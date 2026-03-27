// src/pages/admin/GestaoConsultas.tsx
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, Transition } from '@headlessui/react'
import {
  FaCheck, FaTimes, FaSearch, FaCalendarAlt, FaClock, FaEdit, FaTrash,
  FaVideo, FaMapMarkerAlt, FaInfoCircle, FaSave, FaSync,
} from 'react-icons/fa'
import {
  ConsultasAPI,
  type ConsultaDTO,
  type ConsultaStatus,
  type Metodo,
  parseApiError,
} from '../../api/client'
import { useAuth } from '../../api/client' // mesmo hook reexportado

/* ============================== Helpers ============================== */

type StatusFiltro =
  | 'todas' | 'pendentes'
  | ConsultaStatus // 'MARCADA' | 'CONCLUIDA' | 'CANCELADA' | 'RECUSADA' | 'RETORNADA'

type Draft = {
  id?: number
  bibliotecarioId?: number
  data?: string
  hora?: string
  notas?: string
  status?: ConsultaDTO['status']
  metodo?: Metodo | null
}

const PENDENTE_TAG = '[PENDENTE]'

const isPendente = (c: ConsultaDTO) =>
  c.status === 'MARCADA' && (c.notas ?? '').toUpperCase().includes(PENDENTE_TAG)

function hmFromISO(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseMetodoFromNotas(notas?: string | null): Metodo | undefined {
  if (!notas) return undefined
  const m = notas.match(/m[eé]todo:\s*(presencial|videochamada)/i)
  if (!m) return undefined
  return m[1].toLowerCase() === 'videochamada' ? 'VIDEO' : 'PRESENCIAL'
}

function metodoBadgeClasses(m?: Metodo | null) {
  return !m
    ? 'bg-gray-200 text-gray-950'
    : m === 'PRESENCIAL'
      ? 'bg-blue-200 text-blue-950'
      : 'bg-violet-200 text-violet-950'
}
function metodoLabel(m?: Metodo | null) { return !m ? '—' : m === 'PRESENCIAL' ? 'Presencial' : 'Videochamada' }

function statusBadge(c: ConsultaDTO) {
  if (isPendente(c)) return 'bg-amber-200 text-amber-950'
  return c.status === 'CONCLUIDA' ? 'bg-emerald-200 text-emerald-950'
    : c.status === 'CANCELADA' ? 'bg-rose-200 text-rose-950'
    : c.status === 'RECUSADA'  ? 'bg-rose-200 text-rose-950'
    : c.status === 'RETORNADA' ? 'bg-indigo-200 text-indigo-950'
    : 'bg-blue-200 text-blue-950'
}
function statusLabel(c: ConsultaDTO) {
  return isPendente(c) ? 'Pendente de confirmação'
    : c.status === 'MARCADA' ? 'Marcada'
    : c.status === 'CONCLUIDA' ? 'Concluída'
    : c.status === 'CANCELADA' ? 'Cancelada'
    : c.status === 'RECUSADA' ? 'Recusada'
    : 'A pedir informação'
}

/* ======================= Modais reutilizáveis ======================= */

function ModalBase({
  open, onClose, title, children, footer,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-[100]" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child as={Fragment} enter="ease-out duration-150" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-100" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-5 text-left align-middle shadow-xl ring-2 ring-gray-900/10">
                <div className="mb-3 flex items-center justify-between">
                  <Dialog.Title className="text-2xl font-bold text-gray-950">{title}</Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40 min-h-[44px]"
                    aria-label="Fechar janela"
                  >X</button>
                </div>
                <div className="text-gray-950">{children}</div>
                {footer ? <div className="mt-4 flex flex-wrap gap-2">{footer}</div> : null}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

function TextareaModal({
  open, title, label, placeholder, confirmLabel, busy, onCancel, onConfirm, initialValue = '',
}: {
  open: boolean; title: string; label: string; placeholder?: string; confirmLabel: string;
  busy?: boolean; onCancel: () => void; onConfirm: (v: string) => void; initialValue?: string
}) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => { if (open) setValue(initialValue) }, [open, initialValue])
  return (
    <ModalBase
      open={open}
      onClose={() => !busy && onCancel()}
      title={title}
      footer={
        <>
          <button onClick={onCancel} disabled={busy}
            className="rounded-lg border-2 border-gray-400 bg-white px-4 py-2 text-gray-950 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40 min-h-[44px]">
            Voltar
          </button>
          <button onClick={() => onConfirm(value.trim())} disabled={busy || !value.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 min-h-[44px]">
            {busy ? 'A processar…' : confirmLabel}
          </button>
        </>
      }
    >
      <label htmlFor="modal-textarea" className="mb-1 block text-sm font-medium">{label}</label>
      <textarea
        id="modal-textarea"
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border-2 border-gray-400 bg-white px-3 py-2 text-gray-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
      />
      <p className="mt-1 text-xs text-gray-600">Conteúdo será enviado ao responsável e registado nas notas.</p>
    </ModalBase>
  )
}

function ConfirmModal({
  open, title, message, confirmLabel, tone = 'danger', busy, onCancel, onConfirm,
}: {
  open: boolean; title: string; message: string; confirmLabel: string;
  tone?: 'danger' | 'primary'; busy?: boolean; onCancel: () => void; onConfirm: () => void
}) {
  const btn = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-600 focus-visible:ring-rose-600'
    : 'bg-indigo-600 hover:bg-indigo-600 focus-visible:ring-indigo-600'
  return (
    <ModalBase
      open={open}
      onClose={() => !busy && onCancel()}
      title={title}
      footer={
        <>
          <button onClick={onCancel} disabled={busy}
            className="rounded-lg border-2 border-gray-400 bg-white px-4 py-2 text-gray-950 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40 min-h-[44px]">
            Voltar
          </button>
          <button onClick={onConfirm} disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white ${btn} focus-visible:outline-none focus-visible:ring-2 min-h-[44px]`}>
            {busy ? 'A processar…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-900">{message}</p>
    </ModalBase>
  )
}

/* ============================ Página ============================ */

type DispResposta = { bibliotecarioId: number; desde: string; ate: string; dias: Array<{ data: string; slots: string[] }> }

export default function GestaoConsultas() {
  const role = useAuth.getState().user?.role
  const isAdmin = role === 'ADMIN'
  const meId = useAuth.getState().user?.id as number | undefined

  const [items, setItems] = useState<ConsultaDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('todas')

  const [modalOpen, setModalOpen] = useState(false)
  const [cur, setCur] = useState<ConsultaDTO | null>(null)
  const [draft, setDraft] = useState<Draft>({})

  const [dispLoading, setDispLoading] = useState(false)
  const [dispMap, setDispMap] = useState<Record<string, string[]>>({})
  const [dispRange, setDispRange] = useState<{ desde: string; ate: string } | null>(null)

  const [recusaOpen, setRecusaOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [concluirOpen, setConcluirOpen] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)

  const [busyAction, setBusyAction] = useState(false)
  const liveRef = useRef<HTMLParagraphElement>(null)

  const minDateISO = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 3)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    document.title = 'Gestão de Consultas • Admin'
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    try {
      const base = await ConsultasAPI.listar({ page: 1, pageSize: 200 })
      setItems(base.items ?? [])
      announce('Lista de consultas atualizada.')
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }

  function announce(msg: string) {
    if (liveRef.current) liveRef.current.textContent = msg
  }

  async function abrir(c: ConsultaDTO) {
    setCur(c)
    setDraft({
      id: Number(c.id),
      bibliotecarioId: c.bibliotecarioId,
      data: new Date(c.dataHora).toISOString().slice(0, 10),
      hora: hmFromISO(c.dataHora),
      notas: c.notas ?? '',
      status: c.status,
      metodo: c.metodo ?? parseMetodoFromNotas(c.notas) ?? null,
    })
    setModalOpen(true)
    try {
      setDispLoading(true)
      const res = await ConsultasAPI.disponibilidade({ bibliotecarioId: c.bibliotecarioId, dias: 21 }) as DispResposta
      const map: Record<string, string[]> = {}; res.dias.forEach(d => { map[d.data] = d.slots })
      setDispMap(map); setDispRange({ desde: res.desde, ate: res.ate })
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setDispLoading(false) }
  }

  function filtradas() {
    const q = filtroTexto.trim().toLowerCase()
    let base = items
    if (filtroStatus !== 'todas') {
      if (filtroStatus === 'pendentes') base = base.filter(isPendente)
      else base = base.filter(c => c.status === filtroStatus)
    }
    if (q) {
      base = base.filter(c =>
        (c.familiaNome ?? '').toLowerCase().includes(q) ||
        (c.bibliotecarioNome ?? '').toLowerCase().includes(q) ||
        (c.notas ?? '').toLowerCase().includes(q)
      )
    }
    if (!isAdmin && meId) base = base.filter(c => c.bibliotecarioId === meId)
    return base
  }

  async function aceitar(c: ConsultaDTO) {
    setBusyAction(true)
    const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const notas = (c.notas ?? '').replace(new RegExp(`\\s*${ESC(PENDENTE_TAG)}\\s*`, 'i'), '').trim()
    try {
      const up = await ConsultasAPI.atualizar(Number(c.id), { notas })
      toast.success('Consulta aceite.')
      setItems(arr => arr.map(x => (x.id === c.id ? up : x)))
      announce('Consulta aceite.')
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setBusyAction(false) }
  }

  async function recusar(c: ConsultaDTO, motivo: string) {
    if (!motivo.trim()) return
    setBusyAction(true)
    try {
      const up = await ConsultasAPI.atualizar(Number(c.id), {
        status: 'RECUSADA',
        motivo,
        notas: motivo ? `${motivo}${c.notas ? `\n${c.notas}` : ''}` : c.notas ?? undefined
      })
      toast.success('Consulta recusada.')
      setItems(arr => arr.map(x => (x.id === c.id ? up : x)))
      setRecusaOpen(false)
      setModalOpen(false)
      announce('Consulta recusada.')
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setBusyAction(false) }
  }

  async function pedirMaisInfo(c: ConsultaDTO, motivo: string) {
    if (!motivo.trim()) return
    setBusyAction(true)
    try {
      const up = await ConsultasAPI.atualizar(Number(c.id), {
        status: 'RETORNADA',
        motivo,
        notas: motivo ? `${motivo}${c.notas ? `\n${c.notas}` : ''}` : c.notas ?? undefined
      })
      toast.success('Pedido de informação enviado.')
      setItems(arr => arr.map(x => (x.id === c.id ? up : x)))
      setInfoOpen(false)
      announce('Pedido de informação enviado.')
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setBusyAction(false) }
  }

  async function concluir(c: ConsultaDTO, resumo: string, enviar: boolean) {
    setBusyAction(true)
    try {
      const up = await ConsultasAPI.atualizar(Number(c.id), {
        status: 'CONCLUIDA',
        notas: resumo ? `${resumo}${c.notas ? `\n${c.notas}` : ''}` : c.notas ?? undefined,
        ...(resumo ? { resultadoResumo: resumo } : {}),
        ...(enviar ? { enviarResultadoAgora: true } : {}),
      })
      toast.success('Consulta concluída.')
      setItems(arr => arr.map(x => (x.id === c.id ? up : x)))
      setConcluirOpen(false)
      setModalOpen(false)
      announce('Consulta concluída.')
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setBusyAction(false) }
  }

  async function cancelar(c: ConsultaDTO) {
    setBusyAction(true)
    try {
      const up = await ConsultasAPI.cancelar(Number(c.id))
      toast.success('Consulta cancelada.')
      setItems(arr => arr.map(x => (x.id === c.id ? up : x)))
      setConfirmCancelOpen(false)
      announce('Consulta cancelada.')
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setBusyAction(false) }
  }

  const slotsISO = draft.data ? (dispMap[draft.data] ?? []) : []
  const optionsHora = slotsISO.map(iso => ({
    value: hmFromISO(iso),
    label: new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  }))

  async function guardarRemarcacao() {
    if (!cur || !draft.data || !draft.hora) return toast.error('Seleciona data e hora válidas.')
    const hmList = (dispMap[draft.data] ?? []).map(hmFromISO)
    if (!hmList.includes(draft.hora)) return toast.error('Escolhe uma hora disponível.')

    // reforça “Método: …” nas notas (não há campo metodo no PATCH)
    const notasRaw = (draft.notas ?? '')
      .replace(/Método:\s*(Presencial|Videochamada)/i, '')
      .replace(/\s*\|\s*\|\s*/g, ' ')
      .trim()
    const metodoLinha =
      draft.metodo === 'VIDEO' ? 'Método: Videochamada'
      : draft.metodo === 'PRESENCIAL' ? 'Método: Presencial' : ''
    const novasNotas = [metodoLinha, notasRaw].filter(Boolean).join(' | ').trim()

    const dataHora = `${draft.data}T${draft.hora}:00`
    setBusyAction(true)
    try {
      const up = await ConsultasAPI.atualizar(Number(cur.id), { dataHora, notas: novasNotas || undefined })
      toast.success('Consulta remarcada.')
      setItems(arr => arr.map(x => (x.id === cur.id ? up : x)))
      announce('Consulta remarcada.')
    } catch (e) { toast.error(parseApiError(e)) }
    finally { setBusyAction(false) }
  }

  return (
    <div className="min-h-screen text-gray-950">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-indigo-600">
        Ir para o conteúdo principal
      </a>
      <p ref={liveRef} className="sr-only" aria-live="polite" />

      <div className="mx-auto px-3 py-4 sm:px-4 lg:px-4">
        <section className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="mb-1 flex items-center gap-3 text-3xl font-extrabold">
              <FaCalendarAlt aria-hidden="true" className="text-indigo-600" />
              Gestão de Consultas
            </h1>
            <p className="text-sm text-gray-900">Aceitar/recusar, pedir informação, remarcar e concluir com resumo.</p>
          </div>
          <button
            onClick={carregar}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-gray-400 bg-white px-4 py-2 font-medium text-gray-950 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40"
            aria-label="Recarregar lista de consultas"
          >
            <FaSync aria-hidden="true" /> Recarregar
          </button>
        </section>

        {/* Filtros */}
        <section className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border-2 border-gray-300 bg-white p-4 shadow-sm md:grid-cols-3" aria-labelledby="filtros-title">
          <h2 id="filtros-title" className="sr-only">Filtros da listagem</h2>
          <div className="relative min-w-0">
            <FaSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-indigo-600/70" />
            <input
              type="search"
              placeholder="Pesquisar família, bibliotecário ou notas…"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="w-full rounded-lg border-2 border-gray-400 bg-white px-9 py-2 text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              aria-label="Pesquisar por texto livre"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="filtro-status" className="sr-only">Filtrar por estado</label>
            <select
              id="filtro-status"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as StatusFiltro)}
              className="w-full min-w-0 rounded-lg border-2 border-gray-400 bg-white px-3 py-2 text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              <option value="todas">Todas</option>
              <option value="pendentes">Pendentes de aceitação</option>
              <option value="MARCADA">Marcadas</option>
              <option value="RETORNADA">A pedir informação</option>
              <option value="RECUSADA">Recusadas</option>
              <option value="CONCLUIDA">Concluídas</option>
              <option value="CANCELADA">Canceladas</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button
              onClick={() => { setFiltroTexto(''); setFiltroStatus('todas') }}
              className="min-h-[44px] rounded-md px-3 py-2 text-sm font-medium text-indigo-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              Limpar filtros
            </button>
          </div>
        </section>

        {/* Tabela */}
        <section id="main" className="overflow-hidden rounded-2xl border-2 border-gray-300 bg-white shadow-sm" aria-labelledby="tabela-title">
          <h2 id="tabela-title" className="sr-only">Tabela de consultas</h2>
          <div className="overflow-x-auto" role="region" aria-label="Tabela de consultas com scroll horizontal">
            <table className="min-w-full text-left">
              <caption className="sr-only">Listagem de consultas com família, bibliotecário, data/hora, estado, método e ações</caption>
              <thead className="bg-indigo-600 text-white">
                <tr>
                  <th className="px-6 py-3 text-sm font-semibold">Família</th>
                  <th className="px-6 py-3 text-sm font-semibold">Bibliotecário</th>
                  <th className="px-6 py-3 text-sm font-semibold">Data/Hora</th>
                  <th className="px-6 py-3 text-sm font-semibold">Estado</th>
                  <th className="px-6 py-3 text-sm font-semibold">Método</th>
                  <th className="px-6 py-3 text-sm font-semibold">Notas</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-900">A carregar…</td></tr>
                ) : filtradas().length ? (
                  filtradas().map((c) => {
                    const metodo = c.metodo ?? parseMetodoFromNotas(c.notas)
                    const dataStr = new Date(c.dataHora).toLocaleDateString('pt-PT')
                    const horaStr = new Date(c.dataHora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
                    const labelLinha = `Consulta de ${c.familiaNome ?? `Família #${c.familiaId}`} com ${c.bibliotecarioNome ?? `#${c.bibliotecarioId}`}, ${dataStr} ${horaStr}, estado ${statusLabel(c)}`
                    return (
                      <tr key={c.id} className="hover:bg-indigo-50/50" aria-label={labelLinha}>
                        <td className="px-6 py-4 align-top">
                          <div className="font-medium text-gray-950">{c.familiaNome ?? `Família #${c.familiaId}`}</div>
                          <div className="break-words text-sm text-gray-600">{c.familiaEmail ?? '—'}</div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="font-medium text-gray-950">{c.bibliotecarioNome ?? `#${c.bibliotecarioId}`}</div>
                          <div className="break-words text-sm text-gray-600">{c.bibliotecarioEmail ?? '—'}</div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="font-medium">{dataStr}</div>
                          <div className="flex items-center gap-1 text-sm text-gray-900">
                            <FaClock aria-hidden="true" className="text-indigo-600/80" /> {horaStr}
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(c)}`} aria-label={`Estado: ${statusLabel(c)}`}>{statusLabel(c)}</span>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${metodoBadgeClasses(metodo)}`}>
                            {metodo === 'VIDEO' ? <FaVideo aria-hidden="true" /> : <FaMapMarkerAlt aria-hidden="true" />}
                            {metodoLabel(metodo)}
                          </span>
                        </td>
                        <td className="max-w-xs px-6 py-4 align-top text-sm text-gray-950">
                          <span className="line-clamp-3">{c.notas ?? '—'}</span>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              onClick={() => abrir(c)}
                              className="rounded-full p-2 text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 min-h-[44px]"
                              title="Detalhes e remarcação"
                              aria-label={`Abrir detalhes da consulta: ${labelLinha}`}
                            >
                              <FaEdit aria-hidden="true" />
                            </button>

                            {isPendente(c) && (
                              <>
                                <button
                                  onClick={() => aceitar(c)}
                                  disabled={busyAction}
                                  className="rounded-full p-2 text-emerald-600 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 min-h-[44px]"
                                  title="Aceitar pedido"
                                  aria-label={`Aceitar consulta: ${labelLinha}`}
                                > Aceitar o pedido 
                                  <FaCheck aria-hidden="true" />
                                </button>
                                <button
                                  onClick={() => { setCur(c); setRecusaOpen(true) }}
                                  className="rounded-full p-2 text-rose-600 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 min-h-[44px]"
                                  title="Recusar pedido"
                                  aria-label={`Recusar consulta: ${labelLinha}`}
                                >Recusar pedido
                                  <FaTimes aria-hidden="true" />
                                </button>
                              </>
                            )}

                            {c.status === 'MARCADA' && !isPendente(c) && (
                              <>
                              
                                <button
                                  onClick={() => { setCur(c); setInfoOpen(true) }}
                                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                  title="Pedir mais informação"
                                  aria-label={`Pedir informação adicional: ${labelLinha}`}
                                >
                                  <FaInfoCircle aria-hidden="true" /> Pedir info
                                </button>
                                <button
                                  onClick={() => { setCur(c); setConcluirOpen(true) }}
                                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  title="Concluir consulta"
                                  aria-label={`Concluir consulta: ${labelLinha}`}
                                >
                                  <FaCheck aria-hidden="true" /> Concluir
                                </button>
                              </>
                            )}

                            {/*c.status !== 'CANCELADA' && (
                              <button
                                onClick={() => { setCur(c); setConfirmCancelOpen(true) }}
                                className="rounded-full p-2 text-rose-600 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 min-h-[44px]"
                                title="Cancelar consulta"
                                aria-label={`Cancelar consulta: ${labelLinha}`}
                              >
                                <FaTrash aria-hidden="true" />
                              </button>
                            )*/}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-900">Nenhuma consulta encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ===== Modais ===== */}

      {/* Detalhes / Remarcação */}
      <ModalBase open={modalOpen} onClose={() => setModalOpen(false)} title="Detalhes da consulta">
        {cur && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-gray-900">Família</p>
                <p className="font-medium">{cur.familiaNome ?? `#${cur.familiaId}`}</p>
                <p className="break-all text-xs text-gray-900">{cur.familiaEmail ?? '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-900">Bibliotecário</p>
                <p className="font-medium">{cur.bibliotecarioNome ?? `#${cur.bibliotecarioId}`}</p>
                <p className="break-all text-xs text-gray-900">{cur.bibliotecarioEmail ?? '—'}</p>
              </div>

              {/* Data */}
              <div>
                <label htmlFor="input-data" className="text-sm text-gray-900">Data</label>
                <input
                  id="input-data"
                  type="date"
                  min={minDateISO}
                  value={draft.data ?? ''}
                  onChange={(e) => {
                    const d = e.target.value
                    setDraft((prev) => {
                      const possiveis = (dispMap[d] ?? []).map(hmFromISO)
                      const hora = possiveis.includes(prev.hora || '') ? prev.hora : possiveis[0] ?? ''
                      return { ...prev, data: d, hora }
                    })
                  }}
                  className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                />
                {dispRange && (
                  <p className="mt-1 text-xs text-gray-900">
                    Slots entre {new Date(dispRange.desde).toLocaleDateString('pt-PT')} e {new Date(dispRange.ate).toLocaleDateString('pt-PT')}.
                    {dispLoading ? ' (a atualizar…)' : ''}
                  </p>
                )}
              </div>

              {/* Hora */}
              <div>
                <label htmlFor="input-hora" className="text-sm text-gray-900">Hora</label>
                <select
                  id="input-hora"
                  value={draft.hora ?? ''}
                  onChange={(e) => setDraft({ ...draft, hora: e.target.value })}
                  disabled={!draft.data || dispLoading || optionsHora.length === 0}
                  className="w-full rounded-lg border-2 border-gray-400 px-3 py-2 text-gray-950 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  {!draft.data || optionsHora.length === 0 ? (
                    <option value="">{dispLoading ? 'A carregar…' : 'Seleciona a data'}</option>
                  ) : optionsHora.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>

              {/* Método */}
              <fieldset className="md:col-span-2 rounded-lg border-2 border-gray-300 p-3">
                <legend className="px-1 text-sm font-medium text-gray-950">Método</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  <label className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 ${draft.metodo === 'PRESENCIAL' ? 'border-indigo-600 ring-2 ring-indigo-600' : 'border-gray-400'}`}>
                    <input type="radio" className="sr-only" checked={draft.metodo === 'PRESENCIAL'} onChange={() => setDraft((d) => ({ ...d, metodo: 'PRESENCIAL' }))} />
                    <FaMapMarkerAlt aria-hidden="true" /> Presencial
                  </label>
                  <label className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 ${draft.metodo === 'VIDEO' ? 'border-indigo-600 ring-2 ring-indigo-600' : 'border-gray-400'}`}>
                    <input type="radio" className="sr-only" checked={draft.metodo === 'VIDEO'} onChange={() => setDraft((d) => ({ ...d, metodo: 'VIDEO' }))} />
                    <FaVideo aria-hidden="true" /> Videochamada
                  </label>
                </div>
              </fieldset>

              {/* Notas */}
              <div className="md:col-span-2">
                <label htmlFor="input-notas" className="text-sm text-gray-900">Notas</label>
                <textarea
                  id="input-notas"
                  rows={4}
                  value={draft.notas ?? ''}
                  onChange={(e) => setDraft({ ...draft, notas: e.target.value })}
                  className="max-h-60 w-full resize-y rounded-lg border-2 border-gray-400 px-3 py-2 text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                />
                {cur && isPendente(cur) && (
                  <p className="mt-1 text-xs text-amber-900">Pedido pendente de aceitação.</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                {cur && isPendente(cur) && (
                  <>
                    <button
                      onClick={() => aceitar(cur)}
                      disabled={busyAction}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <FaCheck aria-hidden="true" /> Aceitar
                    </button>
                    <button
                      onClick={() => setRecusaOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                    >
                      <FaTimes aria-hidden="true" /> Recusar
                    </button>
                  </>
                )}

                {cur && cur.status === 'MARCADA' && !isPendente(cur) && (
                  <>
                    <button
                      onClick={guardarRemarcacao}
                      className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 min-h-[44px]"
                      title="Guardar remarcação e método"
                    >
                      <FaSave aria-hidden="true" /> Guardar alterações
                    </button>
                    <button
                      onClick={() => setInfoOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                    >
                      <FaInfoCircle aria-hidden="true" /> Pedir info
                    </button>
                    <button
                      onClick={() => setConcluirOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <FaCheck aria-hidden="true" /> Concluir
                    </button>
                  </>
                )}

                {cur && cur.status !== 'CANCELADA' && (
                  <button
                    onClick={() => setConfirmCancelOpen(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                  >
                    <FaTrash aria-hidden="true" /> Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalBase>

      {/* Recusar */}
      <TextareaModal
        open={recusaOpen}
        title="Recusar consulta"
        label="Motivo da recusa"
        placeholder="Explica de forma clara e objetiva o motivo."
        confirmLabel="Confirmar recusa"
        busy={busyAction}
        onCancel={() => !busyAction && setRecusaOpen(false)}
        onConfirm={(v) => { if (cur) recusar(cur, v) }}
      />

      {/* Pedir Mais Informação */}
      <TextareaModal
        open={infoOpen}
        title="Pedir informação adicional"
        label="Mensagem ao responsável"
        placeholder="Descreve os dados necessários para prosseguir com a consulta."
        confirmLabel="Enviar pedido"
        busy={busyAction}
        onCancel={() => !busyAction && setInfoOpen(false)}
        onConfirm={(v) => { if (cur) pedirMaisInfo(cur, v) }}
      />

      {/* Concluir */}
      <ConcluirModal
        open={concluirOpen}
        busy={busyAction}
        onCancel={() => !busyAction && setConcluirOpen(false)}
        onConfirm={(resumo, enviar) => { if (cur) concluir(cur, resumo, enviar) }}
      />

      {/* Cancelar */}
      <ConfirmModal
        open={confirmCancelOpen}
        title="Cancelar consulta"
        message="Queres mesmo cancelar esta consulta? Esta ação não pode ser desfeita."
        confirmLabel="Sim, cancelar"
        tone="danger"
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmCancelOpen(false)}
        onConfirm={() => { if (cur) cancelar(cur) }}
      />
    </div>
  )
}

/* -------- Modal específico para concluir -------- */
function ConcluirModal({
  open, busy, onCancel, onConfirm,
}: {
  open: boolean; busy?: boolean; onCancel: () => void; onConfirm: (resumo: string, enviar: boolean) => void
}) {
  const [resumo, setResumo] = useState('')
  const [enviar, setEnviar] = useState(true)
  useEffect(() => { if (open) { setResumo(''); setEnviar(true) } }, [open])
  return (
    <ModalBase
      open={open}
      onClose={() => !busy && onCancel()}
      title="Concluir consulta"
      footer={
        <>
          <button onClick={onCancel} disabled={busy}
            className="rounded-lg border-2 border-gray-400 bg-white px-4 py-2 text-gray-950 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40 min-h-[44px]">
            Voltar
          </button>
          <button onClick={() => onConfirm(resumo.trim(), enviar)} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 min-h-[44px]">
            {busy ? 'A concluir…' : 'Concluir'}
          </button>
        </>
      }
    >
      <label htmlFor="concluir-resumo" className="mb-1 block text-sm font-medium">Resumo / resultado (opcional)</label>
      <textarea
        id="concluir-resumo"
        rows={6}
        value={resumo}
        onChange={(e) => setResumo(e.target.value)}
        placeholder="Regista as recomendações, observações ou encaminhamentos."
        className="w-full rounded-lg border-2 border-gray-400 bg-white px-3 py-2 text-gray-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      />
      <label className="mt-3 inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={enviar}
          onChange={(e) => setEnviar(e.target.checked)}
          className="h-5 w-5 accent-emerald-600"
          aria-describedby="enviar-ajuda"
        />
        <span className="text-sm">Enviar resultado por mensagem à família</span>
      </label>
      <p id="enviar-ajuda" className="mt-1 text-xs text-gray-900">
        Se marcado, a família recebe a mensagem imediatamente.
      </p>
    </ModalBase>
  )
}
