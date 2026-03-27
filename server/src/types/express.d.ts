// server/src/types/express.d.ts
import type { Role } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number
        role: Role
        bibliotecaId: number | null
      }
    }
  }
}

export {}
