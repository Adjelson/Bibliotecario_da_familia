// client/src/pages/Pedidos.tsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  FaSearch, FaFilter, FaSyncAlt, FaInfoCircle, FaCheck, FaTimes,
  FaShoppingCart, FaBook, FaCalendarAlt, FaMapMarkerAlt, FaCreditCard,
  FaTruck, FaClipboardList, FaList, FaColumns
} from 'react-icons/fa'
import { toast } from 'sonner'
import {
  RequisicoesAPI, PedidosLojaAPI,
  type RequisicaoDTO, type PedidoLojaDTO,
  imageUrl, parseApiError
} from '../../api/client'

type Aba = 'emprestimos' | 'compras'
type FiltroStatusEmp =
  | 'todos' | 'PENDENTE' | 'APROVADA' | 'NEGADA' | 'ENTREGUE' | 'DEVOLVIDA' | 'PAGAMENTO_PENDENTE' | 'PAGAMENTO_FALHOU' | 'PAGO'
type FiltroStatusShop =
  | 'todos' | 'pendente' | 'confirmado' | 'enviado' | 'concluido' | 'cancelado'
type UIItem =
  | ({ origem: 'emprestimo' } & RequisicaoDTO)
  | ({ origem: 'compra'; itens: PedidoLojaDTO['itens'] } & PedidoLojaDTO)

const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' ')
const fmtDate = (iso?: string | null) => (!iso ? '—' : new Date(iso).toLocaleString())
const fmtDateOnly = (iso?: string | null) => (!iso ? '—' : new Date(iso).toLocaleDateString())
const fmtMoney = (n?: number | null) =>
  typeof n === 'number' ? n.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'

/* --------------------------------- UI bits -------------------------------- */
function Pill({ children, tone = 'gray' }: { children: any; tone?: 'gray' | 'amber' | 'emerald' | 'rose' | 'blue' | 'indigo' }) {
  const map: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-900',
    amber: 'bg-amber-100 text-amber-900',
    emerald: 'bg-emerald-100 text-emerald-900',
    rose: 'bg-rose-100 text-rose-900',
    blue: 'bg-blue-100 text-blue-900',
    indigo: 'bg-indigo-100 text-indigo-900',
  }
  return <span className={cls('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', map[tone])}>{children}</span>
}

function HeaderStat({ label, value, icon: Icon }:{ label: string; value: string | number; icon: any }) {
  return (
    <div className="rounded-xl border border-white/60 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-[11px] text-gray-700">
        <span>{label}</span>
        <Icon aria-hidden />
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}

/* ------------------------------- Toolbars --------------------------------- */
function Toolbar({
  aba, q, setQ, statusEmp, setStatusEmp, statusShop, setStatusShop, modo, setModo, recarregar,
}:{
  aba: Aba
  q: string; setQ: (s: string) => void
  statusEmp: FiltroStatusEmp; setStatusEmp: (s: FiltroStatusEmp) => void
  statusShop: FiltroStatusShop; setStatusShop: (s: FiltroStatusShop) => void
  modo: 'cards' | 'lista'; setModo: (m: 'cards' | 'lista') => void
  recarregar: () => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3" role="region" aria-label="Filtros e pesquisa">
      <div className="relative">
        <FaSearch className="pointer-events-none absolute left-3 top-3.5 text-gray-700" aria-hidden />
        <input
          type="search"
          placeholder="Pesquisar leitor, livro, pedido…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-700"
          aria-label="Pesquisar"
        />
      </div>

      <div className="relative">
        <FaFilter className="pointer-events-none absolute left-3 top-3.5 text-gray-700" aria-hidden />
        {aba === 'emprestimos' ? (
          <select
            className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-700"
            value={statusEmp}
            onChange={(e) => setStatusEmp(e.target.value as FiltroStatusEmp)}
            aria-label="Filtrar por estado (empréstimos)"
          >
            {['todos','PENDENTE','APROVADA','NEGADA','ENTREGUE','DEVOLVIDA','PAGAMENTO_PENDENTE','PAGAMENTO_FALHOU','PAGO'].map(s => (
              <option key={s} value={s}>{s.replaceAll('_',' ')}</option>
            ))}
          </select>
        ) : (
          <select
            className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-9 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-700"
            value={statusShop}
            onChange={(e) => setStatusShop(e.target.value as FiltroStatusShop)}
            aria-label="Filtrar por estado (compras)"
          >
            {['todos','pendente','confirmado','enviado','concluido','cancelado'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Modo de visualização" className="flex items-center gap-1">
          <button
            onClick={() => setModo('lista')}
            className={cls(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              modo === 'lista' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white hover:bg-gray-50'
            )}
            aria-pressed={modo === 'lista'}
            title="Lista"
          >
            <FaList /> Lista
          </button>
          <button
            onClick={() => setModo('cards')}
            className={cls(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              modo === 'cards' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white hover:bg-gray-50'
            )}
            aria-pressed={modo === 'cards'}
            title="Cartões/Kanban"
          >
            <FaColumns /> Cards
          </button>
        </div>

        <button onClick={recarregar} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
          <FaSyncAlt className="inline" /> Recarregar
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ Estados UI -------------------------------- */
function EstadoPills({ item }: { item: UIItem }) {
  if (item.origem === 'compra') {
    const m = item.pagamentoStatus
    return (
      <div className="flex flex-wrap gap-1">
        <Pill tone="indigo"><FaShoppingCart className="mr-1" />Compra</Pill>
        <Pill tone="blue">{item.status}</Pill>
        {m && (
          <Pill tone={m === 'PAGO' ? 'emerald' : m === 'PENDENTE' ? 'amber' : 'rose'}>
            <FaCreditCard className="mr-1" /> {m === 'PAGO' ? 'Pago' : m === 'PENDENTE' ? 'Pagamento pendente' : 'Falhou'}
          </Pill>
        )}
      </div>
    )
  }
  const s = item.statusRaw ?? '—'
  return (
    <div className="flex flex-wrap gap-1">
      <Pill tone="emerald"><FaBook className="mr-1" />Empréstimo</Pill>
      <Pill tone={s === 'PENDENTE' ? 'amber' : s === 'NEGADA' ? 'rose' : s === 'DEVOLVIDA' ? 'gray' : 'blue'}>
        {s.replaceAll('_', ' ')}
      </Pill>
      {'tipo' in item && item.tipo && (
        <Pill tone="indigo">
          {item.tipo === 'domicilio'
            ? (item.endereco ? `Domicílio: ${item.endereco}` : 'Domicílio')
            : 'Levantamento na biblioteca'}
        </Pill>
      )}
    </div>
  )
}

/* ------------------------- Ações (com modais) ------------------------------ */
type ActionKind = null
  | { type: 'aprovar'; req: RequisicaoDTO }
  | { type: 'confirm'; what: 'negar'|'entregar'|'devolver'; req: RequisicaoDTO; title: string; hint?: string }
  | { type: 'shop'; pedido: PedidoLojaDTO; next: PedidoLojaDTO['status'] }

function LinhaAcao({
  item, openAction,
}:{
  item: UIItem
  openAction: (a: ActionKind) => void
}) {
  if (item.origem === 'compra') {
    return (
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Ações de compra">
        <button onClick={() => openAction({ type: 'shop', pedido: item, next: 'confirmado' })}
          className={cls('rounded border px-3 py-1.5 text-sm hover:bg-gray-50', item.status !== 'pendente' && 'hidden')}>
          Aprovar/Confirmar
        </button>
        <button onClick={() => openAction({ type: 'shop', pedido: item, next: 'cancelado' })}
          className={cls('rounded border px-3 py-1.5 text-sm hover:bg-gray-50', item.status !== 'pendente' && 'hidden')}>
          Cancelar
        </button>
        <button onClick={() => openAction({ type: 'shop', pedido: item, next: 'enviado' })}
          className={cls('rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-800', item.status !== 'confirmado' && 'hidden')}>
          <FaTruck className="mr-1 inline" /> Marcar enviado
        </button>
        <button onClick={() => openAction({ type: 'shop', pedido: item, next: 'concluido' })}
          className={cls('rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-800', item.status !== 'enviado' && 'hidden')}>
          <FaCheck className="mr-1 inline" /> Concluir
        </button>
      </div>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Ações de empréstimo">
      {item.statusRaw === 'PENDENTE' && (
        <>
          <button onClick={() => openAction({ type: 'aprovar', req: item })}
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100">
            Aprovar / Agendar
          </button>
          <button onClick={() => openAction({ type: 'confirm', what: 'negar', req: item, title: 'Confirmar rejeição' })}
            className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm text-rose-900 hover:bg-rose-100">
            Rejeitar
          </button>
        </>
      )}
      {item.statusRaw === 'APROVADA' && (
        <button onClick={() => openAction({ type: 'confirm', what: 'entregar', req: item, title: 'Confirmar entrega ao leitor' })}
          className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-800">
          Entregar
        </button>
      )}
      {item.statusRaw === 'ENTREGUE' && (
        <button onClick={() => openAction({ type: 'confirm', what: 'devolver', req: item, title: 'Confirmar devolução' })}
          className="rounded bg-indigo-700 px-3 py-1.5 text-sm text-white hover:bg-indigo-800">
          Devolver
        </button>
      )}
    </div>
  )
}

/* ------------------------------ Item Card --------------------------------- */
function ItemCard({ item, openAction, onDetalhes }:{
  item: UIItem
  openAction: (a: ActionKind) => void
  onDetalhes: () => void
}) {
  const titulo = item.origem === 'compra'
    ? (item.itens?.[0]?.titulo ?? 'Compra')
    : item.livroTitulo
  const imagem = item.origem === 'compra'
    ? item.itens?.[0]?.imagem ?? null
    : item.livroImagem ?? null

  const entregaText = item.origem === 'compra'
    ? (item.entregaTipo === 'domicilio'
        ? (item.entregaEndereco ? `Domicílio: ${item.entregaEndereco}` : 'Domicílio')
        : (item.entregaTipo === 'biblioteca' ? 'Levantamento na biblioteca' : '—'))
    : (item.tipo === 'domicilio'
        ? (item.endereco ? `Domicílio: ${item.endereco}` : 'Domicílio')
        : (item.tipo === 'biblioteca' ? 'Levantamento na biblioteca' : '—'))

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-700" tabIndex={0}>
      <div className="flex gap-3">
        <img
          src={imageUrl(imagem ?? '') || ''}
          onError={(e) => ((e.target as HTMLImageElement).src = `https://dummyimage.com/96x128/f9fafb/111&text=${encodeURIComponent(titulo?.slice(0,10) || 'Item')}`)}
          alt=""
          className="h-24 w-18 min-w-18 rounded bg-gray-50 object-cover"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900">{titulo}</h3>

          <div className="mt-1 text-xs text-gray-700 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <FaCalendarAlt aria-hidden />
              <span>Pedido em {fmtDate(item.dataPedido ?? (item as any).createdAt)}</span>
            </div>

            {/* identificação */}
            {item.origem === 'compra' ? (
              <div className="flex flex-wrap items-center gap-2">
                <FaClipboardList aria-hidden />
                <span className="truncate">
                  Comprador: {item.clienteNome ?? '—'}{item.clienteEmail ? ` · ${item.clienteEmail}` : ''}
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <FaClipboardList aria-hidden />
                <span className="truncate">
                  Leitor/Família: {(item as RequisicaoDTO).nome}{(item as RequisicaoDTO).familiaEmail ? ` · ${(item as RequisicaoDTO).familiaEmail}` : ''}
                </span>
              </div>
            )}

            {/* entrega/agendamento */}
            <div className="flex flex-wrap items-center gap-2">
              <FaMapMarkerAlt aria-hidden />
              <span className="truncate">{entregaText}</span>
            </div>
            {item.origem !== 'compra' && ((item as RequisicaoDTO).dataResposta || (item as RequisicaoDTO).horario) && (
              <div className="flex flex-wrap items-center gap-2">
                <FaCalendarAlt aria-hidden />
                <span>
                  Agendado para {fmtDateOnly((item as RequisicaoDTO).dataResposta)} {(item as RequisicaoDTO).horario ?? ''}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2"><EstadoPills item={item} /></div>
          <div className="mt-2 flex items-center justify-between">
            <button onClick={onDetalhes} className="rounded border text-sm hover:bg-gray-50">Ver detalhes</button>
            <LinhaAcao item={item} openAction={openAction} />
          </div>
        </div>
      </div>
    </article>
  )
}

/* ------------------------------- Página ----------------------------------- */
export default function GestaoPedidos() {
  const [aba, setAba] = useState<Aba>('emprestimos')
  const [q, setQ] = useState('')
  const [statusEmp, setStatusEmp] = useState<FiltroStatusEmp>('todos')
  const [statusShop, setStatusShop] = useState<FiltroStatusShop>('todos')
  const [modo, setModo] = useState<'cards' | 'lista'>('cards')

  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [emprestimos, setEmprestimos] = useState<RequisicaoDTO[]>([])
  const [compras, setCompras] = useState<PedidoLojaDTO[]>([])
  const [ver, setVer] = useState<UIItem | null>(null)

  // ação ativa (modal)
  const [action, setAction] = useState<ActionKind>(null)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const [reqPage, shop] = await Promise.all([
        RequisicoesAPI.listar({ page: 1, pageSize: 200, status: statusEmp === 'todos' ? undefined : statusEmp }),
        PedidosLojaAPI.minhas(statusShop === 'todos' ? undefined : statusShop),
      ])
      setEmprestimos(reqPage.items)
      setCompras(shop)
    } catch (e) {
      const m = parseApiError(e)
      setErro(m)
      toast.error(m)
    } finally {
      setLoading(false)
    }
  }, [statusEmp, statusShop])

  useEffect(() => { carregar() }, [carregar])

  const termo = q.trim().toLowerCase()
  const items: UIItem[] = useMemo(() => {
    const emps: UIItem[] = emprestimos.map(r => ({ origem: 'emprestimo', ...r }))
    const shops: UIItem[] = compras.map(p => ({ origem: 'compra', ...p }))
    const base = aba === 'emprestimos' ? emps : shops
    if (!termo) return base
    return base.filter(it => JSON.stringify(it).toLowerCase().includes(termo))
  }, [emprestimos, compras, aba, termo])

  const kpis = useMemo(() => {
    if (aba === 'emprestimos') {
      const pend = emprestimos.filter(x => (x.statusRaw ?? x.status) === 'PENDENTE').length
      const conf = emprestimos.filter(x => (x.statusRaw ?? x.status) === 'APROVADA' || (x.statusRaw ?? x.status) === 'ENTREGUE').length
      const rej = emprestimos.filter(x => (x.statusRaw ?? x.status) === 'NEGADA' || (x.statusRaw ?? x.status) === 'DEVOLVIDA').length
      return { total: emprestimos.length, pend, conf, rej, comprasConfirmadas: 0 }
    } else {
      const pend = compras.filter(x => x.status === 'pendente').length
      const conf = compras.filter(x => ['confirmado','enviado','concluido'].includes(x.status)).length
      const rej = compras.filter(x => x.status === 'cancelado').length
      const comprasConfirmadas = compras
        .filter(x => ['confirmado','concluido'].includes(x.status))
        .reduce((acc, x) => acc + (x.total ?? 0), 0)
      return { total: compras.length, pend, conf, rej, comprasConfirmadas }
    }
  }, [aba, emprestimos, compras])

  /* ---------------------------- Handlers (API) ----------------------------- */
  const handleApprove = async (r: RequisicaoDTO, form: { data: string; hora: string; entregaTipo: 'domicilio'|'biblioteca'; endereco?: string }) => {
    try {
      await RequisicoesAPI.aprovar(r.id, {
        entregaTipo: form.entregaTipo,
        data: form.data,
        hora: form.hora,
        endereco: form.entregaTipo === 'domicilio' ? (form.endereco ?? '') : undefined,
      })
      toast.success(`Pedido aprovado para ${form.data} ${form.hora}`)
      setAction(null)
      carregar()
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const handleConfirm = async (which: 'negar'|'entregar'|'devolver', r: RequisicaoDTO) => {
    try {
      if (which === 'negar') await RequisicoesAPI.rejeitar(r.id)
      if (which === 'entregar') await RequisicoesAPI.entregar(r.id)
      if (which === 'devolver') await RequisicoesAPI.devolver(r.id)
      toast.success({
        negar: 'Pedido rejeitado',
        entregar: 'Entregue',
        devolver: 'Devolvido',
      }[which])
      setAction(null)
      carregar()
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const handleShop = async (p: PedidoLojaDTO, novo: PedidoLojaDTO['status']) => {
    try {
      await PedidosLojaAPI.patchStatus(
        p.id,
        (novo === 'pendente'
          ? 'PAGAMENTO_PENDENTE'
          : novo === 'confirmado'
          ? 'APROVADO'
          : novo.toUpperCase()) as any
      )
      toast.success(`Estado atualizado para ${novo}`)
      setAction(null)
      carregar()
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  /* -------------------------------- Render -------------------------------- */
  const lista = (items.length === 0 && !loading) ? (
    <div className="rounded-xl border bg-white p-8 text-center text-gray-700">Sem resultados.</div>
  ) : modo === 'lista' ? (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-900">
          <tr className="text-left">
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Título / Item</th>
            <th className="px-3 py-2">Pessoa</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Pedido</th>
            <th className="px-3 py-2">Agendamento</th>
            <th className="px-3 py-2">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it) => {
            const entregaText = it.origem === 'compra'
              ? (it.entregaTipo === 'domicilio'
                  ? (it.entregaEndereco ? `Domicílio: ${it.entregaEndereco}` : 'Domicílio')
                  : (it.entregaTipo === 'biblioteca' ? 'Levantamento na biblioteca' : '—'))
              : (it.tipo === 'domicilio'
                  ? (it.endereco ? `Domicílio: ${it.endereco}` : 'Domicílio')
                  : (it.tipo === 'biblioteca' ? 'Levantamento na biblioteca' : '—'))
            return (
              <tr key={(it as any).id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {it.origem === 'compra' ? <Pill tone="indigo">Compra</Pill> : <Pill tone="emerald">Empréstimo</Pill>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={imageUrl(it.origem === 'compra' ? it.itens?.[0]?.imagem ?? '' : it.livroImagem ?? '') || ''}
                      onError={(e) => ((e.target as HTMLImageElement).src = 'https://dummyimage.com/56x72/f9fafb/111&text=—')}
                      alt=""
                      className="h-14 w-10 rounded bg-gray-50 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {it.origem === 'compra'
                          ? (it.itens?.[0]?.titulo ?? `Pedido #${it.id}`)
                          : it.livroTitulo}
                      </div>
                      <div className="truncate text-xs text-gray-600">{entregaText}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-sm">
                  {it.origem === 'compra'
                    ? <>
                        <div>{it.clienteNome ?? '—'}</div>
                        <div className="text-xs text-gray-600">{it.clienteEmail ?? ''}</div>
                      </>
                    : <>
                        <div>{(it as RequisicaoDTO).nome}</div>
                        <div className="text-xs text-gray-600">{(it as RequisicaoDTO).familiaEmail ?? ''}</div>
                      </>
                  }
                </td>
                <td className="px-3 py-2">
                  <EstadoPills item={it} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(it.dataPedido ?? (it as any).createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {it.origem === 'compra'
                    ? '—'
                    : ((it as RequisicaoDTO).dataResposta || (it as RequisicaoDTO).horario)
                        ? `${fmtDateOnly((it as RequisicaoDTO).dataResposta)} ${(it as RequisicaoDTO).horario ?? ''}`
                        : '—'}
                </td>
                <td className="px-3 py-2">
                  <LinhaAcao
                    item={it}
                    openAction={(a) => setAction(a)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <section className="grid gap-4 lg:grid-cols-3" aria-label="Colunas de estado">
      <div className="rounded-xl border border-amber-200 bg-white/70">
        <ColHeader title="Pendentes" icon={FaInfoCircle} count={
          items.filter(it => it.origem === 'compra' ? it.status === 'pendente' : it.statusRaw === 'PENDENTE').length
        } tone="amber" />
        <div className="space-y-3 p-3">
          {items.filter(it => it.origem === 'compra' ? it.status === 'pendente' : it.statusRaw === 'PENDENTE')
            .map(it => (
              <ItemCard
                key={`${it.origem}-${(it as any).id}`}
                item={it}
                onDetalhes={() => setVer(it)}
                openAction={(a) => setAction(a)}
              />
            ))}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-white/70">
        <ColHeader title="Confirmados / Em curso" icon={FaCheck} count={
          items.filter(it =>
            it.origem === 'compra'
              ? (it.status === 'confirmado' || it.status === 'enviado')
              : (it.statusRaw === 'APROVADA' || it.statusRaw === 'ENTREGUE')
          ).length
        } tone="emerald" />
        <div className="space-y-3 p-3">
          {items.filter(it =>
            it.origem === 'compra'
              ? (it.status === 'confirmado' || it.status === 'enviado')
              : (it.statusRaw === 'APROVADA' || it.statusRaw === 'ENTREGUE')
          ).map(it => (
            <ItemCard
              key={`${it.origem}-${(it as any).id}`}
              item={it}
              onDetalhes={() => setVer(it)}
              openAction={(a) => setAction(a)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-rose-200 bg-white/70">
        <ColHeader title="Concluídos / Cancelados" icon={FaTimes} count={
          items.filter(it =>
            it.origem === 'compra'
              ? (it.status === 'concluido' || it.status === 'cancelado')
              : (it.statusRaw === 'DEVOLVIDA' || it.statusRaw === 'NEGADA')
          ).length
        } tone="rose" />
        <div className="space-y-3 p-3">
          {items.filter(it =>
            it.origem === 'compra'
              ? (it.status === 'concluido' || it.status === 'cancelado')
              : (it.statusRaw === 'DEVOLVIDA' || it.statusRaw === 'NEGADA')
          ).map(it => (
            <ItemCard
              key={`${it.origem}-${(it as any).id}`}
              item={it}
              onDetalhes={() => setVer(it)}
              openAction={(a) => setAction(a)}
            />
          ))}
        </div>
      </div>
    </section>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee] text-gray-900">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/75 backdrop-blur">
        <div className="mx-auto px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-extrabold tracking-tight text-blue-800 md:text-3xl">
              Gestão de Pedidos
            </h1>

            <div className="flex items-center gap-2">
              <nav aria-label="Selecionar tipo de pedidos" className="rounded-xl border bg-white p-1">
                <button
                  onClick={() => setAba('emprestimos')}
                  className={cls('px-3 py-1.5 text-sm rounded-lg', aba === 'emprestimos' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50')}
                  aria-pressed={aba === 'emprestimos'}
                >
                  Empréstimos
                </button>
                <button
                  onClick={() => setAba('compras')}
                  className={cls('px-3 py-1.5 text-sm rounded-lg', aba === 'compras' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50')}
                  aria-pressed={aba === 'compras'}
                >
                  Compras
                </button>
              </nav>

              <button onClick={carregar} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                <FaSyncAlt className="inline" /> Recarregar
              </button>
            </div>
          </div>

          <div className="mt-3">
            <Toolbar
              aba={aba}
              q={q}
              setQ={setQ}
              statusEmp={statusEmp}
              setStatusEmp={setStatusEmp}
              statusShop={statusShop}
              setStatusShop={setStatusShop}
              modo={modo}
              setModo={setModo}
              recarregar={carregar}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <HeaderStat label="Total linhas" value={kpis.total} icon={FaClipboardList} />
            <HeaderStat label="Pendentes" value={kpis.pend} icon={FaInfoCircle} />
            <HeaderStat
              label={aba === 'compras' ? 'STN compras confirmadas' : 'Confirmados/em curso'}
              value={aba === 'compras' ? fmtMoney(kpis.comprasConfirmadas) : kpis.conf}
              icon={aba === 'compras' ? FaShoppingCart : FaCheck}
            />
          </div>

          {erro && <p className="mt-2 text-sm text-rose-700" role="alert">{erro}</p>}
        </div>
      </header>

      <main id="conteudo" className="mx-auto px-4 py-6">
        {loading && (
          <div role="status" aria-live="polite" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        )}
        {!loading && lista}
      </main>

      {/* Modal Detalhes */}
      {ver && (
        <Dialog onClose={() => setVer(null)} title="Detalhes do pedido">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <img
                src={imageUrl(ver.origem === 'compra' ? ver.itens?.[0]?.imagem ?? '' : ver.livroImagem ?? '') || ''}
                onError={(e) => ((e.target as HTMLImageElement).src = 'https://dummyimage.com/192x256/f9fafb/111&text=—')}
                alt=""
                className="h-64 w-48 rounded bg-gray-50 object-cover"
              />
            </div>
            <div className="sm:col-span-2">
              <h3 className="text-xl font-bold text-blue-800">
                {ver.origem === 'compra' ? (ver.itens?.[0]?.titulo ?? `Pedido #${ver.id}`) : ver.livroTitulo}
              </h3>

              <div className="mt-2 space-y-1 text-sm">
                <div><b>Tipo:</b> {ver.origem === 'compra' ? 'Compra' : 'Empréstimo'}</div>
                <div><b>Estado:</b> {ver.origem === 'compra' ? ver.status : (ver as RequisicaoDTO).statusRaw}</div>

                {ver.origem === 'compra' ? (
                  <>
                    <div><b>Comprador:</b> {ver.clienteNome ?? '—'}</div>
                    {ver.clienteEmail && <div><b>Email:</b> {ver.clienteEmail}</div>}
                  </>
                ) : (
                  <>
                    <div><b>Leitor/Família:</b> {(ver as RequisicaoDTO).nome}</div>
                    {(ver as RequisicaoDTO).familiaEmail && <div><b>Email:</b> {(ver as RequisicaoDTO).familiaEmail}</div>}
                  </>
                )}

                <div><b>Pedido:</b> {fmtDate(ver.dataPedido ?? (ver as any).createdAt)}</div>

                {/* Endereço / Levantamento */}
                <div>
                  <b>Entrega:</b>{' '}
                  {ver.origem === 'compra'
                    ? (ver.entregaTipo === 'domicilio'
                        ? (ver.entregaEndereco ? `Domicílio: ${ver.entregaEndereco}` : 'Domicílio')
                        : (ver.entregaTipo === 'biblioteca' ? 'Levantamento na biblioteca' : '—'))
                    : ((ver as RequisicaoDTO).tipo === 'domicilio'
                        ? ((ver as RequisicaoDTO).endereco ? `Domicílio: ${(ver as RequisicaoDTO).endereco}` : 'Domicílio')
                        : ((ver as RequisicaoDTO).tipo === 'biblioteca' ? 'Levantamento na biblioteca' : '—'))
                  }
                </div>

                {/* Agendamento (apenas empréstimo) */}
                {ver.origem !== 'compra' && (((ver as RequisicaoDTO).dataResposta) || ((ver as RequisicaoDTO).horario)) && (
                  <div><b>Agendado para:</b> {fmtDateOnly((ver as RequisicaoDTO).dataResposta)} {(ver as RequisicaoDTO).horario ?? ''}</div>
                )}

                {ver.origem === 'compra' && (
                  <>
                    <div><b>Total:</b> {fmtMoney(ver.total)} STN</div>
                    <div><b>Pagamento:</b> {ver.pagamentoStatus ?? '—'}</div>
                  </>
                )}

                {ver.origem === 'emprestimo' && (
                  <>
                    {'diasDevolucao' in ver && typeof (ver as RequisicaoDTO).diasDevolucao === 'number' && (
                      <div><b>Prazo:</b> {(ver as RequisicaoDTO).diasDevolucao} dias</div>
                    )}
                    {'dataDevolucaoPrevista' in ver && (
                      <div><b>Devolver até:</b> {fmtDate((ver as RequisicaoDTO).dataDevolucaoPrevista as any)}</div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-4"><EstadoPills item={ver} /></div>

              <div className="mt-6 flex flex-wrap gap-2 justify-end">
                <button className="rounded bg-gray-100 px-4 py-2 hover:bg-gray-200" onClick={() => setVer(null)}>Fechar</button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal de ações */}
      {action && action.type === 'aprovar' && (
        <AprovarDialog
          req={action.req}
          onCancel={() => setAction(null)}
          onSubmit={(form) => handleApprove(action.req, form)}
        />
      )}

      {action && action.type === 'confirm' && (
        <ConfirmDialog
          title={action.title}
          hint={action.hint}
          onCancel={() => setAction(null)}
          onConfirm={() => handleConfirm(action.what, action.req)}
        />
      )}

      {action && action.type === 'shop' && (
        <ConfirmDialog
          title={`Atualizar estado da compra para "${action.next}"?`}
          onCancel={() => setAction(null)}
          onConfirm={() => handleShop(action.pedido, action.next)}
        />
      )}
    </div>
  )
}

/* --------------------------- Cabeçalho de coluna --------------------------- */
function ColHeader({ title, count, icon: Icon, tone }:{
  title: string; count: number; icon: any; tone: 'amber'|'emerald'|'rose'
}) {
  const toneMap: Record<string,string> = {
    amber: 'from-amber-50 via-white to-white',
    emerald: 'from-emerald-50 via-white to-white',
    rose: 'from-rose-50 via-white to-white',
  }
  return (
    <div className={cls('flex items-center justify-between rounded-t-xl bg-gradient-to-r px-3 py-2', toneMap[tone])}>
      <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
        <Icon aria-hidden />
        <span>{title}</span>
      </div>
      <span className="rounded-full bg-gray-900/90 px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
    </div>
  )
}

/* --------------------------------- Dialogs -------------------------------- */
function Dialog({ title, children, onClose }:{
  title: string; children: any; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl rounded-xl border bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="rounded px-2 py-1 text-sm hover:bg-gray-50" onClick={onClose} aria-label="Fechar">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ConfirmDialog({ title, hint, onCancel, onConfirm }:{
  title: string; hint?: string; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      {hint && <p className="mb-4 text-sm text-gray-700">{hint}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded bg-gray-100 px-4 py-2 hover:bg-gray-200">Cancelar</button>
        <button onClick={onConfirm} className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-800">Confirmar</button>
      </div>
    </Dialog>
  )
}

function AprovarDialog({ req, onCancel, onSubmit }:{
  req: RequisicaoDTO
  onCancel: () => void
  onSubmit: (form: { data: string; hora: string; entregaTipo: 'domicilio'|'biblioteca'; endereco?: string }) => void
}) {
  const [data, setData] = useState<string>('')
  const [hora, setHora] = useState<string>('')
  const [entregaTipo, setEntregaTipo] = useState<'domicilio'|'biblioteca'>('biblioteca')
  const [endereco, setEndereco] = useState<string>('')

  const precisaEndereco = entregaTipo === 'domicilio'

  const canSubmit = data && hora && (!precisaEndereco || endereco.trim().length > 4)

  return (
    <Dialog title={`Aprovar / Agendar — ${req.livroTitulo}`} onClose={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Data</label>
          <input type="date" className="mt-1 w-full rounded border px-3 py-2"
            value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Hora</label>
          <input type="time" className="mt-1 w-full rounded border px-3 py-2"
            value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Tipo de entrega</label>
          <div className="mt-1 flex gap-2">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="entrega" checked={entregaTipo==='biblioteca'} onChange={() => setEntregaTipo('biblioteca')} />
              <span>Levantamento na biblioteca</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="entrega" checked={entregaTipo==='domicilio'} onChange={() => setEntregaTipo('domicilio')} />
              <span>Domicílio</span>
            </label>
          </div>
        </div>

        {precisaEndereco && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Endereço</label>
            <input type="text" className="mt-1 w-full rounded border px-3 py-2"
              placeholder="Rua, nº, bairro…" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded bg-gray-100 px-4 py-2 hover:bg-gray-200">Cancelar</button>
        <button
          disabled={!canSubmit}
          onClick={() => onSubmit({ data, hora, entregaTipo, endereco: precisaEndereco ? endereco : undefined })}
          className={cls('rounded px-4 py-2 text-white',
            canSubmit ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-emerald-300 cursor-not-allowed')}
        >
          Aprovar e agendar
        </button>
      </div>
    </Dialog>
  )
}
