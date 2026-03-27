"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/utilizadores.ts
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const r = (0, express_1.Router)();
/* ========================= Schemas ========================= */
const RoleUi = zod_1.z.enum(['PAI', 'BIBLIOTECARIO', 'ADMIN']);
const toPrismaRole = (r) => (r === 'ADMIN' ? client_1.Role.ADMIN : r === 'BIBLIOTECARIO' ? client_1.Role.BIBLIOTECARIO : client_1.Role.PAI);
const UserCreate = zod_1.z.object({
    name: zod_1.z.string().min(3),
    email: zod_1.z.string().email(),
    role: RoleUi.default('PAI'),
    password: zod_1.z.string().min(6, 'Password mínima 6'),
    active: zod_1.z.boolean().optional(),
    bibliotecaId: zod_1.z.coerce.number().int().positive().nullable().optional(),
});
const UserUpdate = zod_1.z
    .object({
    name: zod_1.z.string().min(3).optional(),
    email: zod_1.z.string().email().optional(),
    role: RoleUi.optional(),
    password: zod_1.z.string().min(6).optional(),
    active: zod_1.z.boolean().optional(),
    bibliotecaId: zod_1.z.coerce.number().int().positive().nullable().optional(),
})
    .refine((o) => Object.keys(o).length > 0, { message: 'Sem campos' });
const IdParam = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
// Horário: weekday 0..6, minutos desde 00:00
const SlotBase = zod_1.z.object({
    weekday: zod_1.z.number().int().min(0).max(6),
    startMin: zod_1.z.number().int().min(0).max(24 * 60 - 1),
    endMin: zod_1.z.number().int().min(1).max(24 * 60),
    slotMin: zod_1.z.number().int().min(5).max(240).default(30),
    active: zod_1.z.boolean().default(true),
});
// Versão "com regra" (usa refine → vira ZodEffects, sem .partial)
const Slot = SlotBase.refine((s) => s.endMin > s.startMin, { message: 'endMin deve ser > startMin' });
// Para PATCH precisamos de .partial(); validamos a regra com o registo atual (runtime)
const SlotPatch = SlotBase.partial().refine((p) => Object.keys(p).length > 0, { message: 'Sem campos' });
const SlotsBody = zod_1.z.array(Slot).min(1);
/* ========================= Select/DTO ========================= */
const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    isActive: true,
    bibliotecaId: true,
    biblioteca: { select: { id: true, nome: true, local: true } },
    familia: { select: { id: true } },
};
const dto = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: !!u.isActive,
    bibliotecaId: u.bibliotecaId ?? null,
    biblioteca: u.biblioteca ? { id: u.biblioteca.id, nome: u.biblioteca.nome, local: u.biblioteca.local } : null,
});
/* ========================= Utils ========================= */
function mapPrismaError(e) {
    if (e?.code === 'P2002')
        return { status: 409, message: 'Já existe um utilizador com este email.' };
    if (e?.code === 'P2003') {
        const f = e?.meta?.field_name ?? e?.meta?.constraint ?? '';
        if (String(f).includes('bibliotecaId'))
            return { status: 400, message: 'Biblioteca inválida.' };
        return { status: 409, message: 'Conflito de integridade.' };
    }
    return null;
}
/* ========================= CRUD Utilizadores ========================= */
// GET /utilizadores
r.get('/', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        const roleQ = req.query.role || undefined;
        const activeQ = req.query.active || undefined;
        const bibliotecaIdQ = req.query.bibliotecaId ? Number(req.query.bibliotecaId) : undefined;
        const page = Math.max(1, Number(req.query.page ?? 1));
        const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20)));
        const where = {};
        if (q)
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
            ];
        if (roleQ)
            where.role = toPrismaRole(roleQ);
        if (activeQ === 'true' || activeQ === 'false')
            where.isActive = activeQ === 'true';
        if (typeof bibliotecaIdQ === 'number' && !Number.isNaN(bibliotecaIdQ))
            where.bibliotecaId = bibliotecaIdQ;
        const [total, items] = await Promise.all([
            prisma_1.prisma.user.count({ where }),
            prisma_1.prisma.user.findMany({
                where,
                orderBy: { name: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: userSelect,
            }),
        ]);
        res.json({ items: items.map(dto), total, page, pageSize });
    }
    catch (e) {
        next(e);
    }
});
// GET /utilizadores/:id
r.get('/:id', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const u = await prisma_1.prisma.user.findUnique({ where: { id }, select: userSelect });
        if (!u)
            return res.status(404).json({ message: 'Utilizador não encontrado' });
        res.json(dto(u));
    }
    catch (e) {
        next(e);
    }
});
// POST /utilizadores
r.post('/', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const body = UserCreate.parse(req.body);
        const passwordHash = await bcryptjs_1.default.hash(body.password, 10);
        const created = await prisma_1.prisma.user.create({
            data: {
                name: body.name,
                email: body.email,
                role: toPrismaRole(body.role),
                isActive: body.active ?? true,
                passwordHash,
                bibliotecaId: body.bibliotecaId ?? null,
            },
            select: userSelect,
        });
        res.status(201).json(dto(created));
    }
    catch (e) {
        const m = mapPrismaError(e);
        if (m)
            return res.status(m.status).json({ message: m.message });
        next(e);
    }
});
// PUT /utilizadores/:id
r.put('/:id', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const body = UserCreate.parse(req.body); // PUT = shape completo
        const passwordHash = await bcryptjs_1.default.hash(body.password, 10);
        const updated = await prisma_1.prisma.user.update({
            where: { id },
            data: {
                name: body.name,
                email: body.email,
                role: toPrismaRole(body.role),
                isActive: body.active ?? true,
                passwordHash,
                bibliotecaId: body.bibliotecaId ?? null,
            },
            select: userSelect,
        });
        res.json(dto(updated));
    }
    catch (e) {
        const m = mapPrismaError(e);
        if (m)
            return res.status(m.status).json({ message: m.message });
        next(e);
    }
});
// PATCH /utilizadores/:id
r.patch('/:id', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const body = UserUpdate.parse(req.body);
        const data = {};
        if (body.name !== undefined)
            data.name = body.name;
        if (body.email !== undefined)
            data.email = body.email;
        if (body.role !== undefined)
            data.role = toPrismaRole(body.role);
        if (typeof body.active === 'boolean')
            data.isActive = body.active;
        if ('bibliotecaId' in body)
            data.bibliotecaId = body.bibliotecaId ?? null;
        if (body.password)
            data.passwordHash = await bcryptjs_1.default.hash(body.password, 10);
        const updated = await prisma_1.prisma.user.update({ where: { id }, data, select: userSelect });
        res.json(dto(updated));
    }
    catch (e) {
        const m = mapPrismaError(e);
        if (m)
            return res.status(m.status).json({ message: m.message });
        next(e);
    }
});
// DELETE /utilizadores/:id
r.delete('/:id', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        if (req.auth?.userId === id)
            return res.status(400).json({ message: 'Não podes remover a tua própria conta' });
        await prisma_1.prisma.user.delete({ where: { id } });
        res.status(204).send();
    }
    catch (e) {
        const m = mapPrismaError(e);
        if (m)
            return res.status(m.status).json({ message: m.message });
        next(e);
    }
});
/* ========================= HorárioSemanal ========================= */
/**
 * GET    /utilizadores/:id/horario                → lista slots
 * PUT    /utilizadores/:id/horario                → substitui todos (bulk replace)
 * PATCH  /utilizadores/:id/horario/:horarioId     → edita 1 slot (parcial)
 * DELETE /utilizadores/:id/horario/:horarioId     → apaga 1 slot
 */
// GET slots do utilizador
r.get('/:id/horario', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const rows = await prisma_1.prisma.horarioSemanal.findMany({
            where: { userId: id },
            orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
        });
        res.json(rows);
    }
    catch (e) {
        next(e);
    }
});
// PUT (replace all)
r.put('/:id/horario', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const slots = SlotsBody.parse(req.body);
        // Regra: não permitir overlap no mesmo weekday
        const byDay = new Map();
        for (const s of slots) {
            const arr = byDay.get(s.weekday) ?? [];
            if (arr.some((x) => Math.max(x.s, s.startMin) < Math.min(x.e, s.endMin))) {
                return res.status(400).json({ message: `Overlap no weekday ${s.weekday}` });
            }
            arr.push({ s: s.startMin, e: s.endMin });
            byDay.set(s.weekday, arr);
        }
        const out = await prisma_1.prisma.$transaction(async (tx) => {
            await tx.horarioSemanal.deleteMany({ where: { userId: id } });
            await tx.horarioSemanal.createMany({
                data: slots.map((s) => ({
                    userId: id,
                    weekday: s.weekday,
                    startMin: s.startMin,
                    endMin: s.endMin,
                    slotMin: s.slotMin,
                    active: s.active,
                })),
            });
            return tx.horarioSemanal.findMany({
                where: { userId: id },
                orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
            });
        });
        res.json(out);
    }
    catch (e) {
        next(e);
    }
});
// PATCH 1 slot
r.patch('/:id/horario/:horarioId', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const horarioId = zod_1.z.coerce.number().int().positive().parse(req.params.horarioId);
        const body = SlotPatch.parse(req.body);
        const exists = await prisma_1.prisma.horarioSemanal.findFirst({ where: { id: horarioId, userId: id } });
        if (!exists)
            return res.status(404).json({ message: 'Slot não encontrado' });
        // valida a regra end > start se um dos campos for alterado
        const nextStart = body.startMin ?? exists.startMin;
        const nextEnd = body.endMin ?? exists.endMin;
        if (!(nextEnd > nextStart)) {
            return res.status(400).json({ message: 'endMin deve ser > startMin' });
        }
        const up = await prisma_1.prisma.horarioSemanal.update({
            where: { id: horarioId },
            data: {
                weekday: body.weekday ?? undefined,
                startMin: body.startMin ?? undefined,
                endMin: body.endMin ?? undefined,
                slotMin: body.slotMin ?? undefined,
                active: body.active ?? undefined,
            },
        });
        res.json(up);
    }
    catch (e) {
        next(e);
    }
});
// DELETE 1 slot
r.delete('/:id/horario/:horarioId', (0, auth_1.auth)(), (0, auth_1.requireRole)(client_1.Role.ADMIN), async (req, res, next) => {
    try {
        const { id } = IdParam.parse(req.params);
        const horarioId = zod_1.z.coerce.number().int().positive().parse(req.params.horarioId);
        const exists = await prisma_1.prisma.horarioSemanal.findFirst({ where: { id: horarioId, userId: id } });
        if (!exists)
            return res.status(404).json({ message: 'Slot não encontrado' });
        await prisma_1.prisma.horarioSemanal.delete({ where: { id: horarioId } });
        res.status(204).send();
    }
    catch (e) {
        next(e);
    }
});
exports.default = r;
