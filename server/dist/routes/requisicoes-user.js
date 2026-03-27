"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/requisicoes-user.ts
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const async_1 = require("../middleware/async");
const client_1 = require("@prisma/client");
const requisicoes_1 = require("./requisicoes");
const r = (0, express_1.Router)();
async function familiaIdFromReq(req) {
    const userId = req.auth.userId;
    const fam = await prisma_1.prisma.familia.findUnique({
        where: { userId },
        select: { id: true },
    });
    return fam?.id ?? null;
}
// mapper: item de compra -> RequisicaoDTO like
function compraItemToDto(item, pedido) {
    return {
        id: Number(`9${pedido.id}${item.id}`), // id sintético só p/ UI
        livroId: item.livroId,
        livroTitulo: item.titulo ?? item.livro?.titulo ?? 'Livro',
        livroAutor: item.livro?.autor ?? null,
        livroImagem: item.imagem ?? item.livro?.imagem ?? null,
        categoria: item.livro?.categoria ?? null,
        faixa: item.livro?.faixaEtaria ?? null,
        // status “user-friendly” (mantém compat do front)
        status: 'confirmado',
        statusRaw: pedido.status,
        nome: pedido.clienteNome ?? null,
        dataPedido: pedido.createdAt?.toISOString?.() ?? null,
        // compra não tem prazo/devolução
        tipoAquisicao: 'compra',
        diasDevolucao: null,
        dataDevolucaoPrevista: null,
        devolvidoEm: null,
        // entrega (se houver)
        tipo: (pedido.entregaTipo ?? ''),
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
    };
}
// GET /requisicoes-user/minhas
r.get('/minhas', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const role = req.auth.role;
    let where = {};
    if (role === client_1.Role.PAI) {
        const famId = await familiaIdFromReq(req);
        if (!famId)
            return res.status(400).json({ message: 'Família não encontrada' });
        where = { familiaId: famId };
    }
    const rows = await prisma_1.prisma.requisicao.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            livro: true,
            familia: { include: { user: { select: { name: true } } } },
        },
    });
    res.json(rows.map(requisicoes_1.toDtoPedido));
}));
// GET /requisicoes-user/minhas/em-posse  (EMPRÉSTIMO + COMPRA)
r.get('/minhas/em-posse', (0, auth_1.auth)(true), (0, auth_1.requireRole)(client_1.Role.PAI, client_1.Role.ADMIN), (0, async_1.asyncHandler)(async (req, res) => {
    const role = req.auth.role;
    let familiaId = null;
    if (role === client_1.Role.PAI) {
        familiaId = await familiaIdFromReq(req);
        if (!familiaId)
            return res.status(400).json({ message: 'Família não encontrada' });
    }
    // filtro base por família (ou nenhum, caso ADMIN veja todos)
    const whereFam = familiaId ? { familiaId } : {};
    // 1) EMPRÉSTIMOS EM POSSE
    const emprestimos = await prisma_1.prisma.requisicao.findMany({
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
    });
    const emprestimosDto = emprestimos.map(requisicoes_1.toDtoPedido);
    // 2) COMPRAS ENTREGUES/CONCLUÍDAS
    const pedidos = await prisma_1.prisma.pedido.findMany({
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
    });
    const comprasDto = pedidos.flatMap((p) => (p.itens ?? []).map((it) => compraItemToDto(it, p)));
    // junta e ordena por “entregueEm” ou “dataPedido”
    const todos = [...emprestimosDto, ...comprasDto].sort((a, b) => {
        const ta = (a.entregueEm ? new Date(a.entregueEm).getTime() : 0) ||
            (a.dataPedido ? new Date(a.dataPedido).getTime() : 0);
        const tb = (b.entregueEm ? new Date(b.entregueEm).getTime() : 0) ||
            (b.dataPedido ? new Date(b.dataPedido).getTime() : 0);
        return tb - ta;
    });
    res.json(todos);
}));
exports.default = r;
