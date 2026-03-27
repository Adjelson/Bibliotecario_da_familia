import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Menu, Transition } from '@headlessui/react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  UserCircle2,
  LogOut,
  HelpCircle,
  Home,
  BookOpen,
  Wifi,
  WifiOff,
} from 'lucide-react'
import ModalNotificacoes from './ModalNotificacoes'
import logo from '../assets/biblioteca2.png'
import { logoutApi } from '../api/auth'
import { useAuth } from '../store/auth'
import { AuthAPI, NotificacoesAPI, type NotificacaoDTO } from '../api/client'

export default function HeaderFamilia() {
  const navigate = useNavigate()

  // controla o modal
  const [modalOpen, setModalOpen] = useState(false)

  // notificações só para badge (não para render completo do modal)
  const [notificacoes, setNotificacoes] = useState<NotificacaoDTO[]>([])

  // estado de rede
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  // auth store
  const user = useAuth((s) => s.user)
  const accessToken = useAuth((s) => s.accessToken)

  // escuta alterações de rede
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // anuncia visualmente mudanças de rede
  useEffect(() => {
    if (online) {
      toast.success('Ligação restabelecida')
    } else {
      toast.warning('Estás offline. Algumas ações podem ficar indisponíveis.')
    }
  }, [online])

  // se temos token mas ainda não temos user no store, tenta carregar /auth/me
  useEffect(() => {
    let alive = true
    if (!user && accessToken) {
      ;(async () => {
        try {
          const data = await AuthAPI.me()
          const u = (data as any)?.user ?? data
          if (alive && u) {
            useAuth.getState().setUser(u)
          }
        } catch {
          // silenciar: se falhar, deixa como está
        }
      })()
    }
    return () => {
      alive = false
    }
  }, [user, accessToken])

  // carregar notificações iniciais só para a contagem (badge do sino)
  // não metemos SSE aqui porque isso é trabalho do modal aberto.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { items } = await NotificacoesAPI.listar({ limit: 50 })
        if (!alive) return
        setNotificacoes(items ?? [])
      } catch {
        // silencioso, badge só fica 0
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // nome de exibição
  const displayName = useMemo(() => {
    const nm = user?.name?.trim()
    if (nm) return nm.split(/\s+/)[0] // primeiro nome
    const em = user?.email?.trim()
    if (em && em.includes('@')) return em.split('@')[0]
    return 'Utilizador'
  }, [user])

  // número de notificações por ler
  const pendentes = useMemo(
    () => notificacoes.filter((n) => !(n.readAt || (n as { lida?: boolean }).lida)).length,
    [notificacoes],
  )

  // logout
  const handleLogout = async () => {
    try {
      await logoutApi()
    } catch {
      // mesmo que o backend falhe, vamos limpar sessão local
    }
    useAuth.getState().logout()
    toast.success('Sessão terminada')
    navigate({ to: '/login' })
  }

  return (
    <header
      className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg"
      role="banner"
    >
      {/* Região aria-live para leitores de ecrã anunciarem estado da ligação */}
      <div className="sr-only" role="status" aria-live="polite">
        {online
          ? 'Ligação online.'
          : 'Ligação offline. Algumas funções podem não estar disponíveis.'}
      </div>

      {/* skip link: salta para o conteúdo principal da página */}
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 rounded bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow"
      >
        Ir para o conteúdo
      </a>

      <div className="mx-auto flex items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link
          to="/familia"
          className="group flex items-center gap-2"
          aria-label="Página inicial"
          title="Bibliotecário de Família — início"
        >
          <img
            src={logo}
            alt="Logótipo Bibliotecário de Família"
            className="h-10 w-auto transition-transform group-hover:rotate-3"
          />
          <h3 className="hidden text-lg font-extrabold text-white sm:block">
            <span className="bg-gradient-to-r from-yellow-300 to-yellow-100 bg-clip-text text-transparent">
              Bibliotecário de Família
            </span>
          </h3>
        </Link>

        {/* Ações à direita */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Indicador de rede */}
          <span
            tabIndex={0}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 
            text-xs font-semibold ring-1 outline-none focus:ring-2 focus:ring-white/60 ${
              online
                ? 'bg-emerald-500 text-white ring-white'
                : 'bg-amber-50 text-amber-900 ring-amber-200'
            }`}
            title={online ? 'Ligação online' : 'Offline'}
          >
            {online ? (
              <Wifi aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            <span className="select-none">{online ? 'Online' : 'Offline'}</span>
          </span>

          {/* Notificações */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="relative rounded-full p-2 text-white/90 outline-none transition hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-white/50"
            aria-label={
              pendentes > 0
                ? `Abrir notificações (${pendentes} novas)`
                : 'Abrir notificações'
            }
            aria-haspopup="dialog"
            aria-expanded={modalOpen}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {pendentes > 0 && (
              <span
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow"
                aria-label={`${pendentes} notificações por ler`}
              >
                {pendentes}
              </span>
            )}
          </button>

          {/* Ações Desktop */}
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              to="/familia/perfil"
              className="group inline-flex items-center gap-2 rounded-full bg-blue-700 px-3 py-2
               text-sm font-medium text-white outline-none transition hover:bg-blue-500 focus:ring-2 focus:ring-white/60"
            >
              <UserCircle2
                className="h-4 w-4 transition group-hover:scale-110"
                aria-hidden="true"
              />
              <span>{displayName}</span>
            </Link>

            <Link
              to="/familia/MeusLivros"
              className="group inline-flex items-center gap-2 rounded-full bg-purple-700 px-3 py-2 
              text-sm font-medium text-white outline-none transition hover:bg-purple-500 focus:ring-2 focus:ring-white/60"
            >
              <BookOpen
                className="h-4 w-4 transition group-hover:scale-110"
                aria-hidden="true"
              />
              <span>Meus Livros</span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="group inline-flex items-center gap-2 rounded-full px-3 py-2
               text-sm font-medium text-white outline-none transition hover:bg-red-500 focus:ring-2 focus:ring-white/60"
              aria-label="Sair"
            >
              <LogOut
                className="h-4 w-4 transition group-hover:scale-110"
                aria-hidden="true"
              />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>

          {/* Menu Mobile */}
          <Menu as="div" className="relative sm:hidden">
            <Menu.Button
              aria-label="Abrir menu"
              className="rounded-full bg-blue-700 p-2 text-white outline-none 
              transition hover:bg-blue-500 focus:ring-2 focus:ring-white/60"
            >
              <UserCircle2 className="h-5 w-5" aria-hidden="true" />
            </Menu.Button>
            <Transition
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 -translate-y-1"
              enterTo="transform opacity-100 translate-y-0"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 translate-y-0"
              leaveTo="transform opacity-0 -translate-y-1"
            >
              <Menu.Items
                className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md bg-white py-1
               text-sm shadow-lg ring-1 ring-black/5 focus:outline-none"
              >
                <div className="px-4 py-2 text-xs font-medium text-gray-500">
                  Olá, <span className="text-gray-800">{displayName}</span>
                </div>
                <div className="my-1 border-t" />

                <Menu.Item>
                  {({ active }) => (
                    <Link
                      to="/familia"
                      className={`flex items-center gap-2 px-4 py-2 ${
                        active ? 'bg-blue-50' : ''
                      }`}
                    >
                      <Home
                        className="h-4 w-4 text-blue-600"
                        aria-hidden="true"
                      />{' '}
                      Início
                    </Link>
                  )}
                </Menu.Item>

                <Menu.Item>
                  {({ active }) => (
                    <Link
                      to="/familia/perfil"
                      className={`flex items-center gap-2 px-4 py-2 ${
                        active ? 'bg-blue-50' : ''
                      }`}
                    >
                      <UserCircle2
                        className="h-4 w-4 text-blue-600"
                        aria-hidden="true"
                      />{' '}
                      Meu Perfil
                    </Link>
                  )}
                </Menu.Item>

                <Menu.Item>
                  {({ active }) => (
                    <Link
                      to="/familia/ajuda"
                      className={`flex items-center gap-2 px-4 py-2 ${
                        active ? 'bg-blue-50' : ''
                      }`}
                    >
                      <HelpCircle
                        className="h-4 w-4 text-blue-600"
                        aria-hidden="true"
                      />{' '}
                      Ajuda
                    </Link>
                  )}
                </Menu.Item>

                <Menu.Item>
                  {({ active }) => (
                    <Link
                      to="/familia/MeusLivros"
                      className={`flex items-center gap-2 px-4 py-2 ${
                        active ? 'bg-blue-50' : ''
                      }`}
                    >
                      <BookOpen
                        className="h-4 w-4 text-blue-600"
                        aria-hidden="true"
                      />{' '}
                      Meus Livros
                    </Link>
                  )}
                </Menu.Item>

                <Menu.Item>
                  {({ active }) => (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-red-600 ${
                        active ? 'bg-red-50' : ''
                      }`}
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>

      {/* Modal de notificações */}
      <ModalNotificacoes
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </header>
  )
}
