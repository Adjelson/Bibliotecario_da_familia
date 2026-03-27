// src/routes/index.tsx
import { lazy, Suspense, useEffect, useRef } from 'react'
import {
  RouterProvider,
  RootRoute,
  Route,
  createRouter,
  redirect,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { useAuth } from '../store/auth'

// ================= Loading / feedback =================
function AppSpinner() {
  return (
    <div className="p-10 grid place-items-center" role="status" aria-live="polite">
      <div className="animate-pulse text-sm text-neutral-700">A carregar…</div>
    </div>
  )
}

/** Barra fina de progresso no topo quando o router está em transição */
function TopProgress() {
  const status = useRouterState({ select: (s) => s.status })
  // simples CSS: a barra aparece e faz anim grow
  return (
    <div
      aria-hidden
      className={`fixed left-0 top-0 z-[1000] h-[3px] w-full transition-opacity ${
        status === 'pending' ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-full w-0 animate-[progress_1.2s_ease-in-out_infinite] bg-gradient-to-r from-blue-600 via-purple-600 to-fuchsia-600" />
      <style>{`
        @keyframes progress {
          0% { width: 0%; transform: translateX(0); }
          50% { width: 60%; transform: translateX(40%); }
          100% { width: 100%; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

/** Faz scroll pro topo a cada navegação concluída */
function ScrollToTopOnRouteChange() {
  const location = useRouterState({ select: (s) => s.location })
  const prevRef = useRef<string | null>(null)
  useEffect(() => {
    const curr = location.href
    if (prevRef.current && prevRef.current !== curr) {
      // respeita prefers-reduced-motion (sem scroll suave)
      const prefersReduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top: 0, left: 0, behavior: prefersReduce ? 'auto' : 'smooth' })
    }
    prevRef.current = curr
  }, [location])
  return null
}

/** Casca raiz: barra de progresso + outlet */
function AppShell() {
  return (
    <>
      <TopProgress />
      <ScrollToTopOnRouteChange />
      <Outlet />
    </>
  )
}

// ================= Páginas públicas (não lazy) =================
import Home from '../pages/Home'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import Sobre from '../pages/Sobre'

// ================= Família (lazy) =================
const LayoutFamilia = lazy(() => import('./familia'))
const DashboardFamilia = lazy(() => import('../pages/user/DashboardFamilia'))
const Consultas = lazy(() => import('../pages/user/Consultas'))
const Livros = lazy(() => import('../pages/user/MeusLivros'))
const Perfil = lazy(() => import('../pages/user/Perfil'))
const Requisitar = lazy(() => import('../pages/user/Requisitar'))
const Atividades = lazy(() => import('../pages/user/Atividades'))
const MensagenUser = lazy(() => import('../pages/user/mensagemUser'))
const Guia = lazy(() => import('../pages/user/Guia'))
const Pedido = lazy(() => import('../pages/user/Pedido'))
const Ajuda = lazy(() => import('../pages/user/Ajuda'))

// ================= Bibliotecário (lazy) =================
const LayoutBibliotecario = lazy(() => import('./bibliotecario'))
const DashboardBibliotecario = lazy(() => import('../pages/admin/DashboardBibliotecario'))
const PerfilBibliotecario = lazy(() => import('../pages/admin/PerfilBibliotecario'))
const GestaoLivros = lazy(() => import('../pages/admin/GestaoLivros'))
const Atividade = lazy(() => import('../pages/admin/Atividade'))
const ConsultasGestao = lazy(() => import('../pages/admin/GestaoConsultas'))
const Bibliotecas = lazy(() => import('../pages/admin/GestaoBibliotecas'))
const Familias = lazy(() => import('../pages/admin/Familias'))
const Mensagens = lazy(() => import('../pages/admin/Mensagens'))
const Pedidos = lazy(() => import('../pages/admin/Pedidos'))
const Utilizadores = lazy(() => import('../pages/admin/Utilizadores'))

// ================= Páginas utilitárias (estilizadas) =================
function PageContainer({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <div className="min-h-[60vh] bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-purple-700">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-gray-700">{subtitle}</p>}
        </header>
        <div className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow backdrop-blur-xl">
          {children}
        </div>
      </div>
    </div>
  )
}

function RouteError({ error }: { error: any }) {
  // Mostra stack/erro num cartão simples
  return (
    <PageContainer title="Ocorreu um erro" subtitle="Tenta voltar à página inicial ou recarregar.">
      <div className="text-sm text-gray-800">
        <pre className="whitespace-pre-wrap rounded border border-rose-200 bg-rose-50 p-3 text-rose-900">
          {String(error?.message || error)}
        </pre>
      </div>
    </PageContainer>
  )
}

function NotFoundPage() {
  return (
    <PageContainer title="Página não encontrada" subtitle="O recurso que tentaste aceder não existe.">
      <ul className="list-disc pl-6 text-gray-800 space-y-1 text-sm">
        <li>Confere se o endereço está correto.</li>
        <li>Volta ao painel ou à página inicial.</li>
      </ul>
      <div className="mt-6 flex gap-3">
        <a href="/" className="rounded-lg bg-blue-700 px-4 py-2 text-white font-semibold hover:bg-blue-800">Início</a>
        <a href="/familia" className="rounded-lg border px-4 py-2 text-blue-700 border-blue-200 hover:bg-blue-50">Painel da Família</a>
      </div>
    </PageContainer>
  )
}

function ForbiddenPage() {
  return (
    <PageContainer title="Acesso negado" subtitle="Não tens permissões para ver esta página.">
      <p className="text-sm text-gray-800">Se achas que isto é um engano, termina a sessão e volta a entrar com o perfil correto.</p>
      <div className="mt-6 flex gap-3">
        <a href="/login" className="rounded-lg bg-purple-700 px-4 py-2 text-white font-semibold hover:bg-purple-800">Iniciar sessão</a>
        <a href="/" className="rounded-lg border px-4 py-2 text-purple-700 border-purple-200 hover:bg-purple-50">Voltar</a>
      </div>
    </PageContainer>
  )
}

function TermsPage() {
  return (
    <PageContainer title="Termos de Serviço">
      <div className="prose prose-sm max-w-none">
        <p>Estes Termos regem o uso da plataforma Bibliotecário de Família. Ao utilizar o serviço, concordas com estes Termos.</p>
        <h3>1. Conta</h3>
        <p>És responsável por manter a confidencialidade das tuas credenciais.</p>
        <h3>2. Uso adequado</h3>
        <p>Não uses o serviço de forma abusiva, ilegal ou que prejudique terceiros.</p>
        <h3>3. Limitação de responsabilidade</h3>
        <p>O serviço é fornecido “tal como está”, sem garantias implícitas.</p>
        <p className="text-xs text-gray-600 mt-4">Última atualização: {new Date().toLocaleDateString('pt-PT')}</p>
      </div>
    </PageContainer>
  )
}

function PrivacyPage() {
  return (
    <PageContainer title="Política de Privacidade">
      <div className="prose prose-sm max-w-none">
        <p>Explicamos como recolhemos e tratamos os teus dados para personalizar recomendações e gerir agendamentos.</p>
        <h3>Dados recolhidos</h3>
        <ul>
          <li>Dados de conta (nome, email).</li>
          <li>Preferências e histórico de requisições.</li>
          <li>Dados de consulta (agenda, notas).</li>
        </ul>
        <h3>Direitos</h3>
        <p>Podes aceder, corrigir ou apagar os teus dados. Contacta-nos através da área de ajuda.</p>
        <p className="text-xs text-gray-600 mt-4">Última atualização: {new Date().toLocaleDateString('pt-PT')}</p>
      </div>
    </PageContainer>
  )
}

function RecoverPage() {
  return (
    <PageContainer title="Recuperar palavra-passe" subtitle="Introduz o teu email para receber instruções.">
      <form className="max-w-md space-y-3" onSubmit={(e) => e.preventDefault()}>
        <label className="block text-sm font-medium text-gray-900" htmlFor="email">Email</label>
        <input id="email" type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="nome@exemplo.com" />
        <button className="rounded-lg bg-blue-700 px-4 py-2 text-white font-semibold hover:bg-blue-800">Enviar</button>
      </form>
    </PageContainer>
  )
}

// ================= Root =================
const rootRoute = new RootRoute({
  component: AppShell,
  errorComponent: RouteError,
})

// ================= Públicas
const homeRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
  errorComponent: RouteError,
})

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  errorComponent: RouteError,
  beforeLoad: () => {
    const { accessToken } = useAuth.getState()
    if (accessToken) throw redirect({ to: '/' })
  },
})

const registerRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
  errorComponent: RouteError,
  beforeLoad: () => {
    const { accessToken } = useAuth.getState()
    if (accessToken) throw redirect({ to: '/' })
  },
})

const sobreRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/sobre',
  component: Sobre,
  errorComponent: RouteError,
})

const termsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/termos',
  component: TermsPage,
})
const privacyRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/privacidade',
  component: PrivacyPage,
})
const recoverRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/recuperar',
  component: RecoverPage,
})

const forbiddenRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/403',
  component: ForbiddenPage,
})

// ================= Família (privado)
const familiaGroup = new Route({
  getParentRoute: () => rootRoute,
  path: '/familia',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <LayoutFamilia />
    </Suspense>
  ),
  errorComponent: RouteError,
  beforeLoad: () => {
    const { accessToken, user } = useAuth.getState()
    if (!accessToken) throw redirect({ to: '/login' })
    const roleU = String(user?.role ?? '').toUpperCase()
    const allowed = roleU === 'PAI' || roleU === 'ADMIN'
    if (!allowed) throw redirect({ to: '/403' })
  },
})

const familiaIndexRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: '/',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <DashboardFamilia />
    </Suspense>
  ),
})

const familiaConsultasRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'consultas',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Consultas />
    </Suspense>
  ),
})
const familiaGuiaRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'guia',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Guia />
    </Suspense>
  ),
})
const mensagenUser = new Route({
  getParentRoute: () => familiaGroup,
  path: 'mensagem',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <MensagenUser />
    </Suspense>
  ),
})
const familiaLivrosRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'MeusLivros',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Livros />
    </Suspense>
  ),
})
const familiaAtividadesRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'atividades',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Atividades />
    </Suspense>
  ),
})
const familiaRequisitarRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'requisitar',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Requisitar />
    </Suspense>
  ),
})
const familiaPedidoRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'pedido',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Pedido />
    </Suspense>
  ),
})
const familiaAjudaRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'ajuda',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Ajuda />
    </Suspense>
  ),
})
const familiaPerfilRoute = new Route({
  getParentRoute: () => familiaGroup,
  path: 'perfil',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Perfil />
    </Suspense>
  ),
})

// ================= Bibliotecário (privado)
const biblioGroup = new Route({
  getParentRoute: () => rootRoute,
  path: '/bibliotecario',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <LayoutBibliotecario />
    </Suspense> 
  ),
  errorComponent: RouteError,
  beforeLoad: () => {
    const { accessToken, user } = useAuth.getState()
    if (!accessToken) throw redirect({ to: '/login' })
    const roleU = String(user?.role ?? '').toUpperCase()
    const allowed = roleU === 'ADMIN' || roleU === 'BIBLIOTECARIO'
    if (!allowed) throw redirect({ to: '/403' })
  },
})

const biblioIndexRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: '/',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <DashboardBibliotecario />
    </Suspense>
  ),
})
const biblioLivrosRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'livros',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <GestaoLivros />
    </Suspense>
  ),
})
const bibliotecas = new Route({
  getParentRoute: () => biblioGroup,
  path: 'bibliotecas',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Bibliotecas />
    </Suspense>
  ),
})
const biblioConsultasRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'consultas',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <ConsultasGestao />
    </Suspense>
  ),
})
const biblioFamiliasRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'familias',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Familias />
    </Suspense>
  ),
})
const biblioAtividadeRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'atividade',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Atividade />
    </Suspense>
  ),
})
const biblioMensagensRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'mensagens',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Mensagens />
    </Suspense>
  ),
})
const pedidoBibliotecario = new Route({
  getParentRoute: () => biblioGroup,
  path: 'pedidos',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Pedidos />
    </Suspense>
  ),
})
const biblioUtilizadoresRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'utilizadores',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <Utilizadores />
    </Suspense>
  ),
})
const biblioPerfilRoute = new Route({
  getParentRoute: () => biblioGroup,
  path: 'perfil',
  component: () => (
    <Suspense fallback={<AppSpinner />}>
      <PerfilBibliotecario />
    </Suspense>
  ),
})

// ================= 404
const notFoundRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '*',
  component: NotFoundPage,
})

// ================= Árvore
const routeTree = rootRoute.addChildren([
  homeRoute,
  loginRoute,
  registerRoute,
  sobreRoute,
  termsRoute,
  privacyRoute,
  recoverRoute,
  forbiddenRoute,

  familiaGroup.addChildren([
    familiaIndexRoute,
    familiaConsultasRoute,
    familiaGuiaRoute,
    familiaLivrosRoute,
    familiaAtividadesRoute,
    familiaRequisitarRoute,
    mensagenUser,
    familiaPedidoRoute,
    familiaAjudaRoute,
    familiaPerfilRoute,
  ]),

  biblioGroup.addChildren([
    biblioIndexRoute,
    biblioLivrosRoute,
    bibliotecas,
    biblioConsultasRoute,
    biblioFamiliasRoute,
    biblioAtividadeRoute,
    biblioMensagensRoute,
    pedidoBibliotecario,
    biblioUtilizadoresRoute,
    biblioPerfilRoute,
  ]),

  notFoundRoute,
])

export const router = createRouter({
  routeTree,
  // mostra spinner se um route loader ficar pendente (se usares loaders futuramente)
  defaultPendingComponent: AppSpinner,
  defaultNotFoundComponent: NotFoundPage,
  defaultPreload: 'intent', // pré-carrega na intenção (hover/focus) para navegação mais rápida
})

export function AppRoutes() {
  return (
    <Suspense fallback={<AppSpinner />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
