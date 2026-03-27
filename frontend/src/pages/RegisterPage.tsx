// src/pages/RegisterPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik'
import * as Yup from 'yup'
import { Link, useNavigate } from '@tanstack/react-router'
import { Toaster, toast } from 'sonner'
import AOS from 'aos'
import 'aos/dist/aos.css'
import { Users, UserPlus, Mail, Lock, Phone, Home, IdCard, Building2, BookOpenCheck, Plus, Trash2, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react'
import logo from '../assets/biblioteca.png'
import heroSide from '../assets/react.svg'
import { AuthAPI, BibliotecasAPI, type Biblioteca, parseApiError } from '../api/client'

/* ============================== Schemas ============================== */
const TelefoneRegex = /^(\+?\d{3,15})$/
const FilhoSchema = Yup.object({
  nome: Yup.string().trim().min(2, 'Mín. 2 caracteres').required('Obrigatório'),
  idade: Yup.number().typeError('Número inválido').min(0).max(18).required('Obrigatório'),
  genero: Yup.string().oneOf(['F', 'M', 'Outro']).required('Obrigatório'),
  perfilLeitor: Yup.string().oneOf(['iniciante', 'Dislexia', 'autonomo']).required('Obrigatório'),
})
const RegisterSchema = Yup.object({
  nome: Yup.string().trim().min(3, 'Mín. 3 caracteres').required('Obrigatório'),
  email: Yup.string().email('Email inválido').required('Obrigatório'),
  password: Yup.string().min(6, 'Mín. 6 caracteres').required('Obrigatório'),
  confirmPassword: Yup.string().oneOf([Yup.ref('password')], 'As palavras-passe não coincidem').required('Obrigatório'),
  telefone: Yup.string().matches(TelefoneRegex, 'Telefone inválido').required('Obrigatório'),
  morada: Yup.string().trim().min(5, 'Informe a morada completa').required('Obrigatório'),
  bibliotecaId: Yup.string().required('Selecione a biblioteca'),
  interesses: Yup.array().of(Yup.string()).min(1, 'Escolha pelo menos 1 interesse'),
  filhos: Yup.array().of(FilhoSchema).min(1, 'Adicione pelo menos uma criança'),
  aceitarTermos: Yup.boolean().oneOf([true], 'Aceite os termos para continuar').required(),
  newsletter: Yup.boolean().optional(),
})

/* ============================== Helpers ============================== */
type FormVals = {
  nome: string; email: string; password: string; confirmPassword: string; telefone: string; morada: string; cc: string;
  bibliotecaId: string; preferenciaContacto: 'email' | 'telefone'; objetivosSemana: number; interesses: string[];
  filhos: Array<{ nome: string; idade: number | string; genero: 'F' | 'M' | 'Outro'; perfilLeitor: 'iniciante' | 'Dislexia' | 'autonomo' }>;
  aceitarTermos: boolean; newsletter: boolean;
}

const InterestChip = ({ tag, selected, onToggle }: { tag: string; selected: boolean; onToggle: () => void }) => (
  <button type="button" onClick={onToggle} aria-pressed={selected}
    className={`rounded-full px-3 py-1 text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${selected ? 'border-purple-600 bg-purple-50 text-purple-900' : 'border-gray-300 text-gray-700 hover:border-purple-400'}`}>
    {tag}
  </button>
)

const Labeled = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
    {children}
  </div>
)

export default function RegisterPage() {
  const navigate = useNavigate()
  const [bibliotecas, setBibliotecas] = useState<Biblioteca[]>([])
  const [statusText, setStatusText] = useState('')

  const interessesFixos = useMemo(() => ['Contos','Natureza','Ciência','História','Aventuras','Poesia'], [])

  useEffect(() => {
    document.title = 'Criar conta - Bibliotecário de Família'
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    AOS.init({ duration: reduce ? 0 : 700, once: true, offset: 80, easing: 'ease-out-cubic', disable: reduce })
  }, [])

  useEffect(() => { (async () => {
    try {
      const resp = await BibliotecasAPI.listarPublic({ page: 1, pageSize: 200 })
      const items = Array.isArray(resp) ? (resp as Biblioteca[]) : (((resp as any)?.items ?? []) as Biblioteca[])
      items.sort((a, b) => a.nome.localeCompare(b.nome)); setBibliotecas(items)
    } catch (e) { console.error('Falha ao carregar bibliotecas:', e) }
  })() }, [])

  async function handleSubmit(values: FormVals, { setSubmitting, resetForm }: { setSubmitting: (b: boolean) => void; resetForm: () => void }) {
    setSubmitting(true); setStatusText('')
    try {
      const payload = {
        name: values.nome, email: values.email, password: values.password,
        telefone: String(values.telefone || '').replace(/\s+/g, ''),
        morada: values.morada, interesses: values.interesses,
        filhos: (values.filhos || []).map(f => ({ nome: f.nome, idade: Number(f.idade), genero: f.genero, perfilLeitor: f.perfilLeitor })),
        bibliotecaId: values.bibliotecaId ? Number(values.bibliotecaId) : undefined,
      }
      await AuthAPI.registerFamilia(payload)
      toast.success('Conta criada com sucesso! 🎉'); setStatusText('Conta criada com sucesso.')
      resetForm(); navigate({ to: '/familia' })
    } catch (e) {
      const msg = parseApiError(e); toast.error(msg); setStatusText(msg)
    } finally { setSubmitting(false) }
  }

  const initialValues: FormVals = {
    nome: '', email: '', password: '', confirmPassword: '',
    telefone: '', morada: '', cc: '', bibliotecaId: '', preferenciaContacto: 'email',
    objetivosSemana: 7, interesses: [], filhos: [{ nome: '', idade: '', genero: 'Outro', perfilLeitor: 'iniciante' }],
    aceitarTermos: false, newsletter: true,
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee]">
      <Toaster position="top-center" richColors closeButton />
      <div className="pointer-events-none absolute -top-24 -right-16 h-[38rem] w-[38rem] rounded-full bg-gradient-to-tr from-purple-300/60 to-blue-300/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-yellow-300/50 to-rose-200/40 blur-3xl" aria-hidden />
      <div className="sr-only" aria-live="polite" id="form-status">{statusText}</div>

      <main className="relative z-10 grid min-h-screen place-items-center px-3 py-8" role="main">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
          {/* ===== Formulário ===== */}
          <section className="order-first lg:order-last rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-6 sm:p-8 lg:p-10" data-aos="fade-left">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Criar conta familiar</h1>
              <p className="mt-1 text-sm text-gray-600">Preenche os dados para personalizar as recomendações</p>
            </div>

            <Formik<FormVals> initialValues={initialValues} validationSchema={RegisterSchema} onSubmit={handleSubmit}>
              {({ values, isSubmitting, setFieldValue, errors, touched }) => (
                <Form className="space-y-6" aria-busy={isSubmitting}>
                  {/* Dados do responsável */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Labeled id="nome" label="Nome completo *">
                      <div className="relative">
                        <Field id="nome" name="nome" autoComplete="name"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                          aria-invalid={!!(touched.nome && (errors as any).nome)}
                          aria-describedby={touched.nome && (errors as any).nome ? 'nome-error' : undefined}
                        />
                        <UserPlus className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                      </div>
                      <ErrorMessage name="nome">{(msg) => <div id="nome-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                    </Labeled>

                    <Labeled id="email" label="Email *">
                      <div className="relative">
                        <Field id="email" name="email" type="email" autoComplete="email"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                          aria-invalid={!!(touched.email && (errors as any).email)}
                          aria-describedby={touched.email && (errors as any).email ? 'email-error' : undefined}
                        />
                        <Mail className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                      </div>
                      <ErrorMessage name="email">{(msg) => <div id="email-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                    </Labeled>

                    <Labeled id="password" label="Palavra-passe *">
                      <div className="relative">
                        <Field id="password" name="password" type="password" autoComplete="new-password"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                          aria-invalid={!!(touched.password && (errors as any).password)}
                          aria-describedby={touched.password && (errors as any).password ? 'password-error' : undefined}
                        />
                        <Lock className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                      </div>
                      <ErrorMessage name="password">{(msg) => <div id="password-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                    </Labeled>

                    <Labeled id="confirmPassword" label="Confirmar palavra-passe *">
                      <div className="relative">
                        <Field id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                          aria-invalid={!!(touched.confirmPassword && (errors as any).confirmPassword)}
                          aria-describedby={touched.confirmPassword && (errors as any).confirmPassword ? 'confirmPassword-error' : undefined}
                        />
                        <Lock className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                      </div>
                      <ErrorMessage name="confirmPassword">{(msg) => <div id="confirmPassword-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                    </Labeled>

                    <Labeled id="telefone" label="Telefone *">
                      <div className="relative">
                        <Field id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+239 9xx xxx"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                          aria-invalid={!!(touched.telefone && (errors as any).telefone)}
                          aria-describedby={touched.telefone && (errors as any).telefone ? 'telefone-error' : undefined}
                        />
                        <Phone className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                      </div>
                      <ErrorMessage name="telefone">{(msg) => <div id="telefone-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                    </Labeled>

                    <Labeled id="morada" label="Morada *">
                      <div className="relative">
                        <Field id="morada" name="morada" autoComplete="street-address"
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                          aria-invalid={!!(touched.morada && (errors as any).morada)}
                          aria-describedby={touched.morada && (errors as any).morada ? 'morada-error' : undefined}
                        />
                        <Home className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                      </div>
                      <ErrorMessage name="morada">{(msg) => <div id="morada-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                    </Labeled>

                    {/* Biblioteca (select) */}
                    <div className="md:col-span-2">
                      <Labeled id="bibliotecaId" label="Biblioteca preferida *">
                        <div className="relative">
                          <Field as="select" id="bibliotecaId" name="bibliotecaId"
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600"
                            aria-invalid={!!(touched.bibliotecaId && (errors as any).bibliotecaId)}
                            aria-describedby={touched.bibliotecaId && (errors as any).bibliotecaId ? 'bibliotecaId-error' : undefined}
                          >
                            <option value="">Selecione…</option>
                            {bibliotecas.map((b) => <option key={b.id} value={String(b.id)}>{b.nome}</option>)}
                          </Field>
                          <Building2 className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                        </div>
                        <ErrorMessage name="bibliotecaId">{(msg) => <div id="bibliotecaId-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                      </Labeled>
                    </div>

                    {/* Documento opcional */}
                    <div className="md:col-span-2">
                      <Labeled id="cc" label="Documento (BI/PASS)">
                        <div className="relative">
                          <Field id="cc" name="cc" autoComplete="off" className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 focus:ring-2 focus:ring-purple-600" />
                          <IdCard className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden />
                        </div>
                      </Labeled>
                    </div>
                  </div>

                  {/* Interesses */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Interesses da família *</label>
                    <div className="flex flex-wrap gap-2">
                      {interessesFixos.map(tag => {
                        const selected = values.interesses.includes(tag)
                        return <InterestChip key={tag} tag={tag} selected={selected}
                          onToggle={() => {
                            const set = new Set(values.interesses)
                            selected ? set.delete(tag) : set.add(tag)
                            setFieldValue('interesses', Array.from(set))
                          }}
                        />
                      })}
                    </div>
                    <ErrorMessage name="interesses" component="div" className="mt-1 text-sm text-red-600" />
                  </div>

                  {/* Filhos */}
                  <FieldArray name="filhos">
                    {({ remove, push }) => (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-purple-700 flex items-center gap-2"><Users className="h-5 w-5" aria-hidden /> Crianças</h3>
                          <button type="button" onClick={() => push({ nome: '', idade: '', genero: 'Outro', perfilLeitor: 'iniciante' })}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                            <Plus className="h-4 w-4" aria-hidden /> Adicionar
                          </button>
                        </div>

                        {values.filhos.map((_, index) => {
                          const idBase = `filho-${index}`, idNome = `${idBase}-nome`, idIdade = `${idBase}-idade`, idGenero = `${idBase}-genero`, idPerfil = `${idBase}-perfil`
                          const filhoErrors: any = (errors as any)?.filhos?.[index] || {}, filhoTouched: any = (touched as any)?.filhos?.[index] || {}

                          return (
                            <div key={index} className="grid gap-4 rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50 p-4 md:grid-cols-12">
                              <div className="md:col-span-4">
                                <Labeled id={idNome} label="Nome *">
                                  <Field id={idNome} name={`filhos[${index}].nome`} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:ring-2 focus:ring-purple-600"
                                    aria-invalid={!!(filhoTouched.nome && filhoErrors.nome)}
                                    aria-describedby={filhoTouched.nome && filhoErrors.nome ? `${idNome}-error` : undefined}
                                  />
                                  <ErrorMessage name={`filhos[${index}].nome`}>{(msg) => <div id={`${idNome}-error`} className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                                </Labeled>
                              </div>

                              <div className="md:col-span-2">
                                <Labeled id={idIdade} label="Idade *">
                                  <Field id={idIdade} name={`filhos[${index}].idade`} type="number" min={0} max={18}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:ring-2 focus:ring-purple-600"
                                    aria-invalid={!!(filhoTouched.idade && filhoErrors.idade)}
                                    aria-describedby={filhoTouched.idade && filhoErrors.idade ? `${idIdade}-error` : undefined}
                                  />
                                  <ErrorMessage name={`filhos[${index}].idade`}>{(msg) => <div id={`${idIdade}-error`} className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                                </Labeled>
                              </div>

                              <div className="md:col-span-3">
                                <Labeled id={idGenero} label="Género *">
                                  <Field as="select" id={idGenero} name={`filhos[${index}].genero`}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:ring-2 focus:ring-purple-600"
                                    aria-invalid={!!(filhoTouched.genero && filhoErrors.genero)}
                                    aria-describedby={filhoTouched.genero && filhoErrors.genero ? `${idGenero}-error` : undefined}
                                  >
                                    <option value="F">Feminino</option>
                                    <option value="M">Masculino</option>
                                    <option value="Outro">Outro/Prefiro não dizer</option>
                                  </Field>
                                  <ErrorMessage name={`filhos[${index}].genero`}>{(msg) => <div id={`${idGenero}-error`} className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                                </Labeled>
                              </div>

                              <div className="md:col-span-3">
                                <Labeled id={idPerfil} label="Perfil leitor *">
                                  <Field as="select" id={idPerfil} name={`filhos[${index}].perfilLeitor`}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:ring-2 focus:ring-purple-600"
                                    aria-invalid={!!(filhoTouched.perfilLeitor && filhoErrors.perfilLeitor)}
                                    aria-describedby={filhoTouched.perfilLeitor && filhoErrors.perfilLeitor ? `${idPerfil}-error` : undefined}
                                  >
                                    <option value="iniciante">Iniciante</option>
                                    <option value="Dislexia">Dislexia</option>
                                    <option value="autonomo">Autónomo</option>
                                  </Field>
                                  <ErrorMessage name={`filhos[${index}].perfilLeitor`}>{(msg) => <div id={`${idPerfil}-error`} className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                                </Labeled>
                              </div>

                              <div className="md:col-span-12 flex items-center justify-end">
                                <button type="button" onClick={() => remove(index)}
                                  className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 rounded"
                                  aria-label={`Remover criança ${(values.filhos[index]?.nome || index + 1)}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden /> Remover
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </FieldArray>

                  {/* Consentimentos */}
                  <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-4 text-[14px] text-purple-900">
                    <label htmlFor="aceitarTermos" className="flex items-start gap-2">
                      <Field id="aceitarTermos" type="checkbox" name="aceitarTermos" className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-600" />
                      <span>Li e aceito os <Link to="/termos" className="underline">Termos de Serviço</Link> e a <Link to="/privacidade" className="underline">Política de Privacidade</Link>. Autorizo o tratamento dos dados com finalidade de mediação da leitura.</span>
                    </label>
                    <ErrorMessage name="aceitarTermos" component="div" className="text-sm text-red-600" />
                    <label htmlFor="newsletter" className="flex items-start gap-2">
                      <Field id="newsletter" type="checkbox" name="newsletter" className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-600" />
                      <span>Quero receber a newsletter com sugestões e agenda cultural.</span>
                    </label>
                  </div>

                  {/* Ações */}
                  <button type="submit" disabled={isSubmitting} aria-disabled={isSubmitting}
                          className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-3 font-semibold text-white shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2 disabled:opacity-70">
                    <span className="absolute inset-0 -translate-x-full bg-white/20 transition group-hover:translate-x-0" aria-hidden />
                    {isSubmitting ? 'A registar…' : 'Registar família'}
                    <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" aria-hidden />
                  </button>

                  <div className="text-center text-sm text-gray-600">
                    Já tens conta? <Link to="/login" className="font-semibold text-purple-700 hover:underline">Entrar</Link>
                  </div>

                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-[13px] text-purple-900">
                    <ShieldCheck className="mt-0.5 h-4 w-4" aria-hidden />
                    <p>Os dados são utilizados apenas para personalizar recomendações e agendamentos com o bibliotecário de família.</p>
                  </div>
                </Form>
              )}
            </Formik>
          </section>

          {/* ===== Painel lateral ===== */}
          <aside className="order-last lg:order-first rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] p-8 lg:p-10" data-aos="fade-right">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Logótipo Bibliotecário de Família" className="h-14 w-14" loading="lazy" decoding="async" />
              <div>
                <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-purple-700">Bibliotecário de Família</h2>
                <p className="text-sm text-gray-600">Cria a tua conta para recomendações e mediação leitora</p>
              </div>
            </div>

            <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1fr_1.2fr]">
              <ul className="space-y-4">
                <li className="flex items-start gap-3"><Users className="mt-0.5 h-5 w-5 text-purple-700" aria-hidden /><p className="text-gray-700">Registo <span className="font-semibold">familiar</span> com perfis das crianças</p></li>
                <li className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 h-5 w-5 text-blue-700" aria-hidden /><p className="text-gray-700">Sugestões por <span className="font-semibold">idade, interesses</span> e PNL</p></li>
                <li className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" aria-hidden /><p className="text-gray-700">Consentimento informado e boa prática de dados</p></li>
              </ul>
              <img src={heroSide} alt="Leitura em família" className="mx-auto w-full max-w-md drop-shadow-sm" loading="lazy" decoding="async" />
            </div>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-2 text-[13px] text-purple-900">
              <Sparkles className="h-4 w-4" aria-hidden /> Começa hoje a rotina de 10–15min de leitura ✨
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
