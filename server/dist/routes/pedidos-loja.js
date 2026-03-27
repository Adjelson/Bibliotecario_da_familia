"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/pedidos-loja.ts
const express_1 = require("express");
const prisma_1 = require("../prisma");
const async_1 = require("../middleware/async");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
/* ============================ Schemas ============================ */
const ItemCreateSchema = zod_1.z.object({
    livroId: zod_1.z.coerce.number().int().positive(),
    quantidade: zod_1.z.coerce.number().int().min(1),
    precoUnitario: zod_1.z.number().min(0).optional(),
    titulo: zod_1.z.string().optional(),
});
const ItemUpsertSchema = zod_1.z.object({
    titulo: zod_1.z.string().optional(),
    quantidade: zod_1.z.coerce.number().int().min(1).optional(),
    precoUnitario: zod_1.z.number().min(0).optional(),
});
const PedidoPostSchema = zod_1.z.object({
    familiaId: zod_1.z.number().int().optional(),
    entregaTipo: zod_1.z.enum(['domicilio', 'biblioteca']).nullable().optional(),
    entregaEndereco: zod_1.z.string().nullable().optional(),
    itens: zod_1.z.array(zod_1.z.object({
        livroId: zod_1.z.number().int().positive(),
        quantidade: zod_1.z.number().int().min(1),
        precoUnitario: zod_1.z.number().min(0).optional(),
        titulo: zod_1.z.string().optional(),
    })).min(1),
});
/* ============================ Helpers ============================ */
function toFrontStatus(s) {
    switch (s) {
        case 'PAGAMENTO_PENDENTE':
        case 'PAGAMENTO_FALHOU':
            return 'pendente';
        case 'PAGO':
        case 'APROVADO':
            return 'confirmado';
        case 'ENVIADO':
            return 'enviado';
        case 'CONCLUIDO':
            return 'concluido';
        case 'CANCELADO':
            return 'cancelado';
        default:
            return 'pendente';
    }
}
// Sempre trazer itens com livro para termos a capa
const loadPedidoFull = async (id) => {
    const p = await prisma_1.prisma.pedido.findUnique({
        where: { id },
        include: {
            itens: {
                include: {
                    livro: { select: { id: true, imagem: true, titulo: true, autor: true } },
                },
            },
            familia: { include: { user: { select: { name: true, email: true, id: true } } } },
            pagamentos: true,
        },
    });
    if (!p) {
        const e = new Error('Pedido não encontrado');
        e.status = 404;
        throw e;
    }
    return p;
};
async function recalcAndUpdateTotal(tx, pedidoId) {
    const itens = await tx.pedidoItem.findMany({ where: { pedidoId } });
    const total = itens.reduce((acc, it) => acc + (it.precoUnit ?? 0) * (it.quantidade ?? 0), 0);
    await tx.pedido.update({ where: { id: pedidoId }, data: { total } });
}
async function resolveFamiliaIdForRead(req) {
    if (req.auth?.role === client_1.Role.PAI) {
        const fam = await prisma_1.prisma.familia.findFirst({
            where: { userId: req.auth.userId },
            select: { id: true },
        });
        return { familiaId: fam?.id ?? null, bibliotecaId: null };
    }
    if (req.auth?.role === client_1.Role.BIBLIOTECARIO) {
        return { familiaId: null, bibliotecaId: req.auth.bibliotecaId ?? null };
    }
    return { familiaId: null, bibliotecaId: null };
}
async function resolveFamiliaIdForWrite(req, explicit) {
    if (req.auth?.role === client_1.Role.PAI) {
        const fam = await prisma_1.prisma.familia.findFirst({ where: { userId: req.auth.userId } });
        if (!fam) {
            const e = new Error('Família não encontrada');
            e.status = 400;
            throw e;
        }
        return fam.id;
    }
    if (typeof explicit === 'number') {
        const exists = await prisma_1.prisma.familia.count({ where: { id: explicit } });
        if (!exists) {
            const e = new Error('Família inválida');
            e.status = 400;
            throw e;
        }
        return explicit;
    }
    const e = new Error('familiaId é obrigatório');
    e.status = 400;
    throw e;
}
async function assertReadScopeOrThrow(p, scope) {
    if (scope.familiaId !== null && p.familiaId !== scope.familiaId) {
        const err = new Error('Forbidden');
        err.status = 403;
        throw err;
    }
    if (scope.bibliotecaId !== null && p.bibliotecaId !== scope.bibliotecaId) {
        const err = new Error('Forbidden');
        err.status = 403;
        throw err;
    }
}
function pedidoToDTO(p) {
    return {
        id: p.id,
        familiaId: p.familiaId,
        bibliotecaId: p.bibliotecaId ?? null,
        total: p.total ?? 0,
        totalPago: p.pagamentos?.reduce((acc, pg) => acc + (pg.valor ?? 0), 0) ?? 0,
        statusRaw: p.status,
        status: toFrontStatus(p.status),
        pagamentoStatus: p.status === 'PAGAMENTO_PENDENTE' ? 'PENDENTE' :
            p.status === 'PAGAMENTO_FALHOU' ? 'FALHOU' :
                p.status === 'PAGO' ? 'PAGO' :
                    null,
        entregaTipo: p.entregaTipo,
        entregaEndereco: p.entregaEndereco ?? null,
        dataPedido: p.createdAt ?? null,
        // >>> adicionados:
        clienteId: p.familia?.user ? p.familia.user.id : null,
        clienteNome: p.familia?.user?.name ?? null,
        clienteEmail: p.familia?.user?.email ?? null,
        itens: (p.itens ?? []).map((it) => ({
            id: it.id,
            livroId: it.livroId,
            titulo: it.titulo,
            quantidade: it.quantidade,
            precoUnit: it.precoUnit,
            entregaStatus: it.entregaStatus ?? null,
            entregueEm: it.entregueEm ?? null,
            canceladoEm: it.canceladoEm ?? null,
            imagem: it.livro?.imagem ?? null,
        })),
    };
}
/* ============================ Listar minhas ============================ */
// GET /pedidos-loja/minhas?status=<pendente|confirmado|enviado|concluido|cancelado>
router.get('/minhas', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const scope = await resolveFamiliaIdForRead(req);
    const where = {};
    if (scope.familiaId !== null)
        where.familiaId = scope.familiaId;
    if (scope.bibliotecaId !== null)
        where.bibliotecaId = scope.bibliotecaId;
    const statusFront = String(req.query.status ?? '').trim().toLowerCase();
    if (statusFront) {
        const map = {
            pendente: ['PAGAMENTO_PENDENTE', 'PAGAMENTO_FALHOU'],
            confirmado: ['PAGO', 'APROVADO'],
            enviado: ['ENVIADO'],
            concluido: ['CONCLUIDO'],
            cancelado: ['CANCELADO'],
        };
        const list = map[statusFront];
        if (list)
            where.status = { in: list };
    }
    const rows = await prisma_1.prisma.pedido.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            itens: { include: { livro: { select: { id: true, imagem: true, titulo: true, autor: true } } } },
            familia: { include: { user: { select: { name: true } } } },
            pagamentos: true,
        },
    });
    res.json(rows.map(pedidoToDTO));
}));
/* ============================ Obter um ============================ */
// GET /pedidos-loja/:id
router.get('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const scope = await resolveFamiliaIdForRead(req);
    const p = await loadPedidoFull(id);
    await assertReadScopeOrThrow(p, scope);
    res.json(pedidoToDTO(p));
}));
/* ============================ Criar ============================ */
// POST /pedidos-loja
router.post('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const data = PedidoPostSchema.parse(req.body);
    const familiaId = await resolveFamiliaIdForWrite(req, data.familiaId);
    // Carregar livros e garantir mesma biblioteca
    const ids = Array.from(new Set(data.itens.map((i) => i.livroId)));
    const livros = await prisma_1.prisma.livro.findMany({
        where: { id: { in: ids } },
        select: { id: true, titulo: true, preco: true, bibliotecaId: true },
    });
    const byId = new Map(livros.map(l => [l.id, l]));
    for (const it of data.itens) {
        const l = byId.get(it.livroId);
        if (!l)
            return res.status(400).json({ message: `Livro #${it.livroId} não encontrado` });
    }
    const bibSet = new Set(livros.map(l => l.bibliotecaId));
    if (bibSet.size !== 1)
        return res.status(400).json({ message: 'Todos os itens devem ser da mesma biblioteca' });
    const bibliotecaId = [...bibSet][0];
    const created = await prisma_1.prisma.$transaction(async (tx) => {
        const pedido = await tx.pedido.create({
            data: {
                familiaId,
                bibliotecaId,
                status: 'PAGAMENTO_PENDENTE',
                entregaTipo: data.entregaTipo ?? null,
                entregaEndereco: data.entregaEndereco ?? null,
            },
        });
        await tx.pedidoItem.createMany({
            data: data.itens.map((it) => {
                const snap = byId.get(it.livroId);
                return {
                    pedidoId: pedido.id,
                    bibliotecaId,
                    livroId: it.livroId,
                    titulo: it.titulo ?? snap.titulo,
                    quantidade: it.quantidade,
                    precoUnit: it.precoUnitario ?? snap.preco ?? 0,
                };
            }),
        });
        await recalcAndUpdateTotal(tx, pedido.id);
        return tx.pedido.findUnique({
            where: { id: pedido.id },
            include: {
                itens: { include: { livro: { select: { id: true, imagem: true, titulo: true, autor: true } } } },
                familia: { include: { user: { select: { name: true } } } },
                pagamentos: true,
            },
        });
    });
    res.status(201).json(pedidoToDTO(created));
}));
/* ============================ Patch status ============================ */
// PATCH /pedidos-loja/:id/status
router.patch('/:id/status', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const toStatus = zod_1.z
        .enum(['PAGAMENTO_PENDENTE', 'PAGO', 'APROVADO', 'ENVIADO', 'CONCLUIDO', 'CANCELADO'])
        .parse(req.body.status);
    // PAI só pode cancelar (do próprio pedido).
    if (req.auth.role === client_1.Role.PAI && toStatus !== 'CANCELADO') {
        return res.status(403).json({ message: 'Sem permissão para alterar este estado' });
    }
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        // Se ENVIADO, debita stock e marca itens
        if (toStatus === 'ENVIADO') {
            const itens = await tx.pedidoItem.findMany({ where: { pedidoId: id } });
            for (const it of itens) {
                const upd = await tx.livro.updateMany({
                    where: { id: it.livroId, quantidade: { gte: it.quantidade } },
                    data: { quantidade: { decrement: it.quantidade } },
                });
                if (upd.count !== 1) {
                    const err = new Error(`Sem stock para o livro #${it.livroId}`);
                    err.statusCode = 409;
                    throw err;
                }
            }
            await tx.pedidoItem.updateMany({ where: { pedidoId: id }, data: { entregaStatus: 'em_transito' } });
        }
        if (toStatus === 'CONCLUIDO') {
            await tx.pedidoItem.updateMany({
                where: { pedidoId: id },
                data: { entregaStatus: 'entregue', entregueEm: new Date() },
            });
        }
        return tx.pedido.update({
            where: { id },
            data: { status: toStatus },
            include: {
                itens: { include: { livro: { select: { id: true, imagem: true, titulo: true, autor: true } } } },
                familia: { include: { user: { select: { name: true } } } },
                pagamentos: true,
            },
        });
    }).catch((e) => {
        if (e?.statusCode === 409)
            return null;
        throw e;
    });
    if (!updated)
        return res.status(409).json({ message: 'Sem stock disponível para proceder ao envio' });
    res.json(pedidoToDTO(updated));
}));
/* ============================ Itens: add ============================ */
// POST /pedidos-loja/:id/itens
router.post('/:id/itens', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const payload = ItemCreateSchema.parse(req.body);
    const scope = await resolveFamiliaIdForRead(req);
    const p = await loadPedidoFull(id);
    await assertReadScopeOrThrow(p, scope);
    if (['ENVIADO', 'CONCLUIDO', 'CANCELADO'].includes(p.status)) {
        return res.status(400).json({ message: 'Pedido já não aceita alterações de itens' });
    }
    const livro = await prisma_1.prisma.livro.findUnique({
        where: { id: payload.livroId },
        select: { id: true, titulo: true, preco: true, bibliotecaId: true },
    });
    if (!livro)
        return res.status(400).json({ message: 'Livro não encontrado' });
    if (livro.bibliotecaId !== p.bibliotecaId) {
        return res.status(400).json({ message: 'Itens devem pertencer à mesma biblioteca do pedido' });
    }
    const up = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.pedidoItem.create({
            data: {
                pedidoId: p.id,
                bibliotecaId: p.bibliotecaId,
                livroId: livro.id,
                titulo: payload.titulo ?? livro.titulo,
                quantidade: payload.quantidade,
                precoUnit: payload.precoUnitario ?? livro.preco ?? 0,
            },
        });
        await recalcAndUpdateTotal(tx, p.id);
        return tx.pedido.findUnique({
            where: { id: p.id },
            include: {
                itens: { include: { livro: { select: { id: true, imagem: true, titulo: true, autor: true } } } },
                familia: { include: { user: { select: { name: true } } } },
                pagamentos: true,
            },
        });
    });
    res.status(201).json(pedidoToDTO(up));
}));
/* ============================ Itens: update ============================ */
// PUT /pedidos-loja/:id/itens/:itemId
router.put('/:id/itens/:itemId', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const payload = ItemUpsertSchema.parse(req.body);
    const scope = await resolveFamiliaIdForRead(req);
    const p = await loadPedidoFull(id);
    await assertReadScopeOrThrow(p, scope);
    if (['ENVIADO', 'CONCLUIDO', 'CANCELADO'].includes(p.status)) {
        return res.status(400).json({ message: 'Pedido já não aceita alterações de itens' });
    }
    const exists = await prisma_1.prisma.pedidoItem.findFirst({ where: { id: itemId, pedidoId: id } });
    if (!exists)
        return res.status(404).json({ message: 'Item não encontrado' });
    const up = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.pedidoItem.update({
            where: { id: itemId },
            data: {
                ...(payload.titulo !== undefined ? { titulo: payload.titulo } : {}),
                ...(payload.quantidade !== undefined ? { quantidade: payload.quantidade } : {}),
                ...(payload.precoUnitario !== undefined ? { precoUnit: payload.precoUnitario } : {}),
            },
        });
        await recalcAndUpdateTotal(tx, id);
        return tx.pedido.findUnique({
            where: { id },
            include: {
                itens: { include: { livro: { select: { id: true, imagem: true, titulo: true, autor: true } } } },
                familia: { include: { user: { select: { name: true } } } },
                pagamentos: true,
            },
        });
    });
    res.json(pedidoToDTO(up));
}));
/* ============================ Itens: delete ============================ */
// DELETE /pedidos-loja/:id/itens/:itemId
router.delete('/:id/itens/:itemId', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const scope = await resolveFamiliaIdForRead(req);
    const p = await loadPedidoFull(id);
    await assertReadScopeOrThrow(p, scope);
    if (['ENVIADO', 'CONCLUIDO', 'CANCELADO'].includes(p.status)) {
        return res.status(400).json({ message: 'Pedido já não aceita alterações de itens' });
    }
    const exists = await prisma_1.prisma.pedidoItem.findFirst({ where: { id: itemId, pedidoId: id } });
    if (!exists)
        return res.status(404).json({ message: 'Item não encontrado' });
    const up = await prisma_1.prisma.$transaction(async (tx) => {
        await tx.pedidoItem.delete({ where: { id: itemId } });
        await recalcAndUpdateTotal(tx, id);
        return tx.pedido.findUnique({
            where: { id },
            include: {
                itens: { include: { livro: { select: { id: true, imagem: true, titulo: true, autor: true } } } },
                familia: { include: { user: { select: { name: true } } } },
                pagamentos: true,
            },
        });
    });
    res.json(pedidoToDTO(up));
}));
exports.default = router;
