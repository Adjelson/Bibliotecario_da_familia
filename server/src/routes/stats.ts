// server/src/routes/stats.ts
import { Router, type Request, type Response, type RequestHandler } from 'express'
import { Parser } from 'json2csv'
import { prisma } from '../prisma'
import { auth, requireRole } from '../middleware/auth'
import { Prisma, Role, RequisicaoStatus, PagamentoStatus } from '@prisma/client'

const statsRouter = Router()

/* ========================== Middlewares ========================== */
const onlyStaff: RequestHandler[] = [auth(), requireRole(Role.ADMIN, Role.BIBLIOTECARIO)]
const adminOnly: RequestHandler[]  = [auth(), requireRole(Role.ADMIN)]

/* ========================== Helpers ========================== */
const atMidnight = (d = new Date()) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
const addDays   = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

type AuthCtx = { userId: number; role: Role; bibliotecaId: number | null }

/** ADMIN vê tudo. BIBLIOTECARIO só vê a sua biblioteca. */
function buildScope(me: AuthCtx) {
  const isAdmin = me.role === Role.ADMIN
  const bibliotecaId = me.bibliotecaId ?? null

  // Se é bibliotecário e não tem biblioteca definida → bloquear chamadas
  if (!isAdmin && me.role === Role.BIBLIOTECARIO && !bibliotecaId) {
    // devolve filtros vazios que nunca casam
    const never: any = { id: -1 }
    return {
      isAdmin,
      bibliotecaId,
      where: {
        familia: never,
        livro: never,
        requisicao: never,
        consulta: never,
        evento: never,
        pedido: never,
        pedidoItem: never,
      },
      invalidScope: true as const,
    }
  }

  // Ajusta aqui os campos conforme o teu schema real
  const familiaWhere: Prisma.FamiliaWhereInput | undefined =
    !isAdmin ? { user: { bibliotecaId: bibliotecaId! } } : undefined

  const livroWhere: Prisma.LivroWhereInput | undefined =
    !isAdmin ? { bibliotecaId: bibliotecaId! } : undefined

  const requisicaoWhere: Prisma.RequisicaoWhereInput | undefined =
    !isAdmin ? { bibliotecaId: bibliotecaId! } : undefined

  const consultaWhere: Prisma.ConsultaWhereInput | undefined =
    !isAdmin ? { bibliotecario: { bibliotecaId: bibliotecaId! } } : undefined

  const eventoWhere: Prisma.EventoWhereInput | undefined =
    !isAdmin ? { bibliotecaId: bibliotecaId! } : undefined

  // Vendas — adapta conforme teu schema (Pedido/PedidoItem)
  const pedidoWhere: Prisma.PedidoWhereInput | undefined =
    !isAdmin ? {
      OR: [
        { familia: { user: { bibliotecaId: bibliotecaId! } } },
        { itens: { some: { livro: { bibliotecaId: bibliotecaId! } } } },
      ],
    } : undefined

  const pedidoItemWhere: Prisma.PedidoItemWhereInput | undefined =
    !isAdmin ? { livro: { bibliotecaId: bibliotecaId! } } : undefined

  return {
    isAdmin,
    bibliotecaId,
    where: { familia: familiaWhere, livro: livroWhere, requisicao: requisicaoWhere, consulta: consultaWhere, evento: eventoWhere, pedido: pedidoWhere, pedidoItem: pedidoItemWhere },
  }
}

/* ========================== Rotas ========================== */

/** KPIs básicos */
statsRouter.get('/kpis', ...onlyStaff, async (req: Request, res: Response) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const [familias, livrosRequisitados, consultas, atividades] = await Promise.all([
    prisma.familia.count({ where: where.familia }),
    prisma.requisicao.count({ where: where.requisicao }),
    prisma.consulta.count({ where: { ...(where.consulta ?? {}), status: 'MARCADA' } }),
    prisma.evento.count({ where: where.evento }),
  ])

  res.json({ familias, livrosRequisitados, consultas, atividades })
})

/** KPIs Plus */
statsRouter.get('/kpis-plus', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const [pendentes, aprovadasAtivas, atrasadas] = await Promise.all([
    prisma.requisicao.count({ where: { ...(where.requisicao ?? {}), status: RequisicaoStatus.PENDENTE } }),
    prisma.requisicao.count({ where: { ...(where.requisicao ?? {}), status: RequisicaoStatus.APROVADA } }),
    prisma.requisicao.count({
      where: { ...(where.requisicao ?? {}), status: RequisicaoStatus.ENTREGUE, dataDevolucaoPrevista: { lt: new Date() } },
    }),
  ])

  const today = atMidnight()
  const todayEnd = addDays(today, 1)
  const eventosHoje = await prisma.evento.count({ where: { ...(where.evento ?? {}), data: { gte: today, lt: todayEnd } } })

  // Ocupação — placeholder
  const ocupacaoMedia = 0

  // Vendas (se existir Pedido/PedidoItem)
  let comprasPagas = 0
  let receitaTotal = 0
  let topVendidos: Array<{ titulo: string; total: number }> = []
  try {
    const statusPago: PagamentoStatus[] = ['PAGO', 'APROVADO', 'ENVIADO', 'CONCLUIDO'] as any
    comprasPagas = await prisma.pedido.count({ where: { ...(where.pedido ?? {}), status: { in: statusPago } as any } })
    const agg = await prisma.pedido.aggregate({ where: { ...(where.pedido ?? {}), status: { in: statusPago } as any }, _sum: { total: true } })
    receitaTotal = Number(agg._sum.total ?? 0)

    const gb = await prisma.pedidoItem.groupBy({
      by: ['livroId'],
      where: where.pedidoItem as any,
      _sum: { quantidade: true },
    })
    gb.sort((a, b) => Number((b._sum.quantidade ?? 0)) - Number((a._sum.quantidade ?? 0)))
    const top = gb.slice(0, 5)
    const livros = await prisma.livro.findMany({ where: { id: { in: top.map(t => t.livroId) } }, select: { id: true, titulo: true } })
    const tituloById = new Map(livros.map(l => [l.id, l.titulo]))
    topVendidos = top.map(t => ({ titulo: tituloById.get(t.livroId) ?? `#${t.livroId}`, total: Number(t._sum.quantidade ?? 0) }))
  } catch { /* sem modelo de vendas → fica a zeros */ }

  let bibliotecario: null | {
    minhasConsultasHoje: number
    minhasConsultasMarcadas: number
    mensagensNaoLidas: number
    notificacoesNaoLidas?: number
  } = null
  if (me.role === Role.BIBLIOTECARIO) {
    const [minhasConsultasHoje, minhasConsultasMarcadas, mensagensNaoLidas, notificacoesNaoLidas] = await Promise.all([
      prisma.consulta.count({ where: { bibliotecarioId: me.userId, dataHora: { gte: today, lt: todayEnd }, status: 'MARCADA' } }),
      prisma.consulta.count({ where: { bibliotecarioId: me.userId, status: 'MARCADA' } }),
      prisma.mensagem.count({ where: { toUserId: me.userId, readAt: null } }),
      prisma.notificacao.count({ where: { userId: me.userId, readAt: null } }),
    ])
    bibliotecario = { minhasConsultasHoje, minhasConsultasMarcadas, mensagensNaoLidas, notificacoesNaoLidas }
  }

  const [familias, livrosRequisitados, consultas, eventosFuturos] = await Promise.all([
    prisma.familia.count({ where: where.familia }),
    prisma.requisicao.count({ where: where.requisicao }),
    prisma.consulta.count({ where: { ...(where.consulta ?? {}), status: 'MARCADA' } }),
    prisma.evento.count({ where: { ...(where.evento ?? {}), data: { gt: new Date() } } }),
  ])

  res.json({
    gerais: { familias, livrosRequisitados, consultas, eventosFuturos },
    operacional: { pendentes, aprovadasAtivas, atrasadas, eventosHoje, ocupacaoMedia },
    vendas: { comprasPagas, receitaTotal, topVendidos },
    bibliotecario,
  })
})

/** Alertas de inventário */
statsRouter.get('/inventario/alertas', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const [zeroStock, lowStock, emprestimoSemPrazo] = await Promise.all([
    prisma.livro.count({ where: { ...(where.livro ?? {}), quantidade: 0 } }),
    prisma.livro.count({ where: { ...(where.livro ?? {}), quantidade: { lte: 1 } } }),
    prisma.requisicao.count({
      where: {
        ...(where.requisicao ?? {}),
        status: RequisicaoStatus.ENTREGUE,
        OR: [{ dataDevolucaoPrevista: null }, { dataDevolucaoPrevista: undefined as any }],
      },
    }),
  ])

  res.json({ zeroStock, lowStock, emprestimoSemPrazo })
})

/** Série temporal */
statsRouter.get('/requisicoes', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const periodo = String(req.query.periodo ?? 'mes') as 'dia'|'mes'|'ano'
  const end = new Date()
  const from =
    periodo === 'dia' ? addDays(new Date(), -1)
    : periodo === 'ano' ? addDays(new Date(), -365)
    : addDays(new Date(), -30)

  const rows = await prisma.requisicao.findMany({
    where: { ...(where.requisicao ?? {}), createdAt: { gte: from, lte: end } },
    select: { createdAt: true },
  })

  const map = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.createdAt)
    const label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    map.set(label, (map.get(label) ?? 0) + 1)
  }
  const data = [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([label,count])=>({ label, count }))
  res.json(data)
})

/** Requisições por família (Top) */
statsRouter.get('/requisicoes-por-familia', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const gb = await prisma.requisicao.groupBy({
    by: ['familiaId'],
    where: where.requisicao,
    _count: { _all: true },
  })
  gb.sort((a,b)=>Number((b._count as any)?._all ?? 0) - Number((a._count as any)?._all ?? 0))
  const top = gb.slice(0, 10)

  const familias = await prisma.familia.findMany({
    where: { id: { in: top.map(t => t.familiaId) } },
    select: { id: true, user: { select: { name: true } } },
  })
  const nameById = new Map(familias.map(f => [f.id, f.user?.name ?? `Família #${f.id}`]))
  const items = top.map(t => ({ family: nameById.get(t.familiaId) ?? `Família #${t.familiaId}`, count: Number((t._count as any)?._all ?? 0) }))
  res.json({ items, total: items.length, page: 1, pageSize: items.length })
})

/** Top livros */
statsRouter.get('/top-livros', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const limit = Number(req.query.limit ?? 5)
  const gb = await prisma.requisicao.groupBy({
    by: ['livroId'],
    where: where.requisicao,
    _count: { _all: true },
  })
  gb.sort((a,b)=>Number((b._count as any)?._all ?? 0) - Number((a._count as any)?._all ?? 0))
  const top = gb.slice(0, limit)

  const livros = await prisma.livro.findMany({ where: { id: { in: top.map(g => g.livroId) } }, select: { id: true, titulo: true } })
  const tituloById = new Map(livros.map(l => [l.id, l.titulo]))
  res.json(top.map(g => ({ name: tituloById.get(g.livroId) ?? `#${g.livroId}`, value: Number((g._count as any)?._all ?? 0) })))
})

/** Distribuição por status */
statsRouter.get('/requisicoes/status', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const statuses: RequisicaoStatus[] = ['PENDENTE','APROVADA','NEGADA','ENTREGUE','DEVOLVIDA']
  const pairs = await Promise.all(statuses.map(async s => [s, await prisma.requisicao.count({ where: { ...(where.requisicao ?? {}), status: s } })] as const))
  const out: Record<string, number> = {}
  for (const [s,c] of pairs) out[s] = c
  res.json(out)
})

/** Consultas — resumo */
statsRouter.get('/consultas/resumo', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  const { where } = scope

  const gbStatus = await prisma.consulta.groupBy({
    by: ['status'],
    where: where.consulta,
    _count: { _all: true },
  })
  gbStatus.sort((a,b)=>Number((b._count as any)?._all ?? 0) - Number((a._count as any)?._all ?? 0))
  const porStatus = gbStatus.map(r => ({ status: r.status, total: Number((r._count as any)?._all ?? 0) }))

  const gbBib = await prisma.consulta.groupBy({
    by: ['bibliotecarioId'],
    where: where.consulta,
    _count: { _all: true },
  })
  gbBib.sort((a,b)=>Number((b._count as any)?._all ?? 0) - Number((a._count as any)?._all ?? 0))
  const top = gbBib.slice(0, 10)

  const bibUsers = await prisma.user.findMany({
    where: { id: { in: top.map(t => t.bibliotecarioId!).filter(Boolean) as number[] } },
    select: { id: true, name: true },
  })
  const nomeById = new Map(bibUsers.map(u => [u.id, u.name ?? `#${u.id}`]))
  const topBibliotecarios = top.map(t => ({
    id: t.bibliotecarioId ?? 0,
    nome: t.bibliotecarioId ? (nomeById.get(t.bibliotecarioId) ?? `#${t.bibliotecarioId}`) : '—',
    total: Number((t._count as any)?._all ?? 0),
  }))

  res.json({ porStatus, topBibliotecarios })
})

/* ========================== EXPORTS CSV (idem, usando req.auth) ========================== */
// … mantém os endpoints de export iguais, mas onde lias (req as any).user passa a (req as any).auth …
/* ========================== EXPORTS CSV ========================== */

statsRouter.get('/requisicoes/export/csv', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) {
    return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  }
  const { where } = scope

  const periodo = String(req.query.periodo ?? 'mes') as 'dia' | 'mes' | 'ano'
  const end = new Date()
  const from =
    periodo === 'dia' ? addDays(new Date(), -1)
    : periodo === 'ano' ? addDays(new Date(), -365)
    : addDays(new Date(), -30)

  const rows = await prisma.requisicao.findMany({
    where: { ...(where.requisicao ?? {}), createdAt: { gte: from, lte: end } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      dataDevolucaoPrevista: true,
      bibliotecaId: true,
      familia: { select: { id: true, user: { select: { name: true, email: true } } } },
      livro: { select: { id: true, titulo: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const data = rows.map(r => ({
    id: r.id,
    status: r.status,
    criadoEm: r.createdAt.toISOString(),
    devolucaoPrevista: r.dataDevolucaoPrevista ? r.dataDevolucaoPrevista.toISOString() : '',
    familiaId: r.familia?.id ?? '',
    responsavel: r.familia?.user?.name ?? '',
    responsavelEmail: r.familia?.user?.email ?? '',
    livroId: r.livro?.id ?? '',
    livroTitulo: r.livro?.titulo ?? '',
    bibliotecaId: r.bibliotecaId ?? '',
  }))

  const parser = new Parser()
  const csv = parser.parse(data)
  res.header('Content-Type', 'text/csv; charset=utf-8')
  res.attachment(`requisicoes_${periodo}.csv`)
  res.send(csv)
})

statsRouter.get('/familia/export/csv', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) {
    return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  }
  const { where } = scope

  const gb = await prisma.requisicao.groupBy({
    by: ['familiaId'],
    where: where.requisicao,
    _count: { _all: true },
  })
  gb.sort((a,b)=>Number((b._count as any)?._all ?? 0) - Number((a._count as any)?._all ?? 0))

  const familias = await prisma.familia.findMany({
    where: { id: { in: gb.map(t => t.familiaId) } },
    select: { id: true, user: { select: { name: true, email: true } } },
  })
  const byId = new Map(familias.map(f => [f.id, f]))
  const data = gb.map(t => {
    const f = byId.get(t.familiaId)
    return {
      familiaId: t.familiaId,
      responsavel: f?.user?.name ?? '',
      email: f?.user?.email ?? '',
      totalRequisicoes: Number((t._count as any)?._all ?? 0),
    }
  })

  const parser = new Parser()
  const csv = parser.parse(data)
  res.header('Content-Type', 'text/csv; charset=utf-8')
  res.attachment('requisicoes_por_familia.csv')
  res.send(csv)
})

statsRouter.get('/top-livros/export/csv', ...onlyStaff, async (req, res) => {
  const me = (req as any).auth as AuthCtx
  const scope = buildScope(me)
  if ((scope as any).invalidScope) {
    return res.status(403).json({ message: 'Bibliotecário sem biblioteca atribuída' })
  }
  const { where } = scope

  const gb = await prisma.requisicao.groupBy({
    by: ['livroId'],
    where: where.requisicao,
    _count: { _all: true },
  })
  gb.sort((a,b)=>Number((b._count as any)?._all ?? 0) - Number((a._count as any)?._all ?? 0))
  const top = gb.slice(0, 20)

  const livros = await prisma.livro.findMany({
    where: { id: { in: top.map(g => g.livroId) } },
    select: { id: true, titulo: true, autor: true, bibliotecaId: true },
  })
  const byId = new Map(livros.map(l => [l.id, l]))
  const data = top.map(g => {
    const l = byId.get(g.livroId)
    return {
      livroId: g.livroId,
      titulo: l?.titulo ?? '',
      autor: l?.autor ?? '',
      bibliotecaId: l?.bibliotecaId ?? '',
      requisicoes: Number((g._count as any)?._all ?? 0),
    }
  })

  const parser = new Parser()
  const csv = parser.parse(data)
  res.header('Content-Type', 'text/csv; charset=utf-8')
  res.attachment('top_livros.csv')
  res.send(csv)
})

export default statsRouter
