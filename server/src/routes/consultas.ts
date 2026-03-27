// server/src/routes/consultas.ts
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { asyncHandler } from '../middleware/async'
import { auth, requireRole } from '../middleware/auth'
import { Prisma, Role } from '@prisma/client'
import crypto from 'crypto'

const r = Router()

/* ============================ Zod ============================ */

const MetodoEnum = z.preprocess(
  (v) => (typeof v === 'string' ? (v as string).toUpperCase() : v),
  z.enum(['PRESENCIAL', 'VIDEO']),
)

const CreateBody = z.object({
  dataHora: z.coerce.date(),
  bibliotecarioId: z.number().int().positive(),
  notas: z.string().trim().optional(),
  metodo: MetodoEnum.optional(),
  familiaId: z.number().int().positive().optional(), // ADMIN pode marcar para outra família
})

const UpdateBody = z.object({
  dataHora: z.coerce.date().optional(),
  bibliotecarioId: z.number().int().positive().optional(),
  notas: z.string().trim().optional(),
  status: z.enum(['MARCADA', 'RECUSADA', 'RETORNADA', 'CONCLUIDA', 'CANCELADA']).optional(),
  motivo: z.string().trim().optional(),
  resultadoResumo: z.string().trim().optional(),
  enviarResultadoAgora: z.coerce.boolean().optional(),
})

const ResponderBody = z.object({
  info: z.string().trim().min(1),
})

const asDate = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.date().optional(),
)

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  status: z.enum(['MARCADA', 'RECUSADA', 'RETORNADA', 'CONCLUIDA', 'CANCELADA']).optional(),
  desde: asDate,
  ate: asDate,
  bibliotecarioId: z.coerce.number().int().positive().optional(),
  familiaId: z.coerce.number().int().positive().optional(),
})

/* ========================== helpers ========================== */

function toDto(c: any) {
  return {
    id: c.id,
    dataHora: c.dataHora,
    status: c.status,
    notas: c.notas ?? null,
    metodo: c.metodo ?? null,
    familiaId: c.familiaId,
    bibliotecarioId: c.bibliotecarioId,
    createdAt: c.createdAt,

    recusaMotivo: c.recusaMotivo ?? null,
    retornoMotivo: c.retornoMotivo ?? null,
    resultadoResumo: c.resultadoResumo ?? null,
    resultadoEnviadoAt: c.resultadoEnviadoAt ?? null,

    familiaNome: c.familia?.user?.name ?? `Família #${c.familiaId}`,
    familiaEmail: c.familia?.user?.email ?? null,
    bibliotecarioNome: c.bibliotecario?.name ?? `Utilizador #${c.bibliotecarioId}`,
    bibliotecarioEmail: c.bibliotecario?.email ?? null,

    familiaTelefone: c.familia?.telefone ?? null,
    familiaMorada: c.familia?.morada ?? null,
    familiaFilhos: Array.isArray(c.familia?.filhos)
      ? c.familia.filhos.map((f: any) => ({ id: f.id, nome: f.nome, idade: f.idade, genero: f.genero, perfilLeitor: f.perfilLeitor }))
      : [],
  }
}

function addMinutes(dt: Date, m: number) { return new Date(dt.getTime() + m * 60 * 1000) }
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) { return aStart < bEnd && bStart < aEnd }

/** Construção sempre em UTC para evitar “escorregar” o dia noutras TZs */
function dateAtUTC(y: number, m: number, d: number, hh: number, mm: number) {
  return new Date(Date.UTC(y, m, d, hh, mm, 0, 0))
}
function startOfDayUTC(dt = new Date()) {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0, 0))
}
function endOfDayUTC(dt = new Date()) {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 23, 59, 59, 999))
}

function fmtPt(dt: Date) {
  try { return dt.toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return dt.toISOString() }
}

function makeETag(payload: any) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex')
  return `W/"${hash}"`
}

async function notifyMany(data: Array<{ userId: number; type: string; title: string; body?: string }>) {
  const payload: Prisma.NotificacaoCreateManyInput[] = data
    .filter(d => Number.isFinite(d.userId) && d.userId > 0)
    .map(d => ({
      userId: d.userId,
      type: d.type,
      title: d.title,
      body: (d.body ?? '').trim(), // nunca null
    }))

  if (payload.length) {
    await prisma.notificacao.createMany({ data: payload, skipDuplicates: true })
  }
}

async function getUserBibId(userId: number): Promise<number | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { bibliotecaId: true } })
  return u?.bibliotecaId ?? null
}

async function getBibliotecarioBibId(bibliotecarioId: number): Promise<number | null> {
  const bib = await prisma.user.findUnique({ where: { id: bibliotecarioId }, select: { bibliotecaId: true, role: true, isActive: true } })
  if (!bib || bib.role !== Role.BIBLIOTECARIO || !bib.isActive) return null
  return bib.bibliotecaId ?? null
}

/* =================== Disponibilidade =================== */

r.get('/disponibilidade', auth(true), asyncHandler(async (req: Request, res: Response) => {
  const bibliotecarioId = z.coerce.number().int().positive().parse((req.query as any).bibliotecarioId)
  const dias = z.coerce.number().int().min(1).max(60).default(14).parse((req.query as any).dias ?? 14)

  // Gate por biblioteca:
  const targetBibId = await getBibliotecarioBibId(bibliotecarioId)
  if (!targetBibId) return res.status(404).json({ message: 'Bibliotecário inválido' })

  const authCtx = (req as any).auth as { role?: Role; userId?: number } | undefined
  if (authCtx?.role === Role.BIBLIOTECARIO && authCtx.userId !== bibliotecarioId) {
    return res.status(403).json({ message: 'Só pode consultar a sua própria disponibilidade' })
  }
  if (authCtx?.role === Role.PAI) {
    const myBib = await getUserBibId(authCtx.userId!)
    if (!myBib || myBib !== targetBibId) return res.status(403).json({ message: 'Bibliotecário de outra biblioteca' })
  }

  // Limites (UTC)
  const qDesde = (req.query as any).desde ? new Date(String((req.query as any).desde)) : null
  const qAte   = (req.query as any).ate   ? new Date(String((req.query as any).ate))   : null

  const now = new Date()
  const start = qDesde ? startOfDayUTC(qDesde) : startOfDayUTC(now)
  const end   = qAte ? endOfDayUTC(qAte) : endOfDayUTC(addMinutes(start, (dias - 1) * 24 * 60))
  const minAllowed = addMinutes(now, 3 * 24 * 60) // D+3

  const [horarios, bloqueios, consultas] = await Promise.all([
    prisma.horarioSemanal.findMany({
      where: { userId: bibliotecarioId, active: true },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    }),
    prisma.bloqueioAgenda.findMany({
      where: { userId: bibliotecarioId, fim: { gte: start }, inicio: { lte: addMinutes(end, 24 * 60) } },
      orderBy: { inicio: 'asc' },
    }),
    prisma.consulta.findMany({
      where: { bibliotecarioId, status: 'MARCADA', dataHora: { gte: start, lte: addMinutes(end, 24 * 60) } },
      select: { id: true, dataHora: true },
      orderBy: { dataHora: 'asc' },
    }),
  ])

  const consultasPorDia = new Map<string, Date[]>()
  for (const c of consultas) {
    const k = c.dataHora.toISOString().slice(0,10) // YYYY-MM-DD (UTC)
    if (!consultasPorDia.has(k)) consultasPorDia.set(k, [])
    consultasPorDia.get(k)!.push(c.dataHora)
  }

  // Vamos carregar slots com sua duração (step) para colisão correta com bloqueios
  const saida: Array<{ data: string; slots: string[] }> = []

  for (let d = new Date(start); d <= end; d = addMinutes(d, 24 * 60)) {
    const weekday = d.getUTCDay()
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate()
    const horarioDia = horarios.filter(h => h.weekday === weekday)

    const slotsDia: Array<{ dt: Date; step: number }> = []
    for (const h of horarioDia) {
      const step = Math.max(5, h.slotMin || 30)
      for (let mm = h.startMin; mm + step <= h.endMin; mm += step) {
        const hh = Math.floor(mm / 60), mins = mm % 60
        const dt = dateAtUTC(y, m, day, hh, mins)
        if (dt < minAllowed) continue
        if (dt < now) continue
        slotsDia.push({ dt, step })
      }
    }

    // Remove slots que colidem com bloqueios — usando a janela inteira (step)
    const slotsSemBloqueio = slotsDia.filter(({ dt, step }) =>
      !bloqueios.some(b => overlaps(dt, addMinutes(dt, step), b.inicio, b.fim))
    )

    // Remove slots já ocupados (±30min)
    const booked = consultasPorDia.get(d.toISOString().slice(0,10)) ?? []
    const slotsLivres = slotsSemBloqueio.filter(({ dt }) =>
      !booked.some(cdt => Math.abs(dt.getTime() - cdt.getTime()) < 30 * 60 * 1000)
    )

    saida.push({ data: d.toISOString().slice(0,10), slots: slotsLivres.map(({ dt }) => dt.toISOString()) })
  }

  res.json({ bibliotecarioId, desde: start.toISOString(), ate: end.toISOString(), dias: saida })
}))

/* =================== SELECTS AUXILIARES =================== */

// bibliotecários visíveis
r.get('/bibliotecarios', auth(true), asyncHandler(async (req: Request, res: Response) => {
  const qBib = Number((req.query as any).bibliotecaId ?? NaN)
  let bibliotecaId: number | null = Number.isFinite(qBib) ? qBib : null

  const authCtx = (req as any).auth as { role?: Role; userId?: number } | undefined
  if (authCtx?.role === Role.PAI || authCtx?.role === Role.BIBLIOTECARIO) {
    bibliotecaId = await getUserBibId(authCtx.userId!)
    if (!bibliotecaId) return res.json([])
  }

  const where: Prisma.UserWhereInput = { role: Role.BIBLIOTECARIO, isActive: true }
  if (bibliotecaId) where.bibliotecaId = bibliotecaId

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  res.json(users)
}))

// famílias — BIB só da sua biblioteca; PAI vê a sua
r.get('/familias', auth(), requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const q = String((req.query as any).q ?? '').trim()

    const authCtx = (req as any).auth as { role: Role; userId: number }
    const where: Prisma.FamiliaWhereInput = {}

    if (authCtx.role === Role.PAI) {
      where.userId = authCtx.userId
    } else if (authCtx.role === Role.BIBLIOTECARIO) {
      const myBib = await getUserBibId(authCtx.userId)
      if (!myBib) return res.json([])
      where.user = { is: { bibliotecaId: myBib } }
    }

    if (q) {
      where.AND = [
        {
          OR: [
            { user: { is: { name: { contains: q } } } },
            { user: { is: { email: { contains: q } } } },
            { telefone: { contains: q } },
            { morada: { contains: q } },
            { user: { is: { biblioteca: { is: { nome: { contains: q } } } } } },
          ],
        },
      ]
    }

    const familias = await prisma.familia.findMany({
      where,
      select: { id: true, user: { select: { name: true, email: true } } },
      orderBy: { id: 'asc' },
      take: 500,
    })

    res.json(familias.map((f) => ({ id: f.id, name: f.user?.name ?? `Família #${f.id}`, email: f.user?.email ?? '' })))
  })
)

/* =============================== CRUD =============================== */

// Criar
r.post('/', auth(), requireRole(Role.PAI, Role.ADMIN, Role.BIBLIOTECARIO), asyncHandler(async (req, res) => {
  const parsed = CreateBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Dados inválidos' })
  const data = parsed.data
  const authCtx = (req as any).auth as { role: Role; userId: number }

  // Resolve familiaId do requisitante
  let familiaId: number | null = null
  if (authCtx.role === Role.ADMIN) {
    familiaId = data.familiaId ?? null
  } else if (authCtx.role === Role.PAI) {
    const fam = await prisma.familia.findUnique({ where: { userId: authCtx.userId } })
    if (!fam) return res.status(400).json({ message: 'Família não encontrada' })
    familiaId = fam.id
  } else {
    // bibliotecário a criar em nome da família (necessita familiaId)
    if (!data.familiaId) return res.status(400).json({ message: 'Família é obrigatória' })
    familiaId = data.familiaId
  }
  if (!familiaId) return res.status(400).json({ message: 'Família é obrigatória' })

  // Bibliotecário válido e ativo
  const bibUser = await prisma.user.findUnique({
    where: { id: data.bibliotecarioId },
    select: { id: true, role: true, isActive: true, bibliotecaId: true },
  })
  if (!bibUser || bibUser.role !== Role.BIBLIOTECARIO || !bibUser.isActive) {
    return res.status(400).json({ message: 'Bibliotecário inválido' })
  }

  // Gate por biblioteca
  if (authCtx.role === Role.PAI) {
    const familiaUser = await prisma.user.findUnique({
      where: { id: authCtx.userId },
      select: { bibliotecaId: true },
    })
    if (!familiaUser?.bibliotecaId || familiaUser.bibliotecaId !== bibUser.bibliotecaId) {
      return res.status(403).json({ message: 'Só pode marcar com bibliotecário da sua biblioteca' })
    }
  } else if (authCtx.role === Role.BIBLIOTECARIO) {
    // BIB só pode criar para a própria biblioteca
    const myBib = await getUserBibId(authCtx.userId)
    if (!myBib || (bibUser.bibliotecaId && myBib !== bibUser.bibliotecaId)) {
      return res.status(403).json({ message: 'Bibliotecário de outra biblioteca' })
    }
  } else {
    // ADMIN: se forneceu familiaId, alinhar bibliotecas (evita agendamento cruzado)
    const famWithUser = await prisma.familia.findUnique({
      where: { id: familiaId },
      select: { user: { select: { bibliotecaId: true } } },
    })
    const famBib = famWithUser?.user?.bibliotecaId ?? null
    if (famBib && bibUser.bibliotecaId && famBib !== bibUser.bibliotecaId) {
      return res.status(422).json({ message: 'Família e bibliotecário são de bibliotecas diferentes' })
    }
  }

  // Regra D+3 (antecedência mínima)
  const now = new Date()
  const minAllowed = addMinutes(now, 3 * 24 * 60)
  if (data.dataHora.getTime() < minAllowed.getTime()) {
    return res.status(422).json({ message: 'Consultas devem ser marcadas com pelo menos 3 dias de antecedência.' })
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Conflito com outras consultas (±30min, só MARCADA)
      const min = addMinutes(data.dataHora, -30)
      const max = addMinutes(data.dataHora, +30)
      const conflito = await tx.consulta.findFirst({
        where: { bibliotecarioId: data.bibliotecarioId, status: 'MARCADA', dataHora: { gte: min, lte: max } },
        select: { id: true },
      })
      if (conflito) throw Object.assign(new Error('CONFLITO'), { http: 409 })

      // Conflito com bloqueios de agenda (ponto)
      const bloqueio = await tx.bloqueioAgenda.findFirst({
        where: {
          userId: data.bibliotecarioId,
          inicio: { lte: data.dataHora },
          fim:    { gt:  data.dataHora },
        },
        select: { id: true },
      })
      if (bloqueio) throw Object.assign(new Error('BLOQUEADO'), { http: 409 })

      // Montagem de notas/metodologia
      const PENDENTE_TAG = '[PENDENTE]'
      const metodoUpper = (data.metodo ?? undefined) as 'PRESENCIAL' | 'VIDEO' | undefined
      const notasComMetodo = [
        PENDENTE_TAG,
        metodoUpper === 'PRESENCIAL' ? 'Método: Presencial' : null,
        metodoUpper === 'VIDEO'      ? 'Método: Videochamada' : null,
        data.notas?.trim() ? `Notas: ${data.notas.trim()}` : null,
      ].filter(Boolean).join(' | ')

      const c = await tx.consulta.create({
        data: {
          familia: { connect: { id: familiaId! } },
          bibliotecario: { connect: { id: data.bibliotecarioId } },
          dataHora: data.dataHora,
          notas: notasComMetodo || null,
          status: 'MARCADA',
          ...(metodoUpper ? { metodo: metodoUpper } : {}),
        },
        include: {
          familia: { include: { user: true, filhos: { select: { id: true, nome: true, idade: true, genero: true, perfilLeitor: true } } } },
          bibliotecario: { select: { id: true, name: true, email: true } },
        },
      })

      return c
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })

    res.status(201).json(toDto(created))

    // Notificações (best-effort)
    ;(async () => {
      const when = fmtPt(created.dataHora)
      const familiaUserId = created.familia?.user?.id
      await notifyMany([
        { userId: created.bibliotecarioId, type: 'CONSULTA_NOVA',    title: 'Nova consulta marcada', body: `Consulta para ${when}.` },
        { userId: familiaUserId!,           type: 'CONSULTA_MARCADA', title: 'Consulta marcada',       body: `Sessão em ${when}.` },
      ])
    })()
  } catch (e: any) {
    if (e?.http === 409) {
      const msg = e.message === 'BLOQUEADO'
        ? 'Esse horário está bloqueado na agenda do bibliotecário.'
        : 'Já existe consulta marcada nesse período.'
      return res.status(409).json({ message: msg })
    }
    return res.status(500).json({ message: 'Erro ao criar consulta' })
  }
}))

// Listar com filtros + ETag (considera updatedAt)
r.get('/', auth(), asyncHandler(async (req: Request, res: Response) => {
  const q = ListQuery.parse(req.query)

  const authCtx = (req as any).auth as { role?: Role; userId?: number } | undefined
  const role = authCtx?.role
  const userId = authCtx?.userId
  if (!role || !userId) return res.status(401).json({ message: 'Não autenticado' })

  const where: Prisma.ConsultaWhereInput = {}

  if (role === Role.PAI) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { bibliotecaId: true } })
    const fam = await prisma.familia.findUnique({ where: { userId }, select: { id: true } })
    where.familiaId = fam?.id ?? -1
    if (me?.bibliotecaId) where.bibliotecario = { is: { bibliotecaId: me.bibliotecaId } }
  } else if (role === Role.BIBLIOTECARIO) {
    where.bibliotecarioId = userId
    const myBib = await getUserBibId(userId)
    if (myBib) where.bibliotecario = { is: { bibliotecaId: myBib } }
  } else {
    const qBib = Number((req.query as any).bibliotecaId ?? NaN)
    if (Number.isFinite(qBib)) where.bibliotecario = { is: { bibliotecaId: qBib } }
    if (q.familiaId) where.familiaId = q.familiaId
    if (q.bibliotecarioId) where.bibliotecarioId = q.bibliotecarioId
  }

  if (q.status) where.status = q.status
  if (q.desde || q.ate) {
    where.dataHora = {
      ...(q.desde ? { gte: q.desde } : {}),
      ...(q.ate   ? { lte: q.ate }  : {}),
    }
  }

  if (q.q) {
    where.OR = [
      { notas: { contains: q.q } },
      { familia:       { is: { user: { is: { name:  { contains: q.q } } } } } },
      { bibliotecario: { is: { name:  { contains: q.q } } } },
    ]
  }

  const [total, items, maxCreated, maxUpdated] = await Promise.all([
    prisma.consulta.count({ where }),
    prisma.consulta.findMany({
      where,
      orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        familia: { include: { user: true, filhos: { select: { id: true, nome: true, idade: true, genero: true, perfilLeitor: true } } } },
        bibliotecario: { select: { id: true, name: true, email: true, bibliotecaId: true } },
      },
    }),
    prisma.consulta.aggregate({ _max: { createdAt: true }, where }).then(a => a._max?.createdAt ?? null),
    prisma.consulta.aggregate({ _max: { updatedAt: true }, where }).then(a => a._max?.updatedAt ?? null),
  ])

  const etag = makeETag({
    total,
    maxCreatedAt: maxCreated?.toISOString() ?? null,
    maxUpdatedAt: maxUpdated?.toISOString() ?? null,
  })
  res.setHeader('ETag', etag)
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
  if (req.headers['if-none-match'] === etag) return res.status(304).send()

  res.json({ items: items.map(toDto), total, page: q.page, pageSize: q.pageSize, maxCreatedAt: maxCreated })
}))

// Obter por id (gates por role)
r.get('/:id', auth(), asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().parse(req.params.id)
  const authCtx = (req as any).auth as { role: Role; userId: number }

  const c = await prisma.consulta.findUnique({
    where: { id },
    include: {
      familia: { include: { user: true, filhos: { select: { id: true, nome: true, idade: true, genero: true, perfilLeitor: true } } } },
      bibliotecario: { select: { id: true, name: true, email: true, bibliotecaId: true } },
    },
  })
  if (!c) return res.status(404).json({ message: 'Não encontrada' })

  if (authCtx.role === Role.PAI) {
    const fam = await prisma.familia.findUnique({ where: { userId: authCtx.userId }, select: { id: true } })
    if (c.familiaId !== (fam?.id ?? -1)) return res.status(403).json({ message: 'Sem acesso' })
  } else if (authCtx.role === Role.BIBLIOTECARIO && c.bibliotecarioId !== authCtx.userId) {
    return res.status(403).json({ message: 'Sem acesso' })
  }

  res.json(toDto(c))
}))

/* ============================== UPDATEs ============================== */

// Atualização genérica (usada pelo painel do bibliotecário)
r.patch('/:id', auth(), requireRole(Role.ADMIN, Role.BIBLIOTECARIO), asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().parse(req.params.id)
  const body = UpdateBody.parse(req.body)
  const authCtx = (req as any).auth as { role: Role; userId: number }

  const current = await prisma.consulta.findUnique({
    where: { id },
    include: {
      familia: { include: { user: true } },
      bibliotecario: { select: { id: true, bibliotecaId: true } },
    },
  })
  if (!current) return res.status(404).json({ message: 'Não encontrada' })

  // BIB só mexe nas suas
  if (authCtx.role === Role.BIBLIOTECARIO && current.bibliotecarioId !== authCtx.userId) {
    return res.status(403).json({ message: 'Sem acesso' })
  }

  // Remarcação: validar conflitos e regra D+3
  if (body.dataHora) {
    const now = new Date()
    const minAllowed = addMinutes(now, 3 * 24 * 60)
    if (body.dataHora.getTime() < minAllowed.getTime()) {
      return res.status(422).json({ message: 'Consultas devem ser marcadas com pelo menos 3 dias de antecedência.' })
    }

    const min = addMinutes(body.dataHora, -30)
    const max = addMinutes(body.dataHora, +30)
    const conflito = await prisma.consulta.findFirst({
      where: {
        id: { not: id },
        bibliotecarioId: current.bibliotecarioId,
        status: 'MARCADA',
        dataHora: { gte: min, lte: max },
      },
      select: { id: true },
    })
    if (conflito) return res.status(409).json({ message: 'Já existe consulta marcada nesse período.' })
  }

  // Reatribuição: validar bibliotecário
  if (body.bibliotecarioId && body.bibliotecarioId !== current.bibliotecarioId) {
    const novoBib = await prisma.user.findUnique({
      where: { id: body.bibliotecarioId },
      select: { id: true, role: true, isActive: true, bibliotecaId: true },
    })
    if (!novoBib || novoBib.role !== Role.BIBLIOTECARIO || !novoBib.isActive) {
      return res.status(400).json({ message: 'Bibliotecário inválido' })
    }
    // BIB não pode reatribuir para outros
    if (authCtx.role === Role.BIBLIOTECARIO) {
      return res.status(403).json({ message: 'Não pode reatribuir' })
    }
    // ADMIN: manter coerência de biblioteca se existir
    const famBib = current.familia?.user?.bibliotecaId ?? null
    if (famBib && novoBib.bibliotecaId && famBib !== novoBib.bibliotecaId) {
      return res.status(422).json({ message: 'Família e bibliotecário são de bibliotecas diferentes' })
    }
  }

  // Montagem do update
  const dataUpdate: Prisma.ConsultaUpdateInput = {}

  if (body.notas !== undefined) dataUpdate.notas = body.notas || null
  if (body.dataHora) dataUpdate.dataHora = body.dataHora
  if (body.bibliotecarioId) dataUpdate.bibliotecario = { connect: { id: body.bibliotecarioId } }

  // Transições de estado com campos auxiliares
  let notify: Array<{ userId: number, type: string, title: string, body?: string }> = []
  const familiaUserId = current.familia?.user?.id ?? null

  if (body.status) {
    dataUpdate.status = body.status
    if (body.status === 'RECUSADA') {
      if (!body.motivo?.trim()) return res.status(422).json({ message: 'Motivo é obrigatório para recusa' })
      dataUpdate.recusaMotivo = body.motivo.trim()
      if (familiaUserId) notify.push({ userId: familiaUserId, type: 'CONSULTA_RECUSADA', title: 'Consulta recusada', body: body.motivo.trim() })
    }
    if (body.status === 'RETORNADA') {
      if (!body.motivo?.trim()) return res.status(422).json({ message: 'Motivo é obrigatório para pedir informação' })
      dataUpdate.retornoMotivo = body.motivo.trim()
      if (familiaUserId) notify.push({ userId: familiaUserId, type: 'CONSULTA_INFO', title: 'Informação adicional necessária', body: body.motivo.trim() })
    }
    if (body.status === 'CONCLUIDA') {
      dataUpdate.resultadoResumo = body.resultadoResumo?.trim() || null
      dataUpdate.resultadoEnviadoAt = body.enviarResultadoAgora ? new Date() : null
      if (familiaUserId && body.enviarResultadoAgora) {
        notify.push({ userId: familiaUserId, type: 'CONSULTA_RESULTADO', title: 'Resultado da consulta', body: (body.resultadoResumo || 'Consulta concluída.') })
      }
    }
    if (body.status === 'CANCELADA') {
      if (familiaUserId) notify.push({ userId: familiaUserId, type: 'CONSULTA_CANCELADA', title: 'Consulta cancelada' })
    }
  }

  const updated = await prisma.consulta.update({
    where: { id },
    data: dataUpdate,
    include: {
      familia: { include: { user: true } },
      bibliotecario: { select: { id: true, name: true, email: true } },
    },
  })

  // Notificações
  ;(async () => { await notifyMany(notify) })()

  res.json(toDto(updated))
}))

// Responder (família responde a RETORNADA)
r.post('/:id/responder', auth(), requireRole(Role.PAI, Role.ADMIN), asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().parse(req.params.id)
  const { info } = ResponderBody.parse(req.body)
  const authCtx = (req as any).auth as { role: Role; userId: number }

  const c = await prisma.consulta.findUnique({
    where: { id },
    include: { familia: { include: { user: true } }, bibliotecario: { select: { id: true } } },
  })
  if (!c) return res.status(404).json({ message: 'Não encontrada' })

  // Gate: PAI só responde a sua
  if (authCtx.role === Role.PAI) {
    const fam = await prisma.familia.findUnique({ where: { userId: authCtx.userId }, select: { id: true } })
    if (c.familiaId !== (fam?.id ?? -1)) return res.status(403).json({ message: 'Sem acesso' })
  }

  // Anexa resposta nas notas + volta a MARCADA
  const stamp = new Date()
  const respostaLinha = `Resposta (${stamp.toLocaleString('pt-PT')}): ${info.trim()}`
  const notas = [respostaLinha, c.notas?.trim()].filter(Boolean).join('\n')

  const updated = await prisma.consulta.update({
    where: { id },
    data: {
      notas,
      status: 'MARCADA',
      retornoMotivo: null,
    },
    include: { familia: { include: { user: true } }, bibliotecario: true },
  })

  // Notifica o bibliotecário
  ;(async () => {
    await notifyMany([
      { userId: updated.bibliotecarioId, type: 'CONSULTA_RESPOSTA', title: 'Família respondeu ao pedido de informação', body: info.trim() },
    ])
  })()

  res.json(toDto(updated))
}))

// Cancelar (família ou staff)
r.post('/:id/cancelar', auth(), requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN), asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().parse(req.params.id)
  const motivo = typeof (req.body?.motivo) === 'string' ? String(req.body.motivo).trim() : undefined
  const authCtx = (req as any).auth as { role: Role; userId: number }

  const c = await prisma.consulta.findUnique({
    where: { id },
    include: { familia: { include: { user: true } }, bibliotecario: true },
  })
  if (!c) return res.status(404).json({ message: 'Não encontrada' })

  if (authCtx.role === Role.PAI) {
    const fam = await prisma.familia.findUnique({ where: { userId: authCtx.userId }, select: { id: true } })
    if (c.familiaId !== (fam?.id ?? -1)) return res.status(403).json({ message: 'Sem acesso' })
  } else if (authCtx.role === Role.BIBLIOTECARIO && c.bibliotecarioId !== authCtx.userId) {
    return res.status(403).json({ message: 'Sem acesso' })
  }

  const updated = await prisma.consulta.update({
    where: { id },
    data: { status: 'CANCELADA', notas: motivo ? `${motivo}${c.notas ? `\n${c.notas}` : ''}` : c.notas },
    include: { familia: { include: { user: true } }, bibliotecario: true },
  })

  // Notificações
  ;(async () => {
    const when = fmtPt(updated.dataHora)
    const familiaUserId = updated.familia?.user?.id
    await notifyMany([
      { userId: updated.bibliotecarioId, type: 'CONSULTA_CANCELADA', title: 'Consulta cancelada', body: `Cancelada para ${when}.` },
      ...(familiaUserId ? [{ userId: familiaUserId, type: 'CONSULTA_CANCELADA', title: 'Consulta cancelada', body: motivo }] : []),
    ])
  })()

  res.json(toDto(updated))
}))

// Remover (ADMIN)
r.delete('/:id', auth(), requireRole(Role.ADMIN), asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().parse(req.params.id)
  await prisma.consulta.delete({ where: { id } })
  res.json({ ok: true })
}))

export default r
