"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
// server/src/routes/index.ts
const express_1 = require("express");
const auth_1 = __importDefault(require("./auth"));
const bibliotecas_1 = __importDefault(require("./bibliotecas"));
const familia_1 = __importDefault(require("./familia"));
const livros_1 = __importDefault(require("./livros"));
const consultas_1 = __importDefault(require("./consultas"));
const requisicoes_1 = __importDefault(require("./requisicoes"));
const mensagens_1 = __importDefault(require("./mensagens"));
const notificacoes_1 = __importDefault(require("./notificacoes"));
const atividades_1 = __importDefault(require("./atividades"));
const utilizadores_1 = __importDefault(require("./utilizadores"));
const stats_1 = __importDefault(require("./stats"));
const requisicoes_user_1 = __importDefault(require("./requisicoes-user"));
const carrinho_checkout_1 = __importDefault(require("./carrinho-checkout"));
const pedidos_loja_1 = __importDefault(require("./pedidos-loja"));
const router = (0, express_1.Router)();
exports.router = router;
// Auth / sessão
router.use('/auth', auth_1.default);
// Domínio principal
router.use('/familia', familia_1.default);
router.use('/livros', livros_1.default);
router.use('/consultas', consultas_1.default);
router.use('/requisicoes', requisicoes_1.default);
router.use('/requisicoes-user', requisicoes_user_1.default);
router.use('/eventos', atividades_1.default);
router.use('/mensagens', mensagens_1.default);
router.use('/notificacoes', notificacoes_1.default);
router.use('/pedidos-loja', pedidos_loja_1.default);
// Carrinho / Checkout / Pagamentos
router.use('/carrinho', carrinho_checkout_1.default);
// Administração / gestão
router.use('/bibliotecas', bibliotecas_1.default);
router.use('/utilizadores', utilizadores_1.default);
router.use('/stats', stats_1.default);
// Healthcheck
router.get('/', (_req, res) => res.json({ ok: true }));
exports.default = router;
