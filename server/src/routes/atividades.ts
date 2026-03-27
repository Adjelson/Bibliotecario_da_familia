// server/src/routes/atividades.ts
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { prisma } from '../prisma'
import { auth, requireRole } from '../middleware/auth'
import { asyncHandler } from '../middleware/async'
import { Role } from '@prisma/client'

const r = Router()

/* =========================== Upload =========================== */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'eventos')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg'
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})
const upload = multer({ storage })

/* =========================== Schemas =========================== */
const StatusEvt = z.enum(['agendada', 'em_andamento', 'concluida'])

const EventoBodyBase = z.object({
  titulo: z.string().trim().min(1, 'Título é obrigatório'),
  descricao: z.string().trim().min(1, 'Descrição é obrigatória'),
  data: z.coerce.date(),
  horario: z
    .string()
    .regex(/^\d{2}:\d{2}\s-\s\d{2}:\d{2}$/, 'Formato: "HH:MM - HH:MM"'),
  local: z.string().trim().min(1, 'Local é obrigatório'),
  vagas: z.coerce.number().int().min(1, 'Vagas mínimas: 1'),
  status: StatusEvt.default('agendada'),
  imagem: z.string().min(1).optional(),
})

const EventoCreateBody = EventoBodyBase.extend({
  bibliotecaId: z.coerce.number().int().positive().optional(),
})

const EventoPatchBody = EventoBodyBase.partial().extend({
  bibliotecaId: z.coerce.number().int().positive().optional(),
})

const InscricaoBody = z.object({
  familiaId: z.coerce.number().int().positive().optional(),
  utilizadorId: z.coerce.number().int().positive().optional(),
  todosFamilia: z.boolean().optional(),
  incluirResponsavel: z.boolean().optional(),
  filhosIds: z.array(z.coerce.number().int().positive()).optional(),
  numFilhosAcompanhantes: z.coerce.number().int().min(0).optional(),
})

/* =========================== Helpers =========================== */
function ymdLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function httpError(status: number, message: string) {
  const err = new Error(message) as any
  err.status = status
  return err
}

type Authed = { userId: number; role: Role }
type Scope = {
  auth: Authed
  bibliotecaId: number | null
  isAdmin: boolean
  isBibliotecario: boolean
  isPai: boolean
}

/** URL absoluta para ficheiros de /uploads */
function absUrl(req: Request, rel?: string | null) {
  if (!rel) return null
  const host = req.get('x-forwarded-host') || req.get('host')
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0]
  const clean = '/' + String(rel).replace(/^\/+/, '')
  return `${proto}://${host}${clean}`
}

/**
 * Escopo do utilizador autenticado.
 * - ADMIN: bibliotecaId = null (escopo global)
 * - BIBLIOTECARIO/PAI: deve ter bibliotecaId atribuído
 */
async function getUserScope(req: Request): Promise<Scope> {
  const authCtx = (req as any).auth as Authed | undefined
  if (!authCtx?.userId || !authCtx?.role) throw httpError(401, 'Não autenticado')

  const isAdmin = authCtx.role === Role.ADMIN
  const isBibliotecario = authCtx.role === Role.BIBLIOTECARIO
  const isPai = authCtx.role === Role.PAI

  if (isAdmin) {
    return { auth: authCtx, bibliotecaId: null, isAdmin: true, isBibliotecario: false, isPai: false }
  }

  const u = await prisma.user.findUnique({
    where: { id: authCtx.userId },
    select: { bibliotecaId: true },
  })
  if (!u) throw httpError(401, 'Utilizador inválido')

  if ((isBibliotecario || isPai) && u.bibliotecaId == null) {
    const msg = isBibliotecario ? 'Bibliotecário sem biblioteca atribuída' : 'Utilizador sem biblioteca atribuída'
    throw httpError(400, msg)
  }

  return {
    auth: authCtx,
    bibliotecaId: u.bibliotecaId ?? null,
    isAdmin: false,
    isBibliotecario,
    isPai,
  }
}

function todayMidnightLocal() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}
function parseYMD(s?: string) {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

type Sums = { adultos: number; filhos: number; total: number }

async function getSumsEvento(eventoId: number): Promise<Sums> {
  const g = await prisma.eventoParticipante.groupBy({
    by: ['eventoId'],
    where: { eventoId },
    _sum: { qtdAdultos: true, qtdFilhos: true },
  })
  const s = g[0]?._sum ?? { qtdAdultos: 0, qtdFilhos: 0 }
  const adultos = s.qtdAdultos ?? 0
  const filhos = s.qtdFilhos ?? 0
  return { adultos, filhos, total: adultos + filhos }
}

async function getSumsEventos(ids: number[]) {
  if (!ids.length) return new Map<number, Sums>()
  const g = await prisma.eventoParticipante.groupBy({
    by: ['eventoId'],
    where: { eventoId: { in: ids } },
    _sum: { qtdAdultos: true, qtdFilhos: true },
  })
  const map = new Map<number, Sums>()
  g.forEach(row => {
    const a = row._sum.qtdAdultos ?? 0
    const f = row._sum.qtdFilhos ?? 0
    map.set(row.eventoId, { adultos: a, filhos: f, total: a + f })
  })
  ids.forEach(id => { if (!map.has(id)) map.set(id, { adultos: 0, filhos: 0, total: 0 }) })
  return map
}

async function getPresentesMap(ids: number[]) {
  if (!ids.length) return new Map<number, number>()
  const g = await prisma.eventoParticipante.groupBy({
    by: ['eventoId'],
    where: { eventoId: { in: ids }, presente: true },
    _count: { _all: true },
  })
  const map = new Map<number, number>()
  g.forEach(row => map.set(row.eventoId, row._count._all))
  ids.forEach(id => { if (!map.has(id)) map.set(id, 0) })
  return map
}

async function resolveFamiliaIdForUser(userId: number) {
  const fam = await prisma.familia.findUnique({ where: { userId }, select: { id: true } })
  return fam?.id ?? null
}

/** DTO com imagemUrl absoluta */
function toDto(
  req: Request,
  e: any,
  sums?: Partial<Sums>,
  extra?: Record<string, unknown>,
  presentes?: number,
) {
  const adultos = sums?.adultos ?? 0
  const filhos = sums?.filhos ?? 0
  const total = adultos + filhos
  return {
    id: e.id,
    titulo: e.titulo,
    descricao: e.descricao,
    data: ymdLocal(e.data), // sem toISOString()
    horario: e.horario,
    local: e.local,
    vagas: e.vagas,
    status: e.status,
    imagem: e.imagem ?? null,          // relativo
    imagemUrl: absUrl(req, e.imagem),  // absoluto
    bibliotecaId: e.bibliotecaId ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    inscritosAdultos: adultos,
    inscritosFilhos: filhos,
    inscritosTotal: total,
    inscritos: total,
    participantes: total,
    presentes: presentes ?? 0,
    ...(extra ?? {}),
  }
}

/* =========================== LISTAR =========================== */
/**
 * GET /eventos
 * Filtros: q | tempo=hoje|futuras|passadas|todas | status | from/to (YYYY-MM-DD) | bibliotecaId(admin)
 */
r.get(
  '/',
  auth(),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)

    const q = (req.query.q as string | undefined)?.trim() ?? ''
    const tempo = (req.query.tempo as string | undefined)?.trim() || 'todas'

    const statusRaw = (req.query.status as string | undefined)?.trim()
    const status = StatusEvt.safeParse(statusRaw).success
      ? (statusRaw as z.infer<typeof StatusEvt>)
      : undefined

    const fromStr =
      (req.query.from as string | undefined) ??
      (req.query.dataInicio as string | undefined)
    const toStr =
      (req.query.to as string | undefined) ??
      (req.query.dataFim as string | undefined)

    const filtroBib = isAdmin
      ? (req.query.bibliotecaId ? Number(req.query.bibliotecaId) : undefined)
      : myBibId

    const page = Math.max(1, Number(req.query.page ?? 1) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20) || 20))

    const hoje = todayMidnightLocal()

    const where: any = {}
    if (q) {
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { descricao: { contains: q, mode: 'insensitive' } },
        { local: { contains: q, mode: 'insensitive' } },
      ]
    }
    if (status) where.status = status

    // Escopo
    if (!isAdmin) {
      where.bibliotecaId = filtroBib
    } else if (typeof filtroBib === 'number' && Number.isFinite(filtroBib)) {
      where.bibliotecaId = filtroBib
    }

    // Datas
    const from = parseYMD(fromStr)
    const to = parseYMD(toStr)
    if (from && to) where.data = { gte: from, lte: endOfDay(to) }
    else if (from) where.data = { gte: from }
    else if (to) where.data = { lte: endOfDay(to) }
    else {
      if (tempo === 'hoje') where.data = { gte: hoje, lte: endOfDay(hoje) }
      else if (tempo === 'futuras') where.data = { gt: endOfDay(hoje) }
      else if (tempo === 'passadas') where.data = { lt: hoje }
    }

    const [total, items] = await Promise.all([
      prisma.evento.count({ where }),
      prisma.evento.findMany({
        where,
        orderBy: [{ data: 'asc' }, { titulo: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const ids = items.map(e => e.id)
    const [sumsMap, presentesMap] = await Promise.all([
      getSumsEventos(ids),
      getPresentesMap(ids),
    ])

    const authCtx = (req as any).auth as { userId: number } | undefined
    let inscricoesMap = new Map<number, { inscrito: boolean; presente: boolean }>()
    if (authCtx && ids.length) {
      const familiaId = await resolveFamiliaIdForUser(authCtx.userId)
      const whereIns: any = { eventoId: { in: ids } }
      if (familiaId) whereIns.familiaId = familiaId
      else whereIns.utilizadorId = authCtx.userId

      const mine = await prisma.eventoParticipante.findMany({
        where: whereIns,
        select: { eventoId: true, presente: true },
      })
      for (const m of mine) {
        inscricoesMap.set(m.eventoId, { inscrito: true, presente: !!m.presente })
      }
    }

    res.json({
      items: items.map(e =>
        toDto(
          req,
          e,
          sumsMap.get(e.id) || { adultos: 0, filhos: 0, total: 0 },
          { ...(inscricoesMap.get(e.id) ?? { inscrito: false, presente: false }) },
          presentesMap.get(e.id) ?? 0,
        ),
      ),
      total,
      page,
      pageSize,
    })
  }),
)

/* =========================== DETALHE =========================== */
r.get(
  '/:id',
  auth(),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const id = z.coerce.number().int().positive().parse(req.params.id)

    const e = await prisma.evento.findUnique({ where: { id } })
    if (!e) return res.status(404).json({ message: 'Evento não encontrado' })

    if (!isAdmin && e.bibliotecaId !== myBibId) {
      return res.status(403).json({ message: 'Sem permissão' })
    }

    const sums = await getSumsEvento(id)
    const presentes = await prisma.eventoParticipante.count({
      where: { eventoId: id, presente: true },
    })

    let inscrito = false
    let presente = false
    const authCtx = (req as any).auth as { userId: number } | undefined
    if (authCtx) {
      const familiaId = await resolveFamiliaIdForUser(authCtx.userId)
      const whereIns: any = { eventoId: id }
      if (familiaId) whereIns.familiaId = familiaId
      else whereIns.utilizadorId = authCtx.userId
      const ex = await prisma.eventoParticipante.findFirst({
        where: whereIns,
        select: { id: true, presente: true },
      })
      inscrito = !!ex
      presente = !!ex?.presente
    }

    res.json(toDto(req, e, sums, { inscrito, presente }, presentes))
  }),
)

/* =========================== CRIAR =========================== */
r.post(
  '/',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const body = EventoCreateBody.parse(req.body)

    const bibliotecaId = isAdmin ? (body.bibliotecaId ?? null) : (myBibId ?? null)
    if (!bibliotecaId) {
      return res.status(400).json({ message: 'bibliotecaId obrigatório' })
    }

    const created = await prisma.evento.create({
      data: {
        titulo: body.titulo,
        descricao: body.descricao,
        data: body.data,
        horario: body.horario,
        local: body.local,
        vagas: body.vagas,
        status: body.status,
        imagem: body.imagem ?? null,
        biblioteca: { connect: { id: bibliotecaId } },
      },
    })

    res
      .status(201)
      .json(
        toDto(
          req,
          created,
          { adultos: 0, filhos: 0, total: 0 },
          { inscrito: false, presente: false },
          0,
        ),
      )
  }),
)

/* =========================== UPDATE (full) =========================== */
r.put(
  '/:id',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const id = z.coerce.number().int().positive().parse(req.params.id)
    const body = EventoCreateBody.parse(req.body)

    const current = await prisma.evento.findUnique({ where: { id } })
    if (!current) return res.status(404).json({ message: 'Evento não encontrado' })
    if (!isAdmin && current.bibliotecaId !== myBibId) {
      return res.status(403).json({ message: 'Sem permissão' })
    }

    const bibliotecaId = isAdmin
      ? (body.bibliotecaId ?? current.bibliotecaId)
      : (myBibId ?? current.bibliotecaId)

    const up = await prisma.evento.update({
      where: { id },
      data: {
        titulo: body.titulo,
        descricao: body.descricao,
        data: body.data,
        horario: body.horario,
        local: body.local,
        vagas: body.vagas,
        status: body.status,
        imagem: body.imagem ?? null,
        ...(bibliotecaId ? { biblioteca: { connect: { id: bibliotecaId } } } : {}),
      },
    })

    const [sums, presentes] = await Promise.all([
      getSumsEvento(id),
      prisma.eventoParticipante.count({ where: { eventoId: id, presente: true } }),
    ])
    res.json(toDto(req, up, sums, {}, presentes))
  }),
)

/* =========================== UPDATE (partial) =========================== */
r.patch(
  '/:id',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const id = z.coerce.number().int().positive().parse(req.params.id)
    const body = EventoPatchBody.parse(req.body)

    const current = await prisma.evento.findUnique({ where: { id } })
    if (!current) return res.status(404).json({ message: 'Evento não encontrado' })
    if (!isAdmin && current.bibliotecaId !== myBibId) {
      return res.status(403).json({ message: 'Sem permissão' })
    }

    const data: any = {
      ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
      ...(body.descricao !== undefined ? { descricao: body.descricao } : {}),
      ...(body.data !== undefined ? { data: body.data } : {}),
      ...(body.horario !== undefined ? { horario: body.horario } : {}),
      ...(body.local !== undefined ? { local: body.local } : {}),
      ...(body.vagas !== undefined ? { vagas: body.vagas } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.imagem !== undefined ? { imagem: body.imagem ?? null } : {}),
    }

    if (isAdmin && body.bibliotecaId !== undefined) {
      data.biblioteca = { connect: { id: body.bibliotecaId } }
    }

    const up = await prisma.evento.update({ where: { id }, data })
    const [sums, presentes] = await Promise.all([
      getSumsEvento(id),
      prisma.eventoParticipante.count({ where: { eventoId: id, presente: true } }),
    ])
    res.json(toDto(req, up, sums, {}, presentes))
  }),
)

/* =========================== DELETE =========================== */
r.delete(
  '/:id',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const id = z.coerce.number().int().positive().parse(req.params.id)

    const evt = await prisma.evento.findUnique({ where: { id } })
    if (!evt) return res.status(404).json({ message: 'Evento não encontrado' })
    if (!isAdmin && evt.bibliotecaId !== myBibId) {
      return res.status(403).json({ message: 'Sem permissão' })
    }

    await prisma.eventoParticipante.deleteMany({ where: { eventoId: id } })
    await prisma.evento.delete({ where: { id } })
    res.status(204).send()
  }),
)

/* =========================== Upload de imagem =========================== */
r.post(
  '/:id/imagem',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const id = z.coerce.number().int().positive().parse(req.params.id)
    if (!req.file) return res.status(400).json({ message: 'Ficheiro obrigatório (field: file)' })

    const evt = await prisma.evento.findUnique({ where: { id } })
    if (!evt) return res.status(404).json({ message: 'Evento não encontrado' })
    if (!isAdmin && evt.bibliotecaId !== myBibId) {
      return res.status(403).json({ message: 'Sem permissão' })
    }

    const relPath = `/uploads/eventos/${req.file.filename}`
    const up = await prisma.evento.update({ where: { id }, data: { imagem: relPath } })
    const [sums, presentes] = await Promise.all([
      getSumsEvento(id),
      prisma.eventoParticipante.count({ where: { eventoId: id, presente: true } }),
    ])
    res.status(200).json(toDto(req, up, sums, {}, presentes))
  }),
)

/* =========================== INSCRIÇÕES =========================== */
r.post(
  '/:id/inscricoes',
  auth(),
  requireRole(Role.PAI, Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const eventoId = z.coerce.number().int().positive().parse(req.params.id)
    const body = InscricaoBody.parse(req.body)

    const authCtx = (req as any).auth as { userId: number }
    let familiaId = body.familiaId
    let utilizadorId = body.utilizadorId

    if (!familiaId && !utilizadorId) {
      const famId = await resolveFamiliaIdForUser(authCtx.userId)
      if (famId) familiaId = famId
      else utilizadorId = authCtx.userId
    }

    const evento = await prisma.evento.findUnique({ where: { id: eventoId } })
    if (!evento) return res.status(404).json({ message: 'Evento não encontrado' })

    let familiaUserId: number | null = null
    let filhosValidos: number[] = []
    if (familiaId) {
      const fam = await prisma.familia.findUnique({
        where: { id: familiaId },
        include: { filhos: { select: { id: true } }, user: { select: { id: true } } },
      })
      if (!fam) return res.status(400).json({ message: 'Família inválida' })
      familiaUserId = fam.user.id
      filhosValidos = fam.filhos.map(f => f.id)
    }

    const existentes = await prisma.eventoParticipante.findMany({
      where: {
        eventoId,
        OR: [
          familiaId ? { familiaId } : undefined,
          familiaUserId ? { utilizadorId: familiaUserId } : undefined,
          (!familiaId && utilizadorId) ? { utilizadorId } : undefined,
        ].filter(Boolean) as any,
      },
    })

    let qtdAdultos = 0
    let qtdFilhos = 0
    let modo: 'individual' | 'familia_total' | 'familia_parcial' = 'individual'

    if (familiaId) {
      const incluirResp = body.incluirResponsavel ?? true
      qtdAdultos = incluirResp ? 1 : 0
      if (body.todosFamilia) {
        modo = 'familia_total'
        qtdFilhos = filhosValidos.length
      } else if (Array.isArray(body.filhosIds) && body.filhosIds.length) {
        modo = 'familia_parcial'
        const setValidos = new Set(filhosValidos)
        qtdFilhos = body.filhosIds.filter(id => setValidos.has(id)).length
      } else {
        modo = 'familia_parcial'
        qtdFilhos = 0
      }
    } else {
      modo = 'individual'
      qtdAdultos = 1
      qtdFilhos = body.numFilhosAcompanhantes ?? 0
    }

    const novoTotal = qtdAdultos + qtdFilhos
    if (novoTotal <= 0) return res.status(400).json({ message: 'Inscrição vazia.' })

    const sums = await getSumsEvento(eventoId)
    const totalMeusAnteriores = existentes.reduce((acc, p) => acc + (p.qtdAdultos + p.qtdFilhos), 0)
    const ocupadoSemMim = sums.total - totalMeusAnteriores
    const disponivel = evento.vagas - ocupadoSemMim
    if (novoTotal > disponivel) return res.status(409).json({ message: 'Evento lotado', disponivel })

    const prefer = existentes.find(e => e.familiaId != null) ?? existentes[0] ?? null

    const txResult = await prisma.$transaction(async (tx) => {
      let keptId: number | null = prefer?.id ?? null

      if (keptId) {
        await tx.eventoParticipante.update({
          where: { id: keptId },
          data: {
            eventoId,
            familiaId: familiaId ?? null,
            utilizadorId: familiaId ? null : (utilizadorId ?? null),
            qtdAdultos, qtdFilhos, modo,
          },
        })
        for (const ex of existentes) {
          if (ex.id !== keptId) await tx.eventoParticipante.delete({ where: { id: ex.id } })
        }
      } else {
        const created = await tx.eventoParticipante.create({
          data: {
            eventoId,
            familiaId: familiaId ?? null,
            utilizadorId: familiaId ? null : (utilizadorId ?? null),
            qtdAdultos, qtdFilhos, modo, presente: false,
          },
        })
        keptId = created.id
      }

      const after = await getSumsEvento(eventoId)
      return { keptId: keptId!, after }
    })

    const presentes = await prisma.eventoParticipante.count({ where: { eventoId, presente: true } })
    const participante = await prisma.eventoParticipante.findUnique({ where: { id: txResult.keptId } })
    res.status(prefer ? 200 : 201).json({
      participante: {
        id: participante!.id,
        eventoId,
        familiaId: participante!.familiaId,
        utilizadorId: participante!.utilizadorId,
        qtdAdultos: participante!.qtdAdultos,
        qtdFilhos: participante!.qtdFilhos,
        modo: participante!.modo,
        presente: participante!.presente,
        createdAt: participante!.createdAt,
      },
      inscritosAdultos: txResult.after.adultos,
      inscritosFilhos: txResult.after.filhos,
      inscritosTotal: txResult.after.total,
      inscritos: txResult.after.total,
      participantes: txResult.after.total,
      presentes,
      vagas: evento.vagas,
    })
  }),
)

/* =========================== Cancelar minha inscrição =========================== */
r.delete(
  '/:id/inscricoes',
  auth(),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const eventoId = z.coerce.number().int().positive().parse(req.params.id)
    const userId = (req as any).auth!.userId

    const famId = await resolveFamiliaIdForUser(userId)
    const whereMine = famId ? { eventoId, familiaId: famId } : { eventoId, utilizadorId: userId }
    const ex = await prisma.eventoParticipante.findFirst({ where: whereMine, select: { id: true } })
    if (!ex) return res.status(404).json({ message: 'Inscrição não encontrada.' })

    await prisma.eventoParticipante.delete({ where: { id: ex.id } })
    res.status(204).send()
  }),
)

/* =========================== Listar inscrições (staff) =========================== */
r.get(
  '/:id/inscricoes',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const eventoId = z.coerce.number().int().positive().parse(req.params.id)
    const evt = await prisma.evento.findUnique({ where: { id: eventoId } })
    if (!evt) return res.status(404).json({ message: 'Evento não encontrado' })
    if (!isAdmin && evt.bibliotecaId !== myBibId) return res.status(403).json({ message: 'Sem permissão' })

    const rows = await prisma.eventoParticipante.findMany({
      where: { eventoId },
      orderBy: { id: 'asc' },
      include: {
        familia: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
        utilizador: { select: { id: true, name: true, email: true } },
      },
    })

    res.json(rows.map(p => ({
      id: p.id,
      modo: p.modo,
      presente: p.presente,
      qtdAdultos: p.qtdAdultos,
      qtdFilhos: p.qtdFilhos,
      createdAt: p.createdAt,
      familia: p.familia ? { id: p.familia.id, responsavel: p.familia.user } : null,
      utilizador: p.utilizador ?? null,
    })))
  }),
)

/* =========================== Remover inscrição (staff) =========================== */
r.delete(
  '/:id/inscricoes/:participanteId',
  auth(),
  requireRole(Role.ADMIN, Role.BIBLIOTECARIO),
  asyncHandler(async (req: Request, res: Response) => {
    const { isAdmin, bibliotecaId: myBibId } = await getUserScope(req)
    const eventoId = z.coerce.number().int().positive().parse(req.params.id)
    const participanteId = z.coerce.number().int().positive().parse(req.params.participanteId)

    const p = await prisma.eventoParticipante.findUnique({
      where: { id: participanteId },
      include: { evento: { select: { bibliotecaId: true, id: true } } },
    })
    if (!p || p.evento.id !== eventoId) {
      return res.status(404).json({ message: 'Participante não encontrado neste evento' })
    }
    if (!isAdmin && p.evento.bibliotecaId !== myBibId) {
      return res.status(403).json({ message: 'Sem permissão' })
    }
    await prisma.eventoParticipante.delete({ where: { id: participanteId } })
    res.status(204).send()
  }),
)


/* =========================== Minhas inscrições =========================== */
r.get(
  '/minhas-inscricoes',
  auth(),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (_req: Request, res: Response) => {
    const userId = (_req as any).auth!.userId
    const parts = await prisma.eventoParticipante.findMany({
      where: { OR: [{ utilizadorId: userId }, { familia: { userId } }] },
      include: { evento: true, familia: { select: { id: true } }, utilizador: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }],
    })
    res.json(parts.map(p => ({
      id: p.id,
      presente: p.presente,
      qtdAdultos: p.qtdAdultos,
      qtdFilhos: p.qtdFilhos,
      createdAt: p.createdAt,
      evento: {
        id: p.evento.id,
        titulo: p.evento.titulo,
        data: p.evento.data,
        horario: p.evento.horario,
        local: p.evento.local,
        vagas: p.evento.vagas,
        status: p.evento.status,
        imagem: p.evento.imagem ?? null,
        imagemUrl: absUrl(_req, p.evento.imagem),
        bibliotecaId: p.evento.bibliotecaId ?? null,
      },
      familiaId: p.familiaId,
      utilizadorId: p.utilizadorId,
    })))
  }),
)

/* =========================== Presença (self) =========================== */
r.post(
  '/:id/presenca/self',
  auth(),
  requireRole(Role.PAI),
  asyncHandler(async (req: Request, res: Response) => {
    const eventoId = z.coerce.number().int().positive().parse(req.params.id)
    const userId = (req as any).auth!.userId

    const evt = await prisma.evento.findUnique({ where: { id: eventoId } })
    if (!evt) return res.status(404).json({ message: 'Evento não encontrado' })

    const hoje = todayMidnightLocal()
    if (evt.data < hoje || evt.data > endOfDay(hoje)) {
      return res.status(400).json({ message: 'Presença só no dia do evento.' })
    }

    const famId = await resolveFamiliaIdForUser(userId)
    const whereMine = famId ? { eventoId, familiaId: famId } : { eventoId, utilizadorId: userId }
    const part = await prisma.eventoParticipante.findFirst({ where: whereMine })
    if (!part) return res.status(404).json({ message: 'Inscrição não encontrada para marcar presença.' })
    if (part.presente) return res.status(200).json({ ok: true, presente: true })

    await prisma.eventoParticipante.update({ where: { id: part.id }, data: { presente: true } })
    const presentes = await prisma.eventoParticipante.count({ where: { eventoId, presente: true } })
    res.status(200).json({ ok: true, presente: true, presentes })
  }),
)

export default r
