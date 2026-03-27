"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mensagensRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
exports.mensagensRouter = (0, express_1.Router)();
exports.mensagensRouter.use((0, auth_1.auth)());
// Regra de permissão: ADMIN fala com todos; caso contrário, apenas PAI <-> BIBLIOTECARIO ativos e da mesma biblioteca.
async function canMessage(userId, peerId) {
    if (!userId || !peerId || userId === peerId)
        return false;
    const [me, peer] = await Promise.all([
        prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, bibliotecaId: true, isActive: true },
        }),
        prisma_1.prisma.user.findUnique({
            where: { id: peerId },
            select: { role: true, bibliotecaId: true, isActive: true },
        }),
    ]);
    if (!me || !peer)
        return false;
    if (!me.isActive || !peer.isActive)
        return false;
    // Se um dos dois for ADMIN, permitido
    if (me.role === client_1.Role.ADMIN || peer.role === client_1.Role.ADMIN)
        return true;
    const pair = new Set([me.role, peer.role]);
    const isPaiBib = pair.has(client_1.Role.PAI) && pair.has(client_1.Role.BIBLIOTECARIO);
    if (!isPaiBib)
        return false;
    if (!me.bibliotecaId || !peer.bibliotecaId)
        return false;
    return me.bibliotecaId === peer.bibliotecaId;
}
/** GET /mensagens/peers */
exports.mensagensRouter.get('/peers', async (req, res) => {
    const meId = req.auth.userId;
    const me = await prisma_1.prisma.user.findUnique({
        where: { id: meId },
        select: { role: true, bibliotecaId: true, isActive: true },
    });
    if (!me?.isActive)
        return res.json([]);
    const q = String(req.query.q ?? '').trim();
    const byNameOrEmail = q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
        : {};
    if (me.role === client_1.Role.PAI) {
        if (!me.bibliotecaId)
            return res.json([]);
        const bibs = await prisma_1.prisma.user.findMany({
            where: { role: client_1.Role.BIBLIOTECARIO, isActive: true, bibliotecaId: me.bibliotecaId, ...byNameOrEmail },
            select: { id: true, name: true, email: true, role: true, bibliotecaId: true },
            orderBy: { name: 'asc' }, take: 500,
        });
        return res.json(bibs);
    }
    if (me.role === client_1.Role.BIBLIOTECARIO) {
        if (!me.bibliotecaId)
            return res.json([]);
        const familias = await prisma_1.prisma.familia.findMany({
            where: { user: { bibliotecaId: me.bibliotecaId, isActive: true, ...byNameOrEmail } },
            select: { user: { select: { id: true, name: true, email: true, role: true, bibliotecaId: true } } },
            orderBy: { id: 'asc' }, take: 500,
        });
        const peers = familias.map((f) => f.user).filter(Boolean);
        return res.json(peers);
    }
    if (me.role === client_1.Role.ADMIN) {
        const bibliotecaId = req.query.bibliotecaId ? Number(req.query.bibliotecaId) : undefined;
        const where = { isActive: true, ...(bibliotecaId ? { bibliotecaId } : {}), ...byNameOrEmail };
        const users = await prisma_1.prisma.user.findMany({
            where,
            select: { id: true, name: true, email: true, role: true, bibliotecaId: true },
            orderBy: { name: 'asc' }, take: 500,
        });
        return res.json(users);
    }
    return res.json([]);
});
/** GET /mensagens/peer/:id -> perfil mínimo do peer, se eu puder falar com ele */
exports.mensagensRouter.get('/peer/:id', async (req, res) => {
    const me = req.auth.userId;
    const peerId = Number(req.params.id);
    if (!peerId)
        return res.status(400).json({ message: 'id inválido' });
    if (!(await canMessage(me, peerId)))
        return res.status(403).json({ message: 'Sem permissão' });
    const peer = await prisma_1.prisma.user.findUnique({
        where: { id: peerId },
        select: { id: true, name: true, email: true, role: true, bibliotecaId: true, isActive: true },
    });
    if (!peer)
        return res.status(404).json({ message: 'Peer não encontrado' });
    return res.json(peer);
});
/** GET /mensagens/threads  -> apenas threads permitidas */
exports.mensagensRouter.get('/threads', async (req, res) => {
    const me = req.auth.userId;
    const meUser = await prisma_1.prisma.user.findUnique({
        where: { id: me },
        select: { role: true, bibliotecaId: true, isActive: true },
    });
    if (!meUser?.isActive)
        return res.json([]);
    // últimas mensagens minhas
    const msgs = await prisma_1.prisma.mensagem.findMany({
        where: { OR: [{ fromUserId: me }, { toUserId: me }] },
        orderBy: { createdAt: 'desc' },
        take: 1000,
    });
    // última por peer
    const lastByPeer = new Map();
    for (const m of msgs) {
        const peer = m.fromUserId === me ? m.toUserId : m.fromUserId;
        if (!lastByPeer.has(peer))
            lastByPeer.set(peer, m);
    }
    const peerIds = Array.from(lastByPeer.keys());
    // carrega peers
    const peers = await prisma_1.prisma.user.findMany({
        where: { id: { in: peerIds }, isActive: true },
        select: { id: true, name: true, role: true, bibliotecaId: true },
    });
    // aplica a mesma regra de permissão
    const can = (peer) => {
        if (meUser.role === client_1.Role.ADMIN || peer.role === client_1.Role.ADMIN)
            return true;
        const pair = new Set([meUser.role, peer.role]);
        const isPaiBib = pair.has(client_1.Role.PAI) && pair.has(client_1.Role.BIBLIOTECARIO);
        return isPaiBib && !!meUser.bibliotecaId && meUser.bibliotecaId === peer.bibliotecaId;
    };
    const peersAllowed = peers.filter(can);
    const allowedIds = new Set(peersAllowed.map(p => p.id));
    // não lidas por peer (só os permitidos)
    const unread = await prisma_1.prisma.mensagem.groupBy({
        by: ['fromUserId'],
        where: { toUserId: me, readAt: null, fromUserId: { in: Array.from(allowedIds) } },
        _count: { _all: true },
    });
    const unreadByPeer = new Map();
    unread.forEach((u) => unreadByPeer.set(u.fromUserId, u._count._all));
    const out = peersAllowed
        .map(p => ({
        peer: { id: p.id, name: p.name ?? `Utilizador #${p.id}`, role: p.role },
        lastMessage: lastByPeer.get(p.id),
        unread: unreadByPeer.get(p.id) ?? 0,
    }))
        .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
    return res.json(out);
});
/** GET /mensagens?peerId=123 */
exports.mensagensRouter.get('/', async (req, res) => {
    const me = req.auth.userId;
    const peerId = Number(req.query.peerId);
    if (!peerId)
        return res.status(400).json({ message: 'peerId é obrigatório' });
    if (!(await canMessage(me, peerId)))
        return res.status(403).json({ message: 'Sem permissão' });
    const data = await prisma_1.prisma.mensagem.findMany({
        where: { OR: [{ fromUserId: me, toUserId: peerId }, { fromUserId: peerId, toUserId: me }] },
        orderBy: { createdAt: 'asc' },
        take: 1000,
    });
    return res.json(data);
});
/** POST /mensagens  { toUserId, body }  -> cria mensagem + notificação para o destinatário */
exports.mensagensRouter.post('/', async (req, res) => {
    const me = req.auth.userId;
    const { toUserId, body } = req.body ?? {};
    const peerId = Number(toUserId);
    const text = String(body ?? '').trim();
    if (!peerId || !text)
        return res.status(400).json({ message: 'toUserId e body são obrigatórios' });
    if (!(await canMessage(me, peerId)))
        return res.status(403).json({ message: 'Sem permissão' });
    const sender = await prisma_1.prisma.user.findUnique({
        where: { id: me },
        select: { name: true, email: true },
    });
    const senderName = (sender?.name?.trim())
        || (sender?.email?.split('@')[0])
        || `Utilizador #${me}`;
    const snippet = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    const [created] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.mensagem.create({
            data: { fromUserId: me, toUserId: peerId, body: text },
        }),
        prisma_1.prisma.notificacao.create({
            data: {
                userId: peerId,
                type: 'MENSAGEM',
                title: `Nova mensagem de ${senderName}`,
                body: snippet,
            },
        }),
    ]);
    return res.json(created);
});
/** PATCH /mensagens/:id/read  (marca como lida, se for destinatário) */
exports.mensagensRouter.patch('/:id/read', async (req, res) => {
    const me = req.auth.userId;
    const id = Number(req.params.id);
    const msg = await prisma_1.prisma.mensagem.findUnique({ where: { id } });
    if (!msg)
        return res.status(404).json({ message: 'Mensagem não encontrada' });
    if (msg.toUserId !== me)
        return res.status(403).json({ message: 'Sem permissão' });
    if (msg.readAt)
        return res.json(msg);
    const updated = await prisma_1.prisma.mensagem.update({ where: { id }, data: { readAt: new Date() } });
    return res.json(updated);
});
/** Compat: POST /mensagens/:id/lida */
exports.mensagensRouter.post('/:id/lida', async (req, res) => {
    const me = req.auth.userId;
    const id = Number(req.params.id);
    const msg = await prisma_1.prisma.mensagem.findUnique({ where: { id } });
    if (!msg)
        return res.status(404).json({ message: 'Mensagem não encontrada' });
    if (msg.toUserId !== me)
        return res.status(403).json({ message: 'Sem permissão' });
    if (msg.readAt)
        return res.json(msg);
    const updated = await prisma_1.prisma.mensagem.update({ where: { id }, data: { readAt: new Date() } });
    return res.json(updated);
});
exports.default = exports.mensagensRouter;
