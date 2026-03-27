// src/store/auth.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Role = 'PAI' | 'BIBLIOTECARIO' | 'ADMIN'

export const normalizeRole = (r: unknown): Role | null => {
  const up = String(r ?? '').toUpperCase()
  return (['PAI', 'BIBLIOTECARIO', 'ADMIN'] as const).includes(up as Role)
    ? (up as Role)
    : null
}

export interface Filho {
  id: number
  nome: string
  idade: number
  genero: 'F' | 'M' | 'Outro'
  perfilLeitor: 'iniciante' | 'Dislexia' | 'autonomo'
}

export interface Familia {
  id: number
  telefone: string
  morada: string
  interesses: string[]
  filhos?: Filho[]
}

export interface Biblioteca {
  id: number
  nome: string
  local?: string | null
}

export interface User {
  id: number
  name: string | null
  email: string | null
  role: Role
  active?: boolean
  isActive?: boolean
  bibliotecaId: number | null
  biblioteca?: Biblioteca | null
  familia?: Familia | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 min

type AuthState = {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  expiresAt: number | null
  lastActivityAt: number | null
  _timer?: number | null

  login: (p: { user: User; accessToken: string; refreshToken?: string | null; expiresAt?: number | null }) => void
  logout: () => void

  setAccessToken: (token: string | null, expiresAt?: number | null) => void
  setUser: (user: User | null) => void

  startTimers: () => void
  stopTimers: () => void
  touchActivity: () => void
  isAuthed: () => boolean
  hasAnyRole: (roles: Role[]) => boolean
  role: () => Role | null
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      expiresAt: null,
      lastActivityAt: null,
      _timer: null,

      login: ({ user, accessToken, refreshToken, expiresAt }) => {
        const now = Date.now()

        if (user?.role) {
          const nr = normalizeRole(user.role)
          if (nr) user.role = nr
        }
        if (user) {
          const active =
            typeof user.active === 'boolean'
              ? user.active
              : typeof user.isActive === 'boolean'
                ? user.isActive
                : undefined
          if (active !== undefined) {
            user.active = active
            user.isActive = active
          }
        }

        set({
          user,
          accessToken,
          refreshToken: refreshToken ?? null,
          isAuthenticated: true,
          expiresAt: typeof expiresAt === 'number' ? expiresAt : now + 15 * 60 * 1000,
          lastActivityAt: now,
        })

        get().startTimers()
      },

      logout: () => {
        const t = get()._timer
        if (t) window.clearTimeout(t)
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          expiresAt: null,
          lastActivityAt: null,
          _timer: null,
        })
      },

      setAccessToken: (token, expMs) => {
        if (!token) {
          get().stopTimers()
          set({ accessToken: null, isAuthenticated: false, expiresAt: null })
          return
        }
        const now = Date.now()
        set({
          accessToken: token,
          isAuthenticated: true,
          expiresAt: typeof expMs === 'number' ? expMs : now + 15 * 60 * 1000,
        })
        get().startTimers()
      },

      setUser: (user) => {
        if (user?.role) {
          const nr = normalizeRole(user.role)
          if (nr) user.role = nr
        }
        if (user) {
          const active =
            typeof user.active === 'boolean'
              ? user.active
              : typeof user.isActive === 'boolean'
                ? user.isActive
                : undefined
          if (active !== undefined) {
            user.active = active
            user.isActive = active
          }
        }
        set({ user, isAuthenticated: !!user })
      },

      startTimers: () => {
        const prev = get()._timer
        if (prev) window.clearTimeout(prev)

        const schedule = () => {
          const now = Date.now()
          const last = get().lastActivityAt ?? now
          const exp = get().expiresAt ?? now

          const leftIdle = IDLE_TIMEOUT_MS - (now - last)
          const leftExp = exp - now
          const next = Math.max(0, Math.min(leftIdle, leftExp))

          if (leftIdle <= 0 || leftExp <= 0) {
            get().logout()
            return
          }

          const tid = window.setTimeout(() => get().startTimers(), Math.max(1000, next))
          set({ _timer: tid as unknown as number })
        }

        schedule()
      },

      stopTimers: () => {
        const t = get()._timer
        if (t) window.clearTimeout(t)
        set({ _timer: null })
      },

      touchActivity: () => {
        set({ lastActivityAt: Date.now() })
        get().startTimers()
      },

      isAuthed: () => {
        const s = get()
        return !!s.isAuthenticated && !!s.accessToken && !!s.user
      },

      hasAnyRole: (roles) => {
        const r = get().user?.role
        return !!r && roles.includes(r)
      },

      role: () => get().user?.role ?? null,
    }),
    {
      name: 'bf-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
        expiresAt: s.expiresAt,
        lastActivityAt: s.lastActivityAt,
      }),
      version: 2,
      migrate: (persisted: any) => {
        if (persisted && typeof persisted === 'object') {
          if (persisted.expiresAt && persisted.expiresAt < Date.now()) {
            persisted.expiresAt = Date.now() + 15 * 60 * 1000
          }
        }
        return persisted
      },
    },
  ),
)
