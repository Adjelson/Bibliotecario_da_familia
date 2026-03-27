// server/src/routes/index.ts
import { Router } from 'express'

import authRoutes from './auth'
import bibliotecasRoutes from './bibliotecas'
import familiaRoutes from './familia'
import livrosRoutes from './livros'
import consultasRoutes from './consultas'
import requisicoesRoutes from './requisicoes'
import mensagensRoutes from './mensagens'
import notificacoesRoutes from './notificacoes'
import eventosRoutes from './atividades'
import  utilizadoresRouter  from './utilizadores'
import statsRouter from './stats'
import requisicoesUserRouter from './requisicoes-user'
import carrinhoRouter from './carrinho-checkout'
import pedidosLojaRouter from './pedidos-loja'

const router = Router()

// Auth / sessão
router.use('/auth', authRoutes)

// Domínio principal
router.use('/familia', familiaRoutes)
router.use('/livros', livrosRoutes)
router.use('/consultas', consultasRoutes)
router.use('/requisicoes', requisicoesRoutes)
router.use('/requisicoes-user', requisicoesUserRouter)
router.use('/eventos', eventosRoutes)
router.use('/mensagens', mensagensRoutes)
router.use('/notificacoes', notificacoesRoutes)
router.use('/pedidos-loja', pedidosLojaRouter)

// Carrinho / Checkout / Pagamentos
router.use('/carrinho', carrinhoRouter)

// Administração / gestão
router.use('/bibliotecas', bibliotecasRoutes)
router.use('/utilizadores', utilizadoresRouter)
router.use('/stats', statsRouter)

// Healthcheck
router.get('/', (_req, res) => res.json({ ok: true }))

export { router }
export default router
