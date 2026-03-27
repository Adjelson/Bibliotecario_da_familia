// src/pages/user/Consultas.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Formik, Form, Field, ErrorMessage, type FormikHelpers } from 'formik'
import * as Yup from 'yup'
import AOS from 'aos'
import 'aos/dist/aos.css'
import { Toaster, toast } from 'sonner'
import {
  CalendarRange,
  Clock3,
  Send,
  History,
  CheckCircle2,
  User2,
  FileText,
  XCircle,
  Video,
  MapPin,
  AlertTriangle,
  Check,
  MessageSquare,
} from 'lucide-react'
import { ConsultasAPI, parseApiError, type ID, type Consulta } from '../../api/client'
import { useAuth } from '../../store/auth'

/** =================== helpers =================== */
function toISODateInputLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function combineLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}
function hmFromISO(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** =================== Estados/rotulagem =================== */
type Status = 'MARCADA' | 'RECUSADA' | 'RETORNADA' | 'CONCLUIDA' | 'CANCELADA'
function statusHuman(s: Status) {
  switch (s) {
    case 'MARCADA': return 'Pendente de confirmação'
    case 'RETORNADA': return 'Pedir informação'
    case 'RECUSADA': return 'Recusada'
    case 'CONCLUIDA': return 'Concluída'
    case 'CANCELADA': return 'Cancelada'
  }
}
function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    MARCADA:   'bg-amber-200 text-amber-950',
    RETORNADA: 'bg-indigo-200 text-indigo-950',
    RECUSADA:  'bg-rose-200 text-rose-950',
    CONCLUIDA: 'bg-emerald-200 text-emerald-950',
    CANCELADA: 'bg-gray-300 text-gray-950',
  }
  return (
    <span
      className={`inline-flex min-h-[28px] items-center rounded-full px-3 py-1 text-xs font-semibold ${map[status]}`}
      aria-label={`Estado: ${statusHuman(status)}`}
    >
      {statusHuman(status)}
    </span>
  )
}

/** =================== Tipos =================== */
type Historico = Pick<
  Consulta,
  | 'id'
  | 'dataHora'
  | 'status'
  | 'bibliotecarioId'
  | 'bibliotecarioNome'
  | 'notas'
> & {
  createdAt?: string
  recusaMotivo?: string | null
  retornoMotivo?: string | null
  resultadoResumo?: string | null
  resultadoEnviadoAt?: string | null
}

type DispResposta = {
  bibliotecarioId: number
  desde: string
  ate: string
  dias: Array<{ data: string; slots: string[] }>
}

/** ===== Validação acessível ===== */
const Schema = Yup.object({
  bibliotecarioId: Yup.number().moreThan(0, 'Escolhe um bibliotecário').required('Escolhe um bibliotecário'),
  metodo: Yup.mixed<'presencial' | 'video'>().oneOf(['presencial', 'video'], 'Escolhe o método').required('Escolhe o método'),
  data: Yup.string().required('Indica a data'),
  hora: Yup.string().required('Indica a hora'),
  notas: Yup.string().trim().max(1000, 'Máx. 1000 caracteres').notRequired(),
}).test('min-3-dias', 'As consultas devem ser marcadas com pelo menos 3 dias de antecedência.', (v) => {
  if (!v) return true
  const { data, hora } = v as any
  if (!data || !hora) return true
  return combineLocalDateTime(data, hora).getTime() >= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).getTime()
})

type FormValues = Yup.InferType<typeof Schema>

/** =================== Modal Genérico =================== */
type ConfirmModalProps = {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}
function ConfirmModal({
  open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Voltar', tone = 'primary', busy = false, onConfirm, onClose,
}: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const lastActiveRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastActiveRef.current = (document.activeElement as HTMLElement) ?? null
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
    focusables?.[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
      if (e.key === 'Tab') {
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
        if (!nodes?.length) return
        const list = Array.from(nodes).filter(n => n.offsetParent !== null)
        const first = list[0], last = list[list.length - 1]
        const active = document.activeElement as HTMLElement
        if (e.shiftKey) {
          if (active === first || !panelRef.current?.contains(active)) { e.preventDefault(); last.focus() }
        } else if (active === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); lastActiveRef.current?.focus?.() }
  }, [open, busy, onClose])

  if (!open) return null
  const btnTone =
    tone === 'danger'
      ? 'bg-rose-700 hover:bg-rose-800 focus-visible:ring-rose-700'
      : 'bg-indigo-700 hover:bg-indigo-800 focus-visible:ring-indigo-700'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        ref={panelRef}
        className="relative z-[101] w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl ring-2 ring-gray-900/10"
      >
        <div className="mb-4 flex items-start gap-3">
          {tone === 'danger'
            ? <div className="rounded-full bg-rose-100 p-2" aria-hidden="true"><AlertTriangle className="h-5 w-5 text-rose-800" /></div>
            : <div className="rounded-full bg-indigo-100 p-2" aria-hidden="true"><Check className="h-5 w-5 text-indigo-800" /></div>}
          <h3 id="confirm-title" className="text-lg font-semibold text-gray-950">{title}</h3>
        </div>
        <div className="text-sm text-gray-900">{message}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 ${btnTone} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy ? 'A processar…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** =================== Modal Responder (RETORNADA) =================== */
function ResponderInfoModal({
  open, onClose, onSubmit, busy,
}: { open: boolean; busy: boolean; onClose: () => void; onSubmit: (texto: string) => void }) {
  const [texto, setTexto] = useState('')
  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (open) { setTexto(''); setTimeout(() => firstFieldRef.current?.focus(), 0) } }, [open])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="retornar-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div className="relative z-[111] w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl ring-2 ring-gray-900/10">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-full bg-indigo-100 p-2" aria-hidden="true"><MessageSquare className="h-5 w-5 text-indigo-800" /></div>
          <h3 id="retornar-title" className="text-lg font-semibold text-gray-950">Enviar informação adicional</h3>
        </div>
        <label htmlFor="texto" className="mb-1 block text-sm font-medium text-gray-950">
          Mensagem ao bibliotecário
        </label>
        <textarea
          id="texto"
          ref={firstFieldRef}
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 text-gray-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
          placeholder="Escreve a informação pedida…"
          aria-describedby="texto-help"
        />
        <p id="texto-help" className="mt-1 text-xs text-gray-800">Inclui dados objetivos. Esta mensagem será anexada ao processo.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onSubmit(texto.trim())}
            disabled={busy || !texto.trim()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'A enviar…' : 'Enviar resposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** =================== Contador de caracteres =================== */
function FormCount({ value, max, id }: { value: string; max: number; id?: string }) {
  const n = value?.length ?? 0
  const pct = Math.min(100, Math.round((n / max) * 100))
  const nearLimit = pct >= 90
  return (
    <p id={id} aria-live="polite" className={`mt-1 text-xs ${nearLimit ? 'text-amber-900' : 'text-gray-800'}`}>
      {n}/{max} {nearLimit ? '(perto do limite)' : ''}
    </p>
  )
}

/** =================== Resumo de erros =================== */
function ErrorSummary({
  errors, submitCount,
}: { errors: Record<string, any>, submitCount: number }) {
  const keys = Object.keys(errors || {})
  if (!submitCount || keys.length === 0) return null
  return (
    <div
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      className="mb-6 rounded-lg border-2 border-rose-700 bg-rose-50 p-4 text-rose-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-700"
    >
      <p className="font-semibold">Existem erros no formulário:</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {keys.map(k => <li key={k}>{String(errors[k])}</li>)}
      </ul>
    </div>
  )
}

/** =================== Componente =================== */
export default function SolicitarConsulta() {
  const accessToken = useAuth((s) => s.accessToken)
  const role = useAuth((s) => s.user?.role)
  const isLogged = !!accessToken
  const isPai = role === 'PAI'

  const [bibliotecarios, setBibliotecarios] = useState<Array<{ id: number; name: string | null; email: string | null }>>([])
  const [consultas, setConsultas] = useState<Historico[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // disponibilidade
  const [dispLoading, setDispLoading] = useState(false)
  const [dispRange, setDispRange] = useState<{ desde: string; ate: string } | null>(null)
  const [dispMap, setDispMap] = useState<Record<string, string[]>>({})
  const dispLiveRef = useRef<HTMLParagraphElement>(null)

  // modais
  const [confirmCreate, setConfirmCreate] = useState<null | { values: FormValues; actions: FormikHelpers<FormValues> }>(null)
  const [busyCreate, setBusyCreate] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState<null | { id: ID; label: string }>(null)
  const [busyCancel, setBusyCancel] = useState(false)
  const [replyId, setReplyId] = useState<ID | null>(null)
  const [busyReply, setBusyReply] = useState(false)

  // reload histórico
  const [histVersion, setHistVersion] = useState(0)

  const minDateISO = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return toISODateInputLocal(d)
  }, [])

  // AOS + bootstrap data
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    AOS.init({ duration: reduce ? 0 : 600, once: true, offset: 72, easing: 'ease-out-cubic', disable: reduce })
    document.title = 'Agendar consulta • Bibliotecário de Família'
    ;(async () => {
      try {
        const bib = await ConsultasAPI.bibliotecarios()
        setBibliotecarios(bib)
      } catch (e) {
        toast.error(parseApiError(e))
      }
    })()
  }, [])

  async function carregarHistorico() {
    if (!isLogged || !isPai) return
    try {
      const list = await ConsultasAPI.listar({ page: 1, pageSize: 50 })
      setConsultas((list.items ?? []) as Historico[])
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }
  useEffect(() => { carregarHistorico() }, [isLogged, isPai, histVersion])

  // ✅ AJUSTE: nova assinatura de disponibilidade — recebe um objeto
  async function carregarDisponibilidade(bibliotecarioId: number, dias = 21) {
    setDispLoading(true)
    try {
      const res = (await ConsultasAPI.disponibilidade({ bibliotecarioId, dias })) as DispResposta
      const map: Record<string, string[]> = {}
      res.dias.forEach((d) => { map[d.data] = d.slots })
      setDispMap(map)
      setDispRange({ desde: res.desde, ate: res.ate })
      const de = new Date(res.desde).toLocaleDateString('pt-PT')
      const ate = new Date(res.ate).toLocaleDateString('pt-PT')
      if (dispLiveRef.current) dispLiveRef.current.textContent = `Disponibilidade carregada de ${de} a ${ate}.`
      return res
    } catch (e) {
      setDispMap({})
      setDispRange(null)
      if (dispLiveRef.current) dispLiveRef.current.textContent = 'Falha ao carregar disponibilidade.'
      toast.error(parseApiError(e))
      throw e
    } finally {
      setDispLoading(false)
    }
  }

  const doCreate = async (values: FormValues, actions: FormikHelpers<FormValues>) => {
    const { resetForm, setSubmitting } = actions
    const iso = `${values.data}T${values.hora}:00`
    setBusyCreate(true)
    try {
      await toast.promise(
        ConsultasAPI.criar({
          dataHora: iso,
          bibliotecarioId: Number(values.bibliotecarioId),
          metodo: values.metodo === 'video' ? 'VIDEO' : 'PRESENCIAL',
          notas: values.notas?.trim() || undefined,
        }),
        {
          loading: 'A agendar…',
          success: 'Pedido enviado. Fica pendente até confirmação.',
          error: (e) => {
            const msg = String(parseApiError(e) ?? '')
            if (/409|conflito|ocupad/i.test(msg) || /existe consulta/i.test(msg)) return 'Esse horário ficou indisponível. Escolhe outro.'
            return msg
          },
        },
      )
      setHistVersion(v => v + 1)
      setShowHistory(true)
      resetForm()
      setConfirmCreate(null)
      window.location.reload();  
    } finally {
      setSubmitting(false)
      setBusyCreate(false)
    }
  }

  const handleCancelar = async (id: ID, label?: string) => {
    setBusyCancel(true)
    try {
      const up = await ConsultasAPI.cancelar(Number(id))
      setConsultas(prev => prev.map(c => (c.id === up.id ? { ...c, status: up.status } as Historico : c)))
      toast.success(label ? `Consulta cancelada: ${label}` : 'Consulta cancelada.')
      setConfirmCancel(null)
      setHistVersion(v => v + 1)
      window.location.reload();  
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setBusyCancel(false)
    }
  }

  // ✅ AJUSTE: nova assinatura de responder — segundo argumento é string simples
  const handleResponderInfo = async (id: ID, texto: string) => {
    setBusyReply(true)
    try {
      await toast.promise(
        ConsultasAPI.responder(Number(id), texto),
        { loading: 'A enviar…', success: 'Informação enviada.', error: (e) => parseApiError(e) || 'Falha ao enviar' }
      )
      setReplyId(null)
      setHistVersion(v => v + 1)
      window.location.reload();  
    } finally {
      setBusyReply(false)
    }
  }

  function diasValidosLista(map: Record<string, string[]>) {
    return Object.keys(map).filter(d => d >= minDateISO && (map[d]?.length ?? 0) > 0).sort()
  }

  return (
    <div className="relative min-h-screen overflow-hidden  text-gray-950">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-indigo-700"
      >
        Ir para o conteúdo principal
      </a>
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 h-[38rem] w-[38rem] rounded-full bg-gradient-to-tr from-purple-300/60 to-blue-300/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-yellow-300/50 to-rose-200/40 blur-3xl" />

      <Toaster position="top-center" richColors closeButton />

      {/* live regions */}
      <p ref={dispLiveRef} className="sr-only" aria-live="polite" />
      <p id="global-status" className="sr-only" aria-live="polite" />

      <main id="main-content" role="main" className="relative z-10 mx-auto max-w-5xl px-3 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-800 to-purple-900 md:text-4xl">
            Agendar consulta com o Bibliotecário
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-base text-gray-800">
            Preenche os campos abaixo. O pedido ficará associado à tua família via sessão iniciada.
          </p>
        </header>

        {/* Aviso sessão */}
        {!isLogged || !isPai ? (
          <div
            className="mx-auto mb-8 max-w-3xl rounded-lg border-2 border-amber-700/40 bg-amber-50 p-4 text-amber-950"
            role="note"
            aria-label="Aviso de sessão"
          >
            Para agendar, inicia sessão com um perfil de <b>família (PAI)</b>.
          </div>
        ) : null}

        {/* Toggle histórico */}
        <div className="mb-4 flex items-center justify-end gap-3">
          <button
            type="button"
            aria-expanded={showHistory}
            aria-controls="history-panel"
            onClick={() => setShowHistory((s) => !s)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-indigo-700/30 bg-indigo-50 px-3 py-2 text-sm font-medium text-gray-950 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
          >
            <History aria-hidden="true" className="h-4 w-4" />
            {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
          </button>
        </div>

        {/* Histórico */}
        {showHistory && (
          <section
            id="history-panel"
            aria-label="Histórico de consultas"
            className="mb-8 rounded-2xl border-2 border-gray-300 bg-white p-6 shadow-sm"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-950">
              <History aria-hidden="true" className="h-5 w-5" />
              Histórico de consultas
            </h2>

            {consultas.length === 0 ? (
              <p role="status" className="mt-3 text-sm text-gray-900">
                Ainda não tens consultas registadas.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 md:grid-cols-2">
                {consultas.map((c) => {
                  const d = new Date(c.dataHora)
                  const dataStr = d.toLocaleDateString('pt-PT')
                  const horaStr = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
                  const acessivel = `${c.bibliotecarioNome ? `com ${c.bibliotecarioNome}, ` : ''}${dataStr} às ${horaStr}`

                  return (
                    <li key={String(c.id)}>
                      <article className="rounded-xl border-2 border-gray-300 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-medium text-gray-950 truncate">
                              {c.bibliotecarioNome ? `Com ${c.bibliotecarioNome}` : 'Consulta'}
                            </h3>
                            <p className="text-xs text-gray-800">
                              Solicitada em {c.createdAt ? new Date(c.createdAt).toLocaleString('pt-PT') : '—'}
                            </p>
                          </div>
                          <StatusPill status={c.status as Status} />
                        </div>

                        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <dt className="text-gray-800">Data</dt>
                            <dd className="font-medium text-gray-950">{dataStr}</dd>
                          </div>
                          <div>
                            <dt className="text-gray-800">Hora</dt>
                            <dd className="font-medium text-gray-950">{horaStr}</dd>
                          </div>

                          <div className="col-span-2">
                            {c.status === 'MARCADA' && (
                              <div className="mt-2 rounded-lg border-2 border-amber-700/30 bg-amber-50 p-3 text-gray-950">
                                <p className="text-sm">
                                  Pedido <b>pendente de confirmação</b>. Podes cancelar se necessário.
                                </p>
                              </div>
                            )}
                            {c.status === 'RETORNADA' && (
                              <div className="mt-2 space-y-2">
                                <div className="rounded-lg border-2 border-indigo-700/30 bg-indigo-50 p-3 text-gray-950">
                                  <p className="text-sm">
                                    O bibliotecário pediu mais informação {c.retornoMotivo ? `— ${c.retornoMotivo}` : ''}.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setReplyId(c.id)}
                                  className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-indigo-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
                                  aria-label={`Responder informação para a consulta ${acessivel}`}
                                  title="Responder informação"
                                >
                                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                                  Responder informação
                                </button>
                              </div>
                            )}
                            {c.status === 'RECUSADA' && (
                              <div className="mt-2 rounded-lg border-2 border-rose-700/30 bg-rose-50 p-3 text-gray-950">
                                <p className="text-sm">
                                  Consulta <b>recusada</b>{c.recusaMotivo ? ` — ${c.recusaMotivo}` : ''}.
                                </p>
                              </div>
                            )}
                            {c.status === 'CONCLUIDA' && (
                              <div className="mt-2 rounded-lg border-2 border-emerald-700/30 bg-emerald-50 p-3 text-gray-950">
                                <p className="text-sm">
                                  Consulta concluída. {c.resultadoResumo ? <><b>Resumo:</b> <span className="whitespace-pre-line">{c.resultadoResumo}</span></> : 'Sem resumo registado.'}
                                </p>
                                {c.resultadoEnviadoAt && (
                                  <p className="mt-1 text-xs text-gray-900">
                                    Enviado em {new Date(c.resultadoEnviadoAt).toLocaleString('pt-PT')}.
                                  </p>
                                )}
                              </div>
                            )}
                            {c.status === 'CANCELADA' && (
                              <div className="mt-2 rounded-lg border-2 border-gray-400 bg-gray-50 p-3 text-gray-950">
                                <p className="text-sm">Consulta cancelada.</p>
                              </div>
                            )}
                          </div>
                        </dl>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {c.status === 'MARCADA' && (
                            <button
                              type="button"
                              onClick={() => setConfirmCancel({ id: c.id, label: acessivel })}
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-rose-700/40 bg-rose-50 px-3 py-2 text-xs font-medium text-gray-950 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700"
                              title="Cancelar consulta"
                              aria-label={`Cancelar consulta ${acessivel}`}
                            >
                              <XCircle aria-hidden="true" className="h-4 w-4" /> Cancelar
                            </button>
                          )}
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {/* Formulário */}
        <section
          aria-labelledby="form-title"
          className="rounded-2xl border-2 border-gray-300 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 id="form-title" className="mb-2 text-xl font-semibold text-gray-950">
            Formulário de marcação
          </h2>
          <p className="mb-6 text-sm text-gray-900">
            Campos com <span aria-hidden="true" className="font-semibold text-gray-950">*</span> são obrigatórios.
          </p>

          <Formik<FormValues>
            initialValues={{ bibliotecarioId: 0, metodo: '' as any, data: '', hora: '', notas: '' }}
            validationSchema={Schema}
            onSubmit={(values, actions) => { setConfirmCreate({ values, actions }) }}
            validateOnBlur
            validateOnChange
          >
            {({ isSubmitting, setFieldValue, values, errors, touched, submitCount }) => {
              const diasValidos = diasValidosLista(dispMap)
              const slotsISO = dispMap[values.data] ?? []
              const optionsHora = slotsISO.map((iso) => ({
                value: hmFromISO(iso),
                label: new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
              }))

              return (
                <Form
                  className="space-y-6"
                  aria-describedby="form-hint"
                  aria-busy={isSubmitting ? 'true' : 'false'}
                  noValidate
                >
                  <span id="form-hint" className="sr-only">Preenche os campos obrigatórios antes de enviar.</span>

                  <ErrorSummary errors={errors as any} submitCount={submitCount} />

                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Bibliotecário */}
                    <div>
                      <label htmlFor="bibliotecarioId" className="mb-1 block text-sm font-medium text-gray-950">
                        Bibliotecário <span aria-hidden="true" className="text-rose-800">*</span>
                      </label>
                      <div className="relative">
                        <Field
                          as="select"
                          id="bibliotecarioId"
                          name="bibliotecarioId"
                          onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => {
                            const id = Number(e.target.value) || 0
                            setFieldValue('bibliotecarioId', id)
                            setFieldValue('data', '')
                            setFieldValue('hora', '')
                            setDispMap({})
                            setDispRange(null)
                            if (id > 0) {
                              const res = await carregarDisponibilidade(id, 21)
                              const primeiroDia = res.dias.find(d => d.data >= minDateISO && d.slots.length > 0)
                              if (primeiroDia) {
                                setFieldValue('data', primeiroDia.data)
                                setFieldValue('hora', hmFromISO(primeiroDia.slots[0]))
                              }
                            }
                          }}
                          aria-required="true"
                          aria-invalid={!!(touched.bibliotecarioId && errors.bibliotecarioId)}
                          aria-describedby="bibliotecarioId-help bibliotecarioId-error"
                          className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 pr-10 text-gray-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
                        >
                          <option value="">Seleciona…</option>
                          {bibliotecarios.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name ?? `#${b.id}`}{b.email ? ` — ${b.email}` : ''}
                            </option>
                          ))}
                        </Field>
                        <User2 aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-indigo-800" />
                      </div>
                      <p id="bibliotecarioId-help" className="mt-1 text-xs text-gray-800">Escolhe quem vai atender.</p>
                      <ErrorMessage name="bibliotecarioId" render={(msg) => (
                        <div id="bibliotecarioId-error" role="alert" className="mt-1 text-sm text-rose-900">{msg}</div>
                      )} />
                      {dispRange && (
                        <p className="mt-2 text-xs text-gray-900" aria-live="polite">
                          Horários carregados entre <span className="font-medium">{new Date(dispRange.desde).toLocaleDateString('pt-PT')}</span> e <span className="font-medium">{new Date(dispRange.ate).toLocaleDateString('pt-PT')}</span>.
                          {dispLoading ? ' (a atualizar…)' : ''}
                        </p>
                      )}
                    </div>

                    {/* Método */}
                    <fieldset aria-required="true" className="rounded-lg border border-gray-400 p-3">
                      <legend className="px-1 text-sm font-medium text-gray-950">
                        Método da consulta <span aria-hidden="true" className="text-rose-800">*</span>
                      </legend>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input id="metodo-presencial" type="radio" name="metodo" value="presencial" className="sr-only" onChange={() => setFieldValue('metodo', 'presencial')} />
                        <label
                          htmlFor="metodo-presencial"
                          className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${values.metodo === 'presencial' ? 'border-indigo-700 ring-2 ring-indigo-700' : 'border-gray-400'}`}
                        >
                          <MapPin aria-hidden="true" className="h-5 w-5" /> Presencial
                        </label>

                        <input id="metodo-video" type="radio" name="metodo" value="video" className="sr-only" onChange={() => setFieldValue('metodo', 'video')} />
                        <label
                          htmlFor="metodo-video"
                          className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${values.metodo === 'video' ? 'border-indigo-700 ring-2 ring-indigo-700' : 'border-gray-400'}`}
                        >
                          <Video aria-hidden="true" className="h-5 w-5" /> Videochamada
                        </label>
                      </div>
                      {touched.metodo && errors.metodo ? (
                        <div role="alert" className="mt-2 text-sm text-rose-900">{errors.metodo as string}</div>
                      ) : null}
                    </fieldset>

                    {/* Data */}
                    <div>
                      <label htmlFor="data" className="mb-1 block text-sm font-medium text-gray-950">
                        Data <span aria-hidden="true" className="text-rose-800">*</span>
                      </label>
                      <div className="relative">
                        <Field
                          as="select"
                          id="data"
                          name="data"
                          aria-label="Data"
                          aria-required="true"
                          aria-invalid={!!(touched.data && errors.data)}
                          aria-describedby="data-error data-help"
                          disabled={!values.bibliotecarioId || dispLoading || diasValidos.length === 0}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const d = e.target.value
                            setFieldValue('data', d)
                            const possiveis = (dispMap[d] ?? []).map(hmFromISO)
                            setFieldValue('hora', possiveis[0] ?? '')
                          }}
                          className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 pr-10 text-gray-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
                        >
                          {!values.bibliotecarioId || diasValidos.length === 0 ? (
                            <option value="">{dispLoading ? 'A carregar…' : 'Escolhe o bibliotecário'}</option>
                          ) : (
                            diasValidos.map((d) => (
                              <option key={d} value={d}>
                                {new Date(d).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })}
                              </option>
                            ))
                          )}
                        </Field>
                        <CalendarRange aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-indigo-800" />
                      </div>
                      <p id="data-help" className="mt-1 text-xs text-gray-800">Mostra apenas dias com horários disponíveis (≥ 3 dias).</p>
                      <ErrorMessage name="data" render={(msg) => (
                        <div id="data-error" role="alert" className="mt-1 text-sm text-rose-900">{msg}</div>
                      )} />
                      {!dispLoading && (dispMap[values.data]?.length ?? 0) === 0 && values.bibliotecarioId ? (
                        <p className="mt-2 text-xs text-amber-900">Sem horários para este dia. Escolhe outra data.</p>
                      ) : null}
                    </div>

                    {/* Hora */}
                    <div>
                      <label htmlFor="hora" className="mb-1 block text-sm font-medium text-gray-950">
                        Hora <span aria-hidden="true" className="text-rose-800">*</span>
                      </label>
                      <div className="relative">
                        <Field
                          as="select"
                          id="hora"
                          name="hora"
                          aria-label="Hora"
                          aria-required="true"
                          aria-invalid={!!(touched.hora && errors.hora)}
                          aria-describedby="hora-error hora-help"
                          disabled={!values.data || !values.bibliotecarioId || dispLoading || optionsHora.length === 0}
                          className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 pr-10 text-gray-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFieldValue('hora', e.target.value)}
                        >
                          {!values.data || optionsHora.length === 0 ? (
                            <option value="">{dispLoading ? 'A carregar…' : 'Seleciona a data'}</option>
                          ) : (
                            optionsHora.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)
                          )}
                        </Field>
                        <Clock3 aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-indigo-800" />
                      </div>
                      <p id="hora-help" className="mt-1 text-xs text-gray-800">Slots já consideram bloqueios e outras consultas.</p>
                      <ErrorMessage name="hora" render={(msg) => (
                        <div id="hora-error" role="alert" className="mt-1 text-sm text-rose-900">{msg}</div>
                      )} />
                    </div>

                    {/* Notas */}
                    <div className="md:col-span-2">
                      <label htmlFor="notas" className="mb-1 block text-sm font-medium text-gray-950">
                        Notas <span className="text-gray-800">(opcional)</span>
                      </label>
                      <div className="relative">
                        <Field
                          as="textarea"
                          rows={5}
                          id="notas"
                          name="notas"
                          aria-describedby="notas-help notas-count"
                          className="w-full rounded-lg border border-gray-400 bg-white px-4 py-3 pr-10 text-gray-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
                          placeholder="Informações úteis para a mediação (ex.: preferências, dificuldades, etc.)"
                        />
                        <FileText aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-indigo-800" />
                      </div>
                      <p id="notas-help" className="mt-1 text-xs text-gray-800">Máximo de 1000 caracteres.</p>
                      <FormCount value={values.notas ?? ''} max={1000} id="notas-count" />
                      <ErrorMessage name="notas" render={(msg) => (
                        <div role="alert" className="mt-1 text-sm text-rose-900">{msg}</div>
                      )} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="submit"
                      aria-disabled={!isLogged || !isPai}
                      disabled={!isLogged || !isPai}
                      className="group relative inline-flex w-full min-h-[48px] items-center justify-center gap-2 overflow-hidden rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                      title={!isLogged || !isPai ? 'Inicia sessão como família para agendar' : 'Enviar'}
                    >
                      <span aria-hidden="true" className="absolute inset-0 -translate-x-full bg-white/10 transition group-hover:translate-x-0" />
                      <Send aria-hidden="true" className="h-5 w-5" />
                      {isSubmitting ? 'A validar…' : 'Enviar solicitação'}
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
                    </button>
                  </div>
                </Form>
              )
            }}
          </Formik>
        </section>
      </main>

      {/* Modal confirmar criação */}
      <ConfirmModal
        open={!!confirmCreate}
        title="Confirmar agendamento"
        busy={busyCreate}
        confirmLabel="Confirmar agendamento"
        cancelLabel="Voltar e editar"
        onClose={() => !busyCreate && setConfirmCreate(null)}
        onConfirm={() => { if (!confirmCreate) return; doCreate(confirmCreate.values, confirmCreate.actions) }}
        message={
          confirmCreate && (() => {
            const v = confirmCreate.values
            const dt = new Date(`${v.data}T${v.hora}:00`)
            return (
              <div className="space-y-2">
                <p className="text-gray-950">Revê os detalhes:</p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li><span className="font-medium text-gray-950">Bibliotecário:</span> {String(v.bibliotecarioId)}</li>
                  <li><span className="font-medium text-gray-950">Data:</span> {dt.toLocaleDateString('pt-PT')}</li>
                  <li><span className="font-medium text-gray-950">Hora:</span> {dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</li>
                  <li className="flex items-center gap-2">
                    <span className="font-medium text-gray-950">Método:</span>
                    {v.metodo === 'video' ? <><Video className="h-4 w-4" aria-hidden="true" /> Videochamada</> : <><MapPin className="h-4 w-4" aria-hidden="true" /> Presencial</>}
                  </li>
                  {v.notas?.trim() ? (<li><span className="font-medium text-gray-950">Notas:</span> <span className="whitespace-pre-line">{v.notas.trim()}</span></li>) : null}
                </ul>
                <p className="mt-3 text-xs text-gray-900">Ao confirmar, o pedido fica pendente até o bibliotecário aceitar.</p>
              </div>
            )
          })()
        }
      />

      {/* Modal cancelar */}
      <ConfirmModal
        open={!!confirmCancel}
        title="Cancelar consulta?"
        tone="danger"
        busy={busyCancel}
        confirmLabel="Sim, cancelar"
        cancelLabel="Não, manter"
        onClose={() => !busyCancel && setConfirmCancel(null)}
        onConfirm={() => { if (!confirmCancel) return; handleCancelar(confirmCancel.id, confirmCancel.label) }}
        message={
          confirmCancel && (
            <div className="space-y-2 text-sm">
              <p>Queres cancelar a consulta <span className="font-medium text-gray-950">{confirmCancel.label}</span>?</p>
              <p className="text-gray-900">Esta ação não pode ser desfeita.</p>
            </div>
          )
        }
      />

      {/* Modal responder (RETORNADA) */}
      <ResponderInfoModal
        open={replyId != null}
        busy={busyReply}
        onClose={() => !busyReply && setReplyId(null)}
        onSubmit={(texto) => { if (replyId == null) return; handleResponderInfo(replyId, texto) }}
      />
    </div>
  )
}
