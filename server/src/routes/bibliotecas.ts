// server/src/routes/bibliotecas.ts
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import { prisma } from '../prisma'
import { z } from 'zod'
import { auth, requireRole } from '../middleware/auth'
import { Role as PrismaRole, Prisma } from '@prisma/client'

const router = Router()

/* ============================== Schemas ============================== */

const IdParam = z.object({
  id: z.coerce.number().int().positive(),
})

const CreateBody = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto'),
  local: z.string().trim().max(255).optional().nullable(),
})

const PutBody = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto'),
  local: z.string().trim().max(255).optional().nullable(),
})

const PatchBody = z.object({
  nome: z.string().trim().min(2).optional(),
  local: z.string().trim().max(255).optional().nullable(),
})

const ListQuery = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['id', 'nome']).default('nome'),
  order: z.enum(['asc', 'desc']).default('asc'),
})

function pageResponse<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize }
}

/* ============================== Pública ============================== */
/**
 * GET /bibliotecas/public  (sem auth)
 * Retorna apenas { id, nome } com paginação e filtro q
 */
router.get(
  '/public',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page ?? 1))
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 200)))
      const q = String(req.query.q ?? '').trim()

      const where = q
        ? { nome: { contains: q, mode: 'insensitive' as const } }
        : {}

      const [items, total] = await Promise.all([
        prisma.biblioteca.findMany({
          where,
          orderBy: { nome: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: { id: true, nome: true },
        }),
        prisma.biblioteca.count({ where }),
      ])

      res.json({ items, total, page, pageSize })
    } catch (e) {
      next(e)
    }
  },
)

/* ============================== ADMIN: Listar ============================== */
/**
 * GET /bibliotecas  (ADMIN)
 */
router.get(
  '/',
  auth(true),
  requireRole(PrismaRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, page, pageSize, sort, order } = ListQuery.parse(req.query)

      const where = q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { local: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}

      const [total, items] = await Promise.all([
        prisma.biblioteca.count({ where }),
        prisma.biblioteca.findMany({
          where,
          orderBy: { [sort]: order },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ])

      res.json(pageResponse(items, total, page, pageSize))
    } catch (e) {
      next(e)
    }
  },
)

/* ============================== ADMIN: Obter uma ============================== */
/**
 * GET /bibliotecas/:id  (ADMIN)
 */
router.get(
  '/:id',
  auth(true),
  requireRole(PrismaRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = IdParam.parse(req.params)
      const b = await prisma.biblioteca.findUnique({ where: { id } })
      if (!b) return res.status(404).json({ message: 'Biblioteca não encontrada' })
      res.json(b)
    } catch (e) {
      next(e)
    }
  },
)

/* ============================== ADMIN: Criar ============================== */
/**
 * POST /bibliotecas  (ADMIN)
 */
router.post(
  '/',
  auth(true),
  requireRole(PrismaRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = CreateBody.parse(req.body)
      const created = await prisma.biblioteca.create({
        data: { nome: data.nome, local: data.local ?? null },
      })
      res.status(201).json(created)
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return res.status(409).json({ message: 'Já existe uma biblioteca com este nome' })
      }
      next(e)
    }
  },
)

/* ============================== ADMIN: Substituir ============================== */
/**
 * PUT /bibliotecas/:id  (ADMIN)
 */
router.put(
  '/:id',
  auth(true),
  requireRole(PrismaRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = IdParam.parse(req.params)
      const body = PutBody.parse(req.body)

      const updated = await prisma.biblioteca.update({
        where: { id },
        data: { nome: body.nome, local: body.local ?? null },
      })

      res.json(updated)
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          return res.status(409).json({ message: 'Já existe uma biblioteca com este nome' })
        }
        if (e.code === 'P2025') {
          return res.status(404).json({ message: 'Biblioteca não encontrada' })
        }
      }
      next(e)
    }
  },
)

/* ============================== ADMIN: Atualizar parcialmente ============================== */
/**
 * PATCH /bibliotecas/:id  (ADMIN)
 */
router.patch(
  '/:id',
  auth(true),
  requireRole(PrismaRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = IdParam.parse(req.params)
      const body = PatchBody.parse(req.body)

      const data: Record<string, any> = {}
      if (body.nome !== undefined) data.nome = body.nome
      if (body.local !== undefined) data.local = body.local ?? null

      const updated = await prisma.biblioteca.update({
        where: { id },
        data,
      })

      res.json(updated)
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          return res.status(409).json({ message: 'Já existe uma biblioteca com este nome' })
        }
        if (e.code === 'P2025') {
          return res.status(404).json({ message: 'Biblioteca não encontrada' })
        }
      }
      next(e)
    }
  },
)

/* ============================== ADMIN: Apagar ============================== */
/**
 * DELETE /bibliotecas/:id  (ADMIN)
 * - bloqueia se houver utilizadores associados
 */
router.delete(
  '/:id',
  auth(true),
  requireRole(PrismaRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = IdParam.parse(req.params)

      // regra: não apagar se houver utilizadores na biblioteca
      const countUsers = await prisma.user.count({ where: { bibliotecaId: id } })
      if (countUsers > 0) {
        return res.status(409).json({
          message: 'Não é possível remover: existem utilizadores associados',
        })
      }

      // opcional: também bloquear se tiver livros/pedidos/requisições
      const [countLivros, countPedidos, countReqs] = await Promise.all([
        prisma.livro.count({ where: { bibliotecaId: id } }),
        prisma.pedido.count({ where: { bibliotecaId: id } }),
        prisma.requisicao.count({ where: { bibliotecaId: id } }),
      ])
      if (countLivros + countPedidos + countReqs > 0) {
        return res.status(409).json({
          message:
            'Não é possível remover: existem registos associados (livros/pedidos/requisições).',
        })
      }

      await prisma.biblioteca.delete({ where: { id } })
      res.status(204).send()
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') {
          return res.status(404).json({ message: 'Biblioteca não encontrada' })
        }
        if (e.code === 'P2003') {
          return res
            .status(409)
            .json({ message: 'Violação de integridade referencial' })
        }
      }
      next(e)
    }
  },
)

export default router
