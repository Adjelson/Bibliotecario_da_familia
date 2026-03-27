// src/pages/user/DashboardFamilia.tsx
import { useEffect, useMemo, useState } from 'react'
import AOS from 'aos'
import 'aos/dist/aos.css'
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  CalendarDays,
  Star,
  MessagesSquare,
  Baby,
  BookMarked,
  ArrowRight,
  HelpCircle,
  AlertTriangle,
  WifiOff,
  Wifi,
} from 'lucide-react'
import { useAuth } from '../../store/auth'
import {
  NotificacoesAPI,
  RequisicoesAPI,
  ConsultasAPI,
  parseApiError,
} from '../../api/client'

type Stat = { label: string; value: string; srDetail?: string }

const features = [
  { icon: BookOpen, title: 'Explorar Livros', text: 'Recomendações personalizadas para toda a família', link: '/familia/requisitar', bg: 'from-blue-700 to-blue-800' },
  { icon: CalendarDays, title: 'Minhas Consultas', text: 'Agenda de mediação leitora com o bibliotecário', link: '/familia/consultas', bg: 'from-purple-700 to-purple-800' },
  { icon: MessagesSquare, title: 'Mensagens', text: 'Tira dúvidas e acompanha orientações', link: '/familia/mensagem', bg: 'from-indigo-700 to-indigo-800' },
  { icon: Star, title: 'Meus Pedidos', text: 'Solicitações e devoluções em andamento', link: '/familia/pedido', bg: 'from-violet-700 to-violet-800' },
  { icon: Baby, title: 'Atividades Infantis', text: 'Eventos e conteúdos para pequenos leitores', link: '/familia/atividades', bg: 'from-sky-700 to-sky-800' },
  { icon: BookMarked, title: 'Guia de Leitura', text: 'Planos por faixa etária e perfis', link: '/familia/guia', bg: 'from-fuchsia-700 to-fuchsia-800' },
] as const

export default function DashboardFamilia() {
  const me = useAuth((s) => s.user)
  const isAuthed = useAuth((s) => s.isAuthenticated)
  const nome = useMemo(() => (me?.name?.trim() ? me.name : 'Família'), [me?.name])

  // ===== AOS com respeito a prefers-reduced-motion
  useEffect(() => {
    document.title = 'Painel da Família | Bibliotecário de Família'
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'pt-PT'
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    AOS.init({
      duration: reduce ? 0 : 600,
      once: true,
      offset: 80,
      easing: 'ease-out-cubic',
      disable: reduce,
    })
  }, [])

  // ===== Estado online/offline (robustez)
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
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

  // ===== KPIs leves com fallback (evita 401 em sessão inválida)
  const [stats, setStats] = useState<Stat[]>([
    { label: 'Notificações', value: '—' },
    { label: 'Pedidos pendentes', value: '—' },
    { label: 'Consultas agendadas', value: '—' },
  ])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!isAuthed) return
      try {
        // Notificações
        let notifCount = '—'
        try {
          const data = await NotificacoesAPI.listar()
          if (Array.isArray(data)) notifCount = String(data.filter((n: any) => !n?.lida).length)
          else if (typeof (data as any)?.total === 'number') notifCount = String((data as any).total)
          else notifCount = '0'
        } catch {
          /* noop */
        }

        // Pedidos pendentes
        let pendentes = '—'
        try {
          const pend = await RequisicoesAPI.listar({ status: 'PENDENTE', page: 1, pageSize: 1 })
          if (typeof (pend as any)?.total === 'number') pendentes = String((pend as any).total)
        } catch {
          /* noop */
        }

        // Consultas marcadas
        let consultasMarcadas = '—'
        try {
          const cons = await ConsultasAPI.listar({ status: 'MARCADA', page: 1, pageSize: 1 })
          if (typeof (cons as any)?.total === 'number') consultasMarcadas = String((cons as any).total)
        } catch {
          /* noop */
        }

        if (alive) {
          setStats([
            { label: 'Notificações', value: notifCount },
            { label: 'Pedidos pendentes', value: pendentes },
            { label: 'Consultas agendadas', value: consultasMarcadas },
          ])
        }
      } catch (err) {
        console.warn('Falha a carregar KPIs:', parseApiError(err))
      }
    })()
    return () => {
      alive = false
    }
  }, [isAuthed])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900">
      {/* Skip link para navegação por teclado */}
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow focus:outline-none"
      >
        Ir para o conteúdo principal
      </a>

      {/* Cabeçalho */}
      <header className="bg-gradient-to-r from-blue-800 to-purple-800 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          {/* Barra de estado de conectividade */}
          <div
            className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/25"
            role="status"
            aria-live="polite"
          >
            {online ? (
              <Wifi aria-hidden="true" className="h-4 w-4" />
            ) : (
              <WifiOff aria-hidden="true" className="h-4 w-4" />
            )}
            <span className="font-medium">
              {online ? 'Ligação online' : 'Estás offline — funcionalidades limitadas'}
            </span>
            {!online && (
              <span className="ml-2 inline-flex items-center gap-1">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                Os dados mais recentes podem não estar disponíveis.
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight">
            Bem-vindos{nome ? `, ${nome}` : ''} à vossa Biblioteca Familiar
          </h1>
          <p className="mt-2 max-w-2xl text-white/90">
            Um espaço dedicado a tornar a leitura um hábito diário, divertido e partilhado.
          </p>

      
        </div>
      </header>

      {/* Conteúdo principal */}
      <main
        id="conteudo-principal"
        className="mx-auto px-4 sm:px-6 lg:px-8 py-10"
        role="main"
        tabIndex={-1}
      >
        <section aria-labelledby="atalhos-dashboard" className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <h2 id="atalhos-dashboard" className="sr-only">
            Acessos rápidos do painel
          </h2>

          {features.map((f, i) => (
            <div
              key={f.title}
              data-aos="fade-up"
              data-aos-delay={i * 80}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${f.bg} shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl`}
            >
              <Link
                to={f.link}
                aria-label={`${f.title} — ${f.text}`}
                title={f.title}
                className="block h-full focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-white/15 blur-2xl transition group-hover:scale-110"
                />
                <div className="relative z-10 flex h-full flex-col p-6">
                  <div className="mb-4 flex items-center">
                    <f.icon aria-hidden="true" className="mr-3 h-8 w-8 text-white" />
                    <h3 className="text-xl font-bold text-white">{f.title}</h3>
                  </div>
                  <p className="flex-grow text-white/95">{f.text}</p>
                  <div className="mt-5 inline-flex items-center gap-2 self-end text-sm font-semibold text-white">
                    Aceder <ArrowRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </section>

        {/* Secção informativa opcional
        <section
          aria-labelledby="sec-acessibilidade"
          className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 id="sec-acessibilidade" className="text-lg font-semibold text-gray-900">
            Acessibilidade e robustez
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            Objetivo: conformidade WCAG 2.1 — nível AA (texto alternativo, contraste, navegação por teclado,
            responsividade). Respeitamos a preferência "reduzir movimento" do sistema.
          </p>
        </section>
        */}
      </main>

      {/* Rodapé */}
      <footer className="mt-9 bg-gradient-to-r from-blue-900 to-purple-900 text-white">
            {/* KPIs acessíveis */}
          <dl className="mt-6 grid gap-3 sm:grid-cols-3 p-6" aria-label="Indicadores principais">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur transition focus-within:ring-2 focus-within:ring-yellow-300"
              >
                <dt className="text-sm text-white/90">{s.label}</dt>
                <dd className="mt-1 text-2xl font-bold" aria-label={`${s.label}: ${s.value}`}>
                  {s.value}
                  {s?.srDetail && <span className="sr-only"> — {s.srDetail}</span>}
                </dd>
              </div>
            ))}
          </dl>
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div>
              <h2 className="text-xl font-bold">Bibliotecário de Família</h2>
              <p className="text-blue-100">Aproximando famílias através da leitura</p>
            </div>
            <nav aria-label="Rodapé" className="flex gap-6 text-sm">
              <Link
                to="/sobre"
                className="hover:text-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                Sobre
              </Link>
              <Link
                to="/familia/ajuda"
                className="hover:text-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Ajuda"
                title="Ajuda"
              >
                <HelpCircle className="h-5 w-5" aria-hidden="true" />
              </Link>
            </nav>
          </div>
          <div className="mt-6 text-center text-blue-100 text-sm">
            © {new Date().getFullYear()} Bibliotecário de Família. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
