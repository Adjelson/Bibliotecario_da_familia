import { redirect } from '@tanstack/react-router'
import { useAuth } from '../store/auth'
import type { Role } from '../store/auth'

export function requireNoAuth() {
  return () => {
    const { isAuthenticated } = useAuth.getState()
    if (isAuthenticated) {
      throw redirect({ to: '/' })
    }
    return {}
  }
}

export function requireRole(roles: Role[]) {
  return () => {
    const { isAuthenticated, user } = useAuth.getState()
    if (!isAuthenticated) {
      throw redirect({ to: '/login' })
    }
    if (user && !roles.includes(user.role)) {
      // não autorizado -> redireciona p/ página adequada
      throw redirect({ to: '/' })
    }
    return {}
  }
}

export function requireGuest() {
  return () => {
    const { isAuthenticated } = useAuth.getState()
    if (isAuthenticated) {
      throw redirect({ to: '/familia' })
    }
    return {}
  }
}



export function requireAuth(roles?: Role[]) {
  return () => {
    const { isAuthenticated, user } = useAuth.getState()
    if (!isAuthenticated) {
      throw redirect({ to: '/login' })
    }
    if (roles && roles.length > 0 && user && !roles.includes(user.role)) {
      // não autorizado -> redireciona p/ página adequada
      throw redirect({ to: '/' })
    }
    return {}
  }
}
