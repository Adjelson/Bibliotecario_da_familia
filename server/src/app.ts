// server/src/app.ts
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import path from 'path'
import { ENV } from './env'
import { router } from './routes/index'
import { ZodError } from 'zod'

export const app = express()

app.disable('x-powered-by')

// segurança
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
)

// body parsers
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// CORS
app.use(
  cors({
    origin: ENV.CORS_ORIGIN,
    credentials: true,
  }),
)

// estáticos
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    index: false,
    maxAge: '7d',
  }),
)

// API principal
app.use('/', router)

// 404 default -> JSON
app.use((_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada' })
})

// erro genérico -> JSON
app.use(
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        message: 'Dados inválidos',
        errors: (err as any).flatten?.().fieldErrors ?? err.issues,
      })
    }
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'Violação de unicidade (duplicado).' })
    }
    console.error(err)
    res.status(err?.status || 500).json({ message: err?.message || 'Erro interno' })
  },
)
