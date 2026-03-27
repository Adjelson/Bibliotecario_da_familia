import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuth } from './auth' // a tua store

describe('store de autenticação', () => {
  beforeEach(() => {
    useAuth.setState({
      user:null, accessToken:null, refreshToken:null,
      isAuthenticated:false, expiresAt:null, lastActivityAt:null
    })
  })

  it('login activa sessão e agenda timeouts', () => {
    const spy = vi.spyOn(useAuth.getState(), 'startTimers' as any).mockImplementation(() => {})
    useAuth.getState().login({ user:{ id:1, role:'PAI' }, accessToken:'tok', refreshToken:'ref' } as any)
    expect(useAuth.getState().isAuthenticated).toBe(true)
    expect(useAuth.getState().accessToken).toBe('tok')
    expect(spy).toHaveBeenCalled()
  })

  it('logout limpa tokens e sessão', () => {
    useAuth.setState({ isAuthenticated:true, accessToken:'tok', user:{ id:1 } as any })
    useAuth.getState().logout()
    expect(useAuth.getState().isAuthenticated).toBe(false)
    expect(useAuth.getState().accessToken).toBeNull()
  })
})
