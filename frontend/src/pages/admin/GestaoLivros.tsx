// src/pages/admin/GestaoLivros.tsx
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { FaPlus, FaTrash, FaEdit, FaSearch, FaBook, FaShoppingCart, FaExchangeAlt } from 'react-icons/fa'
import { Toaster, toast } from 'sonner'
import vazio from '../../assets/undraw_going-up_g8av.svg'

// runtime
import { LivrosAPI, RequisicoesAPI, parseApiError, imageUrl, BibliotecasAPI, type Biblioteca, useAuth } from '../../api/client'
// tipos
import type { ID, Livro as LivroDTO, TipoAquisicao } from '../../api/client'

type LivroForm = Omit<LivroDTO, 'id' | 'createdAt' | 'updatedAt' | 'bibliotecaId'> & {
  imagem?: string
  customCategoria?: string
}

// ====================== CATEGORIAS PRÉ-DEFINIDAS ======================
const CATEGORIAS_FIXAS = [
  'Geral','Infantil','Fantasia','Aventura','Ficção científica','Mistério','Romance','História',
  'Educação','Biografia','Poesia','HQ/Mangá','Autoajuda','Tecnologia','Arte','Religião','Saúde',
  'Esportes','Outro',
] as const

const schema = Yup.object({
  imagem: Yup.string().optional(),
  titulo: Yup.string().trim().required('Título é obrigatório'),
  autor: Yup.string().trim().required('Autor é obrigatório'),
  faixaEtaria: Yup.string().trim().required('Selecione a faixa etária'),
  categoria: Yup.string().trim().required('Categoria é obrigatória'),
  customCategoria: Yup.string().trim().when('categoria', {
    is: (v: string) => v === 'Outro',
    then: (s) => s.min(2, 'Informe a categoria').required('Informe a categoria'),
    otherwise: (s) => s.optional(),
  }),
  preco: Yup.number().nullable().when('tipoAquisicao', {
    is: 'compra',
    then: (s) => s.typeError('Introduza um valor numérico').min(0, 'Não pode ser negativo').required('Preço obrigatório'),
    otherwise: (s) => s.nullable().transform(() => null),
  }),
  quantidade: Yup.number().min(0, 'Mínimo 0').required('Informe a quantidade'),
  tipoAquisicao: Yup.mixed<TipoAquisicao>().oneOf(['compra', 'emprestimo']).required(),
  diasDevolucao: Yup.number().nullable().when('tipoAquisicao', {
    is: 'emprestimo',
    then: (s) => s.typeError('Introduza um número').min(1, 'Pelo menos 1 dia').required('Obrigatório em empréstimo'),
    otherwise: (s) => s.nullable().transform(() => null),
  }),
  descricao: Yup.string().max(1000, 'Máx. 1000 caracteres'),
})

type ReqModalState = {
  open: boolean
  livro: LivroDTO | null
  modo: 'compra' | 'emprestimo'
  familiaId?: number | ''
  entregaTipo?: '' | 'domicilio' | 'biblioteca'
  endereco?: string
}

export default function GestaoLivros() {
  const { user } = useAuth()
  const role = (user?.role ?? '').toString().toUpperCase()
  const canManage = role === 'ADMIN' || role === 'BIBLIOTECARIO'
  const isAdmin = role === 'ADMIN'

  // lista/paginação
  const [items, setItems] = useState<LivroDTO[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)

  // filtros
  const [q, setQ] = useState('')
  const [filtros, setFiltros] = useState<{ tipo: 'todos' | TipoAquisicao; categoria: string }>({ tipo: 'todos', categoria: 'todas' })

  // filtro de biblioteca (só ADMIN)
  const [bibliotecas, setBibliotecas] = useState<Biblioteca[]>([])
  const [bibliotecaId, setBibliotecaId] = useState<number | 'todas'>('todas')

  // modal/edição
  const [isOpen, setIsOpen] = useState(false)
  const [editing, setEditing] = useState<LivroDTO | null>(null)
  const [filePreview, setFilePreview] = useState<string>('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const fileObjRef = useRef<File | null>(null)

  // modal de requisição (venda/emprestimo)
  const [reqModal, setReqModal] = useState<ReqModalState>({ open: false, livro: null, modo: 'compra', entregaTipo: '' })

  useEffect(() => {
    document.title = 'Gestão de Livros'
  }, [])

  // ADMIN: carregar bibliotecas para filtro opcional
  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      try {
        const r = await BibliotecasAPI.listarAdmin({ page: 1, pageSize: 200, sort: 'nome', order: 'asc' })
        setBibliotecas(r?.items ?? r?.data?.items ?? r?.items ?? [])
      } catch (e) {
        // fallback: tenta público
        try {
          const pub = await BibliotecasAPI.listarPublic({ page: 1, pageSize: 200 })
          setBibliotecas(pub?.items ?? pub ?? [])
        } catch { /* silencia */ }
      }
    })()
  }, [isAdmin])

  // categorias para filtro: fixas + extras detetadas
  const categoriasFiltro = useMemo(() => {
    const extras = new Set(items.map((l) => l.categoria).filter((c) => !!c && !CATEGORIAS_FIXAS.includes(c as any)))
    return ['todas', ...CATEGORIAS_FIXAS, ...Array.from(extras)]
  }, [items])

  const load = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (q.trim()) params.q = q.trim()
      if (filtros.tipo !== 'todos') params.tipo = filtros.tipo
      if (filtros.categoria !== 'todas') params.categoria = filtros.categoria

      // Backend:
      // - BIBLIOTECARIO: server força sua biblioteca (não enviar nada).
      // - ADMIN: pode enviar bibliotecaId para filtrar ou não enviar para ver tudo.
      // - PAI: ver tudo (não enviar bibliotecaId).
      if (isAdmin && bibliotecaId !== 'todas') params.bibliotecaId = bibliotecaId

      const resp = await LivrosAPI.listar(params)
      setItems(resp.items ?? [])
      setTotal(resp.total ?? 0)
    } catch (e) {
      console.error(e)
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }

  // carrega quando muda filtro de página / tipo / categoria / biblioteca (admin)
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filtros.tipo, filtros.categoria, isAdmin ? bibliotecaId : undefined])

  // debounce da pesquisa q
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      load()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const parsePreco = (s: string): number | null => {
    if (!s) return null
    const norm = s.replace(/\./g, '').replace(',', '.')
    const n = Number(norm)
    return Number.isFinite(n) ? n : null
  }

  const resetUpload = () => {
    setFilePreview('')
    fileObjRef.current = null
    if (fileRef.current) fileRef.current.value = ''
  }

  const openCreate = () => {
    setEditing(null)
    resetUpload()
    setIsOpen(true)
  }

  const openEdit = (livro: LivroDTO) => {
    setEditing(livro)
    setFilePreview(livro.imagem || '')
    fileObjRef.current = null
    if (fileRef.current) fileRef.current.value = ''
    setIsOpen(true)
  }

  const remove = async (id: ID) => {
    if (!confirm('Tem a certeza que deseja remover este livro?')) return
    try {
      await LivrosAPI.remover(id)
      toast.success('Livro removido!')
      if (page > 1 && items.length === 1) {
        setPage((p) => Math.max(1, p - 1))
      } else {
        await load()
      }
    } catch (e) {
      console.error(e)
      toast.error(parseApiError(e))
    }
  }

  // submit do modal criar/editar
  const onSubmit = async (values: LivroForm) => {
    const chosenCategoria = values.categoria === 'Outro' ? values.customCategoria?.trim() || 'Outro' : values.categoria

    const payload: Partial<LivroDTO> = {
      titulo: values.titulo.trim(),
      autor: values.autor.trim(),
      faixaEtaria: values.faixaEtaria.trim(),
      categoria: chosenCategoria,
      quantidade: Number(values.quantidade),
      descricao: values.descricao?.trim() || undefined,
      tipoAquisicao: values.tipoAquisicao,
      preco: values.tipoAquisicao === 'compra' ? Number(values.preco) : null,
      diasDevolucao: values.tipoAquisicao === 'emprestimo' ? Number(values.diasDevolucao) : null,
    }

    try {
      let saved: LivroDTO
      if (editing) {
        saved = await LivrosAPI.atualizar(editing.id, payload)
        toast.success('Livro atualizado!')
      } else {
        // ADMIN pode escolher biblioteca no server via body.bibliotecaId — aqui opcional:
        // Se quiser permitir criação como ADMIN para biblioteca selecionada no filtro, envie:
        if (isAdmin && bibliotecaId !== 'todas') {
          ;(payload as any).bibliotecaId = bibliotecaId
        }
        saved = await LivrosAPI.criar(payload)
        toast.success('Livro criado!')
      }

      if (fileObjRef.current) {
        try {
          await LivrosAPI.uploadCapa(saved.id, fileObjRef.current)
          toast.success('Capa atualizada!')
        } catch (e) {
          console.error(e)
          toast.error('Livro guardado, mas falhou o upload da capa: ' + parseApiError(e))
        }
      }

      setIsOpen(false)
      resetUpload()
      await load()
    } catch (e) {
      console.error(e)
      toast.error(parseApiError(e))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // ====================== Requisições (Venda / Empréstimo) ======================
  const closeReqModal = () => setReqModal((s) => ({ ...s, open: false }))

  const submitReq = async () => {
    if (!reqModal.livro) return
    try {
      const base: any = { livroId: reqModal.livro.id }
      if (reqModal.familiaId) base.familiaId = Number(reqModal.familiaId)

      if (reqModal.modo === 'emprestimo') {
        if (!reqModal.entregaTipo) {
          toast.error('Selecione o tipo de entrega')
          return
        }
        base.entregaTipo = reqModal.entregaTipo
        if (reqModal.entregaTipo === 'domicilio') {
          base.endereco = (reqModal.endereco || '').trim()
        }
      }

      await RequisicoesAPI.criar(base)
      toast.success(reqModal.modo === 'compra' ? 'Requisição de venda criada!' : 'Requisição de empréstimo criada!')
      closeReqModal()
      await load()
    } catch (e) {
      console.error(e)
      toast.error(parseApiError(e))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee] py-5 px-3 sm:px-3">
      <Toaster position="top-center" richColors closeButton />
      <main className="mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <FaBook className="text-3xl text-blue-700" aria-hidden />
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-purple-700">
              Gestão de Livros
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setPage(1)
                  setQ(e.target.value)
                }}
                placeholder="Pesquisar por título, autor ou categoria…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                aria-label="Pesquisar por título, autor ou categoria"
              />
            </div>

            {/* Filtro de Tipo e Categoria */}
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="filtro-tipo">Tipo</label>
              <select
                id="filtro-tipo"
                value={filtros.tipo}
                onChange={(e) => {
                  setPage(1)
                  setFiltros((f) => ({ ...f, tipo: e.target.value as any }))
                }}
                className="bg-white px-3 py-2 rounded-lg border border-gray-200"
              >
                <option value="todos">Todos tipos</option>
                <option value="compra">Compra</option>
                <option value="emprestimo">Empréstimo</option>
              </select>

              <label className="sr-only" htmlFor="filtro-cat">Categoria</label>
              <select
                id="filtro-cat"
                value={filtros.categoria}
                onChange={(e) => {
                  setPage(1)
                  setFiltros((f) => ({ ...f, categoria: e.target.value }))
                }}
                className="bg-white px-3 py-2 rounded-lg border border-gray-200"
              >
                {categoriasFiltro.map((c) => (
                  <option key={c} value={c}>{c === 'todas' ? 'Todas categorias' : c}</option>
                ))}
              </select>

              {/* ADMIN: filtro opcional de Biblioteca */}
              {isAdmin && (
                <select
                  value={bibliotecaId}
                  onChange={(e) => {
                    const v = e.target.value === 'todas' ? 'todas' : Number(e.target.value)
                    setPage(1)
                    setBibliotecaId(v)
                  }}
                  className="bg-white px-3 py-2 rounded-lg border border-gray-200"
                  aria-label="Filtrar por biblioteca"
                >
                  <option value="todas">Todas bibliotecas</option>
                  {bibliotecas.map((b) => (
                    <option key={String(b.id)} value={String(b.id)}>{b.nome}</option>
                  ))}
                </select>
              )}
            </div>

            {canManage && (
              <button
                onClick={openCreate}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg shadow-sm hover:opacity-95"
              >
                <FaPlus aria-hidden /> Adicionar Livro
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-600">A carregar…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <img src={vazio} alt="" className="w-32 h-32 mx-auto mb-4 opacity-80" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Sem resultados</h3>
            <p className="text-gray-500 mb-4">Tente ajustar a pesquisa ou os filtros.</p>
            {canManage && (
              <button onClick={openCreate} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg">
                Adicionar Livro
              </button>
            )}
          </div>
        ) : (
          <section className="overflow-hidden bg-white rounded-xl shadow-md">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-blue-600 text-white">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Capa</th>
                    <th className="px-6 py-3 text-left font-medium">Título</th>
                    <th className="px-6 py-3 text-left font-medium">Autor</th>
                    <th className="px-6 py-3 text-left font-medium">Faixa Etária</th>
                    <th className="px-6 py-3 text-left font-medium">Categoria</th>
                    <th className="px-6 py-3 text-left font-medium">Preço</th>
                    <th className="px-6 py-3 text-left font-medium">Tipo</th>
                    <th className="px-6 py-3 text-left font-medium">Stock</th>
                    {canManage && <th className="px-6 py-3 text-right font-medium">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((livro) => (
                    <tr key={livro.id} className="hover:bg-purple-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {livro.imagem ? (
                          <img
                            src={imageUrl(livro.imagem)}
                            alt={`Capa de ${livro.titulo}`}
                            className="w-12 h-16 object-cover rounded-md shadow"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-12 h-16 bg-gray-200 rounded-md flex items-center justify-center text-gray-500" aria-label="Sem capa">
                            <FaBook aria-hidden />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900 max-w-xs truncate">{livro.titulo}</td>
                      <td className="px-6 py-4 text-gray-700">{livro.autor}</td>
                      <td className="px-6 py-4 text-gray-700">{livro.faixaEtaria}</td>
                      <td className="px-6 py-4 text-gray-700">
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{livro.categoria}</span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {livro.tipoAquisicao === 'compra' && livro.preco !== null
                          ? (livro.preco as number).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' STN'
                          : 'grátis'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                            livro.tipoAquisicao === 'compra' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {livro.tipoAquisicao === 'compra' ? (
                            <>
                              <FaShoppingCart aria-hidden /> Compra
                            </>
                          ) : (
                            <>
                              <FaExchangeAlt aria-hidden /> Empréstimo{' '}
                              {livro.diasDevolucao ? `(${livro.diasDevolucao} dias)` : ''}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            livro.quantidade > 3
                              ? 'bg-green-100 text-green-800'
                              : livro.quantidade > 0
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {livro.quantidade} {livro.quantidade === 1 ? 'unidade' : 'unidades'}
                        </span>
                      </td>

                      {canManage && (
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEdit(livro)}
                              className="p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100 transition-colors"
                              title="Editar"
                            >
                              <FaEdit aria-hidden />
                            </button>
                            <button
                              onClick={() => remove(livro.id)}
                              className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100 transition-colors"
                              title="Remover"
                            >
                              <FaTrash aria-hidden />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* paginação */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <div className="text-sm text-gray-600">
                Página <strong>{page}</strong> de <strong>{totalPages}</strong> — {total} registos
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="page-size">Itens por página</label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1)
                    setPageSize(Number(e.target.value))
                  }}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>{n}/página</option>
                  ))}
                </select>
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={`rounded-md px-3 py-1 text-sm ${page <= 1 || loading ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-50 border'}`}
                  aria-disabled={page <= 1 || loading}
                >
                  Anterior
                </button>
                <button
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={`rounded-md px-3 py-1 text-sm ${page >= totalPages || loading ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-50 border'}`}
                  aria-disabled={page >= totalPages || loading}
                >
                  Seguinte
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Modal Form (apenas para quem pode gerir) */}
        <Transition appear show={isOpen && canManage} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
                    <Dialog.Title className="text-2xl font-bold text-purple-700 mb-1">
                      {editing ? 'Editar Livro' : 'Adicionar Novo Livro'}
                    </Dialog.Title>
                    <Dialog.Description className="text-gray-500 mb-4">
                      Preencha os detalhes do livro. Campos com * são obrigatórios.
                    </Dialog.Description>

                    <Formik<LivroForm>
                      initialValues={
                        editing
                          ? {
                              imagem: editing.imagem ?? '',
                              titulo: editing.titulo,
                              autor: editing.autor,
                              faixaEtaria: editing.faixaEtaria,
                              categoria: CATEGORIAS_FIXAS.includes(editing.categoria as any) ? editing.categoria : 'Outro',
                              customCategoria: CATEGORIAS_FIXAS.includes(editing.categoria as any) ? '' : editing.categoria,
                              preco: editing.preco,
                              descricao: editing.descricao ?? '',
                              quantidade: editing.quantidade,
                              tipoAquisicao: editing.tipoAquisicao,
                              diasDevolucao: editing.diasDevolucao,
                            }
                          : {
                              imagem: '',
                              titulo: '',
                              autor: '',
                              faixaEtaria: '',
                              categoria: 'Geral',
                              customCategoria: '',
                              preco: null,
                              descricao: '',
                              quantidade: 1,
                              tipoAquisicao: 'compra',
                              diasDevolucao: null,
                            }
                      }
                      enableReinitialize
                      validationSchema={schema}
                      onSubmit={onSubmit}
                    >
                      {({ values, setFieldValue }) => (
                        <Form className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Coluna esquerda */}
                          <div className="space-y-3">
                            {/* Upload imagem */}
                            <div className="flex flex-col">
                              <label className="text-sm font-medium text-gray-700 mb-1">Capa (JPG/PNG/SVG)</label>
                              {filePreview ? (
                                <img src={filePreview} alt="Pré-visualização" className="w-full h-40 object-contain rounded border mb-2" />
                              ) : null}
                              <input
                                ref={fileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/svg+xml"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (!f) {
                                    resetUpload()
                                    setFieldValue('imagem', '')
                                    return
                                  }
                                  fileObjRef.current = f
                                  const reader = new FileReader()
                                  reader.onload = (ev) => {
                                    const dataUrl = String(ev.target?.result || '')
                                    setFilePreview(dataUrl)
                                    setFieldValue('imagem', dataUrl)
                                  }
                                  reader.readAsDataURL(f)
                                }}
                                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                              />
                              {filePreview && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    resetUpload()
                                    setFieldValue('imagem', '')
                                  }}
                                  className="self-start mt-2 text-xs text-gray-600 hover:text-gray-900"
                                >
                                  Remover capa
                                </button>
                              )}
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Título*</label>
                              <Field name="titulo" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600" />
                              <ErrorMessage name="titulo" component="div" className="text-sm text-red-600 mt-1" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Autor*</label>
                              <Field name="autor" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600" />
                              <ErrorMessage name="autor" component="div" className="text-sm text-red-600 mt-1" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Faixa Etária*</label>
                              <Field as="select" name="faixaEtaria" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600">
                                <option value="">Selecione</option>
                                <option value="0-3 anos">0-3 anos</option>
                                <option value="4-6 anos">4-6 anos</option>
                                <option value="7-9 anos">7-9 anos</option>
                                <option value="10-12 anos">10-12 anos</option>
                                <option value="Adolescente">Adolescente</option>
                                <option value="Adulto">Adulto</option>
                              </Field>
                              <ErrorMessage name="faixaEtaria" component="div" className="text-sm text-red-600 mt-1" />
                            </div>
                          </div>

                          {/* Coluna direita */}
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria*</label>
                              <Field
                                as="select"
                                name="categoria"
                                className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                                onChange={(e: any) => {
                                  setFieldValue('categoria', e.target.value)
                                  if (e.target.value !== 'Outro') {
                                    setFieldValue('customCategoria', '')
                                  }
                                }}
                              >
                                {CATEGORIAS_FIXAS.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </Field>
                              {values.categoria === 'Outro' && (
                                <div className="mt-2">
                                  <label className="block text-xs text-gray-600 mb-1">Informe a categoria</label>
                                  <Field name="customCategoria" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600" />
                                  <ErrorMessage name="customCategoria" component="div" className="text-sm text-red-600 mt-1" />
                                </div>
                              )}
                              <ErrorMessage name="categoria" component="div" className="text-sm text-red-600 mt-1" />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Aquisição*</label>
                              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de aquisição">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFieldValue('tipoAquisicao', 'compra')
                                    setFieldValue('diasDevolucao', null)
                                  }}
                                  className={`py-2 rounded-lg border flex items-center justify-center gap-2 ${values.tipoAquisicao === 'compra' ? 'bg-purple-100 border-purple-500 text-purple-700' : 'bg-gray-50 border-gray-300 text-gray-700'}`}
                                  aria-pressed={values.tipoAquisicao === 'compra'}
                                >
                                  <FaShoppingCart aria-hidden /> Compra
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFieldValue('tipoAquisicao', 'emprestimo')
                                    setFieldValue('preco', null)
                                  }}
                                  className={`py-2 rounded-lg border flex items-center justify-center gap-2 ${values.tipoAquisicao === 'emprestimo' ? 'bg-green-100 border-green-500 text-green-700' : 'bg-gray-50 border-gray-300 text-gray-700'}`}
                                  aria-pressed={values.tipoAquisicao === 'emprestimo'}
                                >
                                  <FaExchangeAlt aria-hidden /> Empréstimo
                                </button>
                              </div>
                            </div>

                            {values.tipoAquisicao === 'compra' ? (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Preço* (Dobras)</label>
                                <Field name="preco">
                                  {({ field }: any) => (
                                    <input
                                      {...field}
                                      inputMode="decimal"
                                      placeholder="0,00"
                                      className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                                      value={field.value ?? ''}
                                      onChange={(e) => {
                                        const v = parsePreco(e.target.value)
                                        setFieldValue('preco', v)
                                      }}
                                    />
                                  )}
                                </Field>
                                <ErrorMessage name="preco" component="div" className="text-sm text-red-600 mt-1" />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dias para Devolução*</label>
                                <Field name="diasDevolucao">
                                  {({ field }: any) => (
                                    <input
                                      {...field}
                                      type="number"
                                      min={1}
                                      className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                                      value={field.value ?? ''}
                                      onChange={(e) => {
                                        const n = e.target.value === '' ? null : Number(e.target.value)
                                        setFieldValue('diasDevolucao', Number.isFinite(n as number) ? n : null)
                                      }}
                                    />
                                  )}
                                </Field>
                                <ErrorMessage name="diasDevolucao" component="div" className="text-sm text-red-600 mt-1" />
                              </div>
                            )}

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade em Stock*</label>
                              <Field name="quantidade">
                                {({ field }: any) => (
                                  <input
                                    {...field}
                                    type="number"
                                    min={0}
                                    className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
                                    value={field.value ?? 0}
                                    onChange={(e) => setFieldValue('quantidade', e.target.value === '' ? 0 : Number(e.target.value))}
                                  />
                                )}
                              </Field>
                              <ErrorMessage name="quantidade" component="div" className="text-sm text-red-600 mt-1" />
                            </div>
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                            <Field as="textarea" name="descricao" rows={4} className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600" />
                            <ErrorMessage name="descricao" component="div" className="text-sm text-red-600 mt-1" />
                          </div>

                          <div className="md:col-span-2 mt-2 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsOpen(false)} className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                              Cancelar
                            </button>
                            <button type="submit" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-95">
                              {editing ? 'Atualizar Livro' : 'Adicionar Livro'}
                            </button>
                          </div>
                        </Form>
                      )}
                    </Formik>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Requisição (Venda / Empréstimo) */}
        <Transition appear show={reqModal.open} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={closeReqModal}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
                    <Dialog.Title className="text-lg font-bold text-gray-900">
                      {reqModal.modo === 'compra' ? 'Criar Requisição de Venda' : 'Criar Requisição de Empréstimo'}
                    </Dialog.Title>
                    <p className="text-sm text-gray-600 mt-1">
                      Livro: <strong>{reqModal.livro?.titulo}</strong>
                    </p>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Família (opcional)</label>
                        <input
                          type="number"
                          min={1}
                          placeholder="ID da família (opcional)"
                          value={reqModal.familiaId ?? ''}
                          onChange={(e) =>
                            setReqModal((s) => ({ ...s, familiaId: e.target.value === '' ? '' : Number(e.target.value) }))
                          }
                          className="w-full border p-2 rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Se não informar, será associado ao utilizador autenticado (quando aplicável).
                        </p>
                      </div>

                      {reqModal.modo === 'emprestimo' && (
                        <>
                          <div>
                            <label className="block text-sm text-gray-700 mb-1">Entrega</label>
                            <select
                              value={reqModal.entregaTipo ?? ''}
                              onChange={(e) => setReqModal((s) => ({ ...s, entregaTipo: e.target.value as any }))}
                              className="w-full border p-2 rounded-lg"
                            >
                              <option value="">Selecione</option>
                              <option value="biblioteca">Retirar na biblioteca</option>
                              <option value="domicilio">Entrega ao domicílio</option>
                            </select>
                          </div>
                          {reqModal.entregaTipo === 'domicilio' && (
                            <div>
                              <label className="block text-sm text-gray-700 mb-1">Endereço</label>
                              <input
                                value={reqModal.endereco ?? ''}
                                onChange={(e) => setReqModal((s) => ({ ...s, endereco: e.target.value }))}
                                className="w-full border p-2 rounded-lg"
                                placeholder="Rua, nº, bairro…"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="mt-5 flex justify-end gap-2">
                      <button onClick={closeReqModal} className="px-4 py-2 rounded-lg border">Cancelar</button>
                      <button
                        onClick={submitReq}
                        className={`px-4 py-2 rounded-lg text-white ${
                          reqModal.modo === 'compra' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {reqModal.modo === 'compra' ? 'Criar Venda' : 'Criar Empréstimo'}
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>
      </main>
    </div>
  )
}
