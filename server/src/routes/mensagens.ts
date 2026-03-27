import { Router, type Request, type Response } from 'express'
import { prisma } from '../prisma'
import { auth } from '../middleware/auth'
import { Role } from '@prisma/client'

export const mensagensRouter = Router()
mensagensRouter.use(auth())

// Regra de permissão: ADMIN fala com todos; caso contrário, apenas PAI <-> BIBLIOTECARIO ativos e da mesma biblioteca.
async function canMessage(userId: number, peerId: number) {
  if (!userId || !peerId || userId === peerId) return false

  const [me, peer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, bibliotecaId: true, isActive: true },
    }),
    prisma.user.findUnique({
      where: { id: peerId },
      select: { role: true, bibliotecaId: true, isActive: true },
    }),
  ])

  if (!me || !peer) return false
  if (!me.isActive || !peer.isActive) return false

  // Se um dos dois for ADMIN, permitido
  if (me.role === Role.ADMIN || peer.role === Role.ADMIN) return true

  const pair = new Set([me.role, peer.role])
  const isPaiBib = pair.has(Role.PAI) && pair.has(Role.BIBLIOTECARIO)
  if (!isPaiBib) return false
  if (!me.bibliotecaId || !peer.bibliotecaId) return false

  return me.bibliotecaId === peer.bibliotecaId
}

/** GET /mensagens/peers */
mensagensRouter.get('/peers', async (req, res) => {
  const meId = (req as any).auth.userId as number
  const me = await prisma.user.findUnique({
    where: { id: meId },
    select: { role: true, bibliotecaId: true, isActive: true },
  })
  if (!me?.isActive) return res.json([])

  const q = String(req.query.q ?? '').trim()
  const byNameOrEmail = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
    : {}

  if (me.role === Role.PAI) {
    if (!me.bibliotecaId) return res.json([])
    const bibs = await prisma.user.findMany({
      where: { role: Role.BIBLIOTECARIO, isActive: true, bibliotecaId: me.bibliotecaId, ...byNameOrEmail },
      select: { id: true, name: true, email: true, role: true, bibliotecaId: true },
      orderBy: { name: 'asc' }, take: 500,
    })
    return res.json(bibs)
  }

  if (me.role === Role.BIBLIOTECARIO) {
    if (!me.bibliotecaId) return res.json([])
    const familias = await prisma.familia.findMany({
      where: { user: { bibliotecaId: me.bibliotecaId, isActive: true, ...byNameOrEmail } },
      select: { user: { select: { id: true, name: true, email: true, role: true, bibliotecaId: true } } },
      orderBy: { id: 'asc' }, take: 500,
    })
    const peers = familias.map((f) => f.user).filter(Boolean)
    return res.json(peers)
  }

  if (me.role === Role.ADMIN) {
    const bibliotecaId = req.query.bibliotecaId ? Number(req.query.bibliotecaId) : undefined
    const where: any = { isActive: true, ...(bibliotecaId ? { bibliotecaId } : {}), ...byNameOrEmail }
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, bibliotecaId: true },
      orderBy: { name: 'asc' }, take: 500,
    })
    return res.json(users)
  }

  return res.json([])
})

/** GET /mensagens/peer/:id -> perfil mínimo do peer, se eu puder falar com ele */
mensagensRouter.get('/peer/:id', async (req, res) => {
  const me = (req as any).auth.userId as number
  const peerId = Number(req.params.id)
  if (!peerId) return res.status(400).json({ message: 'id inválido' })
  if (!(await canMessage(me, peerId))) return res.status(403).json({ message: 'Sem permissão' })

  const peer = await prisma.user.findUnique({
    where: { id: peerId },
    select: { id: true, name: true, email: true, role: true, bibliotecaId: true, isActive: true },
  })
  if (!peer) return res.status(404).json({ message: 'Peer não encontrado' })
  return res.json(peer)
})

/** GET /mensagens/threads  -> apenas threads permitidas */
mensagensRouter.get('/threads', async (req: Request, res: Response) => {
  const me = (req as any).auth.userId as number

  const meUser = await prisma.user.findUnique({
    where: { id: me },
    select: { role: true, bibliotecaId: true, isActive: true },
  })
  if (!meUser?.isActive) return res.json([])

  // últimas mensagens minhas
  const msgs = await prisma.mensagem.findMany({
    where: { OR: [{ fromUserId: me }, { toUserId: me }] },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  // última por peer
  const lastByPeer = new Map<number, (typeof msgs)[number]>()
  for (const m of msgs) {
    const peer = m.fromUserId === me ? m.toUserId : m.fromUserId
    if (!lastByPeer.has(peer)) lastByPeer.set(peer, m)
  }
  const peerIds = Array.from(lastByPeer.keys())

  // carrega peers
  const peers = await prisma.user.findMany({
    where: { id: { in: peerIds }, isActive: true },
    select: { id: true, name: true, role: true, bibliotecaId: true },
  })

  // aplica a mesma regra de permissão
  const can = (peer: { role: Role, bibliotecaId: number | null }) => {
    if (meUser.role === Role.ADMIN || peer.role === Role.ADMIN) return true
    const pair = new Set<Role>([meUser.role as Role, peer.role])
    const isPaiBib = pair.has(Role.PAI) && pair.has(Role.BIBLIOTECARIO)
    return isPaiBib && !!meUser.bibliotecaId && meUser.bibliotecaId === peer.bibliotecaId
  }

  const peersAllowed = peers.filter(can)
  const allowedIds = new Set(peersAllowed.map(p => p.id))

  // não lidas por peer (só os permitidos)
  const unread = await prisma.mensagem.groupBy({
    by: ['fromUserId'],
    where: { toUserId: me, readAt: null, fromUserId: { in: Array.from(allowedIds) } },
    _count: { _all: true },
  })
  const unreadByPeer = new Map<number, number>()
  unread.forEach((u) => unreadByPeer.set(u.fromUserId, u._count._all))

  const out = peersAllowed
    .map(p => ({
      peer: { id: p.id, name: p.name ?? `Utilizador #${p.id}`, role: p.role },
      lastMessage: lastByPeer.get(p.id)!,
      unread: unreadByPeer.get(p.id) ?? 0,
    }))
    .sort((a, b) => new Date(b.lastMessage!.createdAt).getTime() - new Date(a.lastMessage!.createdAt).getTime())

  return res.json(out)
})

/** GET /mensagens?peerId=123 */
mensagensRouter.get('/', async (req: Request, res: Response) => {
  const me = (req as any).auth.userId as number
  const peerId = Number(req.query.peerId)
  if (!peerId) return res.status(400).json({ message: 'peerId é obrigatório' })
  if (!(await canMessage(me, peerId))) return res.status(403).json({ message: 'Sem permissão' })

  const data = await prisma.mensagem.findMany({
    where: { OR: [{ fromUserId: me, toUserId: peerId }, { fromUserId: peerId, toUserId: me }] },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  })
  return res.json(data)
})

/** POST /mensagens  { toUserId, body }  -> cria mensagem + notificação para o destinatário */
mensagensRouter.post('/', async (req: Request, res: Response) => {
  const me = (req as any).auth.userId as number
  const { toUserId, body } = req.body ?? {}
  const peerId = Number(toUserId)
  const text = String(body ?? '').trim()
  if (!peerId || !text) return res.status(400).json({ message: 'toUserId e body são obrigatórios' })
  if (!(await canMessage(me, peerId))) return res.status(403).json({ message: 'Sem permissão' })

  const sender = await prisma.user.findUnique({
    where: { id: me },
    select: { name: true, email: true },
  })
  const senderName = (sender?.name?.trim())
    || (sender?.email?.split('@')[0])
    || `Utilizador #${me}`

  const snippet = text.length > 140 ? `${text.slice(0, 140)}…` : text

  const [created] = await prisma.$transaction([
    prisma.mensagem.create({
      data: { fromUserId: me, toUserId: peerId, body: text },
    }),
    prisma.notificacao.create({
      data: {
        userId: peerId,
        type: 'MENSAGEM',
        title: `Nova mensagem de ${senderName}`,
        body: snippet,
      },
    }),
  ])

  return res.json(created)
})

/** PATCH /mensagens/:id/read  (marca como lida, se for destinatário) */
mensagensRouter.patch('/:id/read', async (req: Request, res: Response) => {
  const me = (req as any).auth.userId as number
  const id = Number(req.params.id)
  const msg = await prisma.mensagem.findUnique({ where: { id } })
  if (!msg) return res.status(404).json({ message: 'Mensagem não encontrada' })
  if (msg.toUserId !== me) return res.status(403).json({ message: 'Sem permissão' })
  if (msg.readAt) return res.json(msg)

  const updated = await prisma.mensagem.update({ where: { id }, data: { readAt: new Date() } })
  return res.json(updated)
})

/** Compat: POST /mensagens/:id/lida */
mensagensRouter.post('/:id/lida', async (req: Request, res: Response) => {
  const me = (req as any).auth.userId as number
  const id = Number(req.params.id)
  const msg = await prisma.mensagem.findUnique({ where: { id } })
  if (!msg) return res.status(404).json({ message: 'Mensagem não encontrada' })
  if (msg.toUserId !== me) return res.status(403).json({ message: 'Sem permissão' })
  if (msg.readAt) return res.json(msg)

  const updated = await prisma.mensagem.update({ where: { id }, data: { readAt: new Date() } })
  return res.json(updated)
})

export default mensagensRouter
