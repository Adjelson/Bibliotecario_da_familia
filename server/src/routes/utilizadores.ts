// server/src/routes/utilizadores.ts
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { Role as PrismaRole } from '@prisma/client'
import { prisma } from '../prisma'
import { auth, requireRole } from '../middleware/auth'

const r = Router()

/* ========================= Schemas ========================= */

const RoleUi = z.enum(['PAI', 'BIBLIOTECARIO', 'ADMIN'])
const toPrismaRole = (r?: string) =>
  (r === 'ADMIN' ? PrismaRole.ADMIN : r === 'BIBLIOTECARIO' ? PrismaRole.BIBLIOTECARIO : PrismaRole.PAI)

const UserCreate = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  role: RoleUi.default('PAI'),
  password: z.string().min(6, 'Password mínima 6'),
  active: z.boolean().optional(),
  bibliotecaId: z.coerce.number().int().positive().nullable().optional(),
})

const UserUpdate = z
  .object({
    name: z.string().min(3).optional(),
    email: z.string().email().optional(),
    role: RoleUi.optional(),
    password: z.string().min(6).optional(),
    active: z.boolean().optional(),
    bibliotecaId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Sem campos' })

const IdParam = z.object({ id: z.coerce.number().int().positive() })

// Horário: weekday 0..6, minutos desde 00:00
const SlotBase = z.object({
  weekday: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(24 * 60 - 1),
  endMin: z.number().int().min(1).max(24 * 60),
  slotMin: z.number().int().min(5).max(240).default(30),
  active: z.boolean().default(true),
})
// Versão "com regra" (usa refine → vira ZodEffects, sem .partial)
const Slot = SlotBase.refine((s) => s.endMin > s.startMin, { message: 'endMin deve ser > startMin' })
// Para PATCH precisamos de .partial(); validamos a regra com o registo atual (runtime)
const SlotPatch = SlotBase.partial().refine((p) => Object.keys(p).length > 0, { message: 'Sem campos' })
type SlotPatchType = z.infer<typeof SlotPatch>
const SlotsBody = z.array(Slot).min(1)

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
} as const

const dto = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role as PrismaRole,
  active: !!u.isActive,
  bibliotecaId: u.bibliotecaId ?? null,
  biblioteca: u.biblioteca ? { id: u.biblioteca.id, nome: u.biblioteca.nome, local: u.biblioteca.local } : null,
})

/* ========================= Utils ========================= */

function mapPrismaError(e: any): { status: number; message: string } | null {
  if (e?.code === 'P2002') return { status: 409, message: 'Já existe um utilizador com este email.' }
  if (e?.code === 'P2003') {
    const f = e?.meta?.field_name ?? e?.meta?.constraint ?? ''
    if (String(f).includes('bibliotecaId')) return { status: 400, message: 'Biblioteca inválida.' }
    return { status: 409, message: 'Conflito de integridade.' }
  }
  return null
}

/* ========================= CRUD Utilizadores ========================= */

// GET /utilizadores
r.get('/', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const q = ((req.query.q as string) || '').trim()
    const roleQ = (req.query.role as string) || undefined
    const activeQ = (req.query.active as string) || undefined
    const bibliotecaIdQ = req.query.bibliotecaId ? Number(req.query.bibliotecaId) : undefined

    const page = Math.max(1, Number(req.query.page ?? 1))
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20)))

    const where: any = {}
    if (q)
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ]
    if (roleQ) where.role = toPrismaRole(roleQ)
    if (activeQ === 'true' || activeQ === 'false') where.isActive = activeQ === 'true'
    if (typeof bibliotecaIdQ === 'number' && !Number.isNaN(bibliotecaIdQ)) where.bibliotecaId = bibliotecaIdQ

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: userSelect,
      }),
    ])

    res.json({ items: items.map(dto), total, page, pageSize })
  } catch (e) {
    next(e)
  }
})

// GET /utilizadores/:id
r.get('/:id', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const u = await prisma.user.findUnique({ where: { id }, select: userSelect })
    if (!u) return res.status(404).json({ message: 'Utilizador não encontrado' })
    res.json(dto(u))
  } catch (e) {
    next(e)
  }
})

// POST /utilizadores
r.post('/', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const body = UserCreate.parse(req.body)
    const passwordHash = await bcrypt.hash(body.password, 10)

    const created = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        role: toPrismaRole(body.role),
        isActive: body.active ?? true,
        passwordHash,
        bibliotecaId: body.bibliotecaId ?? null,
      },
      select: userSelect,
    })
    res.status(201).json(dto(created))
  } catch (e: any) {
    const m = mapPrismaError(e)
    if (m) return res.status(m.status).json({ message: m.message })
    next(e)
  }
})

// PUT /utilizadores/:id
r.put('/:id', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const body = UserCreate.parse(req.body) // PUT = shape completo
    const passwordHash = await bcrypt.hash(body.password, 10)

    const updated = await prisma.user.update({
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
    })
    res.json(dto(updated))
  } catch (e: any) {
    const m = mapPrismaError(e)
    if (m) return res.status(m.status).json({ message: m.message })
    next(e)
  }
})

// PATCH /utilizadores/:id
r.patch('/:id', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const body = UserUpdate.parse(req.body)

    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.email !== undefined) data.email = body.email
    if (body.role !== undefined) data.role = toPrismaRole(body.role)
    if (typeof body.active === 'boolean') data.isActive = body.active
    if ('bibliotecaId' in body) data.bibliotecaId = body.bibliotecaId ?? null
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10)

    const updated = await prisma.user.update({ where: { id }, data, select: userSelect })
    res.json(dto(updated))
  } catch (e: any) {
    const m = mapPrismaError(e)
    if (m) return res.status(m.status).json({ message: m.message })
    next(e)
  }
})

// DELETE /utilizadores/:id
r.delete('/:id', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    if (req.auth?.userId === id) return res.status(400).json({ message: 'Não podes remover a tua própria conta' })
    await prisma.user.delete({ where: { id } })
    res.status(204).send()
  } catch (e: any) {
    const m = mapPrismaError(e)
    if (m) return res.status(m.status).json({ message: m.message })
    next(e)
  }
})

/* ========================= HorárioSemanal ========================= */
/**
 * GET    /utilizadores/:id/horario                → lista slots
 * PUT    /utilizadores/:id/horario                → substitui todos (bulk replace)
 * PATCH  /utilizadores/:id/horario/:horarioId     → edita 1 slot (parcial)
 * DELETE /utilizadores/:id/horario/:horarioId     → apaga 1 slot
 */

// GET slots do utilizador
r.get('/:id/horario', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const rows = await prisma.horarioSemanal.findMany({
      where: { userId: id },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    })
    res.json(rows)
  } catch (e) {
    next(e)
  }
})

// PUT (replace all)
r.put('/:id/horario', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const slots = SlotsBody.parse(req.body)

    // Regra: não permitir overlap no mesmo weekday
    const byDay = new Map<number, { s: number; e: number }[]>()
    for (const s of slots) {
      const arr = byDay.get(s.weekday) ?? []
      if (arr.some((x) => Math.max(x.s, s.startMin) < Math.min(x.e, s.endMin))) {
        return res.status(400).json({ message: `Overlap no weekday ${s.weekday}` })
      }
      arr.push({ s: s.startMin, e: s.endMin })
      byDay.set(s.weekday, arr)
    }

    const out = await prisma.$transaction(async (tx) => {
      await tx.horarioSemanal.deleteMany({ where: { userId: id } })
      await tx.horarioSemanal.createMany({
        data: slots.map((s) => ({
          userId: id,
          weekday: s.weekday,
          startMin: s.startMin,
          endMin: s.endMin,
          slotMin: s.slotMin,
          active: s.active,
        })),
      })
      return tx.horarioSemanal.findMany({
        where: { userId: id },
        orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
      })
    })

    res.json(out)
  } catch (e) {
    next(e)
  }
})

// PATCH 1 slot
r.patch('/:id/horario/:horarioId', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const horarioId = z.coerce.number().int().positive().parse(req.params.horarioId)
    const body: SlotPatchType = SlotPatch.parse(req.body)

    const exists = await prisma.horarioSemanal.findFirst({ where: { id: horarioId, userId: id } })
    if (!exists) return res.status(404).json({ message: 'Slot não encontrado' })

    // valida a regra end > start se um dos campos for alterado
    const nextStart = body.startMin ?? exists.startMin
    const nextEnd = body.endMin ?? exists.endMin
    if (!(nextEnd > nextStart)) {
      return res.status(400).json({ message: 'endMin deve ser > startMin' })
    }

    const up = await prisma.horarioSemanal.update({
      where: { id: horarioId },
      data: {
        weekday: body.weekday ?? undefined,
        startMin: body.startMin ?? undefined,
        endMin: body.endMin ?? undefined,
        slotMin: body.slotMin ?? undefined,
        active: body.active ?? undefined,
      },
    })

    res.json(up)
  } catch (e) {
    next(e)
  }
})

// DELETE 1 slot
r.delete('/:id/horario/:horarioId', auth(), requireRole(PrismaRole.ADMIN), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params)
    const horarioId = z.coerce.number().int().positive().parse(req.params.horarioId)

    const exists = await prisma.horarioSemanal.findFirst({ where: { id: horarioId, userId: id } })
    if (!exists) return res.status(404).json({ message: 'Slot não encontrado' })

    await prisma.horarioSemanal.delete({ where: { id: horarioId } })
    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

export default r
