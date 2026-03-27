// server/src/routes/livros.ts
import { Router, type Request, type Response } from 'express'
import { prisma } from '../prisma'
import { asyncHandler } from '../middleware/async'
import { auth, requireRole } from '../middleware/auth'
import { z } from 'zod'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { Role } from '@prisma/client'

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: number; role: Role; bibliotecaId: number | null }
  }
}

const router = Router()

/* =========================================================
 * PREPARAR PASTA /uploads E MULTER
 * ========================================================= */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin'
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
    cb(null, `${Date.now()}_${base}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|svg\+xml)/.test(file.mimetype)
    if (!ok) return cb(new Error('Tipo de ficheiro inválido (use PNG/JPG/SVG)') as any, false)
    cb(null, true)
  },
})

/* =========================================================
 * HELPERS
 * ========================================================= */
function livroToDTO(l: any) {
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
  }
}

async function ensureLivro(id: number) {
  const l = await prisma.livro.findUnique({ where: { id } })
  if (!l) {
    const err: any = new Error('Livro não encontrado')
    err.statusCode = 404
    throw err
  }
  return l
}

/**
 * ADMIN: livre. BIBLIOTECARIO: só mesma biblioteca.
 */
function mustSameBibliotecaOrAdmin(req: Request, livroBibId: number | null) {
  if (req.auth?.role === Role.ADMIN) return
  if (req.auth?.role === Role.BIBLIOTECARIO) {
    if (!req.auth.bibliotecaId || req.auth.bibliotecaId !== livroBibId) {
      const err: any = new Error('Sem permissão: livro de outra biblioteca')
      err.statusCode = 403
      throw err
    }
  }
}

/**
 * Filtro de biblioteca para listagens
 * - BIBLIOTECARIO: força a sua biblioteca
 * - ADMIN **ou PAI**: pode listar tudo (sem filtro) ou filtrar por ?bibliotecaId
 * - Público (sem auth): exige ?bibliotecaId
 */
function resolveBibliotecaFilter(req: Request): { bibliotecaId?: number; force: boolean } {
  if (req.auth?.role === Role.BIBLIOTECARIO) {
    if (!req.auth.bibliotecaId) {
      const err: any = new Error('Sem biblioteca associada ao utilizador.')
      err.statusCode = 400
      throw err
    }
    return { bibliotecaId: req.auth.bibliotecaId, force: true }
  }

  if (req.auth?.role === Role.ADMIN || req.auth?.role === Role.PAI) {
    const qBib = Number(req.query.bibliotecaId ?? NaN)
    return Number.isFinite(qBib) ? { bibliotecaId: qBib, force: true } : { force: false }
  }

  // público (não autenticado): precisa indicar bibliotecaId
  const qBib = Number(req.query.bibliotecaId ?? NaN)
  if (!Number.isFinite(qBib)) {
    const err: any = new Error('bibliotecaId é obrigatório para listar livros.')
    err.statusCode = 400
    throw err
  }
  return { bibliotecaId: qBib, force: true }
}

/* =========================================================
 * Zod schemas
 * ========================================================= */
const commonShape = {
  imagem: z
    .string()
    .url()
    .optional()
    .or(z.string().regex(/^data:image\/(png|jpeg|jpg|svg\+xml);base64,/, 'dataURL inválido').optional())
    .or(z.literal('').transform(() => undefined))
    .optional(),
  titulo: z.string().min(1, 'Título é obrigatório'),
  autor: z.string().min(1, 'Autor é obrigatório'),
  faixaEtaria: z.string().min(1, 'Faixa etária é obrigatória'),
  categoria: z.string().min(1, 'Categoria é obrigatória'),
  descricao: z.string().max(1000).optional().or(z.literal('').transform(() => undefined)),
  quantidade: z.coerce.number().int().min(0, 'Quantidade mínima 0'),
}

const LivroBody = z.discriminatedUnion('tipoAquisicao', [
  z.object({
    ...commonShape,
    tipoAquisicao: z.literal('compra'),
    preco: z.coerce.number().min(0, 'Preço não pode ser negativo'),
    diasDevolucao: z.coerce.number().int().positive().optional().nullable().transform(() => null),
  }),
  z.object({
    ...commonShape,
    tipoAquisicao: z.literal('emprestimo'),
    preco: z.coerce.number().optional().nullable().transform(() => null),
    diasDevolucao: z.coerce.number().int().min(1, 'Pelo menos 1 dia'),
  }),
])

const AjusteBody = z.object({
  delta: z.number().int(),
  motivo: z.string().trim().min(3).max(200).optional(),
})

const CommentBody = z.object({
  rating: z.number().int().min(1).max(5),
  texto: z.string().trim().min(3).max(1000),
})

/* =========================================================
 * LISTAR LIVROS
 * ========================================================= */
router.get(
  '/',
  auth(), // opcional
  asyncHandler(async (req: Request, res: Response) => {
    const q = (req.query.q as string | undefined)?.trim() ?? ''
    const categoria = (req.query.categoria as string | undefined)?.trim() ?? ''
    const tipo = req.query.tipo as 'compra' | 'emprestimo' | undefined
    const faixa = (req.query.faixa as string | undefined)?.trim() ?? ''

    const page = Math.max(1, Number(req.query.page ?? 1))
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)))

    const { bibliotecaId, force } = resolveBibliotecaFilter(req)

    const where: any = {}
    if (force && typeof bibliotecaId === 'number') {
      where.bibliotecaId = bibliotecaId
    }

    if (q) {
      // Sem 'mode', deixa a BD decidir a sensibilidade por *collation*.
      where.OR = [
        { titulo:   { contains: q } },
        { autor:    { contains: q } },
        { categoria:{ contains: q } },
      ]
    }

    if (categoria) where.categoria   = { contains: categoria }
    if (faixa)     where.faixaEtaria = { contains: faixa }
    if (tipo === 'compra' || tipo === 'emprestimo') where.tipoAquisicao = tipo

    const [total, items] = await Promise.all([
      prisma.livro.count({ where }),
      prisma.livro.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { titulo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({ items: items.map(livroToDTO), total, page, pageSize })
  }),
)

/* =========================================================
 * DETALHE LIVRO
 * - BIBLIOTECARIO: só da própria biblioteca
 * - ADMIN/PAI: acesso total
 * - público: acesso permitido
 * ========================================================= */
router.get(
  '/:id',
  auth(),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const l = await ensureLivro(id)

    if (req.auth?.role === Role.BIBLIOTECARIO) {
      mustSameBibliotecaOrAdmin(req, l.bibliotecaId)
    }
    // ADMIN e PAI não têm bloqueio

    res.json(livroToDTO(l))
  }),
)

/* =========================================================
 * CRIAR LIVRO (staff)
 * ========================================================= */
router.post(
  '/',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const userBibId = req.auth!.bibliotecaId

    const dataParsed = LivroBody.parse(req.body)
    const normalized =
      dataParsed.tipoAquisicao === 'compra'
        ? { ...dataParsed, diasDevolucao: null }
        : { ...dataParsed, preco: null }

    let targetBibId: number | null = null
    if (req.auth!.role === Role.BIBLIOTECARIO) {
      if (!userBibId) return res.status(400).json({ message: 'Sem biblioteca associada' })
      targetBibId = userBibId
    } else {
      const fromBody = Number((req.body as any).bibliotecaId ?? NaN)
      if (!Number.isFinite(fromBody)) {
        return res.status(400).json({ message: 'ADMIN: bibliotecaId é obrigatório para criar livro.' })
      }
      targetBibId = fromBody
    }

    const created = await prisma.livro.create({
      data: {
        ...normalized,
        bibliotecaId: targetBibId!,
      } as any,
    })

    res.status(201).json(livroToDTO(created))
  }),
)

/* =========================================================
 * ATUALIZAR LIVRO (PUT total) (staff)
 * ========================================================= */
router.put(
  '/:id',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const current = await ensureLivro(id)
    mustSameBibliotecaOrAdmin(req, current.bibliotecaId)

    const dataParsed = LivroBody.parse(req.body)
    const normalized =
      dataParsed.tipoAquisicao === 'compra'
        ? { ...dataParsed, diasDevolucao: null }
        : { ...dataParsed, preco: null }

    if (req.auth!.role !== Role.ADMIN && (req.body as any).bibliotecaId !== undefined) {
      return res.status(403).json({ message: 'Não é permitido alterar a biblioteca do livro.' })
    }

    const data: any = { ...normalized }
    if (req.auth!.role === Role.ADMIN && (req.body as any).bibliotecaId !== undefined) {
      const newBib = Number((req.body as any).bibliotecaId)
      if (!Number.isFinite(newBib)) return res.status(400).json({ message: 'bibliotecaId inválido.' })
      data.bibliotecaId = newBib
    }

    const updated = await prisma.livro.update({ where: { id }, data })
    res.json(livroToDTO(updated))
  }),
)

/* =========================================================
 * APAGAR LIVRO (staff)
 * ========================================================= */
router.delete(
  '/:id',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const current = await ensureLivro(id)
    mustSameBibliotecaOrAdmin(req, current.bibliotecaId)

    await prisma.livro.delete({ where: { id } })
    res.status(204).send()
  }),
)

/* =========================================================
 * AJUSTAR STOCK (staff)
 * ========================================================= */
router.post(
  '/:id/ajuste-quantidade',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const body = AjusteBody.parse(req.body)
    const current = await ensureLivro(id)
    mustSameBibliotecaOrAdmin(req, current.bibliotecaId)

    const updated = await prisma
      .$transaction(async (tx) => {
        const novaQtd = (current.quantidade ?? 0) + body.delta
        if (novaQtd < 0) {
          const err: any = new Error('Ajuste levaria a quantidade negativa.')
          err.statusCode = 400
          throw err
        }

        const up = await tx.livro.update({ where: { id }, data: { quantidade: novaQtd } })
        await tx.atividade.create({
          data: {
            userId: req.auth?.userId ?? null,
            action: 'livro_ajuste_quantidade',
            meta: { livroId: id, delta: body.delta, motivo: body.motivo ?? null },
          },
        })
        return up
      })
      .catch((err: any) => {
        if (err?.statusCode === 400) return null
        throw err
      })

    if (!updated) return res.status(400).json({ message: 'Ajuste levaria a quantidade negativa.' })
    res.json(livroToDTO(updated))
  }),
)

/* =========================================================
 * COMENTÁRIOS
 * ========================================================= */

// GET /livros/:id/comentarios
router.get(
  '/:id/comentarios',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await prisma.comentarioLivro.findMany({
      where: { livroId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
      take: 50,
    })
    res.json(
      rows.map((c) => ({
        id: c.id,
        user: c.user?.name ?? 'Utilizador',
        rating: c.rating,
        texto: c.texto,
        createdAt: c.createdAt,
      })),
    )
  }),
)

// POST /livros/:id/comentarios
router.post(
  '/:id/comentarios',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req, res) => {
    const livroId = Number(req.params.id)
    const data = CommentBody.parse(req.body)
    const livro = await ensureLivro(livroId)

    // Restrição só para BIBLIOTECARIO; PAI e ADMIN podem comentar qualquer livro
    if (req.auth?.role === Role.BIBLIOTECARIO) {
      mustSameBibliotecaOrAdmin(req, livro.bibliotecaId)
    }

    const created = await prisma.comentarioLivro.create({
      data: {
        livroId,
        userId: req.auth!.userId,
        rating: data.rating,
        texto: data.texto,
        bibliotecaId: livro.bibliotecaId,
      },
      include: { user: { select: { name: true} } },
    })

    res.status(201).json({
      id: created.id,
      user: created.user?.name ?? 'Utilizador',
      rating: created.rating,
      texto: created.texto,
      createdAt: created.createdAt,
    })
  }),
)

/* =========================================================
 * UPLOAD CAPA (staff)
 * ========================================================= */
router.post(
  '/:id/capa',
  auth(true),
  requireRole(Role.BIBLIOTECARIO, Role.ADMIN),
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id)
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) return res.status(400).json({ message: 'Envie um ficheiro no campo "file".' })

    const livro = await ensureLivro(id)
    mustSameBibliotecaOrAdmin(req, livro.bibliotecaId)

    const publicUrl = `/uploads/${path.basename(file.path)}`
    const up = await prisma.livro.update({ where: { id }, data: { imagem: publicUrl } })
    res.json(livroToDTO(up))
  }),
)

export default router
