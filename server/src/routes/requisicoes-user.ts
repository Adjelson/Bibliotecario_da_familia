// server/src/routes/requisicoes-user.ts
import { Router } from 'express'
import { prisma } from '../prisma'
import { auth, requireRole } from '../middleware/auth'
import { asyncHandler } from '../middleware/async'
import { Role } from '@prisma/client'
import { toDtoPedido } from './requisicoes'

const r = Router()

async function familiaIdFromReq(req: any): Promise<number | null> {
  const userId = req.auth.userId
  const fam = await prisma.familia.findUnique({
    where: { userId },
    select: { id: true },
  })
  return fam?.id ?? null
}

// mapper: item de compra -> RequisicaoDTO like
function compraItemToDto(item: any, pedido: any) {
  return {
    id: Number(`9${pedido.id}${item.id}`),     // id sintético só p/ UI
    livroId: item.livroId,
    livroTitulo: item.titulo ?? item.livro?.titulo ?? 'Livro',
    livroAutor: item.livro?.autor ?? null,
    livroImagem: item.imagem ?? item.livro?.imagem ?? null,
    categoria: item.livro?.categoria ?? null,
    faixa: item.livro?.faixaEtaria ?? null,

    // status “user-friendly” (mantém compat do front)
    status: 'confirmado',
    statusRaw: pedido.status as
      | 'ENVIADO'
      | 'CONCLUIDO'
      | 'APROVADO'
      | 'CANCELADO'
      | 'PAGO',

    nome: pedido.clienteNome ?? null,
    dataPedido: pedido.createdAt?.toISOString?.() ?? null,

    // compra não tem prazo/devolução
    tipoAquisicao: 'compra' as const,
    diasDevolucao: null,
    dataDevolucaoPrevista: null,
    devolvidoEm: null,

    // entrega (se houver)
    tipo: (pedido.entregaTipo ?? '') as '' | 'domicilio' | 'biblioteca',
    endereco: pedido.entregaEndereco ?? null,
    dataResposta: null,
    horario: null,
    entregueEm: item.entregueEm ? item.entregueEm.toISOString?.() : null,

    // pagamentos (opcional)
    pagamentoStatus: pedido.pagamentoStatus ?? null,
    pagamentoValor: item.precoUnit != null ? item.precoUnit * (item.quantidade ?? 1) : null,

    // extras (compat UI)
    precoLivro: item.precoUnit ?? item.livro?.preco ?? null,
    stockAtual: item.livro?.quantidade ?? null,
    quantidadeSolicitada: item.quantidade ?? 1,
    quantidadeAprovada: item.quantidade ?? 1,
  }
}

// GET /requisicoes-user/minhas
r.get(
  '/minhas',
  auth(true),
  requireRole(Role.PAI, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const role = req.auth.role as Role
    let where: any = {}

    if (role === Role.PAI) {
      const famId = await familiaIdFromReq(req)
      if (!famId) return res.status(400).json({ message: 'Família não encontrada' })
      where = { familiaId: famId }
    }

    const rows = await prisma.requisicao.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        livro: true,
        familia: { include: { user: { select: { name: true } } } },
      },
    })

    res.json(rows.map(toDtoPedido))
  }),
)

// GET /requisicoes-user/minhas/em-posse  (EMPRÉSTIMO + COMPRA)
r.get(
  '/minhas/em-posse',
  auth(true),
  requireRole(Role.PAI, Role.ADMIN),
  asyncHandler(async (req: any, res) => {
    const role = req.auth.role as Role
    let familiaId: number | null = null

    if (role === Role.PAI) {
      familiaId = await familiaIdFromReq(req)
      if (!familiaId) return res.status(400).json({ message: 'Família não encontrada' })
    }

    // filtro base por família (ou nenhum, caso ADMIN veja todos)
    const whereFam = familiaId ? { familiaId } : {}

    // 1) EMPRÉSTIMOS EM POSSE
    const emprestimos = await prisma.requisicao.findMany({
      where: {
        ...whereFam,
        status: 'ENTREGUE',
        devolvidoEm: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        livro: true,
        familia: { include: { user: { select: { name: true } } } },
      },
    })
    const emprestimosDto = emprestimos.map(toDtoPedido)

    // 2) COMPRAS ENTREGUES/CONCLUÍDAS
    const pedidos = await prisma.pedido.findMany({
      where: {
        ...whereFam,
        status: { in: ['ENVIADO', 'CONCLUIDO'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        itens: {
          include: { livro: true },
        },
      },
    })
    const comprasDto = pedidos.flatMap((p) => (p.itens ?? []).map((it) => compraItemToDto(it, p)))

    // junta e ordena por “entregueEm” ou “dataPedido”
    const todos = [...emprestimosDto, ...comprasDto].sort((a, b) => {
      const ta =
        (a.entregueEm ? new Date(a.entregueEm).getTime() : 0) ||
        (a.dataPedido ? new Date(a.dataPedido).getTime() : 0)
      const tb =
        (b.entregueEm ? new Date(b.entregueEm).getTime() : 0) ||
        (b.dataPedido ? new Date(b.dataPedido).getTime() : 0)
      return tb - ta
    })

    res.json(todos)
  }),
)

export default r
