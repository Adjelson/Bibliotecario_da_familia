// src/middleware/requireRoles.ts
import { Request, Response, NextFunction } from 'express'
import { Role } from '@prisma/client'

/**
 * Garante que o utilizador autenticado tem um dos perfis exigidos.
 * Assume que o `auth()` já preencheu `req.auth` com { userId, role }.
 */
export function requireRoles(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // adapta ao que o teu auth realmente coloca no request
    const auth = (req as any).auth as { userId?: number; role?: Role } | undefined
    if (!auth?.role) return res.status(401).json({ message: 'Não autenticado' })
    if (!roles.includes(auth.role)) return res.status(403).json({ message: 'Sem permissão' })
    next()
  }
}
