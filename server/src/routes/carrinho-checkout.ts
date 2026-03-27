import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma'
import { auth, requireRole } from '../middleware/auth'
import { asyncHandler } from '../middleware/async'
import { Role, PagamentoMetodo } from '@prisma/client'

const r = Router()

/* ============================ Schemas ============================ */
const CartAddBody = z.object({
  livroId: z.coerce.number().int().positive(),
  quantidade: z.coerce.number().int().min(1).max(999).default(1),
})

const CartUpdateBody = z.object({
  quantidade: z.coerce.number().int().min(0).max(999),
})

const CheckoutBody = z.object({
  entregaTipo: z.enum(['domicilio', 'biblioteca']).default('biblioteca'),
  endereco: z.string().trim().min(5, 'Endereço muito curto').max(255).nullable().optional(),
})

const PayStartBody = z.object({
  // Aceita string e depois normalizamos para o enum do Prisma
  metodo: z.string().trim(),
})

const PayConfirmBody = z.object({
  referencia: z.string().min(3),
})

/* ============================ Helpers ============================ */

function normalizeMetodo(str: string): PagamentoMetodo {
  const upper = str.toUpperCase()
  if ((PagamentoMetodo as any)[upper]) return (PagamentoMetodo as any)[upper] as PagamentoMetodo
  if ((PagamentoMetodo as any)['M_PESA'] && upper === 'MPESA') return (PagamentoMetodo as any)['M_PESA'] as PagamentoMetodo
  return PagamentoMetodo.CARTAO
}

/** Obtém familiaId em função do role */
async function getFamiliaIdFromReq(req: any): Promise<number> {
  const role = req.auth?.role
  if (role === 'PAI') {
    const fam = await prisma.familia.findUnique({
      where: { userId: req.auth.userId },
      select: { id: true },
    })
    if (!fam) throw new Error('Família não encontrada')
    return fam.id
  }
  const familiaId = Number(req.query.familiaId ?? 0)
  if (!familiaId) throw new Error('familiaId é obrigatório para staff')
  const exists = await prisma.familia.count({ where: { id: familiaId } })
  if (!exists) throw new Error('Família inválida')
  return familiaId
}

/** Carrega o carrinho (PK = familiaId) + itens */
async function carregarCarrinhoCompleto(familiaId: number) {
  const carrinho = await prisma.carrinho.upsert({
    where: { familiaId },
    update: {},
    create: { familiaId },
  })

  const itens = await prisma.carrinhoItem.findMany({
    where: { carrinhoId: familiaId }, // carrinhoId = familiaId
    orderBy: { id: 'asc' },
    include: {
      livro: {
        select: {
          id: true,
          titulo: true,
          autor: true,
          preco: true,
          tipoAquisicao: true,
          quantidade: true,
          imagem: true,
          diasDevolucao: true,
          faixaEtaria: true,
          categoria: true,
          bibliotecaId: true,
        },
      },
    },
  })

  return { ...carrinho, itens }
}

/* ============================ GET /carrinho ============================ */
r.get(
  '/',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const familiaId = await getFamiliaIdFromReq(req)
    const cart = await carregarCarrinhoCompleto(familiaId)
    return res.json(cart)
  }),
)

/* ============================ POST /carrinho/itens ============================ */
r.post(
  '/itens',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const familiaId = await getFamiliaIdFromReq(req)
    const body = CartAddBody.parse(req.body)

    const livro = await prisma.livro.findUnique({
      where: { id: body.livroId },
      select: { id: true, titulo: true, preco: true, tipoAquisicao: true, quantidade: true, bibliotecaId: true },
    })
    if (!livro) return res.status(404).json({ message: 'Livro não encontrado' })
    if ((livro.quantidade ?? 0) <= 0) return res.status(400).json({ message: 'Sem stock disponível deste livro' })

    await prisma.carrinho.upsert({ where: { familiaId }, update: {}, create: { familiaId } })

    const existing = await prisma.carrinhoItem.findFirst({
      where: { carrinhoId: familiaId, livroId: body.livroId },
      include: { livro: true },
    })

    if (livro.tipoAquisicao === 'emprestimo') {
      // impede duplicado ativo do mesmo livro no carrinho (apenas 1 unidade)
      if (!existing) {
        // verifica empréstimo ativo já existente
        const dup = await prisma.requisicao.count({
          where: {
            familiaId, livroId: livro.id,
            status: { in: ['APROVADA','ENTREGUE'] },
            devolvidoEm: null,
          },
        })
        if (dup > 0) return res.status(409).json({ message: 'Já existe empréstimo ativo deste livro para a família.' })

        await prisma.carrinhoItem.create({
          data: {
            carrinhoId: familiaId,
            livroId: body.livroId,
            quantidade: 1,
            precoUnit: livro.preco ?? 0,
            tituloSnapshot: livro.titulo,
          },
        })
      }
    } else {
      const novaQtd = (existing?.quantidade ?? 0) + body.quantidade
      if (novaQtd > (livro.quantidade ?? 0)) {
        return res.status(400).json({ message: `Stock insuficiente. Só existem ${livro.quantidade} unidades.` })
      }
      if (existing) {
        await prisma.carrinhoItem.update({ where: { id: existing.id }, data: { quantidade: novaQtd } })
      } else {
        await prisma.carrinhoItem.create({
          data: {
            carrinhoId: familiaId,
            livroId: body.livroId,
            quantidade: body.quantidade,
            precoUnit: livro.preco ?? 0,
            tituloSnapshot: livro.titulo,
          },
        })
      }
    }

    const cart = await carregarCarrinhoCompleto(familiaId)
    return res.status(201).json(cart)
  }),
)

/* ============================ PUT /carrinho/itens/:id ============================ */
r.put(
  '/itens/:id',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const familiaId = await getFamiliaIdFromReq(req)
    const id = z.coerce.number().int().parse(req.params.id)
    const body = CartUpdateBody.parse(req.body)

    const item = await prisma.carrinhoItem.findUnique({
      where: { id },
      include: { livro: true },
    })
    if (!item || item.carrinhoId !== familiaId) return res.status(404).json({ message: 'Item não encontrado' })

    if (body.quantidade === 0) {
      await prisma.carrinhoItem.delete({ where: { id } })
    } else {
      let qnt = body.quantidade
      if (item.livro.tipoAquisicao === 'emprestimo') {
        qnt = 1
      } else if (qnt > (item.livro.quantidade ?? 0)) {
        return res.status(400).json({ message: `Stock insuficiente. Só existem ${item.livro.quantidade} unidades.` })
      }
      await prisma.carrinhoItem.update({ where: { id }, data: { quantidade: qnt } })
    }

    const cart = await carregarCarrinhoCompleto(familiaId)
    return res.json(cart)
  }),
)

/* ============================ DELETE /carrinho/itens/:id ============================ */
r.delete(
  '/itens/:id',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const familiaId = await getFamiliaIdFromReq(req)
    const id = z.coerce.number().int().parse(req.params.id)

    const item = await prisma.carrinhoItem.findUnique({ where: { id } })
    if (!item || item.carrinhoId !== familiaId) return res.status(404).json({ message: 'Item não encontrado' })

    await prisma.carrinhoItem.delete({ where: { id } })

    const cart = await carregarCarrinhoCompleto(familiaId)
    return res.json(cart)
  }),
)

/* ============================ POST /carrinho/checkout ============================ */
r.post(
  '/checkout',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const familiaId = await getFamiliaIdFromReq(req)
    const { entregaTipo, endereco } = CheckoutBody.parse(req.body)

    const carrinho = await prisma.carrinho.findUnique({
      where: { familiaId },
      include: { itens: { include: { livro: true }, orderBy: { id: 'asc' } } },
    })
    if (!carrinho || carrinho.itens.length === 0) return res.status(400).json({ message: 'Carrinho vazio' })

    const emprestimos = carrinho.itens.filter((it) => it.livro.tipoAquisicao === 'emprestimo')
    const compras = carrinho.itens.filter((it) => it.livro.tipoAquisicao === 'compra')

    if (compras.length > 0) {
      if (!endereco || endereco.trim().length < 5) {
        return res.status(400).json({ message: 'Endereço é obrigatório para entrega ao domicílio (itens de compra).' })
      }
    } else if (entregaTipo === 'domicilio' && (!endereco || endereco.trim().length < 5)) {
      return res.status(400).json({ message: 'Endereço é obrigatório para entrega ao domicílio.' })
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Requisições (emprestimo)
      const reqsCriadas: any[] = []
      for (const it of emprestimos) {
        if ((it.livro.quantidade ?? 0) <= 0) throw new Error(`Sem stock para empréstimo: ${it.livro.titulo}`)

        // bloqueia duplicado ativo
        const dup = await tx.requisicao.count({
          where: {
            familiaId, livroId: it.livroId,
            status: { in: ['APROVADA','ENTREGUE'] },
            devolvidoEm: null,
          },
        })
        if (dup > 0) throw new Error(`Já existe um empréstimo ativo do livro "${it.livro.titulo}"`)

        const rq = await tx.requisicao.create({
          data: {
            familiaId,
            bibliotecaId: it.livro.bibliotecaId,
            livroId: it.livroId,
            status: 'PENDENTE',
            entregaTipo: entregaTipo ?? 'biblioteca',
            entregaEndereco: entregaTipo === 'domicilio' ? endereco?.trim() ?? null : null,
            diasDevolucao: it.livro.diasDevolucao ?? null,
            dataDevolucaoPrevista: it.livro.diasDevolucao
              ? new Date(Date.now() + it.livro.diasDevolucao * 24 * 60 * 60 * 1000)
              : null,
          },
          include: {
            livro: {
              select: {
                id: true,
                titulo: true,
                autor: true,
                imagem: true,
                categoria: true,
                faixaEtaria: true,
                tipoAquisicao: true,
                diasDevolucao: true,
                bibliotecaId: true,
              },
            },
            familia: { include: { user: { select: { name: true, id: true } } } },
          },
        })
        reqsCriadas.push(rq)
      }

      // 2) Pedidos de compra — um pedido por biblioteca
      let pedidosCompra: any[] = []
      if (compras.length > 0) {
        // valida stock suficiente
        for (const it of compras) {
          if ((it.livro.quantidade ?? 0) <= 0) throw new Error(`Sem stock: ${it.livro.titulo}`)
          if (it.quantidade > (it.livro.quantidade ?? 0)) throw new Error(`Stock insuficiente: ${it.livro.titulo}`)
        }

        const groupByBib = compras.reduce((acc, it) => {
          const k = it.livro.bibliotecaId
          ;(acc[k] ||= []).push(it)
          return acc
        }, {} as Record<number, typeof compras>)

        for (const [bibIdStr, itens] of Object.entries(groupByBib)) {
          const bibId = Number(bibIdStr)
          const totalCompra = itens.reduce((sum, it) => {
            const unit = it.precoUnit ?? it.livro.preco ?? 0
            const q = it.quantidade ?? 1
            return sum + unit * q
          }, 0)

          const pedido = await tx.pedido.create({
            data: {
              familiaId,
              bibliotecaId: bibId,
              entregaTipo: 'domicilio',
              entregaEndereco: endereco?.trim() ?? null,
              total: totalCompra,
              status: 'PAGAMENTO_PENDENTE',
              itens: {
                create: itens.map((it) => ({
                  livro: { connect: { id: it.livroId } },
                  biblioteca: { connect: { id: bibId } },
                  titulo: it.tituloSnapshot ?? it.livro.titulo,
                  precoUnit: it.precoUnit ?? it.livro.preco ?? 0,
                  quantidade: it.quantidade,
                })),
              },
            },
            include: {
              itens: { include: { livro: true } },
              familia: { include: { user: { select: { id: true, name: true } } } },
            },
          })
          pedidosCompra.push(pedido)
        }
      }

      await tx.carrinhoItem.deleteMany({ where: { carrinhoId: familiaId } })

      return { requisicoes: reqsCriadas, pedidosCompra }
    })

    // 3) notificar bibliotecários por biblioteca (apenas das requisições)
    if (result.requisicoes.length > 0) {
      const byBib = new Map<number, any[]>()
      for (const rq of result.requisicoes) {
        const list = byBib.get(rq.bibliotecaId) ?? []
        list.push(rq)
        byBib.set(rq.bibliotecaId, list)
      }
      for (const [bibId, list] of byBib.entries()) {
        const biblios = await prisma.user.findMany({
          where: { role: 'BIBLIOTECARIO', isActive: true, bibliotecaId: bibId },
          select: { id: true },
        })
        if (biblios.length > 0) {
          await prisma.notificacao.createMany({
            data: biblios.flatMap(b =>
              list.map((rq: any) => ({
                userId: b.id,
                type: 'REQUISICAO_NOVA',
                title: 'Nova requisição de livro',
                body: `Pedido #${rq.id} — ${rq.livro.titulo}`,
              })),
            ),
          })
        }
      }
    }

    return res.status(201).json(result)
  }),
)

/* ============================ POST /carrinho/pagamentos/:pedidoId/iniciar ============================ */
r.post(
  '/pagamentos/:pedidoId/iniciar',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const pedidoId = z.coerce.number().int().parse(req.params.pedidoId)
    const { metodo } = PayStartBody.parse(req.body)
    const metodoEnum = normalizeMetodo(metodo)

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { id: true, total: true, status: true, bibliotecaId: true, familiaId: true },
    })
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' })
    if (pedido.status !== 'PAGAMENTO_PENDENTE') return res.status(409).json({ message: 'Estado inválido' })

    const ref = `REF-${pedido.id}-${Date.now()}`

    const pg = await prisma.pagamento.create({
      data: {
        pedidoId: pedido.id,
        bibliotecaId: pedido.bibliotecaId, // requerido pelo schema
        metodo: metodoEnum,
        referencia: ref,
        status: 'PROCESSANDO',
        valor: pedido.total,
      },
    })

    return res.status(201).json({ pagamentoId: pg.id, referencia: ref, valor: pedido.total })
  }),
)

/* ============================ POST /carrinho/pagamentos/:pedidoId/confirmar ============================ */
r.post(
  '/pagamentos/:pedidoId/confirmar',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const pedidoId = z.coerce.number().int().parse(req.params.pedidoId)
    const { referencia } = PayConfirmBody.parse(req.body)

    // NÃO debita stock aqui. Apenas marca pagamento como PAGO e o pedido como PAGO.
    const result = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
        include: { itens: { include: { livro: true } } },
      })
      if (!pedido) throw new Error('Pedido não encontrado')
      if (pedido.status !== 'PAGAMENTO_PENDENTE') throw new Error('Estado inválido')

      await tx.pagamento.updateMany({ where: { pedidoId, referencia }, data: { status: 'PAGO' } })
      const up = await tx.pedido.update({
        where: { id: pedidoId },
        data: { status: 'PAGO' },
        include: { itens: true, familia: { include: { user: { select: { id: true, name: true } } } } },
      })
      return up
    })

    return res.json(result)
  }),
)

/* ============================ POST /carrinho/pagamentos/:pedidoId/falhou ============================ */
r.post(
  '/pagamentos/:pedidoId/falhou',
  auth(true),
  requireRole(Role.PAI, Role.BIBLIOTECARIO, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const pedidoId = z.coerce.number().int().parse(req.params.pedidoId)

    await prisma.pagamento.updateMany({ where: { pedidoId }, data: { status: 'FALHOU' } })
    await prisma.pedido.update({ where: { id: pedidoId }, data: { status: 'PAGAMENTO_FALHOU' } })

    return res.json({ ok: true })
  }),
)

export default r
