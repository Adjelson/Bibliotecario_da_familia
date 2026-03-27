// client/src/pages/Requisicoes.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  FaBook,
  FaSearch,
  FaFilter,
  FaShoppingCart,
  FaTimes,
  FaBoxes,
  FaEye,
  FaChevronLeft,
  FaChevronRight,
  FaMinus,
  FaSync,
  FaTrash,
  FaMapMarkerAlt,
  FaExternalLinkAlt,
  FaInfoCircle,
  FaCheck,
} from 'react-icons/fa'
import { toast } from 'sonner'
import {
  LivrosAPI,
  CarrinhoAPI,
  // RequisicoesAPI, // <- não usamos mais aqui
  parseApiError,
  imageUrl,
  type Livro,
} from '../../api/client'

/* =========================
   Utils
========================= */
const svgPlaceholder = (txt = 'Sem imagem') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'>
      <rect width='100%' height='100%' fill='#eef2f7'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
            font-family='system-ui,Segoe UI,Roboto,Ubuntu' font-size='16' fill='#374151'>
        ${txt}
      </text>
    </svg>`
  )}`

const PLACEHOLDER = svgPlaceholder()

const fmtMoney = (v?: number | null) =>
  typeof v === 'number' ? `STN ${v.toFixed(2)}` : '—'

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n))

function resolveImgPath(src?: string | null) {
  const s = (src ?? '').trim()
  if (!s) return PLACEHOLDER
  if (/^https?:\/\//i.test(s)) return s
  try {
    const u = imageUrl ? imageUrl(s) : s
    return u || PLACEHOLDER
  } catch {
    return PLACEHOLDER
  }
}

/* =========================
   Componentes pequenos
========================= */
function Stepper({ steps, active }: { steps: string[]; active: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-3 text-sm">
      {steps.map((s, i) => {
        const done = i < active
        const isActive = i === active
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={[
                'grid h-6 w-6 place-items-center rounded-full text-xs font-bold',
                done
                  ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300'
                  : isActive
                    ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300'
                    : 'bg-gray-100 text-gray-800',
              ].join(' ')}
              aria-current={isActive ? 'step' : undefined}
            >
              {done ? <FaCheck /> : i + 1}
            </span>
            <span className={done ? 'text-emerald-800 font-medium' : isActive ? 'text-blue-800 font-medium' : 'text-gray-700'}>
              {s}
            </span>
            {i < steps.length - 1 && <span className="mx-1 text-gray-400">/</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  disableBackdropClose = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  footer?: React.ReactNode
  disableBackdropClose?: boolean
}) {
  if (!open) return null
  const maxW =
    size === 'sm'
      ? 'sm:max-w-md'
      : size === 'md'
        ? 'sm:max-w-2xl'
        : size === 'lg'
          ? 'sm:max-w-3xl'
          : size === 'xl'
            ? 'sm:max-w-5xl'
            : 'sm:max-w-[1100px]'
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30"
        role="button"
        aria-label="Fechar"
        onClick={() => { if (!disableBackdropClose) onClose() }}
      />
      <div className={`relative z-[10000] w-full rounded-2xl bg-white p-4 shadow-xl ${maxW}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full bg-gray-100 p-2 hover:bg-gray-200"
            aria-label="Fechar"
          >
            <FaTimes />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto pr-1">{children}</div>
        {footer ? <div className="mt-4 border-t pt-3">{footer}</div> : null}
      </div>
    </div>
  )
}

function ConfirmModal({
  open, title = 'Confirmar', message,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  onConfirm, onCancel, busy = false, tone = 'blue',
}: {
  open: boolean; title?: string; message: string | React.ReactNode
  confirmLabel?: string; cancelLabel?: string
  onConfirm: () => void; onCancel: () => void
  busy?: boolean; tone?: 'blue' | 'red' | 'emerald'
}) {
  if (!open) return null
  const color =
    tone === 'red'
      ? 'bg-red-700 hover:bg-red-800 focus-visible:ring-red-700'
      : tone === 'emerald'
        ? 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-700'
        : 'bg-blue-700 hover:bg-blue-800 focus-visible:ring-blue-700'
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onCancel() }}
      title={title}
      size="sm"
      disableBackdropClose={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded border px-4 py-2 hover:bg-gray-50 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy} className={`rounded px-4 py-2 text-white ${color} disabled:opacity-50`}>
            {busy ? 'A processar…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-sm text-gray-800">{message}</div>
    </Modal>
  )
}

function SuccessModal({ open, title = 'Operação concluída', message, onClose }:{
  open: boolean; title?: string; message: string | React.ReactNode; onClose: () => void
}) {
  if (!open) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800">
            Fechar
          </button>
        </div>
      }
    >
      <div className="text-sm text-gray-800">{message}</div>
    </Modal>
  )
}

/* =========================
   UI preço / badges
========================= */
function BadgePreco({ livro }: { livro: Livro }) {
  const isCompra = typeof livro.preco === 'number'
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
        isCompra
          ? 'bg-indigo-50 text-indigo-900 ring-indigo-200'
          : 'bg-emerald-50 text-emerald-900 ring-emerald-200',
      ].join(' ')}
    >
      {isCompra ? fmtMoney(livro.preco) : 'Requisição'}
    </span>
  )
}

/* =====================================================================
   MAPA — leve (OpenStreetMap embed)
===================================================================== */
function MapPreview({
  coords,
  onUseMyLocation,
  busy,
  error,
}: {
  coords: { lat: number; lng: number } | null
  onUseMyLocation: () => void
  busy: boolean
  error: string | null
}) {
  const url = coords
    ? `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`
    : null
  const embed = coords
    ? `https://www.openstreetmap.org/export/embed.html?marker=${coords.lat}%2C${coords.lng}&bbox=${coords.lng-0.002}%2C${coords.lat-0.002}%2C${coords.lng+0.002}%2C${coords.lat+0.002}`
    : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded border px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          <FaMapMarkerAlt /> {busy ? 'A obter…' : 'Usar minha localização'}
        </button>
        {coords && (
          <>
            <span className="text-xs text-gray-600 inline-flex items-center gap-1">
              <FaExternalLinkAlt /> {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
            {url && (
              <a className="text-xs text-blue-700 underline" target="_blank" rel="noreferrer" href={url}>
                Abrir no mapa
              </a>
            )}
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {embed && (
        <div className="rounded border overflow-hidden">
          <iframe
            title="Mapa"
            src={embed}
            className="w-full h-56"
            loading="lazy"
          />
        </div>
      )}
    </div>
  )
}

/* =====================================================================
   MODAL DE DETALHES
===================================================================== */
function DetalhesModal({
  open, onClose, livro, onAdd,
}: {
  open: boolean; onClose: () => void; livro: Livro | null; onAdd: (livro: Livro) => void
}) {
  if (!open || !livro) return null
  const imgSrc = resolveImgPath(livro.imagem)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes do livro"
      size="lg"
      footer={
        <div className="flex justify-between gap-2">
          <button onClick={onClose} className="rounded border px-4 py-2 hover:bg-gray-50">Fechar</button>
          <button onClick={() => onAdd(livro)} className="rounded bg-gradient-to-r from-blue-700 to-purple-700 px-4 py-2 text-white font-semibold">
            {livro.preco == null ? 'Adicionar (requisitar)' : `Adicionar (comprar ${fmtMoney(livro.preco)})`}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-[220px,1fr] gap-4">
        <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-center">
          <img
            src={imgSrc}
            alt={`Capa do livro: ${livro.titulo}`}
            className="w-full h-64 object-contain"
            onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = PLACEHOLDER }}
          />
        </div>
        <div className="space-y-2 text-sm text-gray-800">
          <h4 className="text-xl font-bold text-purple-800">{livro.titulo}</h4>
          <p className="italic">{livro.autor || 'Autor desconhecido'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <BadgePreco livro={livro} />
            <span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
              <FaBoxes aria-hidden /> {livro.quantidade ?? 0}{' '}
              {livro.tipoAquisicao === 'emprestimo' ? 'stock' : 'unid.'}
            </span>
            {livro.faixaEtaria ? (
              <span className="inline-flex items-center gap-1 text-blue-800 bg-blue-50 px-2 py-0.5 rounded">
                <FaInfoCircle /> {livro.faixaEtaria}
              </span>
            ) : null}
          </div>
          {livro.descricao ? (
            <p className="text-gray-700 whitespace-pre-wrap mt-2">{livro.descricao}</p>
          ) : (
            <p className="text-gray-500 mt-2">Sem descrição.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* =====================================================================
   CHECKOUT (tudo pelo carrinho)
===================================================================== */
type CartLine = {
  id: number
  livroId: number
  titulo: string
  autor?: string | null
  imagem?: string | null
  tipo: 'compra' | 'emprestimo'
  quantidade: number
  precoUnit: number // 0 para empréstimo
  stockDisponivel?: number
}

function CheckoutWizardModal({
  open, onClose, refetchCart,
}: {
  open: boolean; onClose: () => void; refetchCart: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<CartLine[]>([])
  const [step, setStep] = useState<'carrinho' | 'entrega' | 'pagamento' | 'revisao'>('carrinho')

  const itensEmprestimo = useMemo(() => lines.filter(l => l.tipo === 'emprestimo'), [lines])
  const itensCompra = useMemo(() => lines.filter(l => l.tipo === 'compra'), [lines])
  const temCompra = itensCompra.length > 0
  const totalCompra = itensCompra.reduce((acc, it) => acc + it.precoUnit * it.quantidade, 0)

  const [localQty, setLocalQty] = useState<Record<number, number>>({})
  const setLocalFor = (lineId: number, q: number) => setLocalQty(m => ({ ...m, [lineId]: clamp(q, 1, 99) }))
  const [savingItem, setSavingItem] = useState<number | null>(null)
  const [removingItem, setRemovingItem] = useState<number | null>(null)

  const [tipoEntrega, setTipoEntrega] = useState<'domicilio' | 'biblioteca'>('biblioteca')
  const [endereco, setEndereco] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const [metodoPagamento, setMetodoPagamento] = useState<'CARTAO' | 'BISTP' | 'DINHEIRO'>('CARTAO')
  const [nomeCartao, setNomeCartao] = useState('')
  const [numeroCartao, setNumeroCartao] = useState('')
  const [expiracao, setExpiracao] = useState('')
  const [cvc, setCvc] = useState('')
  const [aceitaTermos, setAceitaTermos] = useState(false)

  const [finalError, setFinalError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)

  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)

  const loadCart = useCallback(async () => {
    setLoading(true)
    try {
      const c = await CarrinhoAPI.get()
      const mapped: CartLine[] = (c?.itens ?? []).map((it: any) => ({
        id: it.id,
        livroId: it.livroId,
        titulo: it.tituloSnapshot ?? it.titulo ?? it.livro?.titulo ?? 'Item',
        autor: it.livro?.autor ?? it.autor ?? null,
        imagem: it.livro?.imagem ?? it.imagem ?? null,
        tipo: (it.livro?.tipoAquisicao ?? (typeof it.precoUnit === 'number' && it.precoUnit > 0 ? 'compra' : 'emprestimo')) as 'compra' | 'emprestimo',
        quantidade: it.quantidade ?? 1,
        precoUnit: it.precoUnit ?? (it.livro?.preco ?? 0),
        stockDisponivel: it.livro?.quantidade ?? it.stockDisponivel ?? 99,
      }))
      setLines(mapped)
      setLocalQty(Object.fromEntries(mapped.map((l) => [l.id, l.quantidade])))
      setFinalError(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setStep('carrinho')
      loadCart().catch(() => {})
    }
  }, [open, loadCart])

  const saveQty = async (lineId: number) => {
    setSavingItem(lineId)
    try {
      const q = localQty[lineId]
      await CarrinhoAPI.atualizarItem(lineId, clamp(q ?? 1, 1, 99))
      await loadCart()
      await refetchCart()
    } finally {
      setSavingItem(null)
    }
  }

  const doRemoveLine = async () => {
    const id = confirmRemoveId
    if (!id) return
    setRemovingItem(id)
    try {
      await CarrinhoAPI.removerItem(id)
      await loadCart()
      await refetchCart()
      setConfirmRemoveId(null)
    } finally {
      setRemovingItem(null)
    }
  }

  const handleUseMyLocation = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Geolocalização não suportada.')
      return
    }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoBusy(false)
      },
      (err) => {
        setGeoBusy(false)
        setGeoError(err.message || 'Falha ao obter localização.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const goNextFromCarrinho = () => {
    setFinalError(null)
    if (lines.length === 0) {
      setFinalError('O carrinho está vazio.')
      return
    }
    setStep('entrega')
  }

  const goNextFromEntrega = () => {
    setFinalError(null)
    // regra unificada: se for domicílio (ou existir compra), precisamos endereço ou coords
    const precisaEndereco = tipoEntrega === 'domicilio' || temCompra
    if (precisaEndereco && !endereco.trim() && !coords) {
      setFinalError('Caso de compra é obrigatorio - Indica um endereço de entrega ou usa a tua localização.')
      return
    }
    setStep('pagamento')
  }

  const goNextFromPagamento = () => {
    setFinalError(null)
    if (temCompra) {
      if (metodoPagamento === 'CARTAO') {
        if (!nomeCartao.trim() || !numeroCartao.trim() || !expiracao.trim() || !cvc.trim()) {
          setFinalError('Preenche os dados de cartão.')
          return
        }
        if (!aceitaTermos) {
          setFinalError('Tens de aceitar os termos de compra.')
          return
        }
      }
    }
    setStep('revisao')
  }

  const abrirConfirmacao = () => {
    setFinalError(null)
    setConfirmOpen(true)
  }

  const confirmarCheckout = async () => {
    if (!lines || lines.length === 0) {
      setFinalError('Carrinho vazio.')
      return
    }

    setSubmitting(true)
    try {
      // Sincronizar quantidades editadas localmente
      const pendentes = Object.entries(localQty).filter(
        ([id, q]) => lines.find((l) => l.id === Number(id))?.quantidade !== q,
      )
      for (const [id, q] of pendentes) {
        await CarrinhoAPI.atualizarItem(Number(id), clamp(Number(q), 1, 99))
      }

      // Endereço final: preferir endereço digitado; se não houver, coordenadas
      const destino = (endereco && endereco.trim().length >= 3)
        ? endereco.trim()
        : (coords ? `${coords.lat},${coords.lng}` : '')

      // **Checkout único** pelo carrinho (back trata compra+empréstimo)
      const result = await CarrinhoAPI.checkout({
        entregaTipo: temCompra ? 'domicilio' : tipoEntrega,
        endereco: (temCompra || tipoEntrega === 'domicilio') ? (destino || null) : null,
      })

      // Pagamento só se houver compra e o back devolver pedido com pagamento pendente
      if (temCompra && result?.pedido?.id) {
        const start = await CarrinhoAPI.iniciarPagamento(result.pedido.id, metodoPagamento || 'CARTAO')
        await CarrinhoAPI.confirmarPagamento(result.pedido.id, start.referencia)
      }

      await loadCart()
      await refetchCart()
      setConfirmOpen(false)
      setSubmitting(false)
      setSuccessOpen(true)
      toast.success('Checkout concluído.')
    } catch (e: any) {
      setSubmitting(false)
      setConfirmOpen(false)
      const msg = parseApiError ? parseApiError(e) : (e?.message || 'Falha ao processar o checkout.')
      setFinalError(msg)
      toast.error(msg)
      console.error(e)
    }
  }

  /* =========================
     Renders dos steps
  ======================== */
  function renderCarrinhoStep() {
    if (!lines || lines.length === 0) {
      return <div className="text-center text-gray-700"><p>Carrinho vazio.</p></div>
    }

    const _emprestimo = lines.filter((l) => l.tipo === 'emprestimo')
    const _compra = lines.filter((l) => l.tipo === 'compra')

    return (
      <div className="space-y-6">
        {_emprestimo.length > 0 && (
          <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              Empréstimos (0 STN)
            </h4>
            <ul className="divide-y divide-gray-200">
              {_emprestimo.map((it) => (
                <li key={it.id} className="py-3 flex flex-col sm:flex-row gap-3">
                  <div className="flex-shrink-0">
                    <img
                      src={resolveImgPath(it.imagem)}
                      alt=""
                      className="w-16 h-20 object-contain bg-blue-50 rounded"
                      onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = PLACEHOLDER }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-words">{it.titulo}</p>
                    <p className="text-xs text-gray-600 italic break-words">{it.autor || 'Autor desconhecido'}</p>
                    <p className="text-xs text-gray-700 mt-1">Tipo: <b>Requisição</b></p>
                  </div>
                  <div className="flex-shrink-0 flex items-start sm:items-center">
                    <button
                      onClick={() => setConfirmRemoveId(it.id)}
                      disabled={removingItem === it.id || savingItem === it.id}
                      className="text-red-700 text-xs font-semibold inline-flex items-center gap-1 bg-red-50 border border-red-200 px-2 py-1 rounded hover:bg-red-100 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600"
                    >
                      <FaTrash aria-hidden /> Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {_compra.length > 0 && (
          <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              Compras
            </h4>
            <ul className="divide-y divide-gray-200">
              {_compra.map((it) => {
                const currentQty = localQty[it.id] ?? it.quantidade
                const subtotal = it.precoUnit * currentQty
                return (
                  <li key={it.id} className="py-3 flex flex-col sm:flex-row gap-3">
                    <div className="flex-shrink-0">
                      <img
                        src={resolveImgPath(it.imagem)}
                        alt=""
                        className="w-16 h-20 object-contain bg-blue-50 rounded"
                        onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = PLACEHOLDER }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 break-words">{it.titulo}</p>
                      <p className="text-xs text-gray-600 italic break-words">{it.autor || 'Autor desconhecido'}</p>
                      <p className="text-xs text-gray-700 mt-1">Tipo: <b>Compra</b></p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Qtd:</span>
                          <button
                            className="p-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                            disabled={currentQty <= 1 || savingItem === it.id}
                            onClick={() => setLocalFor(it.id, currentQty - 1)}
                            aria-label="Diminuir quantidade"
                          >
                            <FaMinus aria-hidden />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={it.stockDisponivel && it.stockDisponivel > 0 ? it.stockDisponivel : 99}
                            value={currentQty}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10)
                              setLocalFor(it.id, isNaN(v) || v < 1 ? 1 : v)
                            }}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600"
                          />
                          <button
                            className="p-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40"
                            disabled={savingItem === it.id}
                            onClick={() => saveQty(it.id)}
                            aria-label="Guardar quantidade"
                            title="Guardar quantidade"
                          >
                            <FaSync className={savingItem === it.id ? 'animate-spin' : undefined} aria-hidden />
                          </button>
                        </div>
                        <div className="text-xs text-gray-700">
                          Preço unidade: {it.precoUnit.toFixed(2)} STN
                        </div>
                        <div className="text-xs text-gray-900 font-semibold">
                          Subtotal: {subtotal.toFixed(2)} STN
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-start sm:items-center">
                      <button
                        onClick={() => setConfirmRemoveId(it.id)}
                        disabled={removingItem === it.id || savingItem === it.id}
                        className="text-red-700 text-xs font-semibold inline-flex items-center gap-1 bg-red-50 border border-red-200 px-2 py-1 rounded hover:bg-red-100 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600"
                      >
                        <FaTrash aria-hidden /> Remover
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="text-right text-sm text-gray-900 font-semibold mt-4">
              Total a pagar agora:{' '}
              <span className="text-blue-800">{totalCompra.toFixed(2)} STN</span>
            </div>
          </section>
        )}
      </div>
    )
  }

  function renderEntregaStep() {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Entrega / Levantamento</h4>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tipoEntrega"
                value="biblioteca"
                checked={tipoEntrega === 'biblioteca'}
                onChange={() => setTipoEntrega('biblioteca')}
              />
              Levantar na biblioteca
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="tipoEntrega"
                value="domicilio"
                checked={tipoEntrega === 'domicilio'}
                onChange={() => setTipoEntrega('domicilio')}
              />
              Entrega ao domicílio
            </label>

            {(tipoEntrega === 'domicilio' || temCompra) && (
              <div className="space-y-2">
                <label className="block text-xs text-gray-700">Endereço (ou usa a localização)</label>
                <input
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, bairro, nº… (ou deixa em branco e usa localização)"
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
                <MapPreview
                  coords={coords}
                  onUseMyLocation={handleUseMyLocation}
                  busy={geoBusy}
                  error={geoError}
                />
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Resumo</h4>
          <ul className="text-sm text-gray-800 space-y-1">
            <li>Itens para requisitar: <b>{itensEmprestimo.length}</b></li>
            <li>Itens para compra: <b>{itensCompra.length}</b></li>
            <li>Total compra: <b>{totalCompra.toFixed(2)} STN</b></li>
          </ul>
        </section>

        {finalError && (
          <div className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {finalError}
          </div>
        )}
      </div>
    )
  }

  function renderPagamentoStep() {
    const precisaPagamento = temCompra
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            {precisaPagamento ? 'Método de pagamento' : 'Pagamento (não necessário)'}
          </h4>

          {!precisaPagamento ? (
            <p className="text-sm text-gray-700">Sem compras com custo. Podes avançar.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="pay" value="CARTAO" checked={metodoPagamento === 'CARTAO'} onChange={() => setMetodoPagamento('CARTAO')} />
                Cartão
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="pay" value="BISTP" checked={metodoPagamento === 'BISTP'} onChange={() => setMetodoPagamento('BISTP')} />
                Transferência BISTP
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="pay" value="DINHEIRO" checked={metodoPagamento === 'DINHEIRO'} onChange={() => setMetodoPagamento('DINHEIRO')} />
                Dinheiro na entrega
              </label>

              {metodoPagamento === 'CARTAO' && (
                <div className="mt-2 grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-700">Nome no cartão</label>
                    <input value={nomeCartao} onChange={(e) => setNomeCartao(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700">Número</label>
                    <input value={numeroCartao} onChange={(e) => setNumeroCartao(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" placeholder="0000 0000 0000 0000" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700">Expiração</label>
                    <input value={expiracao} onChange={(e) => setExpiracao(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" placeholder="MM/AA" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700">CVC</label>
                    <input value={cvc} onChange={(e) => setCvc(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" placeholder="123" />
                  </div>
                  <label className="sm:col-span-2 flex items-center gap-2">
                    <input type="checkbox" checked={aceitaTermos} onChange={() => setAceitaTermos((v) => !v)} />
                    Aceito os termos da compra.
                  </label>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Resumo</h4>
          <ul className="text-sm text-gray-800 space-y-1">
            <li>Itens requisição: <b>{itensEmprestimo.length}</b></li>
            <li>Itens compra: <b>{itensCompra.length}</b></li>
            <li>Total compra: <b>{totalCompra.toFixed(2)} STN</b></li>
          </ul>
        </section>

        {finalError && (
          <div className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {finalError}
          </div>
        )}
      </div>
    )
  }

  function renderRevisaoStep() {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Itens</h4>
          <ul className="divide-y divide-gray-200">
            {lines.map((it) => (
              <li key={it.id} className="py-3 flex gap-3 items-start">
                <img
                  src={resolveImgPath(it.imagem)}
                  alt=""
                  className="w-12 h-16 object-contain bg-blue-50 rounded"
                  onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = PLACEHOLDER }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{it.titulo}</p>
                  <p className="text-xs text-gray-600 italic">{it.autor || 'Autor desconhecido'}</p>
                  <p className="text-xs text-gray-700">Tipo: <b>{it.tipo === 'compra' ? 'Compra' : 'Requisição'}</b></p>
                </div>
                <div className="text-right text-sm">
                  <div>Qtd: <b>{it.quantidade}</b></div>
                  {it.tipo === 'compra' && (
                    <div>Subtotal: <b>{(it.precoUnit * it.quantidade).toFixed(2)} STN</b></div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-right text-sm font-semibold">
            Total compra: <span className="text-blue-800">{totalCompra.toFixed(2)} STN</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Entrega</h4>
          <p className="text-sm text-gray-800">
            {tipoEntrega === 'biblioteca' && !temCompra
              ? 'Levantamento na biblioteca.'
              : `Entrega ao domicílio: ${endereco || (coords ? `${coords.lat},${coords.lng}` : '—')}`}
          </p>
        </div>

        {finalError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {finalError}
          </div>
        )}
      </div>
    )
  }

  function stepTitle() {
    switch (step) {
      case 'carrinho': return 'Carrinho'
      case 'entrega': return 'Entrega / Levantamento'
      case 'pagamento': return 'Pagamento'
      case 'revisao': return 'Revisão final'
      default: return 'Checkout'
    }
  }

  function renderFooter() {
    return (
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <Stepper steps={['Carrinho', 'Entrega', 'Pagamento', 'Revisão']} active={{ carrinho: 0, entrega: 1, pagamento: 2, revisao: 3 }[step]} />
        <div className="flex gap-2">
          <button className="rounded border px-4 py-2 hover:bg-gray-50" onClick={() => { if (lines.length > 0) setConfirmCloseOpen(true); else onClose() }} disabled={submitting}>Fechar</button>
          {step !== 'carrinho' && (
            <button className="rounded border px-4 py-2 hover:bg-gray-50" onClick={() =>
              setStep((s) => s === 'revisao' ? 'pagamento' : s === 'pagamento' ? 'entrega' : 'carrinho')} disabled={submitting}>
              Anterior
            </button>
          )}
          {step === 'carrinho' && (
            <button className="rounded bg-blue-700 text-white px-4 py-2 hover:bg-blue-800 disabled:opacity-50" onClick={goNextFromCarrinho} disabled={submitting || loading}>
              Continuar
            </button>
          )}
          {step === 'entrega' && (
            <button className="rounded bg-blue-700 text-white px-4 py-2 hover:bg-blue-800 disabled:opacity-50" onClick={goNextFromEntrega} disabled={submitting}>
              Continuar
            </button>
          )}
          {step === 'pagamento' && (
            <button className="rounded bg-blue-700 text-white px-4 py-2 hover:bg-blue-800 disabled:opacity-50" onClick={goNextFromPagamento} disabled={submitting}>
              Continuar
            </button>
          )}
          {step === 'revisao' && (
            <button className="rounded bg-emerald-700 text-white px-4 py-2 hover:bg-emerald-800 disabled:opacity-50" onClick={abrirConfirmacao} disabled={submitting}>
              Confirmar pedido
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={submitting ? () => {} : onClose}
        title={stepTitle()}
        size="full"
        disableBackdropClose={submitting}
        footer={renderFooter()}
      >
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg border animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : (
          <>
            {step === 'carrinho' && renderCarrinhoStep()}
            {step === 'entrega' && renderEntregaStep()}
            {step === 'pagamento' && renderPagamentoStep()}
            {step === 'revisao' && renderRevisaoStep()}
          </>
        )}
      </Modal>

      <ConfirmModal
        open={confirmRemoveId != null}
        title="Remover item"
        message="Queres remover este item do carrinho?"
        tone="red"
        onCancel={() => setConfirmRemoveId(null)}
        onConfirm={doRemoveLine}
        busy={removingItem === (confirmRemoveId ?? -1)}
      />

      <ConfirmModal
        open={confirmCloseOpen}
        title="Fechar checkout"
        message="Tens itens no carrinho. Pretendes fechar e voltar à loja?"
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={() => { setConfirmCloseOpen(false); onClose() }}
      />

      <ConfirmModal
        open={confirmOpen}
        title="Confirmar pedido"
        message="Vais submeter o checkout (compras e/ou requisições)."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmarCheckout}
        busy={submitting}
        tone="emerald"
        confirmLabel="Confirmar agora"
      />

      <SuccessModal
        open={successOpen}
        title="Checkout submetido"
        message="Tudo certo! Carrinho processado."
        onClose={() => { setSuccessOpen(false); onClose() }}
      />
    </>
  )
}

/* =====================================================================
   PÁGINA PRINCIPAL
===================================================================== */
export default function LojaRequisicoes() {
  const [loading, setLoading] = useState(true)
  const [livros, setLivros] = useState<Livro[]>([])
  const [pesquisa, setPesquisa] = useState('')
  const [ordenar, setOrdenar] = useState<'relevancia' | 'titulo' | 'precoAsc'>('relevancia')
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtros, setFiltros] = useState<{
    gratuito: boolean
    precoMaximo: number
    faixaEtaria: string
    tipo: 'todos' | 'compra' | 'emprestimo'
  }>({ gratuito: false, precoMaximo: 1_000_000, faixaEtaria: '', tipo: 'todos' })

  const [page, setPage] = useState(1)
  const pageSize = 12

  const [showCart, setShowCart] = useState(false)

  // Modal detalhes
  const [showDetails, setShowDetails] = useState(false)
  const [selectedLivro, setSelectedLivro] = useState<Livro | null>(null)

  const resultsLiveRef = useRef<HTMLParagraphElement>(null)

  const fetchLivros = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {}
      if (pesquisa.trim()) params.q = pesquisa.trim()
      if (filtros.tipo === 'compra') params.tipo = 'compra'
      if (filtros.tipo === 'emprestimo') params.tipo = 'emprestimo'
      if (filtros.faixaEtaria) params.faixa = filtros.faixaEtaria

      const res = await LivrosAPI.listar(params)
      let items: Livro[] = res.items ?? []

      if (filtros.gratuito) items = items.filter((l) => l.preco == null)
      if (Number.isFinite(filtros.precoMaximo))
        items = items.filter((l) => (l.preco ?? 0) <= filtros.precoMaximo)

      if (ordenar === 'titulo') {
        items = [...items].sort((a, b) => a.titulo.localeCompare(b.titulo))
      } else if (ordenar === 'precoAsc') {
        items = [...items].sort(
          (a, b) => (a.preco ?? Number.MAX_SAFE_INTEGER) - (b.preco ?? Number.MAX_SAFE_INTEGER),
        )
      }

      setLivros(items)
      resultsLiveRef.current?.append?.(
        document.createTextNode(`Atualizado: ${items.length} resultados.`),
      )
    } finally {
      setLoading(false)
      setPage(1)
    }
  }, [pesquisa, filtros.gratuito, filtros.precoMaximo, filtros.faixaEtaria, filtros.tipo, ordenar])

  useEffect(() => {
    const t = setTimeout(fetchLivros, 300)
    return () => clearTimeout(t)
  }, [fetchLivros])

  const refetchCart = useCallback(async () => {
    await CarrinhoAPI.get()
  }, [])

  const addToCart = async (livro: Livro) => {
    await CarrinhoAPI.adicionarItem(Number(livro.id), 1)
    setShowCart(true)
  }

  const livrosFiltrados = useMemo(() => livros, [livros])
  const totalPages = Math.max(1, Math.ceil(livrosFiltrados.length / pageSize))
  const pageSafe = clamp(page, 1, totalPages)
  const pageItems = useMemo(
    () => livrosFiltrados.slice((pageSafe - 1) * pageSize, pageSafe * pageSize),
    [livrosFiltrados, pageSafe],
  )

  const resetFiltros = () => {
    setFiltros({ gratuito: false, precoMaximo: 1_000_000, faixaEtaria: '', tipo: 'todos' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee] text-gray-900">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:bg-white focus:text-blue-700 focus:ring-2 focus:ring-blue-600 focus:px-3 focus:py-2 rounded">
        Saltar para o conteúdo
      </a>

      <p ref={resultsLiveRef} className="sr-only" aria-live="polite" />

      <main id="conteudo" className="mx-auto px-4 sm:px-6 py-8" role="main" aria-busy={loading}>
        {/* HEADER */}
        <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-700 to-purple-700 p-3 rounded-full shadow-sm">
              <FaBook className="text-white text-xl" aria-hidden />
            </div>
            <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-purple-700">
              Livros e requisições
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 md:items-center w-full md:w-auto">
            <div className="relative flex-1 sm:w-96">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden />
              <label htmlFor="pesquisar" className="sr-only">Pesquisar</label>
              <input
                id="pesquisar"
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
                placeholder="Pesquisar livro ou autor…"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowFiltros((s) => !s)}
                className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-300 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600"
                aria-expanded={showFiltros}
                aria-controls="filtros-sec"
              >
                <FaFilter aria-hidden /> Filtros
              </button>

              <label className="sr-only" htmlFor="ordenar">Ordenar por</label>
              <select
                id="ordenar"
                value={ordenar}
                onChange={(e) => setOrdenar(e.target.value as any)}
                className="bg-white px-3 py-2 rounded-lg border border-gray-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600"
                aria-label="Ordenar por"
              >
                <option value="relevancia">Mais relevantes</option>
                <option value="titulo">Título (A→Z)</option>
                <option value="precoAsc">Preço (mais baixo)</option>
              </select>

              <button
                type="button"
                onClick={() => setShowCart(true)}
                className="relative inline-flex items-center gap-2 bg-gradient-to-r from-blue-700 to-purple-700 text-white px-4 py-2 rounded-lg shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600"
              >
                <FaShoppingCart aria-hidden />
                <span>Carrinho</span>
              </button>
            </div>
          </div>
        </header>

        {/* FILTROS */}
        {showFiltros && (
          <section id="filtros-sec" className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6" aria-label="Filtros">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <fieldset className="flex items-center gap-3">
                <legend className="sr-only">Tipo</legend>
                <button onClick={() => setFiltros((f) => ({ ...f, tipo: 'todos' }))} className={`rounded-full px-3 py-1 ring-1 ${filtros.tipo === 'todos' ? 'bg-blue-50 text-blue-900 ring-blue-200' : 'bg-gray-50 ring-gray-200'}`}>Todos</button>
                <button onClick={() => setFiltros((f) => ({ ...f, tipo: 'emprestimo' }))} className={`rounded-full px-3 py-1 ring-1 ${filtros.tipo === 'emprestimo' ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-gray-50 ring-gray-200'}`}>Empréstimo</button>
                <button onClick={() => setFiltros((f) => ({ ...f, tipo: 'compra' }))} className={`rounded-full px-3 py-1 ring-1 ${filtros.tipo === 'compra' ? 'bg-indigo-50 text-indigo-900 ring-indigo-200' : 'bg-gray-50 ring-gray-200'}`}>Compra</button>
              </fieldset>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={filtros.gratuito} onChange={() => setFiltros((f) => ({ ...f, gratuito: !f.gratuito }))} className="rounded text-purple-700 focus:ring-purple-700" />
                Apenas gratuitos
              </label>

              <div className="flex items-center gap-2">
                <span>Até</span>
                <label className="sr-only" htmlFor="preco-max">Preço máximo</label>
                <select
                  id="preco-max"
                  value={filtros.precoMaximo}
                  onChange={(e) => setFiltros((f) => ({ ...f, precoMaximo: Number(e.target.value) }))}
                  className="border rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600"
                >
                  <option value={25}>STN 25</option>
                  <option value={50}>STN 50</option>
                  <option value={150}>STN 150</option>
                  <option value={250}>STN 250</option>
                  <option value={500}>STN 500</option>
                  <option value={1000}>STN 1000</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span>Idade</span>
                <label className="sr-only" htmlFor="faixa">Faixa etária</label>
                <select
                  id="faixa"
                  value={filtros.faixaEtaria}
                  onChange={(e) => setFiltros((f) => ({ ...f, faixaEtaria: e.target.value }))}
                  className="border rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600"
                >
                  <option value="">Todas</option>
                  <option value="3-5">3–5</option>
                  <option value="4-6">4–6</option>
                  <option value="5-8">5–8</option>
                  <option value="8-12">8–12</option>
                </select>
              </div>

              <button onClick={() => setFiltros({ gratuito: false, precoMaximo: 1_000_000, faixaEtaria: '', tipo: 'todos' })} className="ml-auto inline-flex items-center gap-2 text-gray-800 hover:text-gray-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600 rounded">
                <FaTimes aria-hidden /> Limpar filtros
              </button>
            </div>
          </section>
        )}

        {/* LISTA */}
        {loading ? (
          <div role="status" aria-live="polite" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white p-4 rounded-xl shadow-md border border-gray-200 animate-pulse h-64" />
            ))}
          </div>
        ) : (
          <>
            <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {pageItems.map((livro) => {
                const semStock = livro.tipoAquisicao === 'emprestimo' && (livro.quantidade ?? 0) <= 0
                const imgSrc = resolveImgPath(livro.imagem)
                return (
                  <article key={livro.id} className="bg-white p-4 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition flex flex-col">
                    <img
                      src={imgSrc}
                      alt={`Capa do livro: ${livro.titulo}`}
                      className="w-full h-40 object-contain bg-blue-50 rounded mb-4"
                      loading="lazy"
                      onError={(e) => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = PLACEHOLDER }}
                    />

                    <h3 className="text-lg font-bold text-purple-800 line-clamp-2">{livro.titulo}</h3>
                    <p className="text-sm text-gray-700 italic mb-1">{livro.autor || 'Autor desconhecido'}</p>

                    <p className="text-xs text-blue-800 mb-2 flex items-center gap-2">
                      Faixa: {livro.faixaEtaria || (livro as any).faixa || '—'}
                      <span className="inline-flex items-center gap-1 text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        <FaBoxes aria-hidden /> {livro.quantidade ?? 0}{' '}
                        {livro.tipoAquisicao === 'emprestimo' ? 'stock' : 'unid.'}
                      </span>
                    </p>

                    <div className="mt-3 mb-3 flex items-center justify-between">
                      <BadgePreco livro={livro} />
                      <button
                        onClick={() => { setSelectedLivro(livro); setShowDetails(true) }}
                        className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1"
                        aria-haspopup="dialog"
                      >
                        <FaEye /> Detalhes
                      </button>
                    </div>

                    <div className="mt-auto flex gap-2">
                      <button
                        onClick={() => addToCart(livro)}
                        disabled={semStock && livro.preco == null}
                        className={`flex-1 text-sm font-medium py-2 px-3 rounded inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600 ${
                          semStock && livro.preco == null
                            ? 'bg-gray-300 text-gray-700 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-700 to-purple-700 text-white hover:opacity-95'
                        }`}
                      >
                        {livro.preco == null ? 'Requisitar' : 'Comprar'}
                      </button>

                      <button
                        onClick={() => addToCart(livro)}
                        disabled={semStock && livro.preco == null}
                        className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-900 text-sm font-medium py-2 px-3 rounded inline-flex items-center justify-center"
                      >
                        Adicionar
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>

            {/* paginação */}
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Paginação">
              <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50" onClick={() => setPage((p) => clamp(p - 1, 1, totalPages))} disabled={pageSafe <= 1}>
                <FaChevronLeft /> Anterior
              </button>
              <span className="text-sm text-gray-700">
                Página <b>{pageSafe}</b> de <b>{totalPages}</b>
              </span>
              <button className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50" onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))} disabled={pageSafe >= totalPages}>
                Próxima <FaChevronRight />
              </button>
            </nav>

            {livrosFiltrados.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-700">Nenhum livro encontrado.</p>
                <button onClick={resetFiltros} className="mt-4 text-purple-800 hover:underline text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-600 rounded">
                  Limpar filtros
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Wizard de checkout */}
      <CheckoutWizardModal open={showCart} onClose={() => setShowCart(false)} refetchCart={refetchCart} />

      {/* Modal de detalhes */}
      <DetalhesModal open={showDetails} onClose={() => { setShowDetails(false); setSelectedLivro(null) }} livro={selectedLivro} onAdd={addToCart} />
    </div>
  )
}
