// src/api/auth.ts
import { useEffect } from 'react'
import { api, AuthAPI } from './client'
import { normalizeRole, useAuth } from '../store/auth'
import type { User } from '../store/auth'

export type LoginBody = { email: string; password: string }

export type FilhoInput = {
  nome: string
  idade: number
  genero: 'F' | 'M' | 'Outro'
  perfilLeitor: 'iniciante' | 'Dislexia' | 'autonomo'
}

export type RegisterFamiliaPayload = {
  name: string
  email: string
  password: string
  telefone: string
  morada: string
  interesses?: string[]
  filhos?: FilhoInput[]
  bibliotecaId?: number
}

/* ============================== wrappers ============================== */

export async function login(body: LoginBody) {
  const data = await AuthAPI.login(body)
  return data as {
    user: User
    accessToken: string
    refreshToken?: string | null
    expiresAt?: number
  }
}

export async function register(payload: RegisterFamiliaPayload) {
  const { data } = await api.post<{ user: User; accessToken: string; refreshToken?: string | null }>(
    '/auth/register',
    payload,
  )

  const nr = normalizeRole((data.user as any).role)
  if (nr) data.user.role = nr
  return data
}

export async function me() {
  const { data } = await api.get<User>('/auth/me')

  const nr = normalizeRole((data as any).role)
  if (nr) (data as any).role = nr

  const active =
    typeof (data as any).active === 'boolean'
      ? (data as any).active
      : typeof (data as any).isActive === 'boolean'
        ? (data as any).isActive
        : undefined
  if (active !== undefined) {
    ;(data as any).active = active
    ;(data as any).isActive = active
  }

  return data
}

export async function logoutApi() {
  await api.post('/auth/logout', {})
}

export const refreshToken = async (token: string) => {
  const { data } = await api.post<{ accessToken: string; user: User }>('/auth/refresh', { refreshToken: token })

  const nr = normalizeRole((data.user as any).role)
  if (nr) data.user.role = nr

  const active =
    typeof (data.user as any).active === 'boolean'
      ? (data.user as any).active
      : typeof (data.user as any).isActive === 'boolean'
        ? (data.user as any).isActive
        : undefined
  if (active !== undefined) {
    ;(data.user as any).active = active
    ;(data.user as any).isActive = active
  }

  return data
}

/* ============================== Sessão: atividade global ============================== */
export function useGlobalActivity() {
  useEffect(() => {
    const touch = () => useAuth.getState().touchActivity()
    const evts = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']
    evts.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    return () => evts.forEach((e) => window.removeEventListener(e, touch))
  }, [])
}
