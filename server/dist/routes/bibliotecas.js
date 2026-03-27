"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/bibliotecas.ts
const express_1 = require("express");
const prisma_1 = require("../prisma");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
/* ============================== Schemas ============================== */
const IdParam = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive(),
});
const CreateBody = zod_1.z.object({
    nome: zod_1.z.string().trim().min(2, 'Nome muito curto'),
    local: zod_1.z.string().trim().max(255).optional().nullable(),
});
const PutBody = zod_1.z.object({
    nome: zod_1.z.string().trim().min(2, 'Nome muito curto'),
    local: zod_1.z.string().trim().max(255).optional().nullable(),
});
const PatchBody = zod_1.z.object({
    nome: zod_1.z.string().trim().min(2).optional(),
    local: zod_1.z.string().trim().max(255).optional().nullable(),
});
const ListQuery = zod_1.z.object({
    q: zod_1.z
        .string()
        .optional()
        .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
    sort: zod_1.z.enum(['id', 'nome']).default('nome'),
    order: zod_1.z.enum(['asc', 'desc']).default('asc'),
});
function pageResponse(items, total, page, pageSize) {
    return { items, total, page, pageSize };
}
/* ============================== Pública ============================== */
/**
 * GET /bibliotecas/public  (sem auth)
 * Retorna apenas { id, nome } com paginação e filtro q
 */
router.get('/public', async (req, res, next) => {
    try {
        const page = Math.max(1, Number(req.query.page ?? 1));
        const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 200)));
        const q = String(req.query.q ?? '').trim();
        const where = q
            ? { nome: { contains: q, mode: 'insensitive' } }
            : {};
        const [items, total] = await Promise.all([
            prisma_1.prisma.biblioteca.findMany({
                where,
                orderBy: { nome: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: { id: true, nome: true },
            }),
            prisma_1.prisma.biblioteca.count({ where }),
        ]);
        res.json({ items, total, page, pageSize });
    }
    catch (e) {
        next(e);
    }
});
/* ============================== ADMIN: Listar ============================== */
/**
 * GET /bibliotecas  (ADMIN)
 */
router.get('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { q, page, pageSize, sort, order } = ListQuery.parse(req.query);
        const where = q
            ? {
                OR: [
                    { nome: { contains: q, mode: 'insensitive' } },
                    { local: { contains: q, mode: 'insensitive' } },
                ],
            }
            : {};
        const [total, items] = await Promise.all([
            prisma_1.prisma.biblioteca.count({ where }),
            prisma_1.prisma.biblioteca.findMany({
                where,
                orderBy: { [sort]: order },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        res.json(pageResponse(items, total, page, pageSize));
    }
    catch (e) {
        next(e);
    }
});
/* ============================== ADMIN: Obter uma ============================== */
/**
 * GET /bibliotecas/:id  (ADMIN)
 */
router.get('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const b = await prisma_1.prisma.biblioteca.findUnique({ where: { id } });
        if (!b)
            return res.status(404).json({ message: 'Biblioteca não encontrada' });
        res.json(b);
    }
    catch (e) {
        next(e);
    }
});
/* ============================== ADMIN: Criar ============================== */
/**
 * POST /bibliotecas  (ADMIN)
 */
router.post('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const data = CreateBody.parse(req.body);
        const created = await prisma_1.prisma.biblioteca.create({
            data: { nome: data.nome, local: data.local ?? null },
        });
        res.status(201).json(created);
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe uma biblioteca com este nome' });
        }
        next(e);
    }
});
/* ============================== ADMIN: Substituir ============================== */
/**
 * PUT /bibliotecas/:id  (ADMIN)
 */
router.put('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const body = PutBody.parse(req.body);
        const updated = await prisma_1.prisma.biblioteca.update({
            where: { id },
            data: { nome: body.nome, local: body.local ?? null },
        });
        res.json(updated);
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2002') {
                return res.status(409).json({ message: 'Já existe uma biblioteca com este nome' });
            }
            if (e.code === 'P2025') {
                return res.status(404).json({ message: 'Biblioteca não encontrada' });
            }
        }
        next(e);
    }
});
/* ============================== ADMIN: Atualizar parcialmente ============================== */
/**
 * PATCH /bibliotecas/:id  (ADMIN)
 */
router.patch('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const body = PatchBody.parse(req.body);
        const data = {};
        if (body.nome !== undefined)
            data.nome = body.nome;
        if (body.local !== undefined)
            data.local = body.local ?? null;
        const updated = await prisma_1.prisma.biblioteca.update({
            where: { id },
            data,
        });
        res.json(updated);
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2002') {
                return res.status(409).json({ message: 'Já existe uma biblioteca com este nome' });
            }
            if (e.code === 'P2025') {
                return res.status(404).json({ message: 'Biblioteca não encontrada' });
            }
        }
        next(e);
    }
});
/* ============================== ADMIN: Apagar ============================== */
/**
 * DELETE /bibliotecas/:id  (ADMIN)
 * - bloqueia se houver utilizadores associados
 */
router.delete('/:id', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        // regra: não apagar se houver utilizadores na biblioteca
        const countUsers = await prisma_1.prisma.user.count({ where: { bibliotecaId: id } });
        if (countUsers > 0) {
            return res.status(409).json({
                message: 'Não é possível remover: existem utilizadores associados',
            });
        }
        // opcional: também bloquear se tiver livros/pedidos/requisições
        const [countLivros, countPedidos, countReqs] = await Promise.all([
            prisma_1.prisma.livro.count({ where: { bibliotecaId: id } }),
            prisma_1.prisma.pedido.count({ where: { bibliotecaId: id } }),
            prisma_1.prisma.requisicao.count({ where: { bibliotecaId: id } }),
        ]);
        if (countLivros + countPedidos + countReqs > 0) {
            return res.status(409).json({
                message: 'Não é possível remover: existem registos associados (livros/pedidos/requisições).',
            });
        }
        await prisma_1.prisma.biblioteca.delete({ where: { id } });
        res.status(204).send();
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (e.code === 'P2025') {
                return res.status(404).json({ message: 'Biblioteca não encontrada' });
            }
            if (e.code === 'P2003') {
                return res
                    .status(409)
                    .json({ message: 'Violação de integridade referencial' });
            }
        }
        next(e);
    }
});
exports.default = router;
