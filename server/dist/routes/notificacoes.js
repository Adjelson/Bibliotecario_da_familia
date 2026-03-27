"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushNotif = pushNotif;
// server/src/routes/notificacoes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const async_1 = require("../middleware/async");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const events_1 = require("events");
const r = (0, express_1.Router)();
/* ===================== SSE: broker simples por utilizador ===================== */
/** Mantemos um emitter e uma tabela userId -> Set<Response> */
const bus = new events_1.EventEmitter();
bus.setMaxListeners(0);
const clients = new Map(); // userId -> set de conexões SSE
function sseSend(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function attachClient(userId, res) {
    if (!clients.has(userId))
        clients.set(userId, new Set());
    clients.get(userId).add(res);
}
function detachClient(userId, res) {
    const set = clients.get(userId);
    if (!set)
        return;
    set.delete(res);
    if (set.size === 0)
        clients.delete(userId);
}
/** Dispara para todos os subscritos do userId */
function broadcastToUser(userId, payload) {
    const set = clients.get(userId);
    if (!set || set.size === 0)
        return;
    for (const res of set) {
        try {
            sseSend(res, payload);
        }
        catch { /* conexão pode ter sido fechada */ }
    }
}
/* ===================== Schemas Zod ===================== */
// Tipos “clássicos” para açúcares rápidos
const TipoClassico = zod_1.z.enum(['PEDIDO', 'REQUISICAO', 'MENSAGEM', 'ATIVIDADE']);
// Tipos semânticos usados no novo fluxo (consultas / eventos)
const TipoConsulta = zod_1.z.enum([
    'CONSULTA_NOVA',
    'CONSULTA_MARCADA',
    'CONSULTA_ACEITA',
    'CONSULTA_CONFIRMADA',
    'CONSULTA_ATRIBUIDA',
    'CONSULTA_ALTERADA',
    'CONSULTA_REMARCADA',
    'CONSULTA_REJEITADA',
    'CONSULTA_CANCELADA',
    'CONSULTA_CONCLUIDA',
]);
const TipoEvento = zod_1.z.enum([
    'EVENTO_INSCRICAO',
    'EVENTO_CANCELADA',
    'EVENTO_CHECKIN',
]);
// Criação genérica (type livre)
const createSchema = zod_1.z.object({
    userId: zod_1.z.number().int().positive(),
    type: zod_1.z.string().min(1), // <- livre
    title: zod_1.z.string().min(1),
    body: zod_1.z.string().default(''),
});
// Criação resumida p/ açúcares clássicos
const createShallowSchema = zod_1.z.object({
    userId: zod_1.z.number().int().positive(),
    title: zod_1.z.string().min(1),
    body: zod_1.z.string().default(''),
});
// Criação para tipos de consulta/evento
const createConsultaSchema = zod_1.z.object({
    userId: zod_1.z.number().int().positive(),
    type: TipoConsulta,
    when: zod_1.z.string().min(1), // texto humanizado da data/hora (“12 mai 14:30”)
    extra: zod_1.z.object({
        bibliotecarioNome: zod_1.z.string().optional(),
        familiaNome: zod_1.z.string().optional(),
    }).optional(),
});
const createEventoSchema = zod_1.z.object({
    userId: zod_1.z.number().int().positive(),
    type: TipoEvento,
    eventoTitulo: zod_1.z.string().min(1),
    data: zod_1.z.string().min(1), // “2025-05-01”
});
// Listagem com filtros e cursor
const listQuerySchema = zod_1.z.object({
    tipo: zod_1.z.string().min(1).optional(), // filtra por "type"
    apenasNaoLidas: zod_1.z.union([zod_1.z.literal('1'), zod_1.z.literal('0')]).optional(),
    q: zod_1.z.string().trim().min(1).optional(), // busca em title/body
    de: zod_1.z.string().datetime().optional(), // ISO date (createdAt >= de)
    ate: zod_1.z.string().datetime().optional(), // ISO date (createdAt < ate)
    limit: zod_1.z.coerce.number().int().min(1).max(200).default(50),
    cursor: zod_1.z.coerce.number().int().positive().optional(),
});
// Marcação em massa
const readManyBodySchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.number().int().positive()).min(1).max(1000),
});
// Criação em massa
const bulkCreateSchema = zod_1.z.object({
    items: zod_1.z.array(createSchema).min(1).max(1000),
});
/* ===================== Helpers exportáveis ===================== */
async function pushNotif(data) {
    const created = await prisma_1.prisma.notificacao.create({
        data: {
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body ?? '',
        },
    });
    // dispara SSE
    broadcastToUser(created.userId, { kind: 'notif:new', item: created });
    return created;
}
/** Helper para montar títulos padronizados das consultas */
function títuloConsulta(t, when) {
    switch (t) {
        case 'CONSULTA_NOVA': return 'Nova consulta solicitada';
        case 'CONSULTA_MARCADA': return 'Consulta solicitada';
        case 'CONSULTA_ACEITA': return 'Consulta aceita';
        case 'CONSULTA_CONFIRMADA': return 'Consulta confirmada';
        case 'CONSULTA_ATRIBUIDA': return 'Consulta atribuída';
        case 'CONSULTA_ALTERADA': return 'Consulta alterada';
        case 'CONSULTA_REMARCADA': return 'Consulta remarcada';
        case 'CONSULTA_REJEITADA': return 'Consulta rejeitada';
        case 'CONSULTA_CANCELADA': return 'Consulta cancelada';
        case 'CONSULTA_CONCLUIDA': return 'Consulta concluída';
        default: return `Consulta (${t})`;
    }
}
function corpoConsulta(t, when, extra) {
    const bib = extra?.bibliotecarioNome ? ` com ${extra.bibliotecarioNome}` : '';
    switch (t) {
        case 'CONSULTA_NOVA': return `Pedido para ${when}${bib}.`;
        case 'CONSULTA_MARCADA': return `Solicitada para ${when}. Aguardando aceitação.`;
        case 'CONSULTA_ACEITA': return `Agendada para ${when}${bib}.`;
        case 'CONSULTA_CONFIRMADA': return `Confirmada para ${when}${bib}.`;
        case 'CONSULTA_ATRIBUIDA': return `Reatribuída${bib}. Sessão em ${when}.`;
        case 'CONSULTA_ALTERADA': return `Data/hora alteradas. Nova data: ${when}.`;
        case 'CONSULTA_REMARCADA': return `Remarcada para ${when}.`;
        case 'CONSULTA_REJEITADA': return `Seu pedido foi rejeitado.`;
        case 'CONSULTA_CANCELADA': return `Consulta de ${when} cancelada.`;
        case 'CONSULTA_CONCLUIDA': return `Obrigado pela presença.`;
        default: return when;
    }
}
/* Pequena proteção: ADMIN pode consultar notificações de outro usuário via query param userId */
function resolveTargetUserId(req) {
    if (req.auth?.role === 'ADMIN' && req.query.userId) {
        const target = Number(req.query.userId);
        if (!Number.isNaN(target) && target > 0)
            return target;
    }
    return req.auth.userId;
}
/* ===================== LISTAR ===================== */
r.get('/', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = resolveTargetUserId(req);
    const qp = listQuerySchema.parse(req.query);
    const where = { userId };
    if (qp.tipo)
        where.type = qp.tipo;
    if (qp.apenasNaoLidas === '1')
        where.readAt = null;
    if (qp.q) {
        where.OR = [
            { title: { contains: qp.q, mode: 'insensitive' } },
            { body: { contains: qp.q, mode: 'insensitive' } },
        ];
    }
    if (qp.de || qp.ate) {
        where.createdAt = {};
        if (qp.de)
            where.createdAt.gte = new Date(qp.de);
        if (qp.ate)
            where.createdAt.lt = new Date(qp.ate);
    }
    const list = await prisma_1.prisma.notificacao.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: qp.limit,
        ...(qp.cursor ? { cursor: { id: qp.cursor }, skip: 1 } : {}),
    });
    const nextCursor = list.length === qp.limit ? list[list.length - 1]?.id : null;
    res.json({ items: list, nextCursor });
}));
/* ===================== SSE: /notificacoes/subscribe ===================== */
/** Conecta o cliente e envia notificações em tempo real do utilizador atual */
r.get('/subscribe', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = resolveTargetUserId(req);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    // kickstart com contadores
    const unread = await prisma_1.prisma.notificacao.count({ where: { userId, readAt: null } });
    sseSend(res, { kind: 'hello', userId, unread });
    attachClient(userId, res);
    // heartbeats para manter conexão
    const hb = setInterval(() => { try {
        res.write(':keep-alive\n\n');
    }
    catch { } }, 15000);
    req.on('close', () => {
        clearInterval(hb);
        detachClient(userId, res);
        try {
            res.end();
        }
        catch { }
    });
}));
/* ===================== CONTADOR ===================== */
r.get('/unread-count', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = resolveTargetUserId(req);
    const count = await prisma_1.prisma.notificacao.count({ where: { userId, readAt: null } });
    res.json({ naoLidas: count });
}));
/* ===================== STATS ===================== */
r.get('/stats', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = resolveTargetUserId(req);
    const [total, naoLidas] = await Promise.all([
        prisma_1.prisma.notificacao.count({ where: { userId } }),
        prisma_1.prisma.notificacao.count({ where: { userId, readAt: null } }),
    ]);
    // Agrupamentos simples por type (livre)
    const porTipo = await prisma_1.prisma.$queryRaw `
      SELECT type, COUNT(*) as total FROM Notificacao
      WHERE userId = ${userId}
      GROUP BY type
    `.catch(() => []);
    const porTipoNaoLidas = await prisma_1.prisma.$queryRaw `
      SELECT type, COUNT(*) as total FROM Notificacao
      WHERE userId = ${userId} AND readAt IS NULL
      GROUP BY type
    `.catch(() => []);
    res.json({
        total,
        naoLidas,
        porTipo: Object.fromEntries(porTipo.map(g => [g.type, Number(g.total)])),
        porTipoNaoLidas: Object.fromEntries(porTipoNaoLidas.map(g => [g.type, Number(g.total)])),
    });
}));
/* ===================== MARCAR LIDAS ===================== */
r.post('/:id/read', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const id = zod_1.z.coerce.number().int().positive().parse(req.params.id);
    const userId = req.auth.userId;
    const notif = await prisma_1.prisma.notificacao.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId)
        return res.status(404).json({ message: 'Não encontrada' });
    const up = await prisma_1.prisma.notificacao.update({ where: { id }, data: { readAt: new Date() } });
    // opcionalmente, emitir para atualizar badge
    broadcastToUser(userId, { kind: 'notif:read', id });
    res.json(up);
}));
r.post('/read-many', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const body = readManyBodySchema.parse(req.body);
    const userId = req.auth.userId;
    await prisma_1.prisma.notificacao.updateMany({
        where: { id: { in: body.ids }, userId, readAt: null },
        data: { readAt: new Date() },
    });
    broadcastToUser(userId, { kind: 'notif:read-many', ids: body.ids });
    res.json({ ok: true });
}));
r.post('/read-all', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = req.auth.userId;
    await prisma_1.prisma.notificacao.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    broadcastToUser(userId, { kind: 'notif:read-all' });
    res.json({ ok: true });
}));
/* ===================== DELETE ===================== */
r.delete('/:id', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const id = zod_1.z.coerce.number().int().positive().parse(req.params.id);
    const userId = req.auth.userId;
    const notif = await prisma_1.prisma.notificacao.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId)
        return res.status(404).json({ message: 'Não encontrada' });
    await prisma_1.prisma.notificacao.delete({ where: { id } });
    broadcastToUser(userId, { kind: 'notif:deleted', id });
    res.status(204).send();
}));
r.delete('/read-all', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = req.auth.userId;
    await prisma_1.prisma.notificacao.deleteMany({ where: { userId, readAt: { not: null } } });
    broadcastToUser(userId, { kind: 'notif:purged-read' });
    res.json({ ok: true });
}));
/* ===================== CRIAÇÃO ===================== */
/** Genérica (type livre). */
r.post('/', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const data = createSchema.parse(req.body);
    const created = await pushNotif(data);
    res.status(201).json(created);
}));
/** Bulk (ADMIN|BIBLIOTECARIO) */
r.post('/bulk', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const body = bulkCreateSchema.parse(req.body);
    const created = await prisma_1.prisma.notificacao.createMany({
        data: body.items.map(i => ({ userId: i.userId, type: i.type, title: i.title, body: i.body ?? '' })),
    });
    // emitir eventos (ligeiro: sem buscar items; front atualiza pelo badge)
    const touched = new Set(body.items.map(i => i.userId));
    for (const uid of touched)
        broadcastToUser(uid, { kind: 'notif:bulk', count: body.items.filter(i => i.userId === uid).length });
    res.status(201).json({ ok: true, count: created.count });
}));
/* ===================== Açúcares clássicos ===================== */
r.post('/pedido', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const data = createShallowSchema.parse(req.body);
    const created = await pushNotif({ ...data, type: 'PEDIDO' });
    res.status(201).json(created);
}));
r.post('/requisicao', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const data = createShallowSchema.parse(req.body);
    const created = await pushNotif({ ...data, type: 'REQUISICAO' });
    res.status(201).json(created);
}));
r.post('/mensagem', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const data = createShallowSchema.parse(req.body);
    const created = await pushNotif({ ...data, type: 'MENSAGEM' });
    res.status(201).json(created);
}));
r.post('/atividade', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const data = createShallowSchema.parse(req.body);
    const created = await pushNotif({ ...data, type: 'ATIVIDADE' });
    res.status(201).json(created);
}));
/* ===================== Açúcares semânticos (Consultas/Eventos) ===================== */
/** Consulta */
r.post('/consulta', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), // em geral quem emite é o staff/servidor
(0, async_1.asyncHandler)(async (req, res) => {
    const data = createConsultaSchema.parse(req.body);
    const title = títuloConsulta(data.type, data.when);
    const body = corpoConsulta(data.type, data.when, data.extra);
    const created = await pushNotif({ userId: data.userId, type: data.type, title, body });
    res.status(201).json(created);
}));
/** Evento (atividades) */
r.post('/evento', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const data = createEventoSchema.parse(req.body);
    const title = data.type === 'EVENTO_INSCRICAO' ? 'Inscrição confirmada'
        : data.type === 'EVENTO_CANCELADA' ? 'Inscrição cancelada'
            : 'Check-in confirmado';
    const body = data.type === 'EVENTO_INSCRICAO' ? `Inscrição em "${data.eventoTitulo}" para ${data.data}.`
        : data.type === 'EVENTO_CANCELADA' ? `A sua inscrição em "${data.eventoTitulo}" foi cancelada.`
            : `Presença registada em "${data.eventoTitulo}" (${data.data}).`;
    const created = await pushNotif({ userId: data.userId, type: data.type, title, body });
    res.status(201).json(created);
}));
exports.default = r;
