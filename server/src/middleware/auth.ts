// server/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express'
import type { JwtPayload } from 'jsonwebtoken'
import { verifyAccess } from '../utils/jwt'
import { prisma } from '../prisma'
import { Role } from '@prisma/client'

/**
 * Lê o JWT, valida e carrega também a biblioteca do utilizador.
 * Injeta em req.auth = { userId, role, bibliotecaId }
 *
 * required = true -> 401 se não autenticado
 * required = false -> segue sem req.auth
 */
export function auth(required = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const hdr = req.headers.authorization || ''
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : undefined

    if (!token) {
      if (required) return res.status(401).json({ message: 'Sem token' })
      return next()
    }

    try {
      const decoded = verifyAccess<JwtPayload>(token) as JwtPayload & {
        role?: Role
      }

      const subStr = decoded.sub ?? ''
      const userId = Number(subStr)
      if (!userId || Number.isNaN(userId)) {
        return res.status(401).json({ message: 'Token sem utilizador válido' })
      }

      // Garantir role e bibliotecaId reais vindos da BD (e se o user está ativo)
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          isActive: true,
          bibliotecaId: true,
        },
      })

      if (!dbUser || !dbUser.isActive) {
        return res.status(401).json({ message: 'Utilizador inativo ou inexistente' })
      }

      // Papel final vem SEMPRE da BD, não confiamos 100% no token
      const role = dbUser.role as Role
      const bibliotecaId = dbUser.bibliotecaId ?? null

      ;(req as any).auth = { userId, role, bibliotecaId }

      return next()
    } catch {
      return res.status(401).json({ message: 'Token inválido' })
    }
  }
}

/**
 * requireRole(...roles):
 * - Garante que req.auth existe (logo, auth() TEM que vir antes)
 * - Verifica se o role do utilizador está na lista permitida
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authCtx = (req as any).auth as {
      userId: number
      role: Role
      bibliotecaId: number | null
    } | undefined

    if (!authCtx) {
      return res.status(401).json({ message: 'Não autenticado' })
    }

    if (!roles.includes(authCtx.role)) {
      return res.status(403).json({ message: 'Sem permissão' })
    }

    return next()
  }
}
