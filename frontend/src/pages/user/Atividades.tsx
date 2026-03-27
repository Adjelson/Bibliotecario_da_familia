// client/src/pages/familia/atividades.tsx
import { useEffect, useMemo, useState, useCallback, Fragment } from 'react'
import {
  FaCalendarAlt,
  FaCalendarDay,
  FaCalendarWeek,
  FaCalendar,
  FaClock,
  FaMapMarkerAlt,
  FaChevronLeft,
  FaChevronRight,
  FaSearch,
  FaFilter,
  FaCheck,
} from 'react-icons/fa'
import { Dialog, Transition } from '@headlessui/react'
import { Toaster, toast } from 'sonner'
import { AtividadesAPI, type Atividade, FamiliaAPI } from '../../api/client'
import { useAuth } from '../../store/auth'

/* ===========================================================================
   Utils
=========================================================================== */

type ViewMode = 'dia' | 'semana' | 'mes'
type StatusEvt = 'agendada' | 'em_andamento' | 'concluida'

const fmtDateFull = (d: string | Date) =>
  new Date(d).toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

/* ===========================================================================
   Página
=========================================================================== */

export default function AtividadesFamiliaPage() {
  const { user } = useAuth()
  const role = (user?.role ?? 'PAI') as 'PAI' | 'BIBLIOTECARIO' | 'ADMIN'

  // estado UI
  const [viewMode, setViewMode] = useState<ViewMode>('dia')
  const [query, setQuery] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<'todas' | StatusEvt>('todas')

  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => toISO(new Date()))
  const [fetching, setFetching] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)

  // dados
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [famLoaded] = useState(true) // mantido para compat

  // modal inscrição
  const [inscreverOpen, setInscreverOpen] = useState(false)
  const [inscreverEvt, setInscreverEvt] = useState<Atividade | null>(null)
  const [carregandoFilhos, setCarregandoFilhos] = useState(false)
  const [filhos, setFilhos] = useState<Array<{ id: number; nome: string }>>([])

  // listeners online/offline
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // carregamento com AbortController → elimina “canceled”
  useEffect(() => {
    const ac = new AbortController()
    const signal = ac.signal

    const load = async () => {
      setFetching(true)
      try {
        const params: any = {
          q: query || undefined,
          status: statusFiltro === 'todas' ? undefined : statusFiltro,
        }

        // dia/semana/mês → janelas
        const sel = new Date(selectedDate)
        if (viewMode === 'dia') {
          params.from = toISO(sel)
          params.to = toISO(sel)
        } else if (viewMode === 'semana') {
          const weekStart = new Date(sel)
          weekStart.setDate(sel.getDate() - ((weekStart.getDay() + 6) % 7)) // segunda
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 6)
          params.from = toISO(weekStart)
          params.to = toISO(weekEnd)
        } else {
          const first = new Date(sel.getFullYear(), sel.getMonth(), 1)
          const last = new Date(sel.getFullYear(), sel.getMonth() + 1, 0)
          params.from = toISO(first)
          params.to = toISO(last)
        }

        const { items } = await AtividadesAPI.listar(params, { signal })
        setAtividades(items)
      } catch (err: any) {
        if (err?.code !== 'ERR_CANCELED') {
          const msg =
            err?.response?.data?.message ??
            err?.message ??
            'Falha ao carregar atividades'
          toast.error(msg)
        }
      } finally {
        setFetching(false)
      }
    }

    // debounce leve p/ search
    const t = setTimeout(load, query ? 250 : 0)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [viewMode, selectedDate, statusFiltro, query])

  // helpers de período
  const changeDate = (deltaDays: number) => {
    const base = new Date(selectedDate)
    base.setDate(base.getDate() + deltaDays)
    setSelectedDate(toISO(base))
    setCurrentDate(base)
  }

  const weekDates = useMemo(() => {
    const sel = new Date(selectedDate)
    const start = new Date(sel)
    start.setDate(sel.getDate() - ((start.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [selectedDate])

  const monthDates = useMemo(() => {
    const sel = new Date(selectedDate)
    const y = sel.getFullYear()
    const m = sel.getMonth()
    const first = new Date(y, m, 1)
    const startIndex = (first.getDay() + 6) % 7 // segunda=0
    const lastDay = new Date(y, m + 1, 0).getDate()
    const grid: (Date | null)[] = Array.from({ length: 42 }, () => null)
    for (let d = 1; d <= lastDay; d++) {
      grid[startIndex + d - 1] = new Date(y, m, d)
    }
    return grid
  }, [selectedDate])

  // partições para DIA/SEMANA
  const atividadesDoDia = useMemo(
    () => atividades.filter((a) => toISO(new Date(a.data)) === selectedDate),
    [atividades, selectedDate],
  )

  const atividadesDaSemana = useMemo(() => {
    const isoSet = new Set(weekDates.map(toISO))
    return atividades.filter((a) => isoSet.has(toISO(new Date(a.data))))
  }, [atividades, weekDates])

  const reloadAfter = useCallback(() => {
    // re-carrega sem mexer no query/filtros
    setSelectedDate((s) => s)
  }, [])

  // abre modal e carrega filhos
  const abrirInscricao = useCallback(
    async (evt: Atividade) => {
      setInscreverEvt(evt)
      setInscreverOpen(true)
      try {
        setCarregandoFilhos(true)
        const r = await FamiliaAPI.meusFilhos()
        setFilhos(r.filhos || [])
      } catch {
        toast.error('Não foi possível carregar filhos.')
        setFilhos([])
      } finally {
        setCarregandoFilhos(false)
      }
    },
    [],
  )

  // cancelar inscrição
  const cancelarInscricao = useCallback(
    async (evt: Atividade) => {
      try {
        await AtividadesAPI.cancelarMinhaInscricao(evt.id)
        toast.success('Inscrição cancelada.')
        reloadAfter()
      } catch (err: any) {
        if (err?.code === 'ERR_CANCELED') return
        const msg =
          err?.response?.data?.message ?? err?.message ?? 'Falha ao cancelar'
        toast.error(msg)
      }
    },
    [reloadAfter],
  )

  // marcar presença
  const marcarPresenca = useCallback(
    async (evt: Atividade) => {
      try {
        const r = await AtividadesAPI.marcarPresencaSelf(evt.id)
        if (r?.presente) toast.success('Presença registada.')
        reloadAfter()
      } catch (err: any) {
        if (err?.code === 'ERR_CANCELED') return
        const msg =
          err?.response?.data?.message ??
          err?.message ??
          'Não foi possível marcar presença'
        toast.error(msg)
      }
    },
    [reloadAfter],
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toaster position="top-center" richColors closeButton />
      <main className="mx-auto px-4 py-7 sm:px-6 lg:px-8">
        {/* topo */}
        <section className="mb-6 text-center">
          <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-extrabold text-transparent md:text-5xl">
            Cronograma de Atividades
          </h1>
          <p className="mx-auto mt-2 max-w-3xl text-lg text-gray-600">
            Explora e participa nas atividades preparadas para a tua família
          </p>
          {!online && (
            <div
              role="status"
              aria-live="polite"
              className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-amber-900"
            >
              Ligação offline — algumas ações podem falhar.
            </div>
          )}
        </section>

        {/* filtros */}
        <section
          className="mb-6 rounded-xl border border-white/60 bg-white/80 p-4 shadow-sm backdrop-blur-md"
          aria-busy={fetching}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('dia')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${
                  viewMode === 'dia'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FaCalendarDay /> <span>Dia</span>
              </button>
              <button
                onClick={() => setViewMode('semana')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${
                  viewMode === 'semana'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FaCalendarWeek /> <span>Semana</span>
              </button>
              <button
                onClick={() => setViewMode('mes')}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${
                  viewMode === 'mes'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FaCalendar /> <span>Mês</span>
              </button>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <div className="relative w-full max-w-sm">
                <FaSearch className="pointer-events-none absolute left-3 top-3.5 text-gray-500" />
                <input
                  type="search"
                  placeholder="Pesquisar atividades…"
                  className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2.5 text-sm focus:ring-2 focus:ring-purple-600"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Pesquisar atividades"
                />
              </div>

              <div className="relative">
                <FaFilter className="pointer-events-none absolute left-3 top-3.5 text-gray-500" />
                <select
                  className="appearance-none rounded-lg border border-gray-300 bg-white px-9 py-2.5 text-sm focus:ring-2 focus:ring-purple-600"
                  value={statusFiltro}
                  onChange={(e) => setStatusFiltro(e.target.value as any)}
                  aria-label="Filtrar por estado"
                >
                  <option value="todas">Todas</option>
                  <option value="agendada">Agendadas</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluida">Concluídas</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  changeDate(
                    viewMode === 'dia' ? -1 : viewMode === 'semana' ? -7 : -30,
                  )
                }
                className="rounded-full p-2 hover:bg-gray-100"
                aria-label="Período anterior"
              >
                <FaChevronLeft />
              </button>
              <div className="min-w-[12rem] text-center text-lg font-semibold text-gray-700">
                {viewMode === 'dia' &&
                  new Date(selectedDate).toLocaleDateString('pt-PT', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                {viewMode === 'semana' &&
                  `Semana de ${currentDate.toLocaleDateString('pt-PT', {
                    day: 'numeric',
                    month: 'long',
                  })}`}
                {viewMode === 'mes' &&
                  currentDate.toLocaleDateString('pt-PT', {
                    month: 'long',
                    year: 'numeric',
                  })}
              </div>
              <button
                onClick={() =>
                  changeDate(
                    viewMode === 'dia' ? 1 : viewMode === 'semana' ? 7 : 30,
                  )
                }
                className="rounded-full p-2 hover:bg-gray-100"
                aria-label="Próximo período"
              >
                <FaChevronRight />
              </button>
              <button
                onClick={() => {
                  const t = new Date()
                  setCurrentDate(t)
                  setSelectedDate(toISO(t))
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
              >
                Hoje
              </button>
            </div>
          </div>
        </section>

        {/* DIA */}
        {viewMode === 'dia' && (
          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-700">
              {fmtDateFull(selectedDate)}
            </h2>
            {atividadesDoDia.length > 0 ? (
              <CardsGrid
                items={atividadesDoDia}
                role={role}
                famLoaded={famLoaded}
                onInscrever={abrirInscricao}
                onCancelar={cancelarInscricao}
                onPresenca={marcarPresenca}
              />
            ) : (
              <EmptyStateDia />
            )}
          </section>
        )}

        {/* SEMANA */}
        {viewMode === 'semana' && (
          <section className="rounded-lg bg-white shadow-md">
            <div className="grid grid-cols-7 divide-x divide-gray-200 border-b border-gray-200">
              {weekDates.map((date, i) => (
                <button
                  key={i}
                  className={`py-3 text-center ${
                    toISO(date) === selectedDate ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedDate(toISO(date))}
                >
                  <div className="text-sm font-medium text-gray-500">
                    {date.toLocaleDateString('pt-PT', { weekday: 'short' })}
                  </div>
                  <div
                    className={`text-lg font-semibold ${
                      date.toDateString() === new Date().toDateString()
                        ? 'text-blue-600'
                        : 'text-gray-700'
                    }`}
                  >
                    {date.getDate()}
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4">
              {atividadesDaSemana.length > 0 ? (
                <CardsGrid
                  items={atividadesDaSemana}
                  role={role}
                  famLoaded={famLoaded}
                  onInscrever={abrirInscricao}
                  onCancelar={cancelarInscricao}
                  onPresenca={marcarPresenca}
                />
              ) : (
                <div className="py-12 text-center text-gray-500">
                  Semana sem atividades.
                </div>
              )}
            </div>
          </section>
        )}

        {/* MÊS */}
        {viewMode === 'mes' && (
          <section className="overflow-hidden rounded-lg bg-white shadow-md">
            <div className="grid grid-cols-7 gap-px bg-gray-200">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                <div
                  key={d}
                  className="bg-gray-100 py-2 text-center text-sm font-medium text-gray-700"
                >
                  {d}
                </div>
              ))}
              {monthDates.map((date, i) => (
                <div
                  key={i}
                  className={`min-h-24 p-1 ${
                    date ? 'cursor-pointer bg-white hover:bg-gray-50' : 'bg-gray-50'
                  } ${date && toISO(date) === selectedDate ? 'bg-blue-50' : ''}`}
                  onClick={() => date && setSelectedDate(toISO(date))}
                >
                  {date && (
                    <>
                      <div
                        className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full p-1 text-right ${
                          date.toDateString() === new Date().toDateString()
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700'
                        }`}
                      >
                        {date.getDate()}
                      </div>
                      <div className="mt-1 max-h-20 space-y-1 overflow-y-auto">
                        {atividades
                          .filter((a) => toISO(new Date(a.data)) === toISO(date))
                          .map((a) => (
                            <div
                              key={a.id}
                              className="truncate rounded bg-blue-100 p-1 text-xs text-blue-900"
                              title={a.titulo}
                            >
                              {String(a.horario ?? '')
                                .split(' - ')[0]
                                .slice(0, 5)}{' '}
                              {a.titulo.substring(0, 14)}…
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Modal de inscrição */}
      <InscreverModal
        open={inscreverOpen}
        onClose={() => setInscreverOpen(false)}
        filhos={filhos}
        loading={carregandoFilhos}
        evento={inscreverEvt}
        onConfirm={async (body) => {
          if (!inscreverEvt) return
          try {
            await AtividadesAPI.inscrever(inscreverEvt.id, body)
            toast.success('Inscrição registada.')
            setInscreverOpen(false)
            setInscreverEvt(null)
            reloadAfter()
          } catch (err: any) {
            const msg =
              err?.response?.data?.message ??
              err?.message ??
              'Falha a inscrever'
            toast.error(msg)
          }
        }}
      />
    </div>
  )
}

/* ===========================================================================
   Cards (layout)
=========================================================================== */

function CardsGrid({
  items,
  onInscrever,
  onCancelar,
  onPresenca,
  role,
}: {
  items: Atividade[]
  famLoaded: boolean
  role: 'PAI' | 'BIBLIOTECARIO' | 'ADMIN'
  onInscrever: (a: Atividade) => void
  onCancelar: (a: Atividade) => void
  onPresenca: (a: Atividade) => void
}) {
  if (!items.length) return null
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((a) => (
        <ActivityCard
          key={a.id}
          data={a}
          role={role}
          onInscrever={() => onInscrever(a)}
          onCancelar={() => onCancelar(a)}
          onPresenca={() => onPresenca(a)}
        />
      ))}
    </div>
  )
}

function ActivityCard({
  data,
  role,
  onInscrever,
  onCancelar,
  onPresenca,
}: {
  data: Atividade
  role: 'PAI' | 'BIBLIOTECARIO' | 'ADMIN'
  onInscrever: () => void
  onCancelar: () => void
  onPresenca: () => void
}) {
  const total = Number(data.vagas || 0)
  const ocupados = Number(data.inscritos ?? data.participantes ?? 0)
  const cheio = total > 0 ? ocupados >= total : false
  const percent = total > 0 ? clamp(Math.round((ocupados / total) * 100), 0, 100) : 0

  const statusLabel =
    data.status === 'concluida'
      ? 'Concluída'
      : data.status === 'em_andamento'
        ? 'Em andamento'
        : 'Agendada'

  const canInscrever =
    role === 'PAI' && !data.inscrito && !cheio && data.status !== 'concluida'
  const canCancelar = role === 'PAI' && data.inscrito && data.status !== 'concluida'
  const canPresenca = role === 'PAI' && data.inscrito && !data.presente

  return (
    <article
      className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-200"
      aria-label={`Atividade ${data.titulo}`}
    >
      {/* Capa */}
      <div className="relative h-44 w-full overflow-hidden">
        {data.imagem ? (
          <img
            src={data.imagem}
            alt={`Capa do evento ${data.titulo}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-r from-blue-200 to-purple-200">
            <FaCalendarAlt className="h-8 w-8 opacity-60" />
          </div>
        )}

        {/* Badge status */}
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-sm font-semibold ${
            data.status === 'concluida'
              ? 'bg-emerald-100 text-emerald-900'
              : data.status === 'em_andamento'
                ? 'bg-blue-100 text-blue-900'
                : 'bg-purple-100 text-purple-900'
          }`}
        >
          {statusLabel}
        </span>

        {/* Badge vagas */}
        <span className="absolute right-3 top-3 rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-900">
          {ocupados}/{total} vagas
        </span>
      </div>

      {/* Corpo */}
      <div className="p-4">
        <h3 className="text-xl font-bold text-gray-900">{data.titulo}</h3>
        {data.descricao && (
          <p className="mt-1 line-clamp-2 text-gray-600">{data.descricao}</p>
        )}

        <ul className="mt-3 space-y-2 text-gray-700">
          <li className="flex items-center gap-2">
            <FaCalendarDay aria-hidden />
            <span className="sr-only">Data:</span>
            <span>{fmtDateFull(data.data)}</span>
          </li>
          <li className="flex items-center gap-2">
            <FaClock aria-hidden />
            <span className="sr-only">Horário:</span>
            <span>{data.horario}</span>
          </li>
          <li className="flex items-center gap-2">
            <FaMapMarkerAlt aria-hidden />
            <span className="sr-only">Local:</span>
            <span>{data.local}</span>
          </li>
        </ul>

        {/* Barra de capacidade */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100">
                <FaCheck className="text-gray-500" />
              </span>
              Capacidade
            </span>
            <span>{percent}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Capacidade ocupada"
          >
            <div
              className="h-full w-0 bg-gradient-to-r from-blue-600 to-purple-600 transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Ações */}
        <div className="mt-4">
          {/* prioridade: cancelar > presença > inscrever */}
          {canCancelar ? (
            <button
              onClick={onCancelar}
              className="w-full rounded-xl border border-purple-300 bg-white px-4 py-3 font-medium text-purple-700 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-600"
            >
              Cancelar inscrição
            </button>
          ) : canPresenca ? (
            <button
              onClick={onPresenca}
              className="w-full rounded-xl bg-purple-600 px-4 py-3 font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-600"
            >
              Marcar presença
            </button>
          ) : canInscrever ? (
            <button
              onClick={onInscrever}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              Inscrever-me
            </button>
          ) : (
            <button
              disabled
              className="w-full cursor-not-allowed rounded-xl bg-gray-100 px-4 py-3 font-medium text-gray-500"
            >
              <span className="inline-flex items-center gap-2">
                <FaCheck /> Inscrever-me
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/* ===========================================================================
   Empty state
=========================================================================== */

function EmptyStateDia() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-600">
      Não há atividades neste dia.
    </div>
  )
}

/* ===========================================================================
   Modal de Inscrição (Só eu | Filhos | Toda a família)
=========================================================================== */

function InscreverModal({
  open,
  onClose,
  onConfirm,
  filhos,
  loading,
  evento,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (body: any) => void
  filhos: Array<{ id: number; nome: string }>
  loading?: boolean
  evento: Atividade | null
}) {
  const [modo, setModo] = useState<'SO_EU' | 'FILHOS' | 'TODOS'>('SO_EU')
  const [filhosSel, setFilhosSel] = useState<number[]>([])
  const [incluiResp, setIncluiResp] = useState(true)

  useEffect(() => {
    if (!open) {
      setModo('SO_EU')
      setFilhosSel([])
      setIncluiResp(true)
    }
  }, [open])

  const toggleFilho = (id: number) => {
    setFilhosSel((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]))
  }

  if (!open) return null

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-[100]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-150"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-100"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white p-5 text-left align-middle shadow-xl ring-1 ring-black/5">
                <div className="mb-3 flex items-center justify-between">
                  <Dialog.Title className="text-xl font-bold text-gray-900">
                    {evento ? `Participar em: ${evento.titulo}` : 'Participação'}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modo === 'SO_EU'}
                      onChange={() => setModo('SO_EU')}
                    />
                    <span>Só eu (responsável)</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modo === 'TODOS'}
                      onChange={() => setModo('TODOS')}
                    />
                    <span>Toda a família</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={modo === 'FILHOS'}
                      onChange={() => setModo('FILHOS')}
                    />
                    <span>Apenas filho(s)</span>
                  </label>

                  {modo === 'FILHOS' && (
                    <div className="rounded-lg border p-3">
                      {loading ? (
                        <p className="text-sm text-gray-600">A carregar filhos…</p>
                      ) : filhos.length ? (
                        <div className="space-y-2">
                          {filhos.map((f) => (
                            <label key={f.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={filhosSel.includes(f.id)}
                                onChange={() => toggleFilho(f.id)}
                              />
                              <span>{f.nome}</span>
                            </label>
                          ))}
                          <label className="mt-2 flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={incluiResp}
                              onChange={(e) => setIncluiResp(e.target.checked)}
                            />
                            <span>Incluir também o responsável</span>
                          </label>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">Nenhum filho cadastrado.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={onClose}
                    className="rounded border px-4 py-2 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      let body: any = {}
                      if (modo === 'SO_EU') {
                        body = { incluirResponsavel: true }
                      } else if (modo === 'TODOS') {
                        body = { todosFamilia: true, incluirResponsavel: true }
                      } else {
                        body = {
                          filhosIds: filhosSel,
                          incluirResponsavel: !!incluiResp,
                        }
                      }
                      if (modo === 'FILHOS' && (!filhosSel.length && !incluiResp)) {
                        toast.error('Seleciona ao menos um participante.')
                        return
                      }
                      onConfirm(body)
                    }}
                    className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    Confirmar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
