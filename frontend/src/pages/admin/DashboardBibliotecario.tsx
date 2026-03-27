// client/src/pages/admin/dashboard.tsx
import { useEffect, useMemo, useState } from 'react'
import AOS from 'aos'
import 'aos/dist/aos.css'
import {
  ResponsiveContainer, CartesianGrid, Tooltip, Legend, XAxis, YAxis,
  LineChart as RLineChart, Line, BarChart as RBarChart, Bar, PieChart, Pie, Cell
} from 'recharts'
import {
  Users, BookOpen, CalendarCheck2, Trophy, Filter, Download,
  ShieldAlert, TrendingUp, ListOrdered, ShoppingCart, Coins
} from 'lucide-react'
import { toast } from 'sonner'
import { StatsAPI, downloadBlob } from '../../api/client'
import { useAuth } from '../../store/auth'

type Periodo = 'dia' | 'mes' | 'ano'
type LineDatum = { label: string; count: number }
type FamilyStat = { family: string; count: number }
type TopBook = { name: string; value: number }
type PieLabelProps = { name?: string; percent?: number }

type KpisPlus = {
  gerais: {
    familias: number
    livrosRequisitados: number
    consultasMarcadas: number
    eventosFuturos: number
  }
  operacional: {
    pendentes: number
    aprovadasAtivas: number
    atrasadas: number
    eventosHoje: number
    ocupacaoMedia: number // 0..1
  }
  vendas: {
    comprasPagas: number
    receitaTotal: number
    topVendidos: Array<{ titulo: string; total: number }>
  }
  bibliotecario: null | {
    minhasConsultasHoje: number
    minhasConsultasMarcadas: number
    mensagensNaoLidas: number
    notificacoesNaoLidas?: number
  }
}

type InventarioAlertas = {
  zeroStock: number
  lowStock: number
  emprestimoSemPrazo: number
}

const COLORS = ['#6D28D9','#0EA5E9','#22C55E','#F59E0B','#EF4444','#7C3AED','#06B6D4']
const money = (v: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v ?? 0)
const formatPct = (n?: number | null) => (n==null || Number.isNaN(n)) ? '—' : `${Math.round(n*100)}%`

function StatCard({
  label, value, icon: Icon, gradient, hint,
}: { label: string; value: number|string; icon: any; gradient: string; hint?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-md`} data-aos="zoom-in">
      <div className="flex items-center justify-between">
        <div className="text-3xl font-extrabold tracking-tight">{value}</div>
        <div className="rounded-xl bg-white/15 p-2 ring-1 ring-white/20"><Icon className="h-6 w-6" /></div>
      </div>
      <div className="mt-1 text-sm/6 text-white/90">{label}</div>
      {hint ? <div className="mt-1 text-xs text-white/70">{hint}</div> : null}
      <span className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-white/10" />
    </div>
  )
}

function Card({
  title, children, actions, icon: Icon,
}: { title: string; children: React.ReactNode; actions?: React.ReactNode; icon?: any }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" data-aos="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon ? <span className="rounded-md bg-gray-50 p-2 text-gray-600 ring-1 ring-gray-200"><Icon className="h-4 w-4" /></span> : null}
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </section>
  )
}

export default function Dashboard() {
  useEffect(() => {
    document.title = 'Dashboard | Sistema'
    AOS.init({ duration: 700, once: true, offset: 80, easing: 'ease-out-cubic' })
  }, [])

  const role = useAuth((s) => s.user?.role)

  const [loading,setLoading] = useState(true)
  const [error,setError] = useState<string|null>(null)

  const [periodo,setPeriodo] = useState<Periodo>('mes')
  const [familiaId] = useState<number|undefined>(undefined) // filtrar série por família (se implementares no backend)

  // blocos de dados
  const [kpis,setKpis] = useState<{ familias: number; livrosRequisitados: number; consultas: number; atividades: number }|null>(null)
  const [kpisPlus,setKpisPlus] = useState<KpisPlus|null>(null)
  const [inventario,setInventario] = useState<InventarioAlertas|null>(null)

  const [serie,setSerie] = useState<LineDatum[]>([])
  const [familias,setFamilias] = useState<FamilyStat[]>([])
  const [topLivros,setTopLivros] = useState<TopBook[]>([])
  const [reqStatusMap,setReqStatusMap] = useState<Record<string,number>>({})
  const [consultasResumo,setConsultasResumo] =
    useState<{ porStatus: Array<{ status: string; total: number }>; topBibliotecarios: Array<{ id: number; nome: string|null; total: number }> }|null>(null)

  // ADMIN extras
  const [adminKpis,setAdminKpis] = useState<any>(null)
  const [adminSeg,setAdminSeg] = useState<any>(null)
  const [adminRecentActs,setAdminRecentActs] =
    useState<Array<{ id: number; action: string; createdAt: string; userId: number|null; nome: string|null }>>([])
  const [adminRecentUsers,setAdminRecentUsers] =
    useState<Array<{ id: number; name: string|null; email: string|null; role: string; isActive: boolean; createdAt: string }>>([])

  useEffect(() => {
    let mounted = true
    const ctrl = new AbortController()

    ;(async () => {
      setLoading(true); setError(null)
      try {
        const base = [
          StatsAPI.kpis({ signal: ctrl.signal }),
          StatsAPI.kpisPlus({ signal: ctrl.signal }),
          StatsAPI.inventarioAlertas({ signal: ctrl.signal }),
          StatsAPI.requisicoesPorPeriodo({ periodo, familiaId, signal: ctrl.signal }),
          StatsAPI.requisicoesPorFamilia({ signal: ctrl.signal }),
          StatsAPI.topLivros({ limit: 5, signal: ctrl.signal }),
          StatsAPI.reqStatus({ signal: ctrl.signal }),
          StatsAPI.consultasResumo({ signal: ctrl.signal }),
        ] as const

        const [kpisRes, kpisPlusRes, invRes, serieRes, famRes, topRes, reqMapRes, consultasRes] = await Promise.all(base)
        if (!mounted) return

        setKpis(kpisRes ?? null)
        setKpisPlus(kpisPlusRes as unknown as KpisPlus)
        setInventario(invRes as InventarioAlertas)
        setSerie((serieRes as LineDatum[]) ?? [])
        setFamilias(((famRes as any)?.items ?? []) as FamilyStat[])
        setTopLivros((topRes as TopBook[]) ?? [])
        setReqStatusMap((reqMapRes as Record<string,number>) ?? {})
        setConsultasResumo(consultasRes ?? null)

        if (role === 'ADMIN') {
          const [ak, asg, acts, users] = await Promise.all([
            StatsAPI.adminKpis({ signal: ctrl.signal }),
            StatsAPI.adminSeguranca({ signal: ctrl.signal }),
            StatsAPI.adminAtividadesRecentes({ signal: ctrl.signal }),
            StatsAPI.adminUsuariosRecentes({ signal: ctrl.signal }),
          ])
          if (!mounted) return
          setAdminKpis(ak ?? null)
          setAdminSeg(asg ?? null)
          setAdminRecentActs((acts as any[])?.map(a => ({ ...a, createdAt: String(a.createdAt) })) ?? [])
          setAdminRecentUsers((users as any[]) ?? [])
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        const msg = e?.response?.data?.message ?? e.message ?? 'Falha ao carregar dashboard'
        if (mounted) { setError(msg); toast.error(msg) }
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false; ctrl.abort() }
  }, [periodo, familiaId, role])

  // derivados
  const donutReqStatus = useMemo(
    () => Object.entries(reqStatusMap).map(([name,value]) => ({ name, value })),
    [reqStatusMap],
  )
  const pieTopVendidos = useMemo(
    () => (kpisPlus?.vendas?.topVendidos ?? []).map(it => ({ name: it.titulo, value: it.total })),
    [kpisPlus],
  )

  // exports
  const onExportRequisicoes = async () => {
    try {
      await downloadBlob('/stats/requisicoes/export/csv', `requisicoes_${periodo}.csv`, { periodo, ...(familiaId ? { familiaId } : {}) })
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao exportar CSV')
    }
  }
  const onExportFamilia = async () => {
    try { await downloadBlob('/stats/familia/export/csv', 'requisicoes_por_familia.csv') }
    catch (e: any) { toast.error(e?.message ?? 'Falha ao exportar CSV') }
  }
  const onExportTopLivros = async () => {
    try { await downloadBlob('/stats/top-livros/export/csv', 'top_livros.csv') }
    catch (e: any) { toast.error(e?.message ?? 'Falha ao exportar CSV') }
  }

  if (loading) {
    return (
      <div className="min-h-screen px-3 py-6 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_,i)=>(<div key={i} className="h-24 rounded-2xl bg-gray-100" />))}
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="h-80 rounded-2xl bg-gray-100" />
            <div className="h-80 rounded-2xl bg-gray-100" />
            <div className="h-[340px] rounded-2xl bg-gray-100 lg:col-span-2" />
          </div>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen px-3 py-6 sm:px-6 lg:px-8">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      </div>
    )
  }

  const hasSerie = (serie?.length ?? 0) > 0
  const hasFamilias = (familias?.length ?? 0) > 0
  const hasDonut = (donutReqStatus?.length ?? 0) > 0
  const hasTopLivros = (topLivros?.length ?? 0) > 0
  const hasTopVendidos = (pieTopVendidos?.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee] px-3 py-6 sm:px-6 lg:px-8">
      <header className="mb-6" data-aos="fade-up">
        <div className="flex flex-col gap-1">
          <h1 className="bg-gradient-to-r from-blue-700 to-purple-700 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent md:text-3xl">
            Dashboard
          </h1>
          <p className="text-sm text-gray-600">Visão geral e métricas do sistema.</p>
        </div>
      </header>

      {/* KPIs básicos */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Famílias registadas" value={kpis?.familias ?? 0} icon={Users} gradient="from-indigo-600 to-indigo-700" />
        <StatCard label="Livros requisitados" value={kpis?.livrosRequisitados ?? 0} icon={BookOpen} gradient="from-emerald-600 to-emerald-700" />
        <StatCard label="Consultas agendadas" value={kpis?.consultas ?? 0} icon={CalendarCheck2} gradient="from-blue-600 to-blue-700" />
        <StatCard label="Atividades culturais" value={kpis?.atividades ?? 0} icon={Trophy} gradient="from-purple-600 to-purple-700" />
      </section>

      {/* KPIs Plus */}
      {kpisPlus && (
        <>
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Pedidos pendentes" value={kpisPlus.operacional.pendentes} icon={BookOpen} gradient="from-sky-600 to-sky-700" />
            <StatCard label="Empréstimos ativos" value={kpisPlus.operacional.aprovadasAtivas} icon={TrendingUp} gradient="from-teal-600 to-teal-700" />
            <StatCard label="Em atraso" value={kpisPlus.operacional.atrasadas} icon={ShieldAlert} gradient="from-rose-600 to-rose-700" />
            <StatCard label="Eventos hoje" value={kpisPlus.operacional.eventosHoje} icon={CalendarCheck2} gradient="from-amber-600 to-amber-700" />
            <StatCard label="Ocupação média" value={formatPct(kpisPlus.operacional.ocupacaoMedia)} icon={ListOrdered} gradient="from-slate-700 to-slate-800" hint="Inscritos / vagas (média)" />
          </section>

          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Compras pagas" value={kpisPlus.vendas.comprasPagas} icon={ShoppingCart} gradient="from-lime-600 to-lime-700" />
            <StatCard label="Receita total" value={money(kpisPlus.vendas.receitaTotal)} icon={Coins} gradient="from-emerald-700 to-emerald-800" />
            <StatCard
              label="Top vendidos (itens)"
              value={(kpisPlus.vendas.topVendidos?.[0]?.total ?? 0)}
              icon={BookOpen}
              gradient="from-cyan-700 to-cyan-800"
              hint={kpisPlus.vendas.topVendidos?.[0]?.titulo ?? '—'}
            />
          </section>

          {kpisPlus.bibliotecario && (
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Minhas consultas (hoje)" value={kpisPlus.bibliotecario.minhasConsultasHoje} icon={CalendarCheck2} gradient="from-indigo-600 to-indigo-700" />
              <StatCard label="Consultas marcadas" value={kpisPlus.bibliotecario.minhasConsultasMarcadas} icon={CalendarCheck2} gradient="from-purple-600 to-purple-700" />
              <StatCard label="Mensagens não lidas" value={kpisPlus.bibliotecario.mensagensNaoLidas} icon={Users} gradient="from-fuchsia-600 to-fuchsia-700" />
            </section>
          )}
        </>
      )}

      {/* Gráficos principais */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card
          title="Requisições por período"
          icon={TrendingUp}
          actions={
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm">
                <Filter className="h-4 w-4 text-gray-500" />
                <select aria-label="Período" value={periodo} onChange={(e)=>setPeriodo(e.target.value as Periodo)} className="bg-transparent outline-none">
                  <option value="dia">Último dia</option>
                  <option value="mes">Último mês</option>
                  <option value="ano">Último ano</option>
                </select>
              </div>
              <button onClick={onExportRequisicoes} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm hover:bg-gray-50">
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
          }
        >
          <div className="h-[260px] w-full">
            {hasSerie ? (
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={serie} margin={{ top:5,right:16,left:0,bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" tickMargin={8} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#7C3AED" strokeWidth={2} dot />
                </RLineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem dados para o período selecionado.</div>
            )}
          </div>
        </Card>

        <Card
          title="Requisições por família"
          icon={Users}
          actions={
            <button onClick={onExportFamilia} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm hover:bg-gray-50">
              <Download className="h-4 w-4" /> CSV
            </button>
          }
        >
          <div className="h-[260px] w-full">
            {hasFamilias ? (
              <ResponsiveContainer width="100%" height="100%">
                <RBarChart data={familias} margin={{ top:5,right:16,left:0,bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="family" tickMargin={8} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10B981" radius={[8,8,0,0]} />
                </RBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem registos de famílias.</div>
            )}
          </div>
        </Card>

        <Card title="Distribuição de pedidos por status" icon={ShieldAlert}>
          <div className="h-[320px] w-full">
            {hasDonut ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutReqStatus}
                    innerRadius={60}
                    outerRadius={110}
                    dataKey="value"
                    nameKey="name"
                    label={(p: PieLabelProps)=>`${p.name ?? ''} ${Math.round((p.percent ?? 0)*100)}%`}
                  >
                    {donutReqStatus.map((_e,i)=>(<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem dados.</div>
            )}
          </div>
        </Card>

        <Card
          title="Top 5 livros mais requisitados"
          icon={BookOpen}
          actions={
            <button onClick={onExportTopLivros} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm hover:bg-gray-50">
              <Download className="h-4 w-4" /> CSV
            </button>
          }
        >
          <div className="h-[320px] w-full">
            {hasTopLivros ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topLivros}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={110}
                    dataKey="value"
                    label={(p: PieLabelProps)=>`${p.name ?? ''} ${Math.round((p.percent ?? 0)*100)}%`}
                  >
                    {topLivros.map((_e,i)=>(<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem dados.</div>
            )}
          </div>
        </Card>

        <Card title="Top vendidos (compras pagas)" icon={ShoppingCart}>
          <div className="h-[320px] w-full">
            {hasTopVendidos ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieTopVendidos}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={110}
                    dataKey="value"
                    label={(p: PieLabelProps)=>`${p.name ?? ''} ${Math.round((p.percent ?? 0)*100)}%`}
                  >
                    {pieTopVendidos.map((_e,i)=>(<Cell key={`cell-v-${i}`} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem dados de vendas.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Alertas + Consultas */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {inventario && (
          <Card title="Alertas de inventário" icon={ShieldAlert}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Sem stock" value={inventario.zeroStock} icon={BookOpen} gradient="from-red-600 to-red-700" />
              <StatCard label="Stock baixo (≤1)" value={inventario.lowStock} icon={BookOpen} gradient="from-orange-600 to-orange-700" />
              <StatCard label="Empréstimo sem prazo" value={inventario.emprestimoSemPrazo} icon={BookOpen} gradient="from-slate-700 to-slate-800" />
            </div>
          </Card>
        )}

        {consultasResumo && (
          <Card title="Consultas — resumo" icon={CalendarCheck2}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="h-[260px] w-full">
                {(consultasResumo.porStatus?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RBarChart data={consultasResumo.porStatus} margin={{ top:5,right:16,left:0,bottom:5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="status" tickMargin={8} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total" fill="#0EA5E9" radius={[8,8,0,0]} />
                    </RBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem dados.</div>
                )}
              </div>
              <div className="h-[260px] w-full">
                {(consultasResumo.topBibliotecarios?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RBarChart data={consultasResumo.topBibliotecarios} margin={{ top:5,right:16,left:0,bottom:5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="nome" tickMargin={8} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="total" fill="#22C55E" radius={[8,8,0,0]} />
                    </RBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">Sem dados.</div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Secções ADMIN */}
      {role === 'ADMIN' && (
        <>
          {adminKpis && (
            <section className="mt-8 mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Utilizadores" value={adminKpis.totalUsers ?? 0} icon={Users} gradient="from-blue-600 to-blue-700" />
              <StatCard label="Inativos" value={adminKpis.inativos ?? 0} icon={Users} gradient="from-gray-600 to-gray-700" />
              <StatCard label="Famílias sem filhos" value={adminKpis.familiasSemFilhos ?? 0} icon={Users} gradient="from-pink-600 to-pink-700" />
              <StatCard label="Livros sem capa" value={adminKpis.livrosSemCapa ?? 0} icon={BookOpen} gradient="from-lime-600 to-lime-700" />
            </section>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {adminSeg && (
              <Card title="Segurança (últimos 30 dias)" icon={ShieldAlert}>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {Object.entries(adminSeg).filter(([k])=>k!=='periodoDias').map(([k,v])=>(
                    <div key={k} className="rounded-xl border border-gray-100 p-3 shadow-sm">
                      <div className="text-xs text-gray-500">{k}</div>
                      <div className="text-xl font-semibold">{Number(v) || 0}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-gray-500">Período: {adminSeg.periodoDias} dias</div>
              </Card>
            )}

            <Card title="Atividades recentes" icon={TrendingUp}>
              <div className="max-h-[300px] overflow-auto rounded-lg border border-gray-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Utilizador</th><th className="px-3 py-2">Ação</th></tr>
                  </thead>
                  <tbody>
                    {adminRecentActs.map((a)=>(
                      <tr key={a.id} className="border-t">
                        <td className="px-3 py-2">{new Date(a.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{a.nome ?? `#${a.userId ?? '—'}`}</td>
                        <td className="px-3 py-2">{a.action}</td>
                      </tr>
                    ))}
                    {adminRecentActs.length===0 && (
                      <tr><td className="px-3 py-3 text-gray-500" colSpan={3}>Sem registos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Utilizadores recentes" icon={Users}>
              <div className="max-h-[300px] overflow-auto rounded-lg border border-gray-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Perfil</th><th className="px-3 py-2">Ativo</th></tr>
                  </thead>
                  <tbody>
                    {adminRecentUsers.map((u)=>(
                      <tr key={u.id} className="border-t">
                        <td className="px-3 py-2">{u.name ?? `#${u.id}`}</td>
                        <td className="px-3 py-2">{u.email ?? '—'}</td>
                        <td className="px-3 py-2">{u.role}</td>
                        <td className="px-3 py-2">{u.isActive ? 'Sim' : 'Não'}</td>
                      </tr>
                    ))}
                    {adminRecentUsers.length===0 && (
                      <tr><td className="px-3 py-3 text-gray-500" colSpan={4}>Sem registos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
