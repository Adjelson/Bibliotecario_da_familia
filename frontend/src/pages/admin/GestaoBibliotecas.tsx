// src/pages/GestaoBibliotecas.tsx
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { Toaster, toast } from 'sonner'
import {
  Building2, MapPin, Search, Plus, Pencil, Trash2, Download, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  BibliotecasAPI,
  parseApiError,
  type Biblioteca,
  downloadBlob,
} from '../../api/client'

// ============================ Validação ============================
const Schema = Yup.object({
  nome: Yup.string().trim().min(2, 'Mínimo 2 caracteres').required('Obrigatório'),
  local: Yup.string().trim().nullable(),
})

type PageLike<T> = { items: T[]; total: number; page: number; pageSize: number } | T[]

function toItems<T>(r: PageLike<T>): { items: T[]; total?: number; page?: number; pageSize?: number } {
  if (Array.isArray(r)) return { items: r }
  return r
}

function useDebounced<T>(value: T, delay = 350) {
  const [v, setV] = useState(value)
  const t = useRef<number | null>(null)
  useEffect(() => {
    if (t.current) window.clearTimeout(t.current)
    t.current = window.setTimeout(() => setV(value), delay)
    return () => { if (t.current) window.clearTimeout(t.current) }
  }, [value, delay])
  return v
}

export default function GestaoBibliotecas() {
  const [data, setData] = useState<Biblioteca[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q, 400)

  const [isOpen, setIsOpen] = useState(false)
  const [modoEdicao, setModoEdicao] = useState(false)
  const [edicao, setEdicao] = useState<Biblioteca | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => { document.title = 'Gestão de Bibliotecas' }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // tenta endpoint admin (paginado). Se falhar, cai no público.
      let res: any
      try {
        res = await BibliotecasAPI.listarAdmin({
          q: debouncedQ || undefined,
          page,
          pageSize,
          sort: 'nome',
          order: 'asc',
        })
      } catch {
        res = await BibliotecasAPI.listarPublic({
          q: debouncedQ || undefined, page: 1, pageSize: 500,
        })
      }
      const pl = toItems<Biblioteca>(res)
      const items = [...(pl.items ?? [])].sort((a, b) => a.nome.localeCompare(b.nome))
      setData(items)
      setTotal(typeof pl.total === 'number' ? pl.total : items.length)
    } catch (e) {
      setError(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])

  const filtrados = useMemo(() => {
    if (!debouncedQ.trim()) return data
    const s = debouncedQ.toLowerCase()
    return data.filter(b =>
      b.nome.toLowerCase().includes(s) ||
      (b.local ?? '').toLowerCase().includes(s),
    )
  }, [data, debouncedQ])

  // ============================ UI helpers ============================
  const openCriar = () => {
    setEdicao({ id: 0 as any, nome: '', local: '' })
    setModoEdicao(false)
    setIsOpen(true)
  }
  const openEditar = (b: Biblioteca) => {
    setEdicao({ ...b, local: b.local ?? '' })
    setModoEdicao(true)
    setIsOpen(true)
  }
  const closeModal = () => setIsOpen(false)

  const nomeExiste = (nome: string, idAtual?: number | string) =>
    data.some((b) => b.nome.toLowerCase() === nome.toLowerCase() && b.id !== idAtual)

  async function eliminar(id: number | string) {
    if (!confirm('Tens a certeza que queres eliminar esta biblioteca?')) return
    try {
      await BibliotecasAPI.remover(id)
      setData((prev) => prev.filter((x) => x.id !== id))
      setTotal((t) => (t == null ? t : Math.max(0, t - 1)))
      toast.success('Biblioteca eliminada.')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  async function exportCSV() {
    try {
      await downloadBlob('/bibliotecas/export/csv', 'bibliotecas.csv', { q: debouncedQ || undefined })
      toast.success('Export concluído.')
    } catch {
      // fallback local
      try {
        const header = 'id;nome;local\n'
        const rows = filtrados.map((b) => `${b.id};${b.nome};${b.local ?? ''}`).join('\n')
        const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'bibliotecas.csv'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Export gerado localmente.')
      } catch (e) {
        toast.error('Falha ao gerar CSV.')
      }
    }
  }

  const canPrev = page > 1
  const canNext = total != null ? page * pageSize < total : false

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee] py-6 px-4 lg:px-3">
      <Toaster richColors closeButton />
      <div className="mx-auto ">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700">
              Bibliotecas
            </h1>
            <p className="text-sm text-gray-600">Gerir bibliotecas do sistema (apenas administradores).</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
                placeholder="Pesquisar por nome ou local"
                className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>
            <button
              onClick={exportCSV}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              onClick={openCriar}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Nova
            </button>
          </div>
        </div>

        {/* Estado */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-gray-100 bg-white p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-gray-100" />
                  <div className="flex-1">
                    <div className="h-4 w-48 rounded bg-gray-100 mb-2" />
                    <div className="h-3 w-36 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="mt-4 h-8 w-24 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {filtrados.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 text-purple-700 ring-1 ring-purple-200">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-gray-900">{b.nome}</div>
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        {b.local || <span className="italic text-gray-400">Sem local</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditar(b)}
                      className="rounded-md p-2 text-blue-700 hover:bg-blue-50"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => eliminar(b.id)}
                      className="rounded-md p-2 text-red-600 hover:bg-red-50"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {!loading && filtrados.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 md:col-span-2">
                  Nenhuma biblioteca encontrada.
                </div>
              )}
            </div>

            {/* Paginação */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {total != null ? `Total: ${total}` : `Registos: ${filtrados.length}`}
              </div>
              {total != null && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={!canPrev}
                    onClick={() => canPrev && setPage((p) => p - 1)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${canPrev ? 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200' : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                  <span className="text-sm text-gray-700">Página {page}</span>
                  <button
                    disabled={!canNext}
                    onClick={() => canNext && setPage((p) => p + 1)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${canNext ? 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200' : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
                  >
                    Seguinte <ChevronRight className="h-4 w-4" />
                  </button>

                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="ml-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
                    title="Itens por página"
                  >
                    {[8, 12, 24, 48].map((n) => <option key={n} value={n}>{n}/página</option>)}
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {/* Modal Adição/Edição */}
        <Transition appear show={isOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={closeModal}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-200"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-150"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 text-left shadow-xl">
                    <div className="mb-2 flex items-center justify-between">
                      <Dialog.Title className="text-lg font-bold text-gray-900">
                        {modoEdicao ? 'Editar biblioteca' : 'Nova biblioteca'}
                      </Dialog.Title>
                      <button onClick={closeModal} className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {edicao && (
                      <Formik
                        initialValues={{ nome: edicao.nome ?? '', local: (edicao.local as string) ?? '' }}
                        enableReinitialize
                        validationSchema={Schema}
                        onSubmit={async (values, { setSubmitting }) => {
                          try {
                            const nome = values.nome.trim()
                            const local = values.local?.trim() || null

                            if (nomeExiste(nome, edicao.id || undefined)) {
                              toast.warning('Já existe uma biblioteca com este nome.')
                              return
                            }

                            if (modoEdicao && edicao.id) {
                              const updated = await BibliotecasAPI.atualizar(edicao.id, { nome, local })
                              setData((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                              toast.success('Biblioteca atualizada.')
                            } else {
                              const created = await BibliotecasAPI.criar({ nome, local })
                              setData((prev) => [...prev, created].sort((a, b) => a.nome.localeCompare(b.nome)))
                              setTotal((t) => (t == null ? t : t + 1))
                              toast.success('Biblioteca criada.')
                            }
                            closeModal()
                          } catch (e) {
                            toast.error(parseApiError(e))
                          } finally {
                            setSubmitting(false)
                          }
                        }}
                      >
                        {({ isSubmitting }) => (
                          <Form className="space-y-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
                              <Field
                                name="nome"
                                autoFocus
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-600"
                              />
                              <ErrorMessage name="nome" component="div" className="mt-1 text-sm text-red-600" />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">Local</label>
                              <Field
                                name="local"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-600"
                              />
                              <ErrorMessage name="local" component="div" className="mt-1 text-sm text-red-600" />
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={closeModal}
                                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
                              >
                                {modoEdicao ? 'Guardar alterações' : 'Criar'}
                              </button>
                            </div>
                          </Form>
                        )}
                      </Formik>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>
      </div>
    </div>
  )
}
