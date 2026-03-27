// server/src/routes/familia.ts
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { auth, requireRole } from '../middleware/auth'
import { Role } from '@prisma/client'
import { asyncHandler } from '../middleware/async'

const r = Router()

type AuthedRequest = Request & { auth?: { userId: number; role: Role } }

const isAdmin = (req: AuthedRequest) => req.auth?.role === Role.ADMIN
const isBib = (req: AuthedRequest) => req.auth?.role === Role.BIBLIOTECARIO

async function myBibId(req: AuthedRequest) {
  const u = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { bibliotecaId: true },
  })
  return u?.bibliotecaId ?? null
}

const userSlim = (u: any) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.isActive,
    bibliotecaId: u.bibliotecaId ?? null,
    biblioteca: u.biblioteca
      ? { id: u.biblioteca.id, nome: u.biblioteca.nome }
      : null,
  }

const familiaDTO = (f: any) =>
  f && {
    id: f.id,
    userId: f.userId,
    telefone: f.telefone,
    morada: f.morada,
    interesses: f.interesses ?? [],
    createdAt: f.createdAt,
    filhos: (f.filhos ?? []).map((x: any) => ({
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
  }

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
} as const

// GET /familia
r.get(
  '/',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string | undefined)?.trim() ?? ''
      const page = Math.max(1, Number(req.query.page ?? 1))
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20)))
      const order: 'asc' | 'desc' =
        String(req.query.order ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'

      // Nota: filtros em relações devem usar `is: {...}`
      const where: any = { user: { is: { role: Role.PAI } } }

      if (isAdmin(req)) {
        // admin vê tudo
      } else if (isBib(req)) {
        const bib = await myBibId(req)
        if (!bib) {
          return res.status(400).json({ message: 'Bibliotecário sem biblioteca associada.' })
        }
        where.user = { is: { ...(where.user?.is || {}), bibliotecaId: bib } }
      } else {
        // PAI só vê a sua família (por relação direta com userId)
        where.userId = req.auth!.userId
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
        ]
      }

      const [total, items] = await Promise.all([
        prisma.familia.count({ where }),
        prisma.familia.findMany({
          where,
          include: includeFam,
          // orderBy por campo de relação é suportado assim
          orderBy: { user: { name: order } },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ])

      res.json({ items: items.map(familiaDTO), total, page, pageSize })
    } catch (e) {
      next(e)
    }
  },
)
r.get(
  '/minha/filhos',
  auth(),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).auth!.userId
    const fam = await prisma.familia.findFirst({
      where: { userId },
      select: { id: true, filhos: { select: { id: true, nome: true } } },
    })
    if (!fam) return res.json({ familiaId: null, filhos: [] })
    res.json({ familiaId: fam.id, filhos: fam.filhos })
  }),
)
r.get('/:id(\\d+)/estatisticas', auth(true), requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      // TODO: trocar por queries reais (requisicoes/compras/consultas)
      res.json({
        totalRequisicoes: 0,
        totalCompras: 0,
        totalConsultas: 0,
      });
    } catch (e) { next(e); }
  }
);
// GET /familia/:id
r.get(
  '/:id(\\d+)',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id)
      const fam = await prisma.familia.findUnique({
        where: { id },
        include: includeFam,
      })
      if (!fam) return res.status(404).json({ message: 'Não encontrado' })

      if (isAdmin(req)) return res.json(familiaDTO(fam))

      if (isBib(req)) {
        const bib = await myBibId(req)
        if (!bib || fam.user?.bibliotecaId !== bib) {
          return res.status(403).json({ message: 'Sem permissão' })
        }
        return res.json(familiaDTO(fam))
      }

      if (fam.userId !== req.auth!.userId) {
        return res.status(403).json({ message: 'Sem permissão' })
      }
      res.json(familiaDTO(fam))
    } catch (e) {
      next(e)
    }
  },
)

// POST /familia
r.post(
  '/',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const Filho = z.object({
        nome: z.string().min(1),
        idade: z.coerce.number().min(0).max(18),
        genero: z.enum(['F', 'M', 'Outro']),
        perfilLeitor: z.enum(['iniciante', 'Dislexia', 'autonomo']),
      })

      const Body = z.object({
        userId: z.coerce.number().int().positive(),
        telefone: z.string().min(3),
        morada: z.string().min(3),
        interesses: z.array(z.string()).default([]),
        filhos: z.array(Filho).default([]),
      })

      const data = Body.parse(req.body)

      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true, role: true, bibliotecaId: true },
      })
      if (!user) return res.status(400).json({ message: 'Utilizador não encontrado' })
      if (user.role !== Role.PAI) return res.status(400).json({ message: 'Utilizador não é PAI' })

      if (isBib(req)) {
        const bib = await myBibId(req)
        if (!bib || user.bibliotecaId !== bib) {
          return res.status(403).json({ message: 'Só da tua biblioteca.' })
        }
      }

      const exists = await prisma.familia.findUnique({ where: { userId: data.userId } })
      if (exists) return res.status(409).json({ message: 'Este utilizador já possui família' })

      const created = await prisma.$transaction(async (tx) => {
        const fam = await tx.familia.create({
          data: {
            userId: data.userId,
            telefone: data.telefone,
            morada: data.morada,
            interesses: data.interesses,
          },
        })

        if (data.filhos.length) {
          await tx.filho.createMany({
            data: data.filhos.map((f) => ({
              familiaId: fam.id,
              nome: f.nome,
              idade: f.idade,
              genero: f.genero,
              perfilLeitor: f.perfilLeitor,
            })),
          })
        }

        return tx.familia.findUnique({ where: { id: fam.id }, include: includeFam })
      })

      res.status(201).json(familiaDTO(created))
    } catch (e) {
      next(e)
    }
  },
)

// PUT /familia/:id
r.put(
  '/:id(\\d+)',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id)

      const Body = z.object({
        telefone: z.string().min(3).optional(),
        morada: z.string().min(3).optional(),
        interesses: z.array(z.string()).optional(),
        user: z
          .object({
            name: z.string().min(1).optional(),
            email: z.string().email().optional(),
            bibliotecaId: z.coerce.number().int().positive().nullable().optional(),
          })
          .optional(),
      })

      const data = Body.parse(req.body)

      if (!data.telefone && !data.morada && !data.interesses && !data.user) {
        return res.status(400).json({ message: 'Nenhum campo para atualizar' })
      }

      const fam = await prisma.familia.findUnique({
        where: { id },
        include: { user: { select: { id: true, bibliotecaId: true } } },
      })
      if (!fam) return res.status(404).json({ message: 'Não encontrado' })

      if (isBib(req)) {
        const bib = await myBibId(req)
        if (!bib || fam.user?.bibliotecaId !== bib) return res.status(403).json({ message: 'Sem permissão' })
        if (data.user) return res.status(403).json({ message: 'Só ADMIN pode alterar dados do utilizador.' })
      }

      const updated = await prisma.familia.update({
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
      })

      res.json(familiaDTO(updated))
    } catch (e) {
      next(e)
    }
  },
)

// DELETE /familia/:id
r.delete(
  '/:id(\\d+)',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id)

      const fam = await prisma.familia.findUnique({
        where: { id },
        include: { user: { select: { bibliotecaId: true } } },
      })
      if (!fam) return res.status(404).json({ message: 'Não encontrado' })

      if (isBib(req)) {
        const bib = await myBibId(req)
        if (!bib || fam.user?.bibliotecaId !== bib) return res.status(403).json({ message: 'Sem permissão' })
      }

      await prisma.$transaction(async (tx) => {
        await tx.filho.deleteMany({ where: { familiaId: id } })
        await tx.familia.delete({ where: { id } })
      })

      res.status(204).send()
    } catch (e) {
      next(e)
    }
  },
)

// GET /familia/me
r.get(
  '/me',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const u = await prisma.user.findUnique({
        where: { id: req.auth!.userId },
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
      })

      return res.json({
        user: userSlim(u),
        familia: u?.familia ? familiaDTO(u.familia) : null,
      })
    } catch (e) {
      next(e)
    }
  },
)

// PUT /familia (própria família do PAI/Admin)
r.put(
  '/',
  auth(true),
  requireRole(Role.PAI, Role.ADMIN),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const Body = z.object({
        telefone: z.string().min(3).optional(),
        morada: z.string().min(3).optional(),
        interesses: z.array(z.string()).optional(),
        user: z
          .object({
            name: z.string().min(1).optional(),
            email: z.string().email().optional(),
          })
          .optional(),
      })

      const data = Body.parse(req.body)

      if (!data.telefone && !data.morada && !data.interesses && !data.user) {
        return res.status(400).json({ message: 'Nenhum campo para atualizar' })
      }

      const fam = await prisma.familia
        .update({
          where: { userId: req.auth!.userId },
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
        .catch(() => null)

      if (!fam) return res.status(400).json({ message: 'Família não encontrada' })

      res.json({ user: userSlim(fam.user), familia: familiaDTO(fam) })
    } catch (e) {
      next(e)
    }
  },
)

export default r
