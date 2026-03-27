// src/pages/user/Pedido.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FaClock,
  FaTruck,
  FaHome,
  FaBook,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaBoxOpen,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaEdit,
  FaFilter,
  FaSearch,
  FaTimes,
  FaUndoAlt,
} from 'react-icons/fa'
import { toast } from 'sonner'
import {
  RequisicoesAPI,
  PedidosLojaAPI,
  imageUrl,
  parseApiError,
  type RequisicaoDTO,
  type PedidoLojaDTO,
  type PedidoUserRow,
} from '../../api/client'

/* ============================================================================
   Constantes e helpers visuais
============================================================================ */

const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200" style="background:#f3f4f6">
      <rect x="20" y="20" width="120" height="160" rx="6" ry="6" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
      <text x="80" y="110" text-anchor="middle"
        font-family="sans-serif"
        font-size="12"
        fill="#6b7280"
      >
        SEM CAPA
      </text>
    </svg>
  `)

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-PT')
}
function formatTime(h?: string | null) {
  if (!h) return '—'
  return h
}
function formatMoney(v?: number | null) {
  if (v == null) return '0 STN'
  return `${v.toFixed(2)} STN`
}

function badgeClasse(status: PedidoUserRow['status'] | string | undefined) {
  switch (status) {
    case 'pendente':
    case 'PAGAMENTO_PENDENTE':
      return 'bg-amber-100 text-amber-900 border border-amber-200'
    case 'confirmado':
    case 'APROVADO':
    case 'PAGO':
      return 'bg-emerald-100 text-emerald-900 border border-emerald-200'
    case 'rejeitado':
    case 'NEGADA':
    case 'CANCELADO':
      return 'bg-rose-100 text-rose-900 border border-rose-200'
    case 'entregue':
    case 'ENVIADO':
    case 'CONCLUIDO':
      return 'bg-blue-100 text-blue-900 border border-blue-200'
    case 'devolvida':
    case 'DEVOLVIDA':
      return 'bg-gray-100 text-gray-800 border border-gray-300'
    default:
      return 'bg-gray-100 text-gray-800 border border-gray-300'
  }
}
function statusLabel(status: PedidoUserRow['status'] | string | undefined) {
  switch (status) {
    case 'pendente':
    case 'PAGAMENTO_PENDENTE':
      return 'Pendente'
    case 'confirmado':
    case 'APROVADO':
    case 'PAGO':
      return 'Confirmado'
    case 'rejeitado':
    case 'NEGADA':
    case 'CANCELADO':
      return 'Rejeitado'
    case 'entregue':
    case 'ENVIADO':
    case 'CONCLUIDO':
      return 'Entregue'
    case 'devolvida':
    case 'DEVOLVIDA':
      return 'Devolvido'
    default:
      return status ?? '—'
  }
}

/* ============================================================================
   Normalização PARA PedidoUserRow (unificar Loja + Empréstimo)
============================================================================ */

function normalizePedido(r: RequisicaoDTO): PedidoUserRow {
  return {
    ...r,
    createdAt: r.dataPedido ?? null,
    quantidadeSolicitada: r.quantidadeSolicitada ?? 1,
    quantidadeAprovada:
      r.quantidadeAprovada ??
      (['APROVADA', 'ENTREGUE', 'DEVOLVIDA'].includes(r.statusRaw as string) ? 1 : null),
    pagamentoValor: r.pagamentoValor ?? null,
    pagamentoStatus: (r.pagamentoStatus as any) ?? null,
    precoLivro: r.precoLivro ?? null,
    stockAtual: r.stockAtual ?? null,
    dataDevolucaoPrevista: r.dataDevolucaoPrevista ?? null,
    devolvidoEm: r.devolvidoEm ?? null,
  }
}

function normalizePedidoLoja(p: PedidoLojaDTO): PedidoUserRow {
  const statusFront: PedidoUserRow['status'] =
    p.status === 'pendente'
      ? 'pendente'
      : p.status === 'confirmado'
      ? 'confirmado'
      : p.status === 'enviado' || p.status === 'concluido'
      ? 'entregue'
      : p.status === 'cancelado'
      ? 'rejeitado'
      : 'pendente'

  const item0 = p.itens?.[0]

  return {
    id: p.id,
    livroId: item0?.livroId ?? 0,
    livroTitulo: item0?.titulo ?? 'Pedido',
    livroAutor: null,
    livroImagem: item0?.imagem ?? null,
    categoria: null,
    faixa: null,
    tipoAquisicao: 'compra',
    diasDevolucao: null,
    dataDevolucaoPrevista: null,

    nome: p.clienteNome ?? '—',
    dataPedido: p.dataPedido ?? null,

    status: statusFront,

    statusRaw:
      (p.statusRaw as PedidoUserRow['statusRaw']) ??
      (p.status === 'pendente'
        ? 'PAGAMENTO_PENDENTE'
        : p.status === 'confirmado'
        ? 'APROVADO'
        : p.status === 'enviado'
        ? 'ENVIADO'
        : p.status === 'concluido'
        ? 'CONCLUIDO'
        : 'CANCELADO'),

    tipo: (p.entregaTipo ?? '') as '' | 'domicilio' | 'biblioteca',
    dataResposta: null,
    horario: null,
    endereco: p.entregaEndereco,

    motivoRecusa: null,
    entregueEm: null,

    pagamentoStatus: p.pagamentoStatus,
    pagamentoValor: p.totalPago ?? p.total ?? null,

    precoLivro: item0?.precoUnit ?? null,
    stockAtual: null,
    quantidadeSolicitada: item0?.quantidade ?? 1,
    quantidadeAprovada: item0?.quantidade ?? 1,
    devolvidoEm: null,

    createdAt: p.dataPedido ?? null,
  }
}

function isRequisicao(p: PedidoUserRow) {
  const raw = p.statusRaw
  return (
    raw === 'PENDENTE' ||
    raw === 'APROVADA' ||
    raw === 'NEGADA' ||
    raw === 'ENTREGUE' ||
    raw === 'DEVOLVIDA' ||
    raw === 'SAIU_PARA_ENTREGA'
  )
}

/* ============================================================================
   Timeline compacta por pedido
============================================================================ */
function EtapasPedido({ p }: { p: PedidoUserRow }) {
  const raw = p.statusRaw as string | undefined
  const pay = p.pagamentoStatus as string | undefined

  const isPago = pay === 'PAGO' || raw === 'PAGO'
  const isPagamentoPendente = pay === 'PENDENTE' || raw === 'PAGAMENTO_PENDENTE'
  const isPagamentoFalhou = pay === 'FALHOU' || raw === 'PAGAMENTO_FALHOU'

  const pagamentoStep = {
    key: 'pagamento',
    label: isPagamentoFalhou
      ? 'Pagamento falhou'
      : isPagamentoPendente
      ? 'Pagamento pendente'
      : isPago
      ? 'Pago / confirmado'
      : 'Sem pagamento',
    color: isPagamentoFalhou
      ? 'text-rose-700 bg-rose-100 ring-rose-300'
      : isPagamentoPendente
      ? 'text-amber-800 bg-amber-100 ring-amber-300'
      : isPago
      ? 'text-emerald-800 bg-emerald-100 ring-emerald-300'
      : 'text-gray-700 bg-gray-100 ring-gray-300',
    icon: isPagamentoFalhou ? <FaTimesCircle /> : isPago ? <FaMoneyBillWave /> : <FaClock />,
  }

  const isRejeitado = p.status === 'rejeitado' || raw === 'NEGADA' || raw === 'CANCELADO'
  const isPendenteAnalise = p.status === 'pendente' || raw === 'PAGAMENTO_PENDENTE'
  const isConfirmado = p.status === 'confirmado' || raw === 'APROVADO' || raw === 'PAGO'

  const confirmStep = {
    key: 'confirmado',
    label: isConfirmado ? 'Confirmado' : isRejeitado ? 'Rejeitado' : isPendenteAnalise ? 'Em análise' : 'Confirmado',
    color: isRejeitado
      ? 'text-rose-800 bg-rose-100 ring-rose-300'
      : isPendenteAnalise
      ? 'text-amber-800 bg-amber-100 ring-amber-300'
      : 'text-emerald-800 bg-emerald-100 ring-emerald-300',
    icon: isRejeitado ? <FaTimesCircle /> : isPendenteAnalise ? <FaClock /> : <FaCheckCircle />,
  }

  const entregueLike =
    p.status === 'entregue' ||
    p.status === 'devolvida' ||
    raw === 'ENVIADO' ||
    raw === 'CONCLUIDO' ||
    raw === 'ENTREGUE' ||
    raw === 'DEVOLVIDA'

  const entregaStep = {
    key: 'entregue',
    label: entregueLike ? 'Entregue' : '—',
    color: entregueLike ? 'text-blue-800 bg-blue-100 ring-blue-300' : 'text-gray-700 bg-gray-100 ring-gray-300',
    icon: <FaTruck />,
  }

  const isCanceladoFinal = p.status === 'rejeitado' || raw === 'NEGADA' || raw === 'CANCELADO'
  const isDevolvidoFinal = p.status === 'devolvida' || raw === 'DEVOLVIDA'

  const finalStep = {
    key: 'devolvido',
    label: isDevolvidoFinal
      ? 'Devolvido'
      : isCanceladoFinal
      ? 'Cancelado'
      : isConfirmado && !entregueLike
      ? 'P/ levantar'
      : entregueLike
      ? 'Em tua posse'
      : '—',
    color: isDevolvidoFinal
      ? 'text-gray-800 bg-gray-100 ring-gray-300'
      : isCanceladoFinal
      ? 'text-rose-800 bg-rose-100 ring-rose-300'
      : entregueLike
      ? 'text-blue-800 bg-blue-100 ring-blue-300'
      : 'text-gray-700 bg-gray-100 ring-gray-300',
    icon: isCanceladoFinal ? <FaTimesCircle /> : isDevolvidoFinal ? <FaUndoAlt /> : <FaTruck />,
  }

  const steps = [pagamentoStep, confirmStep, entregaStep, finalStep]
  return (
    <ul className="flex flex-wrap gap-1 text-[10px] font-semibold text-gray-700">
      {steps.map((s, idx) => (
        <li key={s.key + idx} className={`inline-flex items-center gap-1 rounded px-2 py-1 ring-1 ${s.color}`}>
          {s.icon}
          <span className="whitespace-nowrap">{s.label}</span>
        </li>
      ))}
    </ul>
  )
}

/* ============================================================================
   Modal de edição (apenas requisições)
============================================================================ */
function EditarPedidoModal({
  open,
  onClose,
  pedido,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  pedido: PedidoUserRow | null
  onSaved: () => Promise<void>
}) {
  const [endereco, setEndereco] = useState('')
  const [entregaTipo, setEntregaTipo] = useState<'domicilio' | 'biblioteca'>('biblioteca')
  const [quantidade, setQuantidade] = useState<number>(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !pedido) return
    setEndereco(pedido.endereco || '')
    setEntregaTipo(pedido.tipo === 'domicilio' ? 'domicilio' : 'biblioteca')
    setQuantidade(pedido.quantidadeSolicitada ?? 1)
    setErr(null)
  }, [open, pedido])

  if (!open || !pedido) return null
  const ped = pedido as PedidoUserRow

  async function guardar() {
    try {
      setBusy(true)
      setErr(null)

      if (ped.id == null) {
        setErr('Pedido inválido (sem ID).')
        return
      }

      if (!isRequisicao(ped)) {
        setErr('Ainda não é possível editar pedidos de compra. (Só requisições por agora.)')
      } else {
        await RequisicoesAPI.editar(Number(ped.id), { entregaTipo, endereco })
        toast.success('Pedido atualizado.')
        await onSaved()
        onClose()
      }
    } catch (e) {
      setErr(parseApiError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />

      <div className="relative z-[201] w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        <header className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Editar pedido #{ped.id}</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Fechar"
          >
            <FaTimes />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-auto px-5 py-4 text-sm text-gray-800">
          <div className="mb-4">
            <p className="mb-1 text-sm font-medium text-gray-900">Onde queres receber / levantar?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 ${
                  entregaTipo === 'domicilio' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-300 bg-gray-50 text-gray-800'
                }`}
              >
                <input
                  type="radio"
                  value="domicilio"
                  checked={entregaTipo === 'domicilio'}
                  onChange={() => setEntregaTipo('domicilio')}
                  className="mt-1 text-blue-700 focus:ring-blue-700"
                />
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <FaHome aria-hidden="true" /> Entrega em casa
                  </div>
                  <p className="text-xs text-gray-600">Vamos entregar na morada indicada.</p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 ${
                  entregaTipo === 'biblioteca' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-300 bg-gray-50 text-gray-800'
                }`}
              >
                <input
                  type="radio"
                  value="biblioteca"
                  checked={entregaTipo === 'biblioteca'}
                  onChange={() => setEntregaTipo('biblioteca')}
                  className="mt-1 text-blue-700 focus:ring-blue-700"
                />
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <FaBook aria-hidden="true" /> Levantar na biblioteca
                  </div>
                  <p className="text-xs text-gray-600">Vais lá buscar pessoalmente.</p>
                </div>
              </label>
            </div>
          </div>

          {entregaTipo === 'domicilio' && (
            <div className="mb-4">
              <label htmlFor="novo-endereco" className="block text-sm font-medium text-gray-900">
                Endereço de entrega
              </label>
              <div className="relative mt-1">
                <FaMapMarkerAlt className="absolute left-3 top-3 text-gray-500" aria-hidden="true" />
                <input
                  id="novo-endereco"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, número, localidade"
                  className="w-full rounded border border-gray-300 p-2 pl-9 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Vamos usar este endereço na entrega.</p>
            </div>
          )}

          <div className="mb-2">
            <p className="mb-1 text-sm font-medium text-gray-900">Quantidade pedida</p>
            <input
              type="number"
              min={1}
              className="w-24 rounded border border-gray-300 p-2 text-sm focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
              value={quantidade}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setQuantidade(isNaN(n) || n < 1 ? 1 : n)
              }}
              disabled
            />
            <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
              <FaExclamationTriangle />
              Alterar quantidade precisa suporte no backend.
            </p>
          </div>

          {err && (
            <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {err}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4 text-sm">
          <button
            disabled={busy}
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            disabled={busy}
            onClick={guardar}
            className="inline-flex items-center rounded-md bg-gradient-to-r from-blue-700 to-purple-700 px-4 py-2 font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {busy ? 'A guardar…' : 'Guardar alterações'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/* ============================================================================
   Página principal — mistura Pedidos (loja) + Requisições (empréstimos)
============================================================================ */
export default function Pedido() {
  const [pedidos, setPedidos] = useState<PedidoUserRow[]>([])
  const [emPosse, setEmPosse] = useState<PedidoUserRow[]>([])
  const [ativos, setAtivos] = useState<PedidoUserRow[]>([])
  const [loading, setLoading] = useState(false)

  // filtros
  const [filtroStatus, setFiltroStatus] = useState<
    '' | 'pendente' | 'confirmado' | 'rejeitado' | 'entregue' | 'devolvida'
  >('')
  const [filtroTipo, setFiltroTipo] = useState<'' | 'domicilio' | 'biblioteca'>('')
  const [searchTerm, setSearchTerm] = useState('')

  // debouce de pesquisa
  const [searchQ, setSearchQ] = useState('')
  const debounceRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => setSearchQ(searchTerm.trim()), 300)
    return () => window.clearTimeout(debounceRef.current)
  }, [searchTerm])

  // edição
  const [editOpen, setEditOpen] = useState(false)
  const [editPedido, setEditPedido] = useState<PedidoUserRow | null>(null)

  useEffect(() => {
    document.title = 'Pedidos'
  }, [])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus]) // refaz quando muda Estado (para filtrar loja no servidor)

  async function carregar() {
    setLoading(true)
    try {
      // 1) empréstimos (todas e em posse) — vêm sempre desc no backend
      const [reqAllRaw, reqPosseRaw] = await Promise.all([
        RequisicoesAPI.minhas(),
        RequisicoesAPI.minhasEmPosse(),
      ])

      // 2) compras (loja) — aplica status no servidor se houver
      let comprasRaw: PedidoLojaDTO[] = []
      try {
        comprasRaw = (await PedidosLojaAPI.minhas()) ?? []
      } catch {
        // rota inexistente → ignora
      }

      // Normalizar
      const reqAll: PedidoUserRow[] = (reqAllRaw as RequisicaoDTO[]).map(normalizePedido)
      const reqPosse: PedidoUserRow[] = (reqPosseRaw as RequisicaoDTO[]).map(normalizePedido)
      const compras: PedidoUserRow[] = (comprasRaw as PedidoLojaDTO[]).map(normalizePedidoLoja)

      // Tudo unido e SEMPRE ordenado (mais recente em cima)
      const tudo: PedidoUserRow[] = [...reqAll, ...compras].sort((a, b) => {
        const da = a.createdAt || a.dataPedido
        const db = b.createdAt || b.dataPedido
        const ta = da ? new Date(da).getTime() : 0
        const tb = db ? new Date(db).getTime() : 0
        return tb - ta
      })

      // ativos: aprovados/pagos/saiu/enviado/entregue e não finalizados
      const ativosList: PedidoUserRow[] = tudo.filter((p) => {
        const raw = p.statusRaw
        const finalizado = raw === 'DEVOLVIDA' || raw === 'CONCLUIDO'
        const entregue = raw === 'ENTREGUE' || raw === 'ENVIADO'
        const aprovadoOuPago = raw === 'APROVADO' || raw === 'PAGO'
        const saiu = raw === 'SAIU_PARA_ENTREGA'
        return !finalizado && (aprovadoOuPago || saiu || entregue)
      })

      setPedidos(tudo)
      setEmPosse(reqPosse)
      setAtivos(ativosList)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }

  // Ordenação defensiva para qualquer atualização
  const pedidosOrdenados = useMemo<PedidoUserRow[]>(() => {
    return [...pedidos].sort((a, b) => {
      const da = a.createdAt || a.dataPedido
      const db = b.createdAt || b.dataPedido
      const ta = da ? new Date(da).getTime() : 0
      const tb = db ? new Date(db).getTime() : 0
      return tb - ta
    })
  }, [pedidos])

  const pedidosFiltrados = useMemo<PedidoUserRow[]>(() => {
    return pedidosOrdenados.filter((p) => {
      if (filtroStatus && p.status !== filtroStatus) return false
      if (filtroTipo && p.tipo !== filtroTipo) return false
      if (searchQ) {
        const k = searchQ.toLowerCase()
        const match =
          (p.livroTitulo || '').toLowerCase().includes(k) ||
          (p.livroAutor || '').toLowerCase().includes(k) ||
          String(p.id).includes(k) ||
          (p.endereco || '').toLowerCase().includes(k)
        if (!match) return false
      }
      return true
    })
  }, [pedidosOrdenados, filtroStatus, filtroTipo, searchQ])

  // 30 min no front (UX); backend usa 15 min — front mostra janela mais generosa
  function dentroDaJanelaDeEdicao(p: PedidoUserRow) {
    const base = p.createdAt ?? p.dataPedido
    if (!base) return false
    const createdMs = new Date(base).getTime()
    const diffMs = Date.now() - createdMs
    const TRINTA_MIN_MS = 30 * 60 * 1000
    return diffMs < TRINTA_MIN_MS
  }

  async function cancelarPedido(p: PedidoUserRow) {
    try {
      if (!isRequisicao(p)) {
        toast.error('Ainda não é possível cancelar pedidos de compra pelo site.')
        return
      }
      await RequisicoesAPI.cancelar(Number(p.id))
      toast.success('Pedido cancelado.')
      await carregar()
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  function abrirEditar(p: PedidoUserRow) {
    setEditPedido(p)
    setEditOpen(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#f8f8ff] to-[#fff8f1] text-gray-900">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto px-7 py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-blue-800">Pedidos</h1>
              <p className="text-sm text-gray-600">
                Compras <b>e</b> requisições no mesmo sítio. Podes alterar morada/levantamento nos primeiros{' '}
                <b>30 minutos</b> (onde permitido).
              </p>
            </div>

            <button
              onClick={carregar}
              className="self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Recarregar
            </button>
          </div>

          {/* Filtros */}
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/80 p-3 text-sm shadow-sm md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex items-center gap-2">
                <FaFilter className="text-gray-600" aria-hidden="true" />
                <div className="flex flex-col">
                  <label htmlFor="filtro-status" className="text-[11px] font-medium text-gray-700">
                    Estado
                  </label>
                  <select
                    id="filtro-status"
                    value={filtroStatus}
                    onChange={(e) =>
                      setFiltroStatus(
                        e.target.value as '' | 'pendente' | 'confirmado' | 'rejeitado' | 'entregue' | 'devolvida',
                      )
                    }
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                  >
                    <option value="">Todos</option>
                    <option value="pendente">Pendente</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="rejeitado">Rejeitado</option>
                    <option value="entregue">Entregue</option>
                    <option value="devolvida">Devolvido</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <label htmlFor="filtro-tipo" className="text-[11px] font-medium text-gray-700">
                    Entrega
                  </label>
                  <select
                    id="filtro-tipo"
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value as '' | 'domicilio' | 'biblioteca')}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                  >
                    <option value="">Todas</option>
                    <option value="domicilio">A domicílio</option>
                    <option value="biblioteca">Levantamento</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <label htmlFor="search-pedido" className="text-[11px] font-medium text-gray-700">
                  Pesquisar
                </label>
                <div className="relative">
                  <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                  <input
                    id="search-pedido"
                    className="w-48 rounded border border-gray-300 bg-white py-1 pl-7 pr-2 text-sm focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                    placeholder="Título, autor, #id…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {(filtroStatus || filtroTipo || searchQ) && (
              <button
                onClick={() => {
                  setFiltroStatus('')
                  setFiltroTipo('')
                  setSearchTerm('')
                }}
                className="inline-flex items-center gap-2 self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
              >
                <FaTimes aria-hidden="true" />
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto px-7 py-6">
        {/* LOADING */}
        {loading && (
          <div role="status" aria-live="polite" className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        )}
 {/* HISTÓRICO */}
        {!loading && (
          <section className="rounded-xl border border-gray-200 bg-white/70 shadow-sm">
            <div className="sticky top-[60px] z-10 -mx-4 border-b border-gray-200 bg-gray-50/70 px-7 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <FaBook />
                <span>Histórico de pedidos (compras e requisições)</span>
                <span className="ml-auto inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {pedidosFiltrados.length}
                </span>
              </div>
            </div>

            {pedidosFiltrados.length === 0 ? (
              <div className="p-6 text-center text-gray-600">Nenhum pedido encontrado com estes filtros.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pedidosFiltrados.map((p) => {
                  const solicitada = p.quantidadeSolicitada ?? 1
                  const aprovada = p.quantidadeAprovada ?? solicitada
                  const reduziu = aprovada !== solicitada

                  const raw = p.statusRaw as string | undefined

                  const podeEditarAgora =
                    dentroDaJanelaDeEdicao(p) &&
                    !(
                      p.status === 'rejeitado' ||
                      raw === 'NEGADA' ||
                      raw === 'CANCELADO' ||
                      p.status === 'devolvida' ||
                      raw === 'DEVOLVIDA' ||
                      p.status === 'entregue' ||
                      raw === 'ENVIADO' ||
                      raw === 'CONCLUIDO' ||
                      raw === 'ENTREGUE'
                    )

                  const podeCancelarAgora =
                    dentroDaJanelaDeEdicao(p) &&
                    (p.status === 'pendente' ||
                      raw === 'PAGAMENTO_PENDENTE' ||
                      p.status === 'confirmado' ||
                      raw === 'APROVADO' ||
                      raw === 'PAGO')

                  return (
                    <article key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClasse(p.status)}`}>
                            {statusLabel(p.status)}
                          </span>

                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-900">
                            #{p.id}
                          </span>

                          {p.tipo === 'domicilio' ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                              <FaHome className="mr-1" />
                              Entrega em casa
                            </span>
                          ) : p.tipo === 'biblioteca' ? (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-900">
                              <FaBook className="mr-1" />
                              Levantar na biblioteca
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 break-words font-semibold text-gray-900">{p.livroTitulo ?? 'Pedido'}</div>

                        <div className="mt-1 text-xs text-gray-700">
                          <span className="font-medium">Pediste:</span> {solicitada}x
                          {reduziu && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300">
                              <FaExclamationTriangle />
                              Aprovado {aprovada}x
                            </span>
                          )}
                        </div>

                        {(p.pagamentoValor != null || p.pagamentoStatus != null) && (
                          <div className="mt-1 text-xs text-gray-700">
                            <FaMoneyBillWave className="mr-1 inline" />
                            <span className="font-medium">Pagamento:</span>{' '}
                            {p.pagamentoStatus === 'PENDENTE'
                              ? 'Pendente'
                              : p.pagamentoStatus === 'FALHOU'
                              ? 'Falhou'
                              : p.pagamentoStatus === 'PAGO'
                              ? 'Concluído'
                              : '—'}
                            {p.pagamentoValor != null && (
                              <>
                                {' '}
                                • <b>{formatMoney(p.pagamentoValor)}</b>
                              </>
                            )}
                          </div>
                        )}

                        <div className="mt-1 text-xs text-gray-700">
                          <FaClock className="mr-1 inline" />
                          Pedido em: {formatDate(p.dataPedido)}
                        </div>

                        {(p.status === 'confirmado' ||
                          raw === 'APROVADO' ||
                          raw === 'PAGO' ||
                          raw === 'ENVIADO' ||
                          raw === 'ENTREGUE' ||
                          raw === 'CONCLUIDO') && (
                          <div className="mt-1 text-xs text-gray-700">
                            <FaCalendarAlt className="mr-1 inline" />
                            Agendado: {p.dataResposta ? formatDate(p.dataResposta) : '—'} {p.horario && `às ${formatTime(p.horario)}`}
                          </div>
                        )}

                        {p.endereco && p.tipo === 'domicilio' && (
                          <div className="mt-1 break-words text-xs text-gray-700">
                            <FaMapMarkerAlt className="mr-1 inline" />
                            {p.endereco}
                          </div>
                        )}

                        {p.dataDevolucaoPrevista &&
                          (p.status === 'entregue' || raw === 'ENVIADO' || p.status === 'confirmado' || raw === 'APROVADO') && (
                            <div className="mt-1 text-xs text-gray-700">
                              <FaCalendarAlt className="mr-1 inline" />
                              <span className="font-medium">Devolver até:</span> {formatDate(p.dataDevolucaoPrevista)}
                            </div>
                          )}

                        <div className="mt-2">
                          <EtapasPedido p={p} />
                        </div>

                        {dentroDaJanelaDeEdicao(p) && (
                          <p className="mt-2 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
                            <FaClock />
                            Ainda podes Alterar/Cancelar este pedido (30 min após criação)
                          </p>
                        )}
                      </div>

                      <div className="flex flex-shrink-0 flex-col items-start gap-2 text-xs text-gray-700 sm:items-end">
                        <div className="flex h-16 w-12 items-center justify-center overflow-hidden rounded bg-orange-50">
                          <img
                            src={imageUrl(p.livroImagem) || FALLBACK_IMG}
                            alt={p.livroTitulo ?? 'Livro'}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).src = FALLBACK_IMG
                            }}
                          />
                        </div>

                        {(p.status === 'confirmado' || raw === 'APROVADO' || raw === 'PAGO') && (
                          <div className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-300">
                            <FaCheckCircle /> Confirmado
                          </div>
                        )}

                        {(p.status === 'rejeitado' || raw === 'NEGADA' || raw === 'CANCELADO') && (
                          <div className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-300">
                            <FaTimesCircle /> Rejeitado
                          </div>
                        )}

                        {(p.status === 'entregue' ||
                          p.status === 'devolvida' ||
                          raw === 'ENVIADO' ||
                          raw === 'CONCLUIDO' ||
                          raw === 'ENTREGUE' ||
                          raw === 'DEVOLVIDA') && (
                          <div className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 ring-1 ring-blue-300">
                            <FaTruck />
                            {p.status === 'devolvida' || raw === 'DEVOLVIDA' ? 'Devolvido' : 'Em mãos'}
                          </div>
                        )}

                        <div className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-800 ring-1 ring-gray-300">
                          <FaBoxOpen />
                          ID {p.id}
                        </div>

                        {podeEditarAgora && (
                          <button
                            onClick={() => abrirEditar(p)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                          >
                            <FaEdit /> Editar
                          </button>
                        )}

                        {podeCancelarAgora && (
                          <button
                            onClick={() => cancelarPedido(p)}
                            className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 shadow-sm hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
                          >
                            <FaTimesCircle /> Cancelar
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}
        
        {/* ATIVOS */}
        {!loading && (
          <section className="mb-8 rounded-xl border border-emerald-200 bg-white/70 shadow-sm">
            <div className="sticky top-[60px] z-10 -mx-4 border-b border-emerald-200 bg-emerald-50/70 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <FaCheckCircle />
                <span>Pedidos ativos (aceites / a caminho / agendados)</span>
                <span className="ml-auto inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {ativos.length}
                </span>
              </div>
            </div>

            {ativos.length === 0 ? (
              <div className="p-6 text-center text-gray-600">Sem pedidos ativos neste momento.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {ativos.map((p) => (
                  <article key={`ativo-${p.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClasse(p.status)}`}>
                          {statusLabel(p.status)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-900">
                          #{p.id}
                        </span>
                        {p.tipo === 'domicilio' ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                            <FaHome className="mr-1" />
                            Entrega em casa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-900">
                            <FaBook className="mr-1" />
                            Levantamento
                          </span>
                        )}
                      </div>

                      <div className="mt-1 break-words font-semibold text-gray-900">{p.livroTitulo ?? 'Pedido'}</div>

                      {(p.pagamentoValor != null || p.pagamentoStatus != null) && (
                        <div className="mt-1 text-xs text-gray-700">
                          <FaMoneyBillWave className="mr-1 inline" />
                          <span className="font-medium">Pagamento:</span>{' '}
                          {p.pagamentoStatus === 'PENDENTE'
                            ? 'Pendente'
                            : p.pagamentoStatus === 'FALHOU'
                            ? 'Falhou'
                            : p.pagamentoStatus === 'PAGO'
                            ? 'Concluído'
                            : '—'}
                          {p.pagamentoValor != null && (
                            <>
                              {' '}
                              • <b>{formatMoney(p.pagamentoValor)}</b>
                            </>
                          )}
                        </div>
                      )}

                      <div className="mt-1 text-xs text-gray-700">
                        <FaClock className="mr-1 inline" />
                        Pedido em: {formatDate(p.dataPedido)}
                      </div>

                      {(p.status === 'confirmado' ||
                        p.statusRaw === 'APROVADO' ||
                        p.statusRaw === 'PAGO' ||
                        p.statusRaw === 'ENVIADO' ||
                        p.statusRaw === 'ENTREGUE' ||
                        p.statusRaw === 'CONCLUIDO') && (
                        <div className="mt-1 text-xs text-gray-700">
                          <FaCalendarAlt className="mr-1 inline" />
                          Agendado: {p.dataResposta ? formatDate(p.dataResposta) : '—'} {p.horario && `às ${formatTime(p.horario)}`}
                        </div>
                      )}

                      {p.endereco && p.tipo === 'domicilio' && (
                        <div className="mt-1 break-words text-xs text-gray-700">
                          <FaMapMarkerAlt className="mr-1 inline" />
                          {p.endereco}
                        </div>
                      )}

                      <div className="mt-2">
                        <EtapasPedido p={p} />
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-start gap-2 text-xs text-gray-700 sm:items-end">
                      <div className="flex h-16 w-12 items-center justify-center overflow-hidden rounded bg-orange-50">
                        <img
                          src={imageUrl(p.livroImagem) || FALLBACK_IMG}
                          alt={p.livroTitulo ?? 'Livro'}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).src = FALLBACK_IMG
                          }}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {/* EM POSSE */}
        {!loading && emPosse.length > 0 && (
          <section className="mb-8 rounded-xl border border-blue-200 bg-white/70 shadow-sm">
            <div className="sticky top-[60px] z-10 -mx-4 border-b border-blue-200 bg-blue-50/70 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                <FaTruck />
                <span>Livros em minha posse</span>
                <span className="ml-auto inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-gray-700">
                  {emPosse.length}
                </span>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {emPosse.map((p) => {
                const solicitada = p.quantidadeSolicitada ?? 1
                const aprovada = p.quantidadeAprovada ?? solicitada
                const reduziu = aprovada !== solicitada

                return (
                  <article key={p.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
                    <div className="flex-shrink-0">
                      <div className="h-20 w-16 overflow-hidden rounded bg-orange-50">
                        <img
                          src={imageUrl(p.livroImagem) || FALLBACK_IMG}
                          alt={p.livroTitulo ?? 'Livro'}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).src = FALLBACK_IMG
                          }}
                        />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClasse(p.status)}`}>
                          {statusLabel(p.status)}
                        </span>

                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-900">
                          #{p.id}
                        </span>

                        {p.tipo === 'domicilio' ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                            <FaTruck className="mr-1" />
                            Entrega ao domicílio
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-900">
                            <FaBook className="mr-1" />
                            Levantado na biblioteca
                          </span>
                        )}
                      </div>

                      <div className="mt-1 font-semibold text-gray-900">{p.livroTitulo}</div>

                      <div className="mt-1 text-xs text-gray-700">
                        <span className="font-medium">Quantidade em mãos:</span> {aprovada}x
                        {reduziu && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300">
                            <FaExclamationTriangle />
                            Pediu {solicitada}x
                          </span>
                        )}
                      </div>

                      {p.dataDevolucaoPrevista && (
                        <div className="mt-1 text-xs text-gray-700">
                          <FaCalendarAlt className="mr-1 inline" />
                          <span className="font-medium">Devolver até:</span> {formatDate(p.dataDevolucaoPrevista)}
                        </div>
                      )}

                      <div className="mt-1 text-xs text-gray-700">
                        <FaClock className="mr-1 inline" />
                        Pedido feito em: {formatDate(p.dataPedido)}
                      </div>

                      {p.endereco && p.tipo === 'domicilio' && (
                        <div className="mt-1 text-xs text-gray-700">
                          <FaMapMarkerAlt className="mr-1 inline" />
                          {p.endereco}
                        </div>
                      )}

                      <div className="mt-2">
                        <EtapasPedido p={p} />
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}


       

        {/* MODAL EDIÇÃO */}
        <EditarPedidoModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          pedido={editPedido}
          onSaved={async () => {
            await carregar()
          }}
        />
      </main>
    </div>
  )
}
