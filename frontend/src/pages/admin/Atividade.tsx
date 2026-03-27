// src/pages/admin/Atividades.tsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  Pencil, Trash2, Plus, RefreshCcw, Loader2, Eye, Image as ImageIcon, X, LocateFixed,
  User, Users, Mail, CheckCircle2, CircleX
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import {
  AtividadesAPI, // compat: aponta para /eventos
  parseApiError,
  type Atividade,
  imageUrl,
  type AdminInscricaoRow,
} from '../../api/client'

type FiltroTempo = 'todas' | 'hoje' | 'futuras' | 'passadas'

type FormState = {
  titulo: string
  descricao: string
  data: string
  local: string
  vagas: number
  status: 'agendada' | 'em_andamento' | 'concluida'
}

/* ============ helpers ============ */
const splitHorario = (h?: string) => {
  if (!h) return { ini: '', fim: '' }
  const m = h.trim().match(/^(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})$/)
  return m ? { ini: `${m[1]}:${m[2]}`, fim: `${m[3]}:${m[4]}` } : { ini: '', fim: '' }
}
const makeHorario = (ini: string, fim: string) => `${ini} - ${fim}`
const dateISOToday = () => new Date().toISOString().split('T')[0]
const safeDateLabel = (d?: string) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })
}
const badgeCls = (status?: Atividade['status']) =>
  status === 'em_andamento' ? 'bg-amber-100 text-amber-800'
  : status === 'concluida' ? 'bg-emerald-100 text-emerald-800'
  : 'bg-blue-100 text-blue-800'

/* ============ compat API names ============ */
async function apiList(params: any) {
  const api: any = AtividadesAPI as any
  return typeof api.list === 'function' ? api.list(params) : api.listar(params)
}
async function apiCreate(payload: any) {
  const api: any = AtividadesAPI as any
  return typeof api.create === 'function' ? api.create(payload) : api.criar(payload)
}
async function apiUpdate(id: number, payload: any) {
  const api: any = AtividadesAPI as any
  return typeof api.update === 'function' ? api.update(id, payload) : api.atualizar(id, payload)
}
async function apiRemove(id: number) {
  const api: any = AtividadesAPI as any
  return typeof api.remove === 'function' ? api.remove(id) : api.remover(id)
}
async function apiUploadImagem(id: number, file: File) {
  const api: any = AtividadesAPI as any
  const fn = api.uploadImagem || api.uploadImage || api.imageUpload
  if (!fn) throw new Error('Endpoint de upload de imagem não disponível')
  return fn(id, file)
}

/* ============ inscritos totals ============ */
function computeTotals(rows: AdminInscricaoRow[]) {
  const participantes = rows.reduce((acc, r) => acc + r.qtdAdultos + r.qtdFilhos, 0)
  const presencas = rows.reduce((acc, r) => acc + (r.presente ? 1 : 0), 0)
  return { participantes, presencas }
}

/* ============ componente ============ */
export default function AtividadesAdmin() {
  useEffect(() => { document.title = 'Gestão de Atividades | Admin' }, [])

  // listagem
  const [items, setItems] = useState<Atividade[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  const [busca, setBusca] = useState('')
  const [fTempo, setFTempo] = useState<FiltroTempo>('todas')

  // form/modal
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState<Atividade | null>(null)
  const [form, setForm] = useState<FormState>({
    titulo: '', descricao: '', data: dateISOToday(), local: '', vagas: 10, status: 'agendada',
  })
  const [horaIni, setHoraIni] = useState<string>('10:00')
  const [horaFim, setHoraFim] = useState<string>('11:00')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')

  // inscritos
  const [showInscritos, setShowInscritos] = useState(false)
  const [inscLoading, setInscLoading] = useState(false)
  const [inscRows, setInscRows] = useState<AdminInscricaoRow[]>([])
  const [inscEvento, setInscEvento] = useState<Atividade | null>(null)
  const [inscBusca, setInscBusca] = useState('')
  const [inscModo, setInscModo] = useState<'todos' | 'individual' | 'familia_total' | 'familia_parcial'>('todos')
  const [inscPresenca, setInscPresenca] = useState<'todos' | 'presentes' | 'ausentes'>('todos')

  const hojeISO = dateISOToday()
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  async function load() {
    setLoading(true)
    try {
      const params: any = { page, pageSize, tempo: fTempo }
      if (busca.trim()) params.q = busca.trim()
      const resp = await apiList(params)
      setItems(resp.items ?? [])
      setTotal(resp.total ?? 0)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [page, pageSize, fTempo]) // eslint-disable-line

  /* ------- form helpers ------- */
  function resetForm() {
    setCurrent(null)
    setForm({ titulo: '', descricao: '', data: dateISOToday(), local: '', vagas: 10, status: 'agendada' })
    setHoraIni('10:00'); setHoraFim('11:00')
    setFile(null); setPreview('')
  }
  function openCreate() { resetForm(); setShowModal(true) }
  function openEdit(a: Atividade) {
    setCurrent(a)
    setForm({
      titulo: a.titulo ?? '', descricao: a.descricao ?? '', data: a.data ?? dateISOToday(),
      local: a.local ?? '', vagas: a.vagas ?? 1, status: (a.status as any) ?? 'agendada',
    })
    const { ini, fim } = splitHorario(a.horario)
    setHoraIni(ini || '10:00'); setHoraFim(fim || '11:00')
    setFile(null); setPreview(a.imagem ? imageUrl(a.imagem) : '')
    setShowModal(true)
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((s) => ({ ...s, [name]: name === 'vagas' ? Number(value) : value }) as FormState)
  }

  /* ------- submit/remove ------- */
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!horaIni || !horaFim) return toast.error('Seleciona o horário')
    const start = new Date(`${form.data}T${horaIni}:00`)
    const end = new Date(`${form.data}T${horaFim}:00`)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return toast.error('Horas inválidas')
    if (end <= start) return toast.error('Fim deve ser depois do início')
    if (form.vagas < 1) return toast.error('Vagas deve ser ≥ 1')

    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim(),
      data: form.data,
      horario: makeHorario(horaIni, horaFim),
      local: form.local.trim(),
      vagas: Number(form.vagas),
      status: form.status,
    }

    setSaving(true)
    try {
      let saved: Atividade
      if (current?.id) saved = await apiUpdate(Number(current.id), payload)
      else saved = await apiCreate(payload)

      if (file) {
        try {
          const up = await apiUploadImagem(Number(saved.id), file)
          setItems((arr) => arr.map(it => Number(it.id) === Number(saved.id) ? { ...it, imagem: up.imagem ?? it.imagem } : it))
        } catch (upErr) {
          toast.error('Atividade guardada, mas falhou o upload da imagem: ' + parseApiError(upErr))
        }
      }

      toast.success('Atividade guardada')
      setShowModal(false)
      await load()
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Eliminar esta atividade?')) return
    try {
      await apiRemove(id)
      toast.success('Atividade removida')
      if (page > 1 && items.length === 1) setPage((p) => Math.max(1, p - 1))
      else await load()
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  /* ------- inscritos ------- */
  function openInscritos(a: Atividade) {
    setInscEvento(a)
    setShowInscritos(true)
    setInscBusca('')
    setInscModo('todos')
    setInscPresenca('todos')
    loadInscritos(Number(a.id))
  }

  async function loadInscritos(eventoId: number) {
    setInscLoading(true)
    try {
      const rows = await AtividadesAPI.listarParticipantes(eventoId)
      setInscRows(rows)
      const totals = computeTotals(rows)
      setItems(arr => arr.map(it => Number(it.id) === eventoId
        ? { ...it, inscritos: totals.participantes, participantes: totals.participantes }
        : it))
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setInscLoading(false)
    }
  }

  async function removerInscricao(participanteId: number) {
    if (!inscEvento) return
    const eventoId = Number(inscEvento.id)
    if (!confirm('Remover esta inscrição?')) return
    try {
      await AtividadesAPI.removerInscricao(eventoId, participanteId)
      const newRows = inscRows.filter(r => r.id !== participanteId)
      setInscRows(newRows)
      const totals = computeTotals(newRows)
      setItems(arr => arr.map(it => Number(it.id) === eventoId
        ? { ...it, inscritos: totals.participantes, participantes: totals.participantes }
        : it))
      toast.success('Inscrição removida')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  /* ------- filtros inscritos ------- */
  const inscFiltered = useMemo(() => {
    let rows = [...inscRows]
    if (inscModo !== 'todos') rows = rows.filter(r => r.modo === inscModo)
    if (inscPresenca !== 'todos') rows = rows.filter(r => r.presente === (inscPresenca === 'presentes'))
    if (inscBusca.trim()) {
      const q = inscBusca.trim().toLowerCase()
      rows = rows.filter(r => {
        const fam = r.familia?.responsavel?.name ?? ''
        const u = r.utilizador?.name ?? ''
        const email = r.utilizador?.email ?? r.familia?.responsavel?.email ?? ''
        return `${fam} ${u} ${email}`.toLowerCase().includes(q)
      })
    }
    return rows
  }, [inscRows, inscModo, inscPresenca, inscBusca])

  const inscTotals = useMemo(() => computeTotals(inscFiltered), [inscFiltered])

  /* ============ UI ============ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee]">
      <Toaster position="top-center" richColors closeButton />
      <main className="mx-auto px-3 py-3">
        {/* Header + filtros */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-800">
              Gestão de Atividades
            </h1>
            <p className="mt-1 text-sm text-gray-700">Cria, edita, remove e acompanha inscrições.</p>
          </div>

          <div className="flex flex-col gap-2 w-full md:w-auto md:flex-row md:items-center">
            <select
              value={fTempo}
              onChange={(e) => { setPage(1); setFTempo(e.target.value as FiltroTempo) }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
            >
              <option value="todas">Todas</option>
              <option value="hoje">Hoje</option>
              <option value="futuras">Futuras</option>
              <option value="passadas">Passadas</option>
            </select>

            <input
              value={busca}
              onChange={(e) => { setPage(1); setBusca(e.target.value) }}
              placeholder="Pesquisar título, local…"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-purple-600"
            />

            <div className="flex gap-2">
              <button
                onClick={() => load()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Atualizar
              </button>
              <button
                onClick={openCreate}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Nova atividade
              </button>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Atividade</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Data/Horário</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">Capacidade</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-600">
                      <Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> A carregar…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">Sem resultados.</td>
                  </tr>
                ) : (
                  items
                    .filter(a => !busca.trim()
                      || `${a.titulo ?? ''} ${a.descricao ?? ''} ${a.local ?? ''}`.toLowerCase().includes(busca.toLowerCase()))
                    .map((a) => {
                      const inscritos = a.inscritos ?? a.participantes ?? 0
                      const vagas = a.vagas ?? 0
                      const lotacao = vagas > 0 ? Math.round((inscritos / vagas) * 100) : 0
                      const isLotado = vagas > 0 && inscritos >= vagas

                      return (
                        <tr key={Number(a.id)} className="hover:bg-gray-50/60">
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeCls(a.status)}`}>
                              {a.status === 'em_andamento' ? 'Em andamento' : a.status === 'concluida' ? 'Concluída' : 'Agendada'}
                            </span>
                            {(a.data ?? '') === hojeISO && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                                Hoje
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200">
                                {a.imagem ? (
                                  <img src={imageUrl(a.imagem)} alt="" className="h-full w-full object-cover text-center" />
                                ) : (
                                  <div className="grid h-full w-full place-items-center bg-gray-100 text-gray-400">
                                    <ImageIcon className="h-5 w-5" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{a.titulo ?? '—'}</div>
                                <div className="line-clamp-1 text-sm text-gray-600">{a.descricao ?? '—'}</div>
                                <div className="mt-1 flex items-center gap-1 text-[12px] text-gray-500">
                                  <LocateFixed className="h-3.5 w-3.5" /> {a.local ?? '—'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-sm">
                            <div className="text-gray-900">{safeDateLabel(a.data)}</div>
                            <div className="text-gray-600">{a.horario ?? '—'}</div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-40 rounded-full bg-gray-200">
                                <div
                                  className={`h-2.5 rounded-full ${isLotado ? 'bg-red-600' : 'bg-blue-600'}`}
                                  style={{ width: `${Math.min(Math.max(lotacao, 0), 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-gray-700">
                                {inscritos}/{vagas}
                              </span>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => openInscritos(a)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1"
                                title="Ver inscritos"
                              >
                                <Eye className="h-4 w-4" /> Inscritos
                              </button>
                              <button
                                onClick={() => openEdit(a)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1"
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" /> Editar
                              </button>
                              <button
                                onClick={() => remove(Number(a.id))}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-red-600"
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4" /> Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          </div>

          {/* paginação */}
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <div className="text-gray-700">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong> — {total} registos
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)) }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1"
              >
                {[10, 20, 50].map(n => <option key={n} value={n}>{n}/página</option>)}
              </select>
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:opacity-50"
              >
                Seguinte
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Modal CRIAR/EDITAR */}
      {showModal && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <form
            onSubmit={submit}
            className="relative z-[101] mx-auto mt-8 w-[min(100%,42rem)] overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-xl backdrop-blur-xl"
            role="dialog" aria-modal="true" aria-labelledby="modal-atividade-title"
          >
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 id="modal-atividade-title" className="text-lg font-bold text-gray-900">
                {current ? 'Editar atividade' : 'Nova atividade'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-md p-1 text-gray-600 hover:bg-gray-100" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
              {/* Imagem */}
              <div className="sm:col-span-1">
                <label className="mb-1 block text-sm font-medium text-gray-800">Imagem</label>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50/60">
                  {preview ? (
                    <img src={preview} alt="Pré-visualização" className="absolute inset-0 h-full w-full object-cover" />
                  ) : current?.imagem ? (
                    <img src={imageUrl(current.imagem)} alt="Imagem atual" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-gray-400">
                      <ImageIcon className="h-7 w-7" />
                      <span className="mt-1 text-xs">Sem imagem</span>
                    </div>
                  )}
                </div>
                <input
                  id="file"
                  type="file"
                  accept="image/*"
                  className="mt-2 block w-full text-sm border border-gray-300 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-600 file:mr-4 file:rounded-md file:border-0 file:bg-purple-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-purple-700"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setFile(f || null)
                    if (f) {
                      const reader = new FileReader()
                      reader.onload = (ev) => setPreview(String(ev.target?.result || ''))
                      reader.readAsDataURL(f)
                    } else {
                      setPreview(current?.imagem ? imageUrl(current.imagem) : '')
                    }
                  }}
                />
              </div>

              {/* Campos */}
              <div className="sm:col-span-2 grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-800">Título *</label>
                  <input
                    name="titulo" value={form.titulo} onChange={handleChange} required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-800">Descrição *</label>
                  <textarea
                    name="descricao" rows={4} value={form.descricao} onChange={handleChange} required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">Data *</label>
                    <input
                      type="date" name="data" value={form.data} onChange={handleChange} required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">Local *</label>
                    <input
                      name="local" value={form.local} onChange={handleChange} required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">Início *</label>
                    <input
                      type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">Fim *</label>
                    <input
                      type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">Vagas *</label>
                    <input
                      type="number" name="vagas" min={1} value={form.vagas} onChange={handleChange} required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-800">Estado</label>
                  <select
                    name="status" value={form.status} onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600"
                  >
                    <option value="agendada">Agendada</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button type="button" onClick={() => setShowModal(false)} className="rounded-md border px-4 py-2">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-60">
                {saving
                  ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> A guardar…</span>
                  : (current ? 'Atualizar' : 'Criar')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal INSCRITOS */}
      {showInscritos && inscEvento && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowInscritos(false)} />
          <div className="relative z-[101] mx-auto mt-8 w-[min(100%,56rem)] overflow-hidden rounded-2xl border-white/60 bg-white/95 shadow-xl backdrop-blur-xl">
            <div className="flex items-center bg-blue-600 text-white justify-between border-b px-5 py-3">
              <div>
                <h2 className="text-lg font-bold text-white">Inscritos — {inscEvento.titulo}</h2>
                <p className="text-sm">
                  {safeDateLabel(inscEvento.data)} · {inscEvento.horario ?? '—'} · {inscEvento.local ?? '—'}
                </p>
              </div>
              <button onClick={() => setShowInscritos(false)} className="rounded-md p-1 text-white hover:bg-gray-100 hover:text-black" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* filtros topo */}
            <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                  Participantes: {inscTotals.participantes}
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                  Presenças marcadas: {inscTotals.presencas}
                </div>
                <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
                  Inscrições (linhas): {inscFiltered.length}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={inscBusca}
                  onChange={(e) => setInscBusca(e.target.value)}
                  placeholder="Pesquisar nome/email…"
                  className="w-48 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
                <select
                  value={inscModo}
                  onChange={(e) => setInscModo(e.target.value as any)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="todos">Todos os modos</option>
                  <option value="individual">Individual</option>
                  <option value="familia_total">Família completa</option>
                  <option value="familia_parcial">Família parcial</option>
                </select>
                <select
                  value={inscPresenca}
                  onChange={(e) => setInscPresenca(e.target.value as any)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="todos">Todas</option>
                  <option value="presentes">Com presença</option>
                  <option value="ausentes">Sem presença</option>
                </select>
                <button
                  onClick={() => inscEvento && loadInscritos(Number(inscEvento.id))}
                  disabled={inscLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {inscLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Atualizar
                </button>
              </div>
            </div>

            {/* lista */}
            <div className="max-h-[60vh] overflow-y-auto">
              {inscLoading ? (
                <div className="p-6 text-center text-gray-600">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> A carregar inscrições…
                </div>
              ) : inscFiltered.length === 0 ? (
                <div className="p-10 text-center text-gray-500">Sem inscritos a mostrar.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {inscFiltered.map((r) => {
                    const nome = r.utilizador?.name ?? r.familia?.responsavel?.name ?? '—'
                    const email = r.utilizador?.email ?? r.familia?.responsavel?.email ?? ''
                    const modoLabel =
                      r.modo === 'familia_total' ? 'Família completa'
                        : r.modo === 'familia_parcial' ? 'Família (parcial)'
                          : 'Individual'
                    const qtd = r.qtdAdultos + r.qtdFilhos
                    return (
                      <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                        <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100">
                          {r.modo === 'individual' ? <User className="h-4 w-4 text-gray-600" /> : <Users className="h-4 w-4 text-gray-600" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-gray-900">{nome}</span>
                            {email && (
                              <span className="inline-flex items-center gap-1 truncate text-xs text-gray-600">
                                <Mail className="h-3.5 w-3.5" /> {email}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-800">{modoLabel}</span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Adultos: {r.qtdAdultos}</span>
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-800">Filhos: {r.qtdFilhos}</span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${r.presente ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {r.presente ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
                              {r.presente ? 'Presença marcada' : 'Sem presença'}
                            </span>
                            {r.createdAt && <span className="text-gray-500">· Inscrito em {new Date(r.createdAt).toLocaleString('pt-PT')}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-700">{qtd} participante(s)</span>
                          <button
                            onClick={() => removerInscricao(r.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-red-600 hover:bg-red-50"
                            title="Remover inscrição"
                          >
                            <Trash2 className="h-4 w-4" /> Remover
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button onClick={() => setShowInscritos(false)} className="rounded-md border px-4 py-2">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
