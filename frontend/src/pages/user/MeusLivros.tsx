// src/pages/user/MeusLivros.tsx
import { useEffect, useState, useMemo } from 'react'
import { FaClock, FaMapMarkerAlt, FaExclamationTriangle } from 'react-icons/fa'
import {
  RequisicoesAPI,
  imageUrl,
  parseApiError,
  type RequisicaoDTO,
} from '../../api/client'
import { toast } from 'sonner'

/* ============================================================================
   Tipos locais (alinhados ao DTO do backend + extras)
============================================================================ */
type RequisicaoUserDTO = RequisicaoDTO & {
  devolvidoEm?: string | null
  diasDevolucao?: number | null
  dataDevolucaoPrevista?: string | null
  entregueEm?: string | null
}

type StatusRawExtra =
  | NonNullable<RequisicaoUserDTO['statusRaw']>
  | 'SAIU_PARA_ENTREGA'

/* ============================================================================
   Utils
============================================================================ */
function formatDateTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-PT') +
    ' ' +
    d
      .toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
      })
      .replace(':', 'h')
  )
}

function isAtrasado(req: RequisicaoUserDTO) {
  if (req.tipoAquisicao === 'compra') return false // compras não atrasam
  if (!req.dataDevolucaoPrevista) return false
  const limite = new Date(req.dataDevolucaoPrevista).getTime()
  return Date.now() > limite && !req.devolvidoEm
}

/* ============================================================================
   Badge de prazo / atraso / devolvido (com suporte a compra)
============================================================================ */
function PrazoInfo({
  prazoISO,
  diasDevolucao,
  devolvido,
  tipoAquisicao,
}: {
  prazoISO?: string | null
  diasDevolucao?: number | null
  devolvido?: string | null
  tipoAquisicao?: 'compra' | 'emprestimo' | null
}) {
  if (devolvido) {
    return (
      <div className="rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-700 ring-1 ring-gray-200">
        <div className="font-medium text-gray-900">
          Já devolvido em {formatDateTime(devolvido)}
        </div>
      </div>
    )
  }

  if (tipoAquisicao === 'compra') {
    return (
      <div className="rounded-md bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 ring-1 ring-emerald-200">
        <div className="font-medium text-emerald-900">
          Compra — sem prazo de devolução
        </div>
      </div>
    )
  }

  const atrasado = prazoISO && Date.now() > new Date(prazoISO).getTime()

  return (
    <div
      className={`rounded-md px-3 py-2 text-[11px] ring-1 ${
        atrasado
          ? 'bg-red-50 text-red-800 ring-red-200'
          : 'bg-gray-50 text-gray-700 ring-gray-200'
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px]">
          <span className="font-medium text-gray-900">Devolver até:</span>{' '}
          {prazoISO ? formatDateTime(prazoISO) : '—'}
        </div>
        {typeof diasDevolucao === 'number' && diasDevolucao > 0 && (
          <div className={`text-[11px] ${atrasado ? 'text-red-700' : 'text-gray-600'}`}>
            Prazo: {diasDevolucao} dia{diasDevolucao === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {atrasado && (
        <div className="mt-2 inline-flex items-start gap-2 rounded bg-red-100 px-2 py-1 text-[11px] font-medium text-red-800 ring-1 ring-red-300">
          <FaExclamationTriangle className="mt-[1px] flex-shrink-0" />
          <span>Atenção: prazo ultrapassado, devolução em atraso.</span>
        </div>
      )}
    </div>
  )
}

/* ============================================================================
   Badge simples de estado (Aprovado / A caminho / Compra aprovada / Enviada)
============================================================================ */
function EstadoBadge({ statusRaw }: { statusRaw: StatusRawExtra }) {
  const map: Record<string, { label: string; cls: string }> = {
    APROVADA: { label: 'Aprovada', cls: 'bg-green-50 text-green-800 ring-green-200' },
    SAIU_PARA_ENTREGA: { label: 'A caminho', cls: 'bg-blue-50 text-blue-800 ring-blue-200' },
    APROVADO: { label: 'Compra aprovada', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    ENVIADO: { label: 'Compra enviada', cls: 'bg-blue-50 text-blue-800 ring-blue-200' },
    PAGO: { label: 'Pago', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  }

  const conf = map[statusRaw] ?? { label: statusRaw, cls: 'bg-gray-50 text-gray-700 ring-gray-200' }

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] ring-1 ${conf.cls}`}>
      {conf.label}
    </span>
  )
}

/* ============================================================================
   Card “em posse” (ENTREGUE de empréstimo OU compra entregue/concluída)
============================================================================ */
function LivroCard({ req }: { req: RequisicaoUserDTO }) {
  const atrasado = isAtrasado(req)

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm ring-1 transition ${
        atrasado ? 'border-red-200 ring-red-100' : 'border-gray-200 ring-gray-100'
      } sm:flex-row`}
    >
      {/* Capa */}
      <div className="flex-shrink-0">
        <div className="h-24 w-20 overflow-hidden rounded-md bg-orange-50 ring-1 ring-gray-200">
          {req.livroImagem ? (
            <img
              src={imageUrl(req.livroImagem) || 'https://via.placeholder.com/300x200?text=Livro'}
              alt={req.livroTitulo}
              className="h-full w-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).src =
                  'https://via.placeholder.com/300x200?text=Livro'
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
              sem capa
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold leading-tight text-gray-900">
          {req.livroTitulo}
        </div>
        <div className="text-xs text-gray-600">
          {req.livroAutor || 'Autor desconhecido'}
          {req.tipoAquisicao === 'compra' ? ' • Comprado' : ''}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-gray-700 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="uppercase text-gray-400">Categoria</span>
            <span className="truncate">{req.categoria || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-gray-400">Faixa</span>
            <span>{req.faixa || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-gray-400">
              {req.tipoAquisicao === 'compra' ? 'Entregue em' : 'Levantado em'}
            </span>
            <span>
              {req.entregueEm
                ? formatDateTime(req.entregueEm)
                : req.dataPedido
                ? formatDateTime(req.dataPedido)
                : '—'}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <PrazoInfo
            prazoISO={req.dataDevolucaoPrevista ?? null}
            diasDevolucao={req.diasDevolucao ?? null}
            devolvido={req.devolvidoEm ?? null}
            tipoAquisicao={req.tipoAquisicao ?? null}
          />
        </div>

        <div className="mt-4 flex flex-col items-stretch gap-2 text-[11px] text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <FaClock className="mt-[1px] flex-shrink-0 text-gray-500" />
              <span>
                {req.tipoAquisicao === 'compra' ? 'Pedido da loja:' : 'Pedido feito:'}{' '}
                {req.dataPedido ? formatDateTime(req.dataPedido) : '—'}
              </span>
            </div>

            {req.tipoAquisicao === 'compra' ? (
              <div className="flex items-start gap-2">
                <FaMapMarkerAlt className="mt-[1px] flex-shrink-0 text-gray-500" />
                <span>
                  {req.tipo === 'domicilio'
                    ? `Entrega ao domicílio${req.endereco ? `:\n${req.endereco}` : ''}`
                    : 'Levantamento/entregue pela biblioteca'}
                </span>
              </div>
            ) : req.tipo === 'domicilio' && req.endereco ? (
              <div className="flex items-start gap-2">
                <FaMapMarkerAlt className="mt-[1px] flex-shrink-0 text-gray-500" />
                <span>
                  Entrega ao domicílio:
                  <br />
                  {req.endereco}
                </span>
              </div>
            ) : req.tipo === 'biblioteca' ? (
              <div className="flex items-start gap-2">
                <FaMapMarkerAlt className="mt-[1px] flex-shrink-0 text-gray-500" />
                <span>Levantado na biblioteca</span>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <FaMapMarkerAlt className="mt-[1px] flex-shrink-0 text-gray-500" />
                <span>Método de entrega não registado</span>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center justify-center rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500 shadow-sm"
            title={
              req.tipoAquisicao === 'compra'
                ? 'Itens comprados não são devolvidos.'
                : 'Entrega de devolução é feita diretamente com a biblioteca.'
            }
          >
            {req.tipoAquisicao === 'compra' ? 'Item comprado' : 'Devolver livro'}
          </button>
        </div>
      </div>
    </article>
  )
}

/* ============================================================================
   Card “a caminho / para levantar” (APROVADA | SAIU_PARA_ENTREGA | APROVADO | ENVIADO)
============================================================================ */
function LivroAtivoCard({ req }: { req: RequisicaoUserDTO }) {
  const statusRaw = (req.statusRaw as StatusRawExtra) ?? 'APROVADA'
  const isDomi = req.tipo === 'domicilio'
  const quando = req.dataResposta
    ? `${formatDateTime(req.dataResposta)}${req.horario ? '' : ''}`
    : req.horario
    ? req.horario
    : null

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-blue-200 bg-white p-4 shadow-sm ring-1 ring-blue-100 sm:flex-row">
      {/* Capa */}
      <div className="flex-shrink-0">
        <div className="h-24 w-20 overflow-hidden rounded-md bg-blue-50 ring-1 ring-blue-200">
          {req.livroImagem ? (
            <img
              src={imageUrl(req.livroImagem) || 'https://via.placeholder.com/300x200?text=Livro'}
              alt={req.livroTitulo}
              className="h-full w-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).src =
                  'https://via.placeholder.com/300x200?text=Livro'
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
              sem capa
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold leading-tight text-gray-900">
            {req.livroTitulo}
          </div>
          <EstadoBadge statusRaw={statusRaw} />
        </div>
        <div className="text-xs text-gray-600">{req.livroAutor || 'Autor desconhecido'}</div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-gray-700 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="uppercase text-gray-400">Categoria</span>
            <span className="truncate">{req.categoria || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-gray-400">Faixa</span>
            <span>{req.faixa || '—'}</span>
          </div>
          <div className="flex flex-col">
            <span className="uppercase text-gray-400">
              {isDomi ? 'Entrega prevista' : 'Levantamento'}
            </span>
            <span>{quando || '—'}</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start gap-2 text-[11px] text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <FaClock className="mt-[1px] flex-shrink-0 text-gray-500" />
            <span>Pedido feito: {req.dataPedido ? formatDateTime(req.dataPedido) : '—'}</span>
          </div>

          {isDomi && req.endereco ? (
            <div className="flex items-start gap-2">
              <FaMapMarkerAlt className="mt-[1px] flex-shrink-0 text-gray-500" />
              <span>
                Entrega ao domicílio:
                <br />
                {req.endereco}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <FaMapMarkerAlt className="mt-[1px] flex-shrink-0 text-gray-500" />
              <span>{isDomi ? 'Endereço não registado' : 'Levantamento na biblioteca'}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

/* ============================================================================
   Página principal
============================================================================ */
export default function MeusLivros() {
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [ativas, setAtivas] = useState<RequisicaoUserDTO[]>([])   // APROVADA / SAIU_PARA_ENTREGA / APROVADO / ENVIADO
  const [emPosse, setEmPosse] = useState<RequisicaoUserDTO[]>([]) // ENTREGUE & não devolvidas + COMPRAS entregues/concluídas

  useEffect(() => {
    document.title = 'Meus livros'
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregar() {
    setLoading(true)
    try {
      const [emPosseRes, todas] = await Promise.all([
        RequisicoesAPI.minhasEmPosse(), // agora inclui empréstimos em posse + compras entregues/concluídas
        RequisicoesAPI.minhas(),        // todas deste utilizador (empréstimos e pedidos compat)
      ])

      const emPosseList = (emPosseRes || []) as RequisicaoUserDTO[]
      const todasList = (todas || []) as RequisicaoUserDTO[]

      const ativasList = todasList.filter((r) => {
        const s = (r.statusRaw as StatusRawExtra) || 'PENDENTE'
        // Empréstimos ativos + compras em andamento
        return s === 'APROVADA' || s === 'SAIU_PARA_ENTREGA' || s === 'APROVADO' || s === 'ENVIADO'
      })

      setEmPosse(emPosseList)
      setAtivas(ativasList)
      setErro(null)
    } catch (e) {
      const msg = parseApiError(e)
      setErro(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // ordenar “em posse”: prazo mais urgente primeiro (compras vão para o fim pois não têm prazo)
  const emPosseOrdenado = useMemo(() => {
    return [...emPosse].sort((a, b) => {
      const da = a.dataDevolucaoPrevista ? new Date(a.dataDevolucaoPrevista).getTime() : Infinity
      const db = b.dataDevolucaoPrevista ? new Date(b.dataDevolucaoPrevista).getTime() : Infinity
      return da - db
    })
  }, [emPosse])

  // ordenar “ativas”: mais recentes primeiro (ou pela dataResposta se existir)
  const ativasOrdenado = useMemo(() => {
    return [...ativas].sort((a, b) => {
      const ax =
        (a.dataResposta ? new Date(a.dataResposta).getTime() : 0) ||
        (a.dataPedido ? new Date(a.dataPedido).getTime() : 0)
      const bx =
        (b.dataResposta ? new Date(b.dataResposta).getTime() : 0) ||
        (b.dataPedido ? new Date(b.dataPedido).getTime() : 0)
      return bx - ax
    })
  }, [ativas])

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#f8f8ff] to-[#fff8f1] text-gray-900">
      {/* HEADER FIXO */}
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-blue-800">Meus livros</h1>
              <p className="text-sm text-gray-600">
                Acompanhe entregas/levantamentos e veja o que está em sua posse.
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="hidden text-xs text-gray-400 sm:inline">
                Em posse: {emPosseOrdenado.length} • Ativos: {ativasOrdenado.length}
              </span>
              <button
                onClick={carregar}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 hover:bg-gray-50"
              >
                Recarregar
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {loading ? (
          <div role="status" aria-live="polite" className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        ) : erro ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {erro}
          </div>
        ) : (
          <div className="space-y-10">
            {/* Secção: A caminho / para levantar */}
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-gray-900">A caminho / para levantar</h2>
                <span className="text-xs text-gray-500">{ativasOrdenado.length}</span>
              </div>
              {ativasOrdenado.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm">
                  Sem pedidos aprovados no momento.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {ativasOrdenado.map((req) => (
                    <LivroAtivoCard key={req.id + '-ativo-' + req.livroId} req={req} />
                  ))}
                </div>
              )}
            </section>

            {/* Secção: Em posse */}
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Em posse</h2>
                <span className="text-xs text-gray-500">{emPosseOrdenado.length}</span>
              </div>
              {emPosseOrdenado.length === 0 ? (
                <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm">
                  Nenhum livro em posse neste momento.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {emPosseOrdenado.map((req) => (
                    <LivroCard key={req.id + '-' + req.livroId} req={req} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
