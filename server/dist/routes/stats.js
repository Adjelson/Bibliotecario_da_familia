"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/stats.ts
const express_1 = require("express");
const json2csv_1 = require("json2csv");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const statsRouter = (0, express_1.Router)();
/* ========================== Middlewares ========================== */
const onlyStaff = [(0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO)];
const adminOnly = [(0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN)];
/* ========================== Helpers ========================== */
const atMidnight = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** ADMIN vê tudo. BIBLIOTECARIO só vê a sua biblioteca. */
function buildScope(me) {
    const isAdmin = me.role === client_1.Role.ADMIN;
    const bibliotecaId = me.bibliotecaId ?? null;
    // Se é bibliotecário e não tem biblioteca definida → bloquear chamadas
    if (!isAdmin && me.role === client_1.Role.BIBLIOTECARIO && !bibliotecaId) {
        // devolve filtros vazios que nunca casam
        const never = { id: -1 };
        return {
            isAdmin,
            bibliotecaId,
            where: {
                familia: never,
                livro: never,
                requisicao: never,
                consulta: never,
                evento: never,
                pedido: never,
                pedidoItem: never,
            },
            invalidScope: true,
        };
    }
    // Ajusta aqui os campos conforme o teu schema real
    const familiaWhere = !isAdmin ? { user: { bibliotecaId: bibliotecaId } } : undefined;
    const livroWhere = !isAdmin ? { bibliotecaId: bibliotecaId } : undefined;
    const requisicaoWhere = !isAdmin ? { bibliotecaId: bibliotecaId } : undefined;
    const consultaWhere = !isAdmin ? { bibliotecario: { bibliotecaId: bibliotecaId } } : undefined;
    const eventoWhere = !isAdmin ? { bibliotecaId: bibliotecaId } : undefined;
    // Vendas — adapta conforme teu schema (Pedido/PedidoItem)
    const pedidoWhere = !isAdmin ? {
        OR: [
            { familia: { user: { bibliotecaId: bibliotecaId } } },
            { itens: { some: { livro: { bibliotecaId: bibliotecaId } } } },
        ],
    } : undefined;
    const pedidoItemWhere = !isAdmin ? { livro: { bibliotecaId: bibliotecaId } } : undefined;
    return {
        isAdmin,
        bibliotecaId,
        where: { familia: familiaWhere, livro: livroWhere, requisicao: requisicaoWhere, consulta: consultaWhere, evento: eventoWhere, pedido: pedidoWhere, pedidoItem: pedidoItemWhere },
    };
}
/* ========================== Rotas ========================== */
/** KPIs básicos */
statsRouter.get('/kpis', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const [familias, livrosRequisitados, consultas, atividades] = await Promise.all([
        prisma_1.prisma.familia.count({ where: where.familia }),
        prisma_1.prisma.requisicao.count({ where: where.requisicao }),
        prisma_1.prisma.consulta.count({ where: { ...(where.consulta ?? {}), status: 'MARCADA' } }),
        prisma_1.prisma.evento.count({ where: where.evento }),
    ]);
    res.json({ familias, livrosRequisitados, consultas, atividades });
});
/** KPIs Plus */
statsRouter.get('/kpis-plus', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const [pendentes, aprovadasAtivas, atrasadas] = await Promise.all([
        prisma_1.prisma.requisicao.count({ where: { ...(where.requisicao ?? {}), status: client_1.RequisicaoStatus.PENDENTE } }),
        prisma_1.prisma.requisicao.count({ where: { ...(where.requisicao ?? {}), status: client_1.RequisicaoStatus.APROVADA } }),
        prisma_1.prisma.requisicao.count({
            where: { ...(where.requisicao ?? {}), status: client_1.RequisicaoStatus.ENTREGUE, dataDevolucaoPrevista: { lt: new Date() } },
        }),
    ]);
    const today = atMidnight();
    const todayEnd = addDays(today, 1);
    const eventosHoje = await prisma_1.prisma.evento.count({ where: { ...(where.evento ?? {}), data: { gte: today, lt: todayEnd } } });
    // Ocupação — placeholder
    const ocupacaoMedia = 0;
    // Vendas (se existir Pedido/PedidoItem)
    let comprasPagas = 0;
    let receitaTotal = 0;
    let topVendidos = [];
    try {
        const statusPago = ['PAGO', 'APROVADO', 'ENVIADO', 'CONCLUIDO'];
        comprasPagas = await prisma_1.prisma.pedido.count({ where: { ...(where.pedido ?? {}), status: { in: statusPago } } });
        const agg = await prisma_1.prisma.pedido.aggregate({ where: { ...(where.pedido ?? {}), status: { in: statusPago } }, _sum: { total: true } });
        receitaTotal = Number(agg._sum.total ?? 0);
        const gb = await prisma_1.prisma.pedidoItem.groupBy({
            by: ['livroId'],
            where: where.pedidoItem,
            _sum: { quantidade: true },
        });
        gb.sort((a, b) => Number((b._sum.quantidade ?? 0)) - Number((a._sum.quantidade ?? 0)));
        const top = gb.slice(0, 5);
        const livros = await prisma_1.prisma.livro.findMany({ where: { id: { in: top.map(t => t.livroId) } }, select: { id: true, titulo: true } });
        const tituloById = new Map(livros.map(l => [l.id, l.titulo]));
        topVendidos = top.map(t => ({ titulo: tituloById.get(t.livroId) ?? `#${t.livroId}`, total: Number(t._sum.quantidade ?? 0) }));
    }
    catch { /* sem modelo de vendas → fica a zeros */ }
    let bibliotecario = null;
    if (me.role === client_1.Role.BIBLIOTECARIO) {
        const [minhasConsultasHoje, minhasConsultasMarcadas, mensagensNaoLidas, notificacoesNaoLidas] = await Promise.all([
            prisma_1.prisma.consulta.count({ where: { bibliotecarioId: me.userId, dataHora: { gte: today, lt: todayEnd }, status: 'MARCADA' } }),
            prisma_1.prisma.consulta.count({ where: { bibliotecarioId: me.userId, status: 'MARCADA' } }),
            prisma_1.prisma.mensagem.count({ where: { toUserId: me.userId, readAt: null } }),
            prisma_1.prisma.notificacao.count({ where: { userId: me.userId, readAt: null } }),
        ]);
        bibliotecario = { minhasConsultasHoje, minhasConsultasMarcadas, mensagensNaoLidas, notificacoesNaoLidas };
    }
    const [familias, livrosRequisitados, consultas, eventosFuturos] = await Promise.all([
        prisma_1.prisma.familia.count({ where: where.familia }),
        prisma_1.prisma.requisicao.count({ where: where.requisicao }),
        prisma_1.prisma.consulta.count({ where: { ...(where.consulta ?? {}), status: 'MARCADA' } }),
        prisma_1.prisma.evento.count({ where: { ...(where.evento ?? {}), data: { gt: new Date() } } }),
    ]);
    res.json({
        gerais: { familias, livrosRequisitados, consultas, eventosFuturos },
        operacional: { pendentes, aprovadasAtivas, atrasadas, eventosHoje, ocupacaoMedia },
        vendas: { comprasPagas, receitaTotal, topVendidos },
        bibliotecario,
    });
});
/** Alertas de inventário */
statsRouter.get('/inventario/alertas', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const [zeroStock, lowStock, emprestimoSemPrazo] = await Promise.all([
        prisma_1.prisma.livro.count({ where: { ...(where.livro ?? {}), quantidade: 0 } }),
        prisma_1.prisma.livro.count({ where: { ...(where.livro ?? {}), quantidade: { lte: 1 } } }),
        prisma_1.prisma.requisicao.count({
            where: {
                ...(where.requisicao ?? {}),
                status: client_1.RequisicaoStatus.ENTREGUE,
                OR: [{ dataDevolucaoPrevista: null }, { dataDevolucaoPrevista: undefined }],
            },
        }),
    ]);
    res.json({ zeroStock, lowStock, emprestimoSemPrazo });
});
/** Série temporal */
statsRouter.get('/requisicoes', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const periodo = String(req.query.periodo ?? 'mes');
    const end = new Date();
    const from = periodo === 'dia' ? addDays(new Date(), -1)
        : periodo === 'ano' ? addDays(new Date(), -365)
            : addDays(new Date(), -30);
    const rows = await prisma_1.prisma.requisicao.findMany({
        where: { ...(where.requisicao ?? {}), createdAt: { gte: from, lte: end } },
        select: { createdAt: true },
    });
    const map = new Map();
    for (const r of rows) {
        const d = new Date(r.createdAt);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        map.set(label, (map.get(label) ?? 0) + 1);
    }
    const data = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => ({ label, count }));
    res.json(data);
});
/** Requisições por família (Top) */
statsRouter.get('/requisicoes-por-familia', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const gb = await prisma_1.prisma.requisicao.groupBy({
        by: ['familiaId'],
        where: where.requisicao,
        _count: { _all: true },
    });
    gb.sort((a, b) => Number(b._count?._all ?? 0) - Number(a._count?._all ?? 0));
    const top = gb.slice(0, 10);
    const familias = await prisma_1.prisma.familia.findMany({
        where: { id: { in: top.map(t => t.familiaId) } },
        select: { id: true, user: { select: { name: true } } },
    });
    const nameById = new Map(familias.map(f => [f.id, f.user?.name ?? `Família #${f.id}`]));
    const items = top.map(t => ({ family: nameById.get(t.familiaId) ?? `Família #${t.familiaId}`, count: Number(t._count?._all ?? 0) }));
    res.json({ items, total: items.length, page: 1, pageSize: items.length });
});
/** Top livros */
statsRouter.get('/top-livros', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const limit = Number(req.query.limit ?? 5);
    const gb = await prisma_1.prisma.requisicao.groupBy({
        by: ['livroId'],
        where: where.requisicao,
        _count: { _all: true },
    });
    gb.sort((a, b) => Number(b._count?._all ?? 0) - Number(a._count?._all ?? 0));
    const top = gb.slice(0, limit);
    const livros = await prisma_1.prisma.livro.findMany({ where: { id: { in: top.map(g => g.livroId) } }, select: { id: true, titulo: true } });
    const tituloById = new Map(livros.map(l => [l.id, l.titulo]));
    res.json(top.map(g => ({ name: tituloById.get(g.livroId) ?? `#${g.livroId}`, value: Number(g._count?._all ?? 0) })));
});
/** Distribuição por status */
statsRouter.get('/requisicoes/status', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const statuses = ['PENDENTE', 'APROVADA', 'NEGADA', 'ENTREGUE', 'DEVOLVIDA'];
    const pairs = await Promise.all(statuses.map(async (s) => [s, await prisma_1.prisma.requisicao.count({ where: { ...(where.requisicao ?? {}), status: s } })]));
    const out = {};
    for (const [s, c] of pairs)
        out[s] = c;
    res.json(out);
});
/** Consultas — resumo */
statsRouter.get('/consultas/resumo', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope)
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    const { where } = scope;
    const gbStatus = await prisma_1.prisma.consulta.groupBy({
        by: ['status'],
        where: where.consulta,
        _count: { _all: true },
    });
    gbStatus.sort((a, b) => Number(b._count?._all ?? 0) - Number(a._count?._all ?? 0));
    const porStatus = gbStatus.map(r => ({ status: r.status, total: Number(r._count?._all ?? 0) }));
    const gbBib = await prisma_1.prisma.consulta.groupBy({
        by: ['bibliotecarioId'],
        where: where.consulta,
        _count: { _all: true },
    });
    gbBib.sort((a, b) => Number(b._count?._all ?? 0) - Number(a._count?._all ?? 0));
    const top = gbBib.slice(0, 10);
    const bibUsers = await prisma_1.prisma.user.findMany({
        where: { id: { in: top.map(t => t.bibliotecarioId).filter(Boolean) } },
        select: { id: true, name: true },
    });
    const nomeById = new Map(bibUsers.map(u => [u.id, u.name ?? `#${u.id}`]));
    const topBibliotecarios = top.map(t => ({
        id: t.bibliotecarioId ?? 0,
        nome: t.bibliotecarioId ? (nomeById.get(t.bibliotecarioId) ?? `#${t.bibliotecarioId}`) : '—',
        total: Number(t._count?._all ?? 0),
    }));
    res.json({ porStatus, topBibliotecarios });
});
/* ========================== EXPORTS CSV (idem, usando req.auth) ========================== */
// … mantém os endpoints de export iguais, mas onde lias (req as any).user passa a (req as any).auth …
/* ========================== EXPORTS CSV ========================== */
statsRouter.get('/requisicoes/export/csv', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope) {
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    }
    const { where } = scope;
    const periodo = String(req.query.periodo ?? 'mes');
    const end = new Date();
    const from = periodo === 'dia' ? addDays(new Date(), -1)
        : periodo === 'ano' ? addDays(new Date(), -365)
            : addDays(new Date(), -30);
    const rows = await prisma_1.prisma.requisicao.findMany({
        where: { ...(where.requisicao ?? {}), createdAt: { gte: from, lte: end } },
        select: {
            id: true,
            status: true,
            createdAt: true,
            dataDevolucaoPrevista: true,
            bibliotecaId: true,
            familia: { select: { id: true, user: { select: { name: true, email: true } } } },
            livro: { select: { id: true, titulo: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
    const data = rows.map(r => ({
        id: r.id,
        status: r.status,
        criadoEm: r.createdAt.toISOString(),
        devolucaoPrevista: r.dataDevolucaoPrevista ? r.dataDevolucaoPrevista.toISOString() : '',
        familiaId: r.familia?.id ?? '',
        responsavel: r.familia?.user?.name ?? '',
        responsavelEmail: r.familia?.user?.email ?? '',
        livroId: r.livro?.id ?? '',
        livroTitulo: r.livro?.titulo ?? '',
        bibliotecaId: r.bibliotecaId ?? '',
    }));
    const parser = new json2csv_1.Parser();
    const csv = parser.parse(data);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`requisicoes_${periodo}.csv`);
    res.send(csv);
});
statsRouter.get('/familia/export/csv', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope) {
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    }
    const { where } = scope;
    const gb = await prisma_1.prisma.requisicao.groupBy({
        by: ['familiaId'],
        where: where.requisicao,
        _count: { _all: true },
    });
    gb.sort((a, b) => Number(b._count?._all ?? 0) - Number(a._count?._all ?? 0));
    const familias = await prisma_1.prisma.familia.findMany({
        where: { id: { in: gb.map(t => t.familiaId) } },
        select: { id: true, user: { select: { name: true, email: true } } },
    });
    const byId = new Map(familias.map(f => [f.id, f]));
    const data = gb.map(t => {
        const f = byId.get(t.familiaId);
        return {
            familiaId: t.familiaId,
            responsavel: f?.user?.name ?? '',
            email: f?.user?.email ?? '',
            totalRequisicoes: Number(t._count?._all ?? 0),
        };
    });
    const parser = new json2csv_1.Parser();
    const csv = parser.parse(data);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('requisicoes_por_familia.csv');
    res.send(csv);
});
statsRouter.get('/top-livros/export/csv', ...onlyStaff, async (req, res) => {
    const me = req.auth;
    const scope = buildScope(me);
    if (scope.invalidScope) {
        return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' });
    }
    const { where } = scope;
    const gb = await prisma_1.prisma.requisicao.groupBy({
        by: ['livroId'],
        where: where.requisicao,
        _count: { _all: true },
    });
    gb.sort((a, b) => Number(b._count?._all ?? 0) - Number(a._count?._all ?? 0));
    const top = gb.slice(0, 20);
    const livros = await prisma_1.prisma.livro.findMany({
        where: { id: { in: top.map(g => g.livroId) } },
        select: { id: true, titulo: true, autor: true, bibliotecaId: true },
    });
    const byId = new Map(livros.map(l => [l.id, l]));
    const data = top.map(g => {
        const l = byId.get(g.livroId);
        return {
            livroId: g.livroId,
            titulo: l?.titulo ?? '',
            autor: l?.autor ?? '',
            bibliotecaId: l?.bibliotecaId ?? '',
            requisicoes: Number(g._count?._all ?? 0),
        };
    });
    const parser = new json2csv_1.Parser();
    const csv = parser.parse(data);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('top_livros.csv');
    res.send(csv);
});
exports.default = statsRouter;
