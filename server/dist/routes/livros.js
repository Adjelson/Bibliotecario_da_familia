"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/livros.ts
const express_1 = require("express");
const prisma_1 = require("../prisma");
const async_1 = require("../middleware/async");
const auth_1 = require("../middleware/auth");
const zod_1 = require("zod");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
/* =========================================================
 * PREPARAR PASTA /uploads E MULTER
 * ========================================================= */
const UPLOAD_DIR = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname) || '.bin';
        const base = path_1.default
            .basename(file.originalname, ext)
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_\-]/g, '');
        cb(null, `${Date.now()}_${base}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        const ok = /image\/(png|jpeg|jpg|svg\+xml)/.test(file.mimetype);
        if (!ok)
            return cb(new Error('Tipo de ficheiro inválido (use PNG/JPG/SVG)'), false);
        cb(null, true);
    },
});
/* =========================================================
 * HELPERS
 * ========================================================= */
function livroToDTO(l) {
    return {
        id: l.id,
        imagem: l.imagem ?? null,
        titulo: l.titulo,
        autor: l.autor,
        faixaEtaria: l.faixaEtaria,
        categoria: l.categoria,
        preco: l.preco ?? null,
        descricao: l.descricao ?? '',
        quantidade: l.quantidade,
        tipoAquisicao: l.tipoAquisicao,
        diasDevolucao: l.diasDevolucao ?? null,
        bibliotecaId: l.bibliotecaId ?? null,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
    };
}
async function ensureLivro(id) {
    const l = await prisma_1.prisma.livro.findUnique({ where: { id } });
    if (!l) {
        const err = new Error('Livro não encontrado');
        err.statusCode = 404;
        throw err;
    }
    return l;
}
/**
 * ADMIN: livre. BIBLIOTECARIO: só mesma biblioteca.
 */
function mustSameBibliotecaOrAdmin(req, livroBibId) {
    if (req.auth?.role === client_1.Role.ADMIN)
        return;
    if (req.auth?.role === client_1.Role.BIBLIOTECARIO) {
        if (!req.auth.bibliotecaId || req.auth.bibliotecaId !== livroBibId) {
            const err = new Error('Sem permissão: livro de outra biblioteca');
            err.statusCode = 403;
            throw err;
        }
    }
}
/**
 * Filtro de biblioteca para listagens
 * - BIBLIOTECARIO: força a sua biblioteca
 * - ADMIN **ou PAI**: pode listar tudo (sem filtro) ou filtrar por ?bibliotecaId
 * - Público (sem auth): exige ?bibliotecaId
 */
function resolveBibliotecaFilter(req) {
    if (req.auth?.role === client_1.Role.BIBLIOTECARIO) {
        if (!req.auth.bibliotecaId) {
            const err = new Error('Sem biblioteca associada ao utilizador.');
            err.statusCode = 400;
            throw err;
        }
        return { bibliotecaId: req.auth.bibliotecaId, force: true };
    }
    if (req.auth?.role === client_1.Role.ADMIN || req.auth?.role === client_1.Role.PAI) {
        const qBib = Number(req.query.bibliotecaId ?? NaN);
        return Number.isFinite(qBib) ? { bibliotecaId: qBib, force: true } : { force: false };
    }
    // público (não autenticado): precisa indicar bibliotecaId
    const qBib = Number(req.query.bibliotecaId ?? NaN);
    if (!Number.isFinite(qBib)) {
        const err = new Error('bibliotecaId é obrigatório para listar livros.');
        err.statusCode = 400;
        throw err;
    }
    return { bibliotecaId: qBib, force: true };
}
/* =========================================================
 * Zod schemas
 * ========================================================= */
const commonShape = {
    imagem: zod_1.z
        .string()
        .url()
        .optional()
        .or(zod_1.z.string().regex(/^data:image\/(png|jpeg|jpg|svg\+xml);base64,/, 'dataURL inválido').optional())
        .or(zod_1.z.literal('').transform(() => undefined))
        .optional(),
    titulo: zod_1.z.string().min(1, 'Título é obrigatório'),
    autor: zod_1.z.string().min(1, 'Autor é obrigatório'),
    faixaEtaria: zod_1.z.string().min(1, 'Faixa etária é obrigatória'),
    categoria: zod_1.z.string().min(1, 'Categoria é obrigatória'),
    descricao: zod_1.z.string().max(1000).optional().or(zod_1.z.literal('').transform(() => undefined)),
    quantidade: zod_1.z.coerce.number().int().min(0, 'Quantidade mínima 0'),
};
const LivroBody = zod_1.z.discriminatedUnion('tipoAquisicao', [
    zod_1.z.object({
        ...commonShape,
        tipoAquisicao: zod_1.z.literal('compra'),
        preco: zod_1.z.coerce.number().min(0, 'Preço não pode ser negativo'),
        diasDevolucao: zod_1.z.coerce.number().int().positive().optional().nullable().transform(() => null),
    }),
    zod_1.z.object({
        ...commonShape,
        tipoAquisicao: zod_1.z.literal('emprestimo'),
        preco: zod_1.z.coerce.number().optional().nullable().transform(() => null),
        diasDevolucao: zod_1.z.coerce.number().int().min(1, 'Pelo menos 1 dia'),
    }),
]);
const AjusteBody = zod_1.z.object({
    delta: zod_1.z.number().int(),
    motivo: zod_1.z.string().trim().min(3).max(200).optional(),
});
const CommentBody = zod_1.z.object({
    rating: zod_1.z.number().int().min(1).max(5),
    texto: zod_1.z.string().trim().min(3).max(1000),
});
/* =========================================================
 * LISTAR LIVROS
 * ========================================================= */
router.get('/', (0, auth_1.auth)(), // opcional
(0, async_1.asyncHandler)(async (req, res) => {
    const q = req.query.q?.trim() ?? '';
    const categoria = req.query.categoria?.trim() ?? '';
    const tipo = req.query.tipo;
    const faixa = req.query.faixa?.trim() ?? '';
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const { bibliotecaId, force } = resolveBibliotecaFilter(req);
    const where = {};
    if (force && typeof bibliotecaId === 'number') {
        where.bibliotecaId = bibliotecaId;
    }
    if (q) {
        // Sem 'mode', deixa a BD decidir a sensibilidade por *collation*.
        where.OR = [
            { titulo: { contains: q } },
            { autor: { contains: q } },
            { categoria: { contains: q } },
        ];
    }
    if (categoria)
        where.categoria = { contains: categoria };
    if (faixa)
        where.faixaEtaria = { contains: faixa };
    if (tipo === 'compra' || tipo === 'emprestimo')
        where.tipoAquisicao = tipo;
    const [total, items] = await Promise.all([
        prisma_1.prisma.livro.count({ where }),
        prisma_1.prisma.livro.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { titulo: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);
    res.json({ items: items.map(livroToDTO), total, page, pageSize });
}));
/* =========================================================
 * DETALHE LIVRO
 * - BIBLIOTECARIO: só da própria biblioteca
 * - ADMIN/PAI: acesso total
 * - público: acesso permitido
 * ========================================================= */
router.get('/:id', (0, auth_1.auth)(), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const l = await ensureLivro(id);
    if (req.auth?.role === client_1.Role.BIBLIOTECARIO) {
        mustSameBibliotecaOrAdmin(req, l.bibliotecaId);
    }
    // ADMIN e PAI não têm bloqueio
    res.json(livroToDTO(l));
}));
/* =========================================================
 * CRIAR LIVRO (staff)
 * ========================================================= */
router.post('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const userBibId = req.auth.bibliotecaId;
    const dataParsed = LivroBody.parse(req.body);
    const normalized = dataParsed.tipoAquisicao === 'compra'
        ? { ...dataParsed, diasDevolucao: null }
        : { ...dataParsed, preco: null };
    let targetBibId = null;
    if (req.auth.role === client_1.Role.BIBLIOTECARIO) {
        if (!userBibId)
            return res.status(400).json({ message: 'Sem biblioteca associada' });
        targetBibId = userBibId;
    }
    else {
        const fromBody = Number(req.body.bibliotecaId ?? NaN);
        if (!Number.isFinite(fromBody)) {
            return res.status(400).json({ message: 'ADMIN: bibliotecaId é obrigatório para criar livro.' });
        }
        targetBibId = fromBody;
    }
    const created = await prisma_1.prisma.livro.create({
        data: {
            ...normalized,
            bibliotecaId: targetBibId,
        },
    });
    res.status(201).json(livroToDTO(created));
}));
/* =========================================================
 * ATUALIZAR LIVRO (PUT total) (staff)
 * ========================================================= */
router.put('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const current = await ensureLivro(id);
    mustSameBibliotecaOrAdmin(req, current.bibliotecaId);
    const dataParsed = LivroBody.parse(req.body);
    const normalized = dataParsed.tipoAquisicao === 'compra'
        ? { ...dataParsed, diasDevolucao: null }
        : { ...dataParsed, preco: null };
    if (req.auth.role !== client_1.Role.ADMIN && req.body.bibliotecaId !== undefined) {
        return res.status(403).json({ message: 'Não é permitido alterar a biblioteca do livro.' });
    }
    const data = { ...normalized };
    if (req.auth.role === client_1.Role.ADMIN && req.body.bibliotecaId !== undefined) {
        const newBib = Number(req.body.bibliotecaId);
        if (!Number.isFinite(newBib))
            return res.status(400).json({ message: 'bibliotecaId inválido.' });
        data.bibliotecaId = newBib;
    }
    const updated = await prisma_1.prisma.livro.update({ where: { id }, data });
    res.json(livroToDTO(updated));
}));
/* =========================================================
 * APAGAR LIVRO (staff)
 * ========================================================= */
router.delete('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const current = await ensureLivro(id);
    mustSameBibliotecaOrAdmin(req, current.bibliotecaId);
    await prisma_1.prisma.livro.delete({ where: { id } });
    res.status(204).send();
}));
/* =========================================================
 * AJUSTAR STOCK (staff)
 * ========================================================= */
router.post('/:id/ajuste-quantidade', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const body = AjusteBody.parse(req.body);
    const current = await ensureLivro(id);
    mustSameBibliotecaOrAdmin(req, current.bibliotecaId);
    const updated = await prisma_1.prisma
        .$transaction(async (tx) => {
        const novaQtd = (current.quantidade ?? 0) + body.delta;
        if (novaQtd < 0) {
            const err = new Error('Ajuste levaria a quantidade negativa.');
            err.statusCode = 400;
            throw err;
        }
        const up = await tx.livro.update({ where: { id }, data: { quantidade: novaQtd } });
        await tx.atividade.create({
            data: {
                userId: req.auth?.userId ?? null,
                action: 'livro_ajuste_quantidade',
                meta: { livroId: id, delta: body.delta, motivo: body.motivo ?? null },
            },
        });
        return up;
    })
        .catch((err) => {
        if (err?.statusCode === 400)
            return null;
        throw err;
    });
    if (!updated)
        return res.status(400).json({ message: 'Ajuste levaria a quantidade negativa.' });
    res.json(livroToDTO(updated));
}));
/* =========================================================
 * COMENTÁRIOS
 * ========================================================= */
// GET /livros/:id/comentarios
router.get('/:id/comentarios', (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await prisma_1.prisma.comentarioLivro.findMany({
        where: { livroId: id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
        take: 50,
    });
    res.json(rows.map((c) => ({
        id: c.id,
        user: c.user?.name ?? 'Utilizador',
        rating: c.rating,
        texto: c.texto,
        createdAt: c.createdAt,
    })));
}));
// POST /livros/:id/comentarios
router.post('/:id/comentarios', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const livroId = Number(req.params.id);
    const data = CommentBody.parse(req.body);
    const livro = await ensureLivro(livroId);
    // Restrição só para BIBLIOTECARIO; PAI e ADMIN podem comentar qualquer livro
    if (req.auth?.role === client_1.Role.BIBLIOTECARIO) {
        mustSameBibliotecaOrAdmin(req, livro.bibliotecaId);
    }
    const created = await prisma_1.prisma.comentarioLivro.create({
        data: {
            livroId,
            userId: req.auth.userId,
            rating: data.rating,
            texto: data.texto,
            bibliotecaId: livro.bibliotecaId,
        },
        include: { user: { select: { name: true } } },
    });
    res.status(201).json({
        id: created.id,
        user: created.user?.name ?? 'Utilizador',
        rating: created.rating,
        texto: created.texto,
        createdAt: created.createdAt,
    });
}));
/* =========================================================
 * UPLOAD CAPA (staff)
 * ========================================================= */
router.post('/:id/capa', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), upload.single('file'), (0, async_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'Envie um ficheiro no campo "file".' });
    const livro = await ensureLivro(id);
    mustSameBibliotecaOrAdmin(req, livro.bibliotecaId);
    const publicUrl = `/uploads/${path_1.default.basename(file.path)}`;
    const up = await prisma_1.prisma.livro.update({ where: { id }, data: { imagem: publicUrl } });
    res.json(livroToDTO(up));
}));
exports.default = router;
