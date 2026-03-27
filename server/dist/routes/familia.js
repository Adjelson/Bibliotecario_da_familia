"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/familia.ts
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const client_1 = require("@prisma/client");
const async_1 = require("../middleware/async");
const r = (0, express_1.Router)();
const isAdmin = (req) => req.auth?.role === client_1.Role.ADMIN;
const isBib = (req) => req.auth?.role === client_1.Role.BIBLIOTECARIO;
async function myBibId(req) {
    const u = await prisma_1.prisma.user.findUnique({
        where: { id: req.auth.userId },
        select: { bibliotecaId: true },
    });
    return u?.bibliotecaId ?? null;
}
const userSlim = (u) => u && {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.isActive,
    bibliotecaId: u.bibliotecaId ?? null,
    biblioteca: u.biblioteca
        ? { id: u.biblioteca.id, nome: u.biblioteca.nome }
        : null,
};
const familiaDTO = (f) => f && {
    id: f.id,
    userId: f.userId,
    telefone: f.telefone,
    morada: f.morada,
    interesses: f.interesses ?? [],
    createdAt: f.createdAt,
    filhos: (f.filhos ?? []).map((x) => ({
        id: x.id,
        nome: x.nome,
        idade: x.idade,
        genero: x.genero,
        perfilLeitor: x.perfilLeitor,
        familiaId: x.familiaId,
    })),
    nome: f.user?.name ?? `Família #${f.id}`,
    email: f.user?.email ?? null,
    bibliotecaId: f.user?.bibliotecaId ?? null,
    bibliotecaNome: f.user?.biblioteca?.nome ?? null,
    user: f.user ? userSlim(f.user) : null,
};
const includeFam = {
    filhos: true,
    user: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            bibliotecaId: true,
            biblioteca: { select: { id: true, nome: true } },
        },
    },
};
// GET /familia
r.get('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const q = req.query.q?.trim() ?? '';
        const page = Math.max(1, Number(req.query.page ?? 1));
        const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20)));
        const order = String(req.query.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
        // Nota: filtros em relações devem usar `is: {...}`
        const where = { user: { is: { role: client_1.Role.PAI } } };
        if (isAdmin(req)) {
            // admin vê tudo
        }
        else if (isBib(req)) {
            const bib = await myBibId(req);
            if (!bib) {
                return res.status(400).json({ message: 'Bibliotecário sem biblioteca associada.' });
            }
            where.user = { is: { ...(where.user?.is || {}), bibliotecaId: bib } };
        }
        else {
            // PAI só vê a sua família (por relação direta com userId)
            where.userId = req.auth.userId;
        }
        if (q) {
            // Combina com AND mantendo os filtros acima
            where.AND = [
                {
                    OR: [
                        { user: { is: { name: { contains: q, mode: 'insensitive' } } } },
                        { user: { is: { email: { contains: q, mode: 'insensitive' } } } },
                        { telefone: { contains: q, mode: 'insensitive' } },
                        { morada: { contains: q, mode: 'insensitive' } },
                        {
                            user: {
                                is: {
                                    biblioteca: {
                                        is: {
                                            nome: { contains: q, mode: 'insensitive' },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            ];
        }
        const [total, items] = await Promise.all([
            prisma_1.prisma.familia.count({ where }),
            prisma_1.prisma.familia.findMany({
                where,
                include: includeFam,
                // orderBy por campo de relação é suportado assim
                orderBy: { user: { name: order } },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        res.json({ items: items.map(familiaDTO), total, page, pageSize });
    }
    catch (e) {
        next(e);
    }
});
r.get('/minha/filhos', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const userId = req.auth.userId;
    const fam = await prisma_1.prisma.familia.findFirst({
        where: { userId },
        select: { id: true, filhos: { select: { id: true, nome: true } } },
    });
    if (!fam)
        return res.json({ familiaId: null, filhos: [] });
    res.json({ familiaId: fam.id, filhos: fam.filhos });
}));
r.get('/:id(\\d+)/estatisticas', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const id = zod_1.z.coerce.number().int().positive().parse(req.params.id);
        // TODO: trocar por queries reais (requisicoes/compras/consultas)
        res.json({
            totalRequisicoes: 0,
            totalCompras: 0,
            totalConsultas: 0,
        });
    }
    catch (e) {
        next(e);
    }
});
// GET /familia/:id
r.get('/:id(\\d+)', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const id = zod_1.z.coerce.number().int().positive().parse(req.params.id);
        const fam = await prisma_1.prisma.familia.findUnique({
            where: { id },
            include: includeFam,
        });
        if (!fam)
            return res.status(404).json({ message: 'Não encontrado' });
        if (isAdmin(req))
            return res.json(familiaDTO(fam));
        if (isBib(req)) {
            const bib = await myBibId(req);
            if (!bib || fam.user?.bibliotecaId !== bib) {
                return res.status(403).json({ message: 'Sem permissão' });
            }
            return res.json(familiaDTO(fam));
        }
        if (fam.userId !== req.auth.userId) {
            return res.status(403).json({ message: 'Sem permissão' });
        }
        res.json(familiaDTO(fam));
    }
    catch (e) {
        next(e);
    }
});
// POST /familia
r.post('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const Filho = zod_1.z.object({
            nome: zod_1.z.string().min(1),
            idade: zod_1.z.coerce.number().min(0).max(18),
            genero: zod_1.z.enum(['F', 'M', 'Outro']),
            perfilLeitor: zod_1.z.enum(['iniciante', 'Dislexia', 'autonomo']),
        });
        const Body = zod_1.z.object({
            userId: zod_1.z.coerce.number().int().positive(),
            telefone: zod_1.z.string().min(3),
            morada: zod_1.z.string().min(3),
            interesses: zod_1.z.array(zod_1.z.string()).default([]),
            filhos: zod_1.z.array(Filho).default([]),
        });
        const data = Body.parse(req.body);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: data.userId },
            select: { id: true, role: true, bibliotecaId: true },
        });
        if (!user)
            return res.status(400).json({ message: 'Utilizador não encontrado' });
        if (user.role !== client_1.Role.PAI)
            return res.status(400).json({ message: 'Utilizador não é PAI' });
        if (isBib(req)) {
            const bib = await myBibId(req);
            if (!bib || user.bibliotecaId !== bib) {
                return res.status(403).json({ message: 'Só da tua biblioteca.' });
            }
        }
        const exists = await prisma_1.prisma.familia.findUnique({ where: { userId: data.userId } });
        if (exists)
            return res.status(409).json({ message: 'Este utilizador já possui família' });
        const created = await prisma_1.prisma.$transaction(async (tx) => {
            const fam = await tx.familia.create({
                data: {
                    userId: data.userId,
                    telefone: data.telefone,
                    morada: data.morada,
                    interesses: data.interesses,
                },
            });
            if (data.filhos.length) {
                await tx.filho.createMany({
                    data: data.filhos.map((f) => ({
                        familiaId: fam.id,
                        nome: f.nome,
                        idade: f.idade,
                        genero: f.genero,
                        perfilLeitor: f.perfilLeitor,
                    })),
                });
            }
            return tx.familia.findUnique({ where: { id: fam.id }, include: includeFam });
        });
        res.status(201).json(familiaDTO(created));
    }
    catch (e) {
        next(e);
    }
});
// PUT /familia/:id
r.put('/:id(\\d+)', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const id = zod_1.z.coerce.number().int().positive().parse(req.params.id);
        const Body = zod_1.z.object({
            telefone: zod_1.z.string().min(3).optional(),
            morada: zod_1.z.string().min(3).optional(),
            interesses: zod_1.z.array(zod_1.z.string()).optional(),
            user: zod_1.z
                .object({
                name: zod_1.z.string().min(1).optional(),
                email: zod_1.z.string().email().optional(),
                bibliotecaId: zod_1.z.coerce.number().int().positive().nullable().optional(),
            })
                .optional(),
        });
        const data = Body.parse(req.body);
        if (!data.telefone && !data.morada && !data.interesses && !data.user) {
            return res.status(400).json({ message: 'Nenhum campo para atualizar' });
        }
        const fam = await prisma_1.prisma.familia.findUnique({
            where: { id },
            include: { user: { select: { id: true, bibliotecaId: true } } },
        });
        if (!fam)
            return res.status(404).json({ message: 'Não encontrado' });
        if (isBib(req)) {
            const bib = await myBibId(req);
            if (!bib || fam.user?.bibliotecaId !== bib)
                return res.status(403).json({ message: 'Sem permissão' });
            if (data.user)
                return res.status(403).json({ message: 'Só ADMIN pode alterar dados do utilizador.' });
        }
        const updated = await prisma_1.prisma.familia.update({
            where: { id },
            data: {
                ...(data.telefone !== undefined ? { telefone: data.telefone } : {}),
                ...(data.morada !== undefined ? { morada: data.morada } : {}),
                ...(data.interesses !== undefined ? { interesses: data.interesses } : {}),
                ...(isAdmin(req) && data.user
                    ? {
                        user: {
                            update: {
                                ...(data.user.name !== undefined ? { name: data.user.name } : {}),
                                ...(data.user.email !== undefined ? { email: data.user.email } : {}),
                                ...(data.user.bibliotecaId !== undefined
                                    ? { bibliotecaId: data.user.bibliotecaId }
                                    : {}),
                            },
                        },
                    }
                    : {}),
            },
            include: includeFam,
        });
        res.json(familiaDTO(updated));
    }
    catch (e) {
        next(e);
    }
});
// DELETE /familia/:id
r.delete('/:id(\\d+)', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const id = zod_1.z.coerce.number().int().positive().parse(req.params.id);
        const fam = await prisma_1.prisma.familia.findUnique({
            where: { id },
            include: { user: { select: { bibliotecaId: true } } },
        });
        if (!fam)
            return res.status(404).json({ message: 'Não encontrado' });
        if (isBib(req)) {
            const bib = await myBibId(req);
            if (!bib || fam.user?.bibliotecaId !== bib)
                return res.status(403).json({ message: 'Sem permissão' });
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.filho.deleteMany({ where: { familiaId: id } });
            await tx.familia.delete({ where: { id } });
        });
        res.status(204).send();
    }
    catch (e) {
        next(e);
    }
});
// GET /familia/me
r.get('/me', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.BIBLIOTECARIO, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const u = await prisma_1.prisma.user.findUnique({
            where: { id: req.auth.userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                bibliotecaId: true,
                biblioteca: { select: { id: true, nome: true } },
                familia: { include: includeFam },
            },
        });
        return res.json({
            user: userSlim(u),
            familia: u?.familia ? familiaDTO(u.familia) : null,
        });
    }
    catch (e) {
        next(e);
    }
});
// PUT /familia (própria família do PAI/Admin)
r.put('/', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const Body = zod_1.z.object({
            telefone: zod_1.z.string().min(3).optional(),
            morada: zod_1.z.string().min(3).optional(),
            interesses: zod_1.z.array(zod_1.z.string()).optional(),
            user: zod_1.z
                .object({
                name: zod_1.z.string().min(1).optional(),
                email: zod_1.z.string().email().optional(),
            })
                .optional(),
        });
        const data = Body.parse(req.body);
        if (!data.telefone && !data.morada && !data.interesses && !data.user) {
            return res.status(400).json({ message: 'Nenhum campo para atualizar' });
        }
        const fam = await prisma_1.prisma.familia
            .update({
            where: { userId: req.auth.userId },
            data: {
                ...(data.telefone !== undefined ? { telefone: data.telefone } : {}),
                ...(data.morada !== undefined ? { morada: data.morada } : {}),
                ...(data.interesses !== undefined ? { interesses: data.interesses } : {}),
                ...(data.user
                    ? {
                        user: {
                            update: {
                                ...(data.user.name !== undefined ? { name: data.user.name } : {}),
                                ...(data.user.email !== undefined ? { email: data.user.email } : {}),
                            },
                        },
                    }
                    : {}),
            },
            include: includeFam,
        })
            .catch(() => null);
        if (!fam)
            return res.status(400).json({ message: 'Família não encontrada' });
        res.json({ user: userSlim(fam.user), familia: familiaDTO(fam) });
    }
    catch (e) {
        next(e);
    }
});
exports.default = r;
