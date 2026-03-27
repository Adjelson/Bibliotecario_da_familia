// src/pages/GestaoUtilizadores.tsx
import { useEffect, useMemo, useState, Fragment, useCallback } from 'react'
import { Dialog, Transition, Switch } from '@headlessui/react'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import {
  User2, Trash2, Pencil, Plus, Mail, ShieldCheck, Filter, Search, Download, X, Building2, Clock, PlusCircle, Timer
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import {
  UtilizadoresAPI,
  parseApiError,
  downloadBlob,
  BibliotecasAPI,
  type Biblioteca,
  UtilizadoresHorarioAPI,
} from '../../api/client'
import type { Role } from '../../store/auth'

type RoleFiltro = 'todos' | 'administrador' | 'bibliotecario' | 'familia'
type TipoUI = 'administrador' | 'bibliotecario' | 'familia'
interface Utilizador {
  id: number
  nome: string
  email: string
  tipo: TipoUI
  ativo: boolean
  bibliotecaId?: number | null
  bibliotecaNome?: string | null
}

/* ==================== UI <-> API role ==================== */
const toApiRole = (t: TipoUI): Role =>
  t === 'administrador' ? 'ADMIN' : t === 'bibliotecario' ? 'BIBLIOTECARIO' : 'PAI'

const toUiTipo = (r: Role | string): TipoUI => {
  const R = String(r).toUpperCase()
  if (R === 'ADMIN') return 'administrador'
  if (R === 'BIBLIOTECARIO') return 'bibliotecario'
  return 'familia' // PAI
}
const toUiUser = (u: any): Utilizador => ({
  id: Number(u.id),
  nome: u.name ?? '',
  email: u.email ?? '',
  tipo: toUiTipo(u.role as Role),
  ativo: typeof u.active === 'boolean' ? u.active : (typeof u.isActive === 'boolean' ? u.isActive : true),
  bibliotecaId: u.bibliotecaId ?? null,
  bibliotecaNome: u.bibliotecaNome ?? u?.biblioteca?.nome ?? null,
})

/* ==================== Validação user ==================== */
const makeSchema = (modoEdicao: boolean, pedirSenha: boolean) =>
  Yup.object({
    nome: Yup.string().trim().min(3, 'Mínimo 3 caracteres').required('Obrigatório'),
    email: Yup.string().email('Email inválido').required('Obrigatório'),
    tipo: Yup.mixed<TipoUI>().oneOf(['administrador', 'bibliotecario'], 'Perfil inválido').required('Obrigatório'),
    ativo: Yup.boolean().optional(),
    bibliotecaId: Yup.string().nullable().optional(),
    password: modoEdicao
      ? (pedirSenha ? Yup.string().min(6, 'Mínimo 6 caracteres').required('Obrigatório') : Yup.string().notRequired())
      : Yup.string().min(6, 'Mínimo 6 caracteres').required('Obrigatório'),
    confirmPassword: Yup.string().when('password', (pw, schema) =>
      pw && (pw as any)?.length
        ? schema.oneOf([Yup.ref('password')], 'As palavras-passe não coincidem').required('Obrigatório')
        : schema.notRequired(),
    ),
  })

/* ==================== Horário types/helpers ==================== */
type HorarioSlot = {
  id?: number
  userId?: number
  weekday: number        // 0..6
  startMin: number       // 0..1439
  endMin: number         // 1..1440
  slotMin: number        // 5..240
  active: boolean
}
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const hhmmToMin = (s: string) => {
  const [h, m] = s.split(':').map((x) => Number(x))
  return (isFinite(h) ? h : 0) * 60 + (isFinite(m) ? m : 0)
}
const overlap = (a: HorarioSlot, b: HorarioSlot) =>
  a.weekday === b.weekday && Math.max(a.startMin, b.startMin) < Math.min(a.endMin, b.endMin)

/* ========================================================= */

export default function GestaoUtilizadores() {
  const [utilizadores, setUtilizadores] = useState<Utilizador[]>([])
  const [bibliotecas, setBibliotecas] = useState<Biblioteca[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal user
  const [isOpen, setIsOpen] = useState(false)
  const [modoEdicao, setModoEdicao] = useState(false)
  const [alterarSenha, setAlterarSenha] = useState(false)
  const [edicao, setEdicao] = useState<Utilizador | null>(null)

  // Modal Horário
  const [isHorarioOpen, setIsHorarioOpen] = useState(false)
  const [userHorario, setUserHorario] = useState<Utilizador | null>(null)
  const [slots, setSlots] = useState<HorarioSlot[]>([])
  const [novo, setNovo] = useState<{ weekday: number; start: string; end: string; slotMin: number; active: boolean }>({
    weekday: 1, start: '09:00', end: '12:00', slotMin: 30, active: true,
  })

  // Filtros
  const [q, setQ] = useState('')
  const [role, setRole] = useState<RoleFiltro>('todos')

  useEffect(() => { document.title = 'Gestão de Utilizadores' }, [])

  // Bibliotecas
  useEffect(() => {
    (async () => {
      try {
        const resp = await BibliotecasAPI.listarAdmin({ page: 1, pageSize: 200 })
        const items = (Array.isArray(resp) ? resp : (resp as any)?.items) ?? []
        ;(items as Biblioteca[]).sort((a, b) => a.nome.localeCompare(b.nome))
        setBibliotecas(items as Biblioteca[])
      } catch {/* silencia */}
    })()
  }, [])

  // Listagem
  const fetchUtilizadores = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params: any = { q: q || undefined, page: 1, pageSize: 100 }
      if (role !== 'todos') params.role = toApiRole(role as any) // envia ADMIN/BIBLIOTECARIO
      const page = await UtilizadoresAPI.listar(params)
      const items = (page?.items ?? page ?? []).map(toUiUser) as Utilizador[]
      items.sort((a, b) => a.nome.localeCompare(b.nome))
      setUtilizadores(items)
    } catch (e) {
      setError(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }, [q, role])

  useEffect(() => { fetchUtilizadores() }, [fetchUtilizadores])

  const filtrados = useMemo(() => {
    return utilizadores.filter((u) => {
      const okRole = role === 'todos' ? true : u.tipo === role
      if (!okRole) return false
      if (!q.trim()) return true
      const s = q.toLowerCase()
      return u.nome.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
    })
  }, [utilizadores, q, role])

  // UI user
  const openCriar = () => {
    setEdicao({ id: 0, nome: '', email: '', tipo: 'bibliotecario', ativo: true, bibliotecaId: null, bibliotecaNome: null })
    setModoEdicao(false)
    setAlterarSenha(true)
    setIsOpen(true)
  }
  const openEditar = (u: Utilizador) => {
    setEdicao(u); setModoEdicao(true); setAlterarSenha(false); setIsOpen(true)
  }
  const closeModal = () => setIsOpen(false)

  async function eliminar(id: number) {
    if (!confirm('Tens a certeza de que queres eliminar este utilizador?')) return
    try {
      await UtilizadoresAPI.remover(id)
      setUtilizadores((prev) => prev.filter((u) => u.id !== id))
      toast.success('Utilizador eliminado')
    } catch (e) {
      const msg = parseApiError(e)
      // fallback: desativar conta
      const desativar = confirm('Não foi possível eliminar (pode ter registos ligados). Queres desativar a conta?')
      if (!desativar) return toast.error(msg)
      try {
        await UtilizadoresAPI.patch(id, { active: false })
        setUtilizadores((prev) => prev.map((u) => (u.id === id ? { ...u, ativo: false } : u)))
        toast.success('Conta desativada')
      } catch (e2) {
        toast.error(parseApiError(e2))
      }
    }
  }

  async function exportCSV() {
    try {
      const params: any = { q: q || undefined }
      if (role !== 'todos') params.role = toApiRole(role as any)
      await downloadBlob('/utilizadores/export/csv', 'utilizadores.csv', params)
    } catch {
      // fallback client-side
      const header = 'id;nome;email;perfil;biblioteca\n'
      const rows = filtrados.map((u) => `${u.id};${u.nome};${u.email};${u.tipo};${u.bibliotecaNome ?? ''}`).join('\n')
      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'utilizadores.csv'
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    }
  }

  const emailExiste = (email: string, idActual?: number) =>
    utilizadores.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== idActual)

  /* =============== Horário UI/CRUD =============== */
  const openHorario = async (u: Utilizador) => {
    setUserHorario(u); setIsHorarioOpen(true)
    try {
      const data = await UtilizadoresHorarioAPI.getHorario(u.id)
      data.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
      setSlots(data)
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const addSlot = async () => {
    if (!userHorario) return
    const startMin = hhmmToMin(novo.start)
    const endMin = hhmmToMin(novo.end)
    if (!(endMin > startMin)) return toast.error('Hora final deve ser maior que a inicial.')

    const candidato: Omit<HorarioSlot, 'id' | 'userId'> = {
      weekday: novo.weekday,
      startMin,
      endMin,
      slotMin: Math.max(5, Math.min(240, Number(novo.slotMin || 30))),
      active: !!novo.active,
    }

    // overlap local
    if (slots.some((s) => overlap(s, { ...candidato } as HorarioSlot))) {
      return toast.error(`Overlap no dia ${WEEKDAYS[candidato.weekday]}.`)
    }

    try {
      // replace-all (GET→push→PUT)
      const atuais = await UtilizadoresHorarioAPI.getHorario(userHorario.id)
      const next = [...atuais, candidato]
      const saved = await UtilizadoresHorarioAPI.setHorario(userHorario.id, next)
      saved.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
      setSlots(saved)
      toast.success('Slot adicionado.')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const patchSlot = async (horarioId: number, parc: Partial<HorarioSlot>) => {
    if (!userHorario) return
    try {
      const updated = await UtilizadoresHorarioAPI.patchSlot(userHorario.id, horarioId, parc)
      const next = slots.map((s) => (s.id === horarioId ? updated : s))
      // se alterou tempos/dia, checar overlap
      const changed = ['weekday', 'startMin', 'endMin'].some((k) => k in parc)
      if (changed) {
        const me = next.find((x) => x.id === horarioId)!
        if (next.some((s) => s.id !== horarioId && overlap(s, me))) {
          toast.error('Overlap detectado. Reverte alteração.')
          return
        }
      }
      next.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
      setSlots(next)
      toast.success('Slot actualizado.')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const removeSlot = async (horarioId: number) => {
    if (!userHorario) return
    const ok = confirm('Eliminar este slot?')
    if (!ok) return
    try {
      await UtilizadoresHorarioAPI.deleteSlot(userHorario.id, horarioId)
      setSlots((prev) => prev.filter((s) => s.id !== horarioId))
      toast.success('Slot removido.')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  /* ========================================================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee] py-6 px-4 sm:px-6 lg:px-6">
      <Toaster richColors position="top-right" />
      <div className="mx-auto">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700">
              Utilizadores do Sistema
            </h1>
            <p className="text-sm text-gray-600">Gerir administradores e bibliotecários.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar por nome ou email"
                className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as RoleFiltro)}
                className="rounded-lg border border-gray-200 bg-white pl-8 pr-8 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                <option value="todos">Todos</option>
                <option value="administrador">Administradores</option>
                <option value="bibliotecario">Bibliotecários</option>
                <option value="familia">Famílias</option>
              </select>
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
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </div>

        {/* Estado */}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {loading && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">A carregar...</div>}

        {/* Lista */}
        <div className="grid gap-4 md:grid-cols-2">
          {filtrados.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 text-purple-700 ring-1 ring-purple-200">
                  <User2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">{u.nome}</div>
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Mail className="h-4 w-4 text-gray-400" /> {u.email}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      u.tipo === 'administrador'
                        ? 'bg-indigo-100 text-indigo-800 border-amber-200'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                 {u.tipo === 'administrador' ? 'Administrador' : u.tipo === 'bibliotecario' ? 'Bibliotecário' : 'Pai / Família'}

                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium bg-white text-gray-700 border-gray-200">
                      <Building2 className="h-3.5 w-3.5 text-gray-500" />
                      {u.bibliotecaNome ?? 'Sem biblioteca'}
                    </span>
                    {u.ativo === false && (
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border-gray-200">
                        Inativo
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openHorario(u)} className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50" title="Gerir Horário">
                  <Clock className="h-4 w-4" />
                </button>
                <button onClick={() => openEditar(u)} className="rounded-md p-2 text-blue-700 hover:bg-blue-50" title="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => eliminar(u.id)} className="rounded-md p-2 text-red-600 hover:bg-red-50" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {!loading && filtrados.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              Nenhum utilizador encontrado para os filtros actuais.
            </div>
          )}
        </div>

        {/* Modal User */}
        <Transition appear show={isOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={closeModal}>
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 text-left shadow-xl">
                    <div className="mb-2 flex items-center justify-between">
                      <Dialog.Title className="text-lg font-bold text-gray-900">{modoEdicao ? 'Editar utilizador' : 'Adicionar utilizador'}</Dialog.Title>
                      <button onClick={closeModal} className="rounded-md p-1 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                    </div>

                    {edicao && (
                      <Formik
                        initialValues={{
                          id: edicao.id,
                          nome: edicao.nome,
                          email: edicao.email,
                          tipo: edicao.tipo,
                          ativo: edicao.ativo ?? true,
                          bibliotecaId: edicao.bibliotecaId != null ? String(edicao.bibliotecaId) : '',
                          password: '',
                          confirmPassword: '',
                        }}
                        enableReinitialize
                        validationSchema={makeSchema(modoEdicao, alterarSenha)}
                        onSubmit={async (values, { setSubmitting }) => {
                          try {
                            if (emailExiste(values.email, values.id || undefined)) {
                              toast.error('Já existe um utilizador com este email.')
                              return
                            }

                            const bibliotecaIdNormalizada =
                              values.bibliotecaId === '' || values.bibliotecaId == null ? null : Number(values.bibliotecaId)

                            // Payload correto para o backend
                            const payload: any = {
                              name: values.nome,
                              email: values.email,
                              role: toApiRole(values.tipo),
                              active: values.ativo,
                              bibliotecaId: bibliotecaIdNormalizada,
                            }
                            if (!modoEdicao || alterarSenha) payload.password = values.password

                            if (modoEdicao) {
                              const updated = await UtilizadoresAPI.atualizar(values.id, payload)
                              const u = toUiUser(updated)
                              setUtilizadores((prev) => prev.map((x) => (x.id === u.id ? u : x)))
                              toast.success('Utilizador actualizado')
                            } else {
                              const created = await UtilizadoresAPI.criar(payload)
                              const u = toUiUser(created)
                              setUtilizadores((prev) => [...prev, u].sort((a, b) => a.nome.localeCompare(b.nome)))
                              toast.success('Utilizador criado')
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
                            <div className="grid gap-3">
                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
                                <Field name="nome" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600" />
                                <ErrorMessage name="nome" component="div" className="mt-1 text-sm text-red-600" />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                                <Field name="email" type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600" />
                                <ErrorMessage name="email" component="div" className="mt-1 text-sm text-red-600" />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Perfil *</label>
                                <Field as="select" name="tipo" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600">
                                  <option value="administrador">Administrador</option>
                                  <option value="bibliotecario">Bibliotecário</option>
                                  <option value="familia">Famílias</option>
                                </Field>
                                <ErrorMessage name="tipo" component="div" className="mt-1 text-sm text-red-600" />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Biblioteca</label>
                                <Field as="select" name="bibliotecaId" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600">
                                  <option value="">Sem biblioteca</option>
                                  {bibliotecas.map((b) => (
                                    <option key={b.id} value={String(b.id)}>{b.nome}</option>
                                  ))}
                                </Field>
                              </div>

                              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <Field type="checkbox" name="ativo" className="h-4 w-4 rounded border-gray-300" />
                                <span>Conta ativa</span>
                              </label>
                            </div>

                            {modoEdicao && (
                              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={alterarSenha}
                                  onChange={(e) => setAlterarSenha(e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300"
                                />
                                <span>Alterar senha</span>
                              </label>
                            )}

                            {(!modoEdicao || alterarSenha) && (
                              <div className="grid gap-3">
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">
                                    {modoEdicao ? 'Nova senha *' : 'Senha *'}
                                  </label>
                                  <Field name="password" type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600" />
                                  <ErrorMessage name="password" component="div" className="mt-1 text-sm text-red-600" />
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm font-medium text-gray-700">Confirmar senha *</label>
                                  <Field name="confirmPassword" type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-purple-600" />
                                  <ErrorMessage name="confirmPassword" component="div" className="mt-1 text-sm text-red-600" />
                                </div>
                              </div>
                            )}

                            <div className="mt-6 flex justify-end gap-2">
                              <button type="button" onClick={closeModal} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                Cancelar
                              </button>
                              <button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700">
                                {modoEdicao ? 'Guardar alterações' : 'Adicionar utilizador'}
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

        {/* Modal Horário */}
        <Transition appear show={isHorarioOpen} as={Fragment}>
          <Dialog as="div" className="relative z-[60]" onClose={() => setIsHorarioOpen(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-2xl">
                    <div className="flex items-center justify-between border-b p-4">
                      <Dialog.Title className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-emerald-600" />
                        {userHorario ? `Horário — ${userHorario.nome}` : 'Horário'}
                      </Dialog.Title>
                      <button onClick={() => setIsHorarioOpen(false)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-4">
                      <p className="mb-3 text-sm text-gray-600">
                        Define períodos (podes criar múltiplos por dia). O backend impede overlaps; aqui validamos antes de gravar.
                      </p>

                      {/* Lista de slots existentes */}
                      <div className="mb-4 divide-y rounded-lg border border-gray-200">
                        {slots.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">Sem slots definidos.</div>
                        ) : (
                          slots.map((s) => (
                            <div key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium w-16">{WEEKDAYS[s.weekday]}</span>
                                <span className="text-sm text-gray-700">
                                  {minToHHMM(s.startMin)} — {minToHHMM(s.endMin)}
                                </span>
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-gray-700">
                                  <Timer className="h-3.5 w-3.5 text-gray-500" />
                                  {s.slotMin} min
                                </span>
                                <span className="inline-flex items-center gap-2 text-xs">
                                  <span className="text-gray-600">Ativo</span>
                                  <Switch
                                    checked={!!s.active}
                                    onChange={(v: boolean) => patchSlot(s.id!, { active: v })}
                                    className={`${s.active ? 'bg-emerald-600' : 'bg-gray-200'} relative inline-flex h-5 w-10 items-center rounded-full transition`}
                                  >
                                    <span className={`${s.active ? 'translate-x-5' : 'translate-x-1'} inline-block h-3.5 w-3.5 transform rounded-full bg-white transition`} />
                                  </Switch>
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => patchSlot(s.id!, { startMin: Math.max(0, s.startMin - 15) })}
                                  className="rounded-md px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                  title="Início -15"
                                >
                                  -15 início
                                </button>
                                <button
                                  onClick={() => patchSlot(s.id!, { startMin: Math.min(s.endMin - 1, s.startMin + 15) })}
                                  className="rounded-md px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                  title="Início +15"
                                >
                                  +15 início
                                </button>
                                <button
                                  onClick={() => patchSlot(s.id!, { endMin: Math.max(s.startMin + 1, s.endMin - 15) })}
                                  className="rounded-md px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                  title="Fim -15"
                                >
                                  -15 fim
                                </button>
                                <button
                                  onClick={() => patchSlot(s.id!, { endMin: Math.min(24 * 60, s.endMin + 15) })}
                                  className="rounded-md px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                                  title="Fim +15"
                                >
                                  +15 fim
                                </button>

                                <button
                                  onClick={() => removeSlot(s.id!)}
                                  className="rounded-md p-2 text-red-600 hover:bg-red-50"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Criar novo slot */}
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                        <div className="mb-2 text-sm font-semibold text-emerald-800">Adicionar slot</div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          <select
                            value={novo.weekday}
                            onChange={(e) => setNovo((v) => ({ ...v, weekday: Number(e.target.value) }))}
                            className="rounded-lg border border-gray-300 px-2 py-2 bg-white text-sm"
                          >
                            {WEEKDAYS.map((w, i) => (
                              <option value={i} key={i}>{w}</option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={novo.start}
                            onChange={(e) => setNovo((v) => ({ ...v, start: e.target.value }))}
                            className="rounded-lg border border-gray-300 px-2 py-2 bg-white text-sm"
                          />
                          <input
                            type="time"
                            value={novo.end}
                            onChange={(e) => setNovo((v) => ({ ...v, end: e.target.value }))}
                            className="rounded-lg border border-gray-300 px-2 py-2 bg-white text-sm"
                          />
                          <select
                            value={novo.slotMin}
                            onChange={(e) => setNovo((v) => ({ ...v, slotMin: Number(e.target.value) }))}
                            className="rounded-lg border border-gray-300 px-2 py-2 bg-white text-sm"
                          >
                            {[15, 20, 30, 45, 60, 90].map(n => <option key={n} value={n}>{n} min</option>)}
                          </select>
                          <div className="flex items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={novo.active}
                                onChange={(e) => setNovo((v) => ({ ...v, active: e.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300"
                              />
                              Ativo
                            </label>
                            <button
                              onClick={addSlot}
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
                            >
                              <PlusCircle className="h-4 w-4" /> Add
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button onClick={() => setIsHorarioOpen(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50">
                          Fechar
                        </button>
                      </div>
                    </div>
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
