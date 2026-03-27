"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDtoPedido = toDtoPedido;
// server/src/routes/requisicoes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
/* ============================ Schemas ============================ */
const CreateBody = zod_1.z.object({
    livroId: zod_1.z.coerce.number().int().positive(),
    familiaId: zod_1.z.coerce.number().int().positive().optional(), // apenas ADMIN/BIBLIO (se criar em nome de alguém)
    entregaTipo: zod_1.z.enum(['domicilio', 'biblioteca']).optional(),
    endereco: zod_1.z.string().trim().min(5, 'Endereço muito curto').max(255).optional(),
});
const ListQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(20),
    status: zod_1.z.enum([
        'PENDENTE', 'APROVADA', 'NEGADA', 'ENTREGUE', 'DEVOLVIDA',
        'PAGAMENTO_PENDENTE', 'PAGAMENTO_FALHOU', 'PAGO',
    ]).optional(),
    q: zod_1.z.string().trim().optional().transform(v => (v === '' ? undefined : v)),
});
const AprovarBody = zod_1.z.object({
    entregaTipo: zod_1.z.enum(['domicilio', 'biblioteca']),
    data: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida (yyyy-mm-dd)'),
    hora: zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'hora inválida (HH:MM)'),
    endereco: zod_1.z.string().optional(),
}).strict();
const EntregarBody = zod_1.z.object({ confirmar: zod_1.z.literal(true) });
const DevolverBody = zod_1.z.object({ confirmar: zod_1.z.literal(true) });
const EditBody = zod_1.z.object({
    entregaTipo: zod_1.z.enum(['domicilio', 'biblioteca']).optional(),
    endereco: zod_1.z.string().trim().min(5, 'Endereço muito curto').max(255).optional(),
}).refine(d => d.entregaTipo !== undefined || d.endereco !== undefined, { message: 'Nada para atualizar' });
const PagarBody = zod_1.z.object({ confirmar: zod_1.z.literal(true).default(true) });
const IdParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
/* ============================ Utils ============================ */
function mapStatusFrontEmprestimo(raw) {
    switch (raw) {
        case 'PENDENTE': return 'pendente';
        case 'APROVADA': return 'confirmado';
        case 'NEGADA': return 'rejeitado';
        case 'ENTREGUE': return 'entregue';
        case 'DEVOLVIDA': return 'devolvida';
        default: return 'pendente';
    }
}
function combineISO_UTC(date, time) {
    // Usa UTC para evitar deriva de timezone
    return new Date(`${date}T${time}:00Z`);
}
async function ensureLivro(livroId) {
    const l = await prisma_1.prisma.livro.findUnique({
        where: { id: livroId },
        select: { id: true, titulo: true, preco: true, diasDevolucao: true, tipoAquisicao: true, bibliotecaId: true, quantidade: true },
    });
    if (!l)
        throw new Error('Livro não encontrado');
    return l;
}
async function familiaIdFromReq(req) {
    if (req.auth.role === 'PAI') {
        const fam = await prisma_1.prisma.familia.findUnique({ where: { userId: req.auth.userId }, select: { id: true } });
        if (!fam)
            throw new Error('Família não encontrada');
        return fam.id;
    }
    const famId = Number(req.query.familiaId ?? 0);
    if (!famId)
        throw new Error('familiaId é obrigatório para staff');
    const ok = await prisma_1.prisma.familia.count({ where: { id: famId } });
    if (!ok)
        throw new Error('Família inválida');
    return famId;
}
const EDIT_WINDOW_MINUTES = 15;
function isWithinEditWindow(ref) { return Date.now() - new Date(ref).getTime() <= EDIT_WINDOW_MINUTES * 60 * 1000; }
/* DTO */
function toDtoPedido(x) {
    const entregaISO = x.entregaData ? new Date(x.entregaData).toISOString() : null;
    const horario = x.entregaData ? (() => {
        const d = new Date(x.entregaData);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    })() : null;
    const tipoAquisicao = x.livro?.tipoAquisicao ?? 'emprestimo';
    return {
        id: x.id,
        livroId: x.livroId,
        livroTitulo: x.livro?.titulo ?? `Livro #${x.livroId}`,
        livroAutor: x.livro?.autor ?? null,
        livroImagem: x.livro?.imagem ?? null,
        categoria: x.livro?.categoria ?? null,
        faixa: x.livro?.faixaEtaria ?? null,
        tipoAquisicao,
        diasDevolucao: x.diasDevolucao ?? x.livro?.diasDevolucao ?? null,
        dataDevolucaoPrevista: x.dataDevolucaoPrevista ? new Date(x.dataDevolucaoPrevista).toISOString() : null,
        // reconhecimento do leitor/família
        familiaId: x.familiaId ?? null,
        nome: x.familia?.user?.name ?? `Família #${x.familiaId ?? ''}`.trim(),
        familiaEmail: x.familia?.user?.email ?? null,
        bibliotecaId: x.bibliotecaId ?? null,
        dataPedido: x.createdAt ? new Date(x.createdAt).toISOString() : null,
        status: mapStatusFrontEmprestimo(x.status),
        statusRaw: x.status,
        // agendamento
        tipo: x.entregaTipo ?? '',
        dataResposta: entregaISO,
        horario,
        endereco: x.entregaEndereco ?? null,
        motivoRecusa: x.motivoRecusa ?? null,
        entregueEm: x.entregueEm ? new Date(x.entregueEm).toISOString() : null,
        devolvidoEm: x.devolvidoEm ? new Date(x.devolvidoEm).toISOString() : null,
        pagamentoStatus: x.pagamentoStatus ?? null,
        pagamentoValor: x.pagamentoValor ?? x.livro?.preco ?? null,
        quantidadeSolicitada: 1,
        quantidadeAprovada: ['APROVADA', 'ENTREGUE', 'DEVOLVIDA'].includes(x.status) ? 1 : null,
        stockAtual: typeof x.livro?.quantidade === 'number' ? x.livro.quantidade : null,
        precoLivro: x.livro?.preco ?? null,
    };
}
/* ============================ POST /requisicoes ============================ */
router.post('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), async (req, res, next) => {
    try {
        const parsed = CreateBody.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: 'Dados inválidos' });
        const livro = await ensureLivro(parsed.data.livroId);
        // família
        let familiaId;
        if (req.auth.role === 'PAI') {
            const fam = await prisma_1.prisma.familia.findUnique({ where: { userId: req.auth.userId } });
            if (!fam)
                return res.status(400).json({ message: 'Família não encontrada' });
            familiaId = fam.id;
        }
        else {
            familiaId = parsed.data.familiaId ?? 0;
            if (!familiaId)
                return res.status(400).json({ message: 'familiaId é obrigatório' });
            const famExists = await prisma_1.prisma.familia.count({ where: { id: familiaId } });
            if (!famExists)
                return res.status(400).json({ message: 'Família inválida' });
        }
        // bloqueia empréstimo duplicado ativo do mesmo livro
        const dup = await prisma_1.prisma.requisicao.count({
            where: {
                familiaId, livroId: livro.id,
                status: { in: ['APROVADA', 'ENTREGUE'] },
                devolvidoEm: null,
            },
        });
        if (dup > 0)
            return res.status(409).json({ message: 'Já existe um empréstimo ativo deste livro para a família.' });
        // entrega
        const reqEntregaTipo = parsed.data.entregaTipo ?? null;
        let endereco = parsed.data.endereco?.trim() || null;
        let entregaTipoToSave = null;
        if (livro.tipoAquisicao === 'compra') {
            entregaTipoToSave = 'domicilio';
            if (!endereco)
                return res.status(400).json({ message: 'Endereço é obrigatório para compras (domicílio).' });
        }
        else {
            if (reqEntregaTipo === 'domicilio' && !endereco)
                return res.status(400).json({ message: 'Endereço é obrigatório para entrega ao domicílio.' });
            entregaTipoToSave = reqEntregaTipo;
            if (entregaTipoToSave === 'biblioteca')
                endereco = null;
        }
        const created = await prisma_1.prisma.requisicao.create({
            data: {
                familiaId,
                livroId: livro.id,
                bibliotecaId: livro.bibliotecaId,
                entregaTipo: entregaTipoToSave,
                entregaEndereco: endereco,
            },
            include: {
                livro: true,
                familia: { include: { user: { select: { name: true, id: true } } } },
            },
        });
        // notificar bibliotecários da MESMA biblioteca
        const biblios = await prisma_1.prisma.user.findMany({
            where: { role: 'BIBLIOTECARIO', isActive: true, bibliotecaId: livro.bibliotecaId },
            select: { id: true },
        });
        if (biblios.length) {
            await prisma_1.prisma.notificacao.createMany({
                data: biblios.map(b => ({
                    userId: b.id,
                    type: 'REQUISICAO_NOVA',
                    title: 'Nova requisição de livro',
                    body: `Pedido #${created.id} — ${created.livro.titulo}`,
                })),
            });
        }
        res.status(201).json(toDtoPedido(created));
    }
    catch (e) {
        next(e);
    }
});
/* ============================ GET /requisicoes/minhas ============================ */
router.get('/minhas', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI), async (req, res, next) => {
    try {
        const familiaId = await familiaIdFromReq(req);
        const reqs = await prisma_1.prisma.requisicao.findMany({
            where: { familiaId },
            orderBy: { createdAt: 'desc' },
            include: {
                livro: true,
                familia: { include: { user: { select: { name: true } } } },
            },
        });
        const all = reqs.map(toDtoPedido).sort((a, b) => (b.dataPedido ? new Date(b.dataPedido).getTime() : 0) - (a.dataPedido ? new Date(a.dataPedido).getTime() : 0));
        res.json(all);
    }
    catch (e) {
        next(e);
    }
});
/* ============================ GET /requisicoes/minhas-em-posse ============================ */
router.get('/minhas-em-posse', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI), async (req, res, next) => {
    try {
        const familiaId = await familiaIdFromReq(req);
        const reqs = await prisma_1.prisma.requisicao.findMany({
            where: { familiaId, status: 'ENTREGUE', devolvidoEm: null },
            orderBy: { createdAt: 'desc' },
            include: {
                livro: true,
                familia: { include: { user: { select: { name: true } } } },
            },
        });
        const all = reqs.map(toDtoPedido).sort((a, b) => (b.dataPedido ? new Date(b.dataPedido).getTime() : 0) - (a.dataPedido ? new Date(a.dataPedido).getTime() : 0));
        res.json(all);
    }
    catch (e) {
        next(e);
    }
});
/* ============================ GET /requisicoes ============================ */
router.get('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ message: 'Parâmetros inválidos' });
    const q = parsed.data;
    // pagar estados? devolver vazio; compras tratam-se noutro fluxo
    if (['PAGAMENTO_PENDENTE', 'PAGAMENTO_FALHOU', 'PAGO'].includes(q.status ?? '')) {
        return res.json({ items: [], total: 0, page: q.page, pageSize: q.pageSize });
    }
    try {
        const where = {};
        if (req.auth.role === 'PAI') {
            const fam = await prisma_1.prisma.familia.findUnique({ where: { userId: req.auth.userId } });
            if (!fam)
                return res.json({ items: [], total: 0, page: q.page, pageSize: q.pageSize });
            where.familiaId = fam.id;
        }
        if (req.auth.role === 'BIBLIOTECARIO') {
            if (!req.auth.bibliotecaId)
                return res.status(403).json({ message: 'Bibliotecário sem biblioteca' });
            where.bibliotecaId = req.auth.bibliotecaId;
        }
        if (q.status)
            where.status = q.status;
        if (q.q) {
            where.OR = [
                { livro: { titulo: { contains: q.q, mode: 'insensitive' } } },
                { familia: { user: { name: { contains: q.q, mode: 'insensitive' } } } },
            ];
        }
        const [total, items] = await Promise.all([
            prisma_1.prisma.requisicao.count({ where }),
            prisma_1.prisma.requisicao.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
                include: {
                    livro: true,
                    familia: { include: { user: { select: { name: true } } } },
                },
            }),
        ]);
        res.json({ items: items.map(toDtoPedido), total, page: q.page, pageSize: q.pageSize });
    }
    catch (e) {
        return res.status(500).json({ message: 'Erro ao listar requisições', detail: e?.message ?? String(e) });
    }
});
/* ============================ PUT /requisicoes/:id ============================ */
router.put('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const body = EditBody.parse(req.body);
        const current = await prisma_1.prisma.requisicao.findUnique({
            where: { id },
            include: {
                livro: true,
                familia: { include: { user: true } },
            },
        });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        // bibliotecário tem de ser da MESMA biblioteca
        if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        if (req.auth.role === 'PAI') {
            const myFam = await prisma_1.prisma.familia.findUnique({ where: { userId: req.auth.userId } });
            if (!myFam || current.familiaId !== myFam.id)
                return res.status(403).json({ message: 'Sem permissão para editar este pedido' });
            if (current.status !== 'PENDENTE')
                return res.status(409).json({ message: 'Só é possível editar pedidos pendentes.' });
            if (!isWithinEditWindow(current.createdAt))
                return res.status(409).json({ message: `Edição permitida apenas até ${EDIT_WINDOW_MINUTES} minutos após o pedido.` });
        }
        else {
            if (current.status !== 'PENDENTE')
                return res.status(409).json({ message: 'Só é possível editar pedidos pendentes.' });
        }
        let entregaTipo = (body.entregaTipo ?? current.entregaTipo);
        let endereco = body.endereco !== undefined ? body.endereco?.trim() || null : current.entregaEndereco ?? null;
        if (current.livro.tipoAquisicao === 'compra') {
            entregaTipo = 'domicilio';
            if (!endereco)
                return res.status(400).json({ message: 'Endereço é obrigatório para compras (domicílio).' });
        }
        else {
            if (entregaTipo === 'domicilio' && !endereco)
                return res.status(400).json({ message: 'Endereço é obrigatório para domicílio.' });
            if (entregaTipo === 'biblioteca')
                endereco = null;
        }
        const up = await prisma_1.prisma.requisicao.update({
            where: { id },
            data: { entregaTipo, entregaEndereco: endereco },
            include: {
                livro: true,
                familia: { include: { user: { select: { name: true, id: true } } } },
            },
        });
        // notificar bibliotecários da mesma biblioteca
        const biblios = await prisma_1.prisma.user.findMany({
            where: { role: 'BIBLIOTECARIO', isActive: true, bibliotecaId: current.bibliotecaId },
            select: { id: true },
        });
        if (biblios.length) {
            await prisma_1.prisma.notificacao.createMany({
                data: biblios.map(b => ({
                    userId: b.id,
                    type: 'REQUISICAO_EDITADA',
                    title: 'Requisição atualizada',
                    body: `Pedido #${up.id} — ${up.livro.titulo}`,
                })),
            });
        }
        res.json(toDtoPedido(up));
    }
    catch (e) {
        next(e);
    }
});
// server/src/routes/requisicoes.ts
router.post('/:id/despachar', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const current = await prisma_1.prisma.requisicao.findUnique({ where: { id }, include: { livro: true } });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        if (current.status !== 'APROVADA')
            return res.status(409).json({ message: 'Só é possível despachar pedidos APROVADOS.' });
        // escopo biblio
        if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        const up = await prisma_1.prisma.requisicao.update({
            where: { id },
            data: { status: 'SAIU_PARA_ENTREGA', despachadoEm: new Date() },
            include: { livro: true, familia: { include: { user: { select: { id: true } } } } }
        });
        res.json(toDtoPedido(up));
    }
    catch (e) {
        next(e);
    }
});
/* ============================ POST /requisicoes/:id/cancelar ============================ */
router.post('/:id/cancelar', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const current = await prisma_1.prisma.requisicao.findUnique({
            where: { id },
            include: { livro: true, familia: { include: { user: true } } },
        });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        if (current.status !== 'PENDENTE')
            return res.status(409).json({ message: 'Só é possível cancelar pedidos pendentes.' });
        if (req.auth.role === 'PAI') {
            const myFam = await prisma_1.prisma.familia.findUnique({ where: { userId: req.auth.userId } });
            if (!myFam || current.familiaId !== myFam.id)
                return res.status(403).json({ message: 'Sem permissão para cancelar este pedido' });
            if (!isWithinEditWindow(current.createdAt))
                return res.status(409).json({ message: `Cancelamento permitido apenas até ${EDIT_WINDOW_MINUTES} minutos.` });
        }
        else if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        const up = await prisma_1.prisma.requisicao.update({
            where: { id },
            data: {
                status: 'NEGADA',
                entregaTipo: null,
                entregaData: null,
                motivoRecusa: req.auth.role === 'PAI' ? 'Cancelado pelo utilizador' : current.motivoRecusa ?? null,
            },
            include: { livro: true, familia: { include: { user: { select: { name: true, id: true } } } } },
        });
        if (req.auth.role === 'PAI') {
            const biblios = await prisma_1.prisma.user.findMany({
                where: { role: 'BIBLIOTECARIO', isActive: true, bibliotecaId: current.bibliotecaId },
                select: { id: true },
            });
            if (biblios.length) {
                await prisma_1.prisma.notificacao.createMany({
                    data: biblios.map(b => ({
                        userId: b.id,
                        type: 'REQUISICAO_CANCELADA',
                        title: 'Pedido cancelado pelo utilizador',
                        body: `Pedido #${up.id} — ${up.livro.titulo}`,
                    })),
                });
            }
        }
        else {
            await prisma_1.prisma.notificacao.create({
                data: {
                    userId: up.familia.user.id,
                    type: 'REQUISICAO_NEGADA',
                    title: 'Requisição cancelada',
                    body: `O pedido do livro "${up.livro.titulo}" foi cancelado pela biblioteca.`,
                },
            });
        }
        res.json(toDtoPedido(up));
    }
    catch (e) {
        next(e);
    }
});
/* ============================ POST /requisicoes/:id/aprovar ============================ */
router.post('/:id/aprovar', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const body = AprovarBody.parse(req.body);
        const current = await prisma_1.prisma.requisicao.findUnique({
            where: { id },
            include: { livro: true, familia: { include: { user: true } } },
        });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        if (current.status !== 'PENDENTE')
            return res.status(409).json({ message: 'Estado atual não permite esta ação' });
        // bibliotecário tem de ser da mesma biblioteca
        if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        // validação/normalização de endereço por tipo
        let entregaEndereco = current.entregaEndereco ?? null;
        if (body.entregaTipo === 'domicilio') {
            entregaEndereco = entregaEndereco ?? body.endereco?.trim() ?? null;
            if (!entregaEndereco)
                return res.status(400).json({ message: 'Endereço em falta para domicílio.' });
        }
        else {
            entregaEndereco = null;
        }
        const entregaData = combineISO_UTC(body.data, body.hora);
        if (isNaN(entregaData.getTime()))
            return res.status(400).json({ message: 'Data/Hora inválidas.' });
        // sem reserva de stock; check no ENTREGAR
        const up = await prisma_1.prisma.requisicao.update({
            where: { id },
            data: { status: 'APROVADA', entregaTipo: body.entregaTipo, entregaData, entregaEndereco },
            include: { livro: true, familia: { include: { user: { select: { id: true, name: true } } } } },
        });
        await prisma_1.prisma.notificacao.create({
            data: {
                userId: up.familia.user.id,
                type: 'REQUISICAO_APROVADA',
                title: 'Requisição aprovado',
                body: `O livro "${up.livro.titulo}" foi aprovado para ${body.entregaTipo === 'domicilio' ? 'domicílio' : 'levantamento'} em ${entregaData.toLocaleDateString('pt-PT')} às ${entregaData.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}.`,
            },
        });
        res.json(toDtoPedido(up));
    }
    catch (e) {
        next(e);
    }
});
/* ============================ POST /requisicoes/:id/entregar ============================ */
router.post('/:id/entregar', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        EntregarBody.parse(req.body);
        const current = await prisma_1.prisma.requisicao.findUnique({
            where: { id },
            include: { livro: true, familia: { include: { user: true } } },
        });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        if (current.status !== 'APROVADA')
            return res.status(409).json({ message: 'Só é possível marcar ENTREGUE se estiver APROVADA.' });
        // escopo biblio
        if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        const agora = new Date();
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            if (current.livro.tipoAquisicao === 'emprestimo') {
                const upd = await tx.livro.updateMany({
                    where: { id: current.livroId, bibliotecaId: current.bibliotecaId, quantidade: { gt: 0 } },
                    data: { quantidade: { decrement: 1 } },
                });
                if (upd.count !== 1)
                    throw new Error('Sem stock disponível para entrega.');
            }
            let dataPrevista = null;
            let diasDev = null;
            if (current.livro.tipoAquisicao === 'emprestimo' && current.livro.diasDevolucao && current.livro.diasDevolucao > 0) {
                diasDev = current.livro.diasDevolucao;
                dataPrevista = new Date(agora.getTime() + diasDev * 24 * 60 * 60 * 1000);
            }
            return tx.requisicao.update({
                where: { id },
                data: {
                    status: 'ENTREGUE',
                    entregueEm: agora,
                    dataDevolucaoPrevista: dataPrevista ?? null,
                    diasDevolucao: diasDev ?? null,
                },
                include: { livro: true, familia: { include: { user: { select: { id: true, name: true } } } } },
            });
        });
        await prisma_1.prisma.notificacao.create({
            data: { userId: updated.familia.user.id, type: 'REQUISICAO_ENTREGUE', title: 'Livro entregue', body: `O livro "${updated.livro.titulo}" foi entregue.` },
        });
        res.json(toDtoPedido(updated));
    }
    catch (e) {
        next(e);
    }
});
/* ============================ POST /requisicoes/:id/devolver ============================ */
router.post('/:id/devolver', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        DevolverBody.parse(req.body);
        const current = await prisma_1.prisma.requisicao.findUnique({
            where: { id },
            include: { livro: true, familia: { include: { user: true } } },
        });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        if (current.status !== 'ENTREGUE')
            return res.status(409).json({ message: 'Só é possível devolver requisições ENTREGUE.' });
        if (current.livro.tipoAquisicao === 'compra')
            return res.status(409).json({ message: 'Compras não são devolvidas neste fluxo.' });
        // escopo biblio
        if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        const up = await prisma_1.prisma.$transaction(async (tx) => {
            const inc = await tx.livro.updateMany({
                where: { id: current.livroId, bibliotecaId: current.bibliotecaId },
                data: { quantidade: { increment: 1 } },
            });
            if (inc.count !== 1)
                throw new Error('Falha ao repor stock.');
            return tx.requisicao.update({
                where: { id },
                data: { status: 'DEVOLVIDA', devolvidoEm: new Date() },
                include: { livro: true, familia: { include: { user: { select: { name: true } } } } },
            });
        });
        res.json(toDtoPedido(up));
    }
    catch (e) {
        next(e);
    }
});
/* ============================ POST /requisicoes/:id/pagar (legacy) ============================ */
router.post('/:id/pagar', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN, client_1.Role.BIBLIOTECARIO), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        PagarBody.parse(req.body);
        const current = await prisma_1.prisma.requisicao.findUnique({
            where: { id },
            include: { livro: true, familia: { include: { user: true } } },
        });
        if (!current)
            return res.status(404).json({ message: 'Requisição não encontrada' });
        if (current.livro.tipoAquisicao !== 'compra')
            return res.status(409).json({ message: 'Pagamento só para compras.' });
        if (current.pagamentoStatus === 'PAGO')
            return res.status(409).json({ message: 'Pedido já pago.' });
        if (req.auth.role === 'BIBLIOTECARIO' && req.auth.bibliotecaId !== current.bibliotecaId) {
            return res.status(403).json({ message: 'Sem permissão (biblioteca diferente)' });
        }
        const up = await prisma_1.prisma.requisicao.update({
            where: { id },
            data: {
                pagamentoStatus: 'PAGO',
                pagamentoValor: current.livro.preco ?? 0,
                status: 'APROVADA',
            },
            include: { livro: true, familia: { include: { user: { select: { name: true } } } } },
        });
        res.json(toDtoPedido(up));
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
