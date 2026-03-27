// src/components/SidebarBibliotecario.tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  FaHome, FaBookMedical, FaCalendarPlus, FaUsers,
  FaInbox, FaFileAlt, FaUser, FaSignOutAlt, FaBars, FaTimes, FaClipboardList
} from 'react-icons/fa'
import type { IconType } from 'react-icons'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'

import { logoutApi } from '../api/auth'
import { useAuth, type Role } from '../store/auth'
import imagem from '../assets/biblioteca.png'

type NavItem = {
  to: string
  label: string
  icon: IconType
  roles?: Role[]            // se definido, apenas estes papéis vêem o link
}

const NAV_ITEMS: NavItem[] = [
  { to: '/bibliotecario',            label: 'Início',        icon: FaHome },
  { to: '/bibliotecario/livros',     label: 'Livros',        icon: FaBookMedical },
  { to: '/bibliotecario/consultas',  label: 'Consultas',     icon: FaCalendarPlus },
  { to: '/bibliotecario/atividade',  label: 'Atividade',     icon: FaClipboardList },
  { to: '/bibliotecario/familias',   label: 'Famílias',      icon: FaUsers },
  { to: '/bibliotecario/pedidos',    label: 'Pedidos',       icon: FaInbox },
  { to: '/bibliotecario/mensagens',  label: 'Mensagens',     icon: FaInbox },

  // ======== RESERVADOS AO ADMIN ========
  { to: '/bibliotecario/utilizadores', label: 'Utilizadores', icon: FaFileAlt, roles: ['ADMIN'] },
  { to: '/bibliotecario/bibliotecas',  label: 'Bibliotecas',
    // usar lucide aqui mantendo o contrato de IconType
    icon: ((props: any) => <Building2 {...props} />) as unknown as IconType, roles: ['ADMIN'] },

  // ======== PERFIL (todos) ========
  { to: '/bibliotecario/perfil', label: 'Meu Perfil', icon: FaUser },
]

export default function SidebarBibliotecario() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const role = (user?.role ?? null) as Role | null

  const [open, setOpen] = useState(false) // controla o drawer no mobile
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)
  const drawerId = 'drawer-navegacao'

  // fecha no Esc + focus trap quando aberto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'Tab' && open && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // bloqueia scroll quando aberto no mobile + gerencia foco inicial/retorno
  useEffect(() => {
    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement | null
      document.body.style.overflow = 'hidden'
      // foca primeiro item do menu
      setTimeout(() => {
        const el = drawerRef.current?.querySelector<HTMLElement>('a, button')
        el?.focus()
      }, 0)
    } else {
      document.body.style.overflow = ''
      // restaura foco para o botão que abriu
      lastFocusRef.current?.focus?.()
    }
  }, [open])

  const handleLogout = async () => {
    try { await logoutApi() } catch { /* ignora erro da API */ }
    finally {
      useAuth.getState().logout()
      toast.success('Sessão terminada')
      navigate({ to: '/login' })
    }
  }

  const baseClasses =
    'flex items-center gap-3 p-3 rounded-md font-medium transition text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600'
  const filtered = NAV_ITEMS.filter(i => !i.roles || (role && i.roles.includes(role)))

  // Botão flutuante “hamburger” para mobile
  const MobileToggle = (
    <button
      type="button"
      aria-label={open ? 'Fechar menu' : 'Abrir menu'}
      aria-controls={drawerId}
      aria-expanded={open}
      onClick={(e) => {
        setOpen((v) => !v)
        lastFocusRef.current = e.currentTarget as unknown as HTMLElement
      }}
      className="fixed left-3 top-3 z-[60] inline-flex items-center justify-center rounded-lg bg-blue-600 p-2 text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-white/60 lg:hidden"
    >
      {open ? <FaTimes className="h-5 w-5" aria-hidden="true" /> : <FaBars className="h-5 w-5" aria-hidden="true" />}
    </button>
  )

  // Bloco interno (nav + header) — usado tanto no drawer mobile quanto no desktop
  const NavContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-2">
        <img src={imagem} alt="Logótipo Bibliotecário de Família" className="h-12 w-auto" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-blue-900">
            {user?.name ?? 'Utilizador'}
          </div>
          <div className="text-xs text-blue-700/80">
            {role === 'ADMIN' ? 'Administrador' : role === 'BIBLIOTECARIO' ? 'Bibliotecário' : 'Utilizador'}
          </div>
        </div>
      </div>

      <nav className="mt-4 space-y-1" aria-label="Navegação principal">
        {/* título apenas para leitores de ecrã */}
        <h2 id="nav-title" className="sr-only">Menu principal</h2>
        {filtered.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            preload="intent"
            activeOptions={{ exact: to === '/bibliotecario' }}
            activeProps={{ className: `${baseClasses} bg-blue-600 text-white`, 'aria-current': 'page' as const }}
            inactiveProps={{ className: `${baseClasses} text-blue-800 hover:bg-blue-100` }}
            onClick={() => setOpen(false)} // fecha o drawer ao navegar no mobile
            title={label}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-blue-200 pt-4">
        <button
          type="button"
          onClick={handleLogout}
          className={`${baseClasses} w-full text-blue-800 hover:bg-blue-100`}
          aria-label="Sair da conta"
        >
          <FaSignOutAlt className="h-5 w-5" aria-hidden="true" />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Botão mobile */}
      {MobileToggle}

      {/* Drawer mobile */}
      <div className="lg:hidden">
        {/* overlay */}
        {open && (
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            aria-hidden="true"
          />
        )}

        <aside
          id={drawerId}
          ref={drawerRef}
          // Para leitores de ecrã, trate como diálogo modal contendo navegação
          role="dialog"
          aria-modal="true"
          aria-labelledby="nav-title"
          className={[
            'fixed z-50 inset-y-0 left-0 w-72 max-w-[85%] bg-gradient-to-b from-blue-200 to-blue-50',
            'shadow-2xl px-4 py-6',
            'transform transition-transform duration-200 ease-out',
            open ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          {/* Botão fechar dentro do drawer (alvo de foco inicial alternativo) */}
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-md bg-white/70 px-2.5 py-1.5 text-sm text-blue-900 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Fechar menu"
            >
              <FaTimes className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {NavContent}
        </aside>
      </div>

      {/* Sidebar desktop (sempre visível) */}
      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 bg-gradient-to-b from-blue-200 to-blue-50 px-4 py-8 shadow-lg lg:block"
        aria-label="Navegação lateral"
      >
        {NavContent}
      </aside>
    </>
  )
}
