// src/pages/LoginPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { Link, useNavigate } from '@tanstack/react-router'
import { Toaster, toast } from 'sonner'
import AOS from 'aos'
import 'aos/dist/aos.css'
import { Eye, EyeOff, LogIn, Shield, BookOpen, UserCircle2, LibraryBig, LockKeyhole, Mail, ArrowRight } from 'lucide-react'
import imagem from '../assets/biblioteca.png'
import heroSide from '../assets/react.svg'
import { AuthAPI, parseApiError } from '../api/client'
import { useAuth } from '../store/auth'

const LoginSchema = Yup.object({
  email: Yup.string().email('Introduza um email válido').required('Obrigatório'),
  password: Yup.string().min(6, 'Mínimo 6 caracteres').required('Obrigatório'),
  lembreMe: Yup.boolean().notRequired(),
})

const redirectByRole = (role?: string | null) => (role === 'PAI' ? '/familia' : '/bibliotecario')

export default function LoginPage() {
  const [showPass, setShowPass] = useState(false)
  const [statusText, setStatusText] = useState('')
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  // redireciona se já tiver sessão
  useEffect(() => {
    if (isAuthenticated && user) navigate({ to: redirectByRole(user.role), replace: true })
  }, [isAuthenticated, user, navigate])

  useEffect(() => {
    document.title = 'Iniciar sessão - Bibliotecário de Família'
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    AOS.init({ duration: reduce ? 0 : 500, once: true, disable: reduce })
  }, [])

  const initialValues = useMemo(() => ({ email: '', password: '', lembreMe: true }), [])

  async function handleSubmit(
    values: { email: string; password: string },
    { setSubmitting }: { setSubmitting: (s: boolean) => void },
  ) {
    setSubmitting(true); setStatusText('')
    try {
      await AuthAPI.login(values)
      const logged = useAuth.getState().user
      toast.success('Bem-vindo 👋'); setStatusText('Sessão iniciada com sucesso.')
      navigate({ to: redirectByRole(logged?.role), replace: true })
    } catch (e) {
      const msg = parseApiError(e) || 'Credenciais inválidas.'
      toast.error('Credenciais inválidas.'); setStatusText(msg)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#eef4ff] via-[#f8f6ff] to-[#fdf7ee]">
      <Toaster position="top-center" richColors closeButton />
      <div className="pointer-events-none absolute -top-24 -right-16 h-[38rem] w-[38rem] rounded-full bg-gradient-to-tr from-purple-300/60 to-blue-300/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-[32rem] w-[32rem] rounded-full bg-gradient-to-tr from-yellow-300/50 to-rose-200/40 blur-3xl" aria-hidden="true" />

      <div className="sr-only" aria-live="polite" id="form-status">{statusText}</div>

      <main className="relative z-10 grid min-h-screen place-items-center px-3 py-8">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">
          {/* Form */}
          <section className="order-first rounded-2xl border border-white/60 bg-white/80 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:p-8 lg:order-last lg:p-10" data-aos="fade-left">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Iniciar sessão</h1>
              <p className="mt-1 text-sm text-gray-600">Acede para continuares a jornada de leitura em família</p>
              <img src={imagem} alt="" className="mx-auto h-14 w-14" loading="lazy" decoding="async" />
            </div>

            <Formik initialValues={initialValues} validationSchema={LoginSchema} onSubmit={handleSubmit}>
              {({ isSubmitting, errors, touched }) => (
                <Form className="space-y-5" aria-busy={isSubmitting}>
                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Field name="email" type="email" id="email" autoComplete="email"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                        aria-invalid={!!(touched.email && errors.email)}
                        aria-describedby={touched.email && errors.email ? 'email-error' : undefined} />
                      <Mail className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden="true" />
                    </div>
                    <ErrorMessage name="email">{msg => <div id="email-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">Palavra-passe <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Field name="password" type={showPass ? 'text' : 'password'} id="password" autoComplete="current-password"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-12 text-gray-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                        aria-invalid={!!(touched.password && errors.password)}
                        aria-describedby={touched.password && errors.password ? 'password-error' : undefined} />
                      <button type="button" onClick={() => setShowPass(s => !s)}
                        className="absolute right-10 top-3.5 rounded text-gray-600 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
                        aria-label={showPass ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'} aria-pressed={showPass}>
                        {showPass ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                      </button>
                      <LockKeyhole className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-purple-700" aria-hidden="true" />
                    </div>
                    <ErrorMessage name="password">{msg => <div id="password-error" className="mt-1 text-sm text-red-600">{msg}</div>}</ErrorMessage>
                  </div>

                  {/* Lembrar / recuperar */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="lembreMe" className="inline-flex select-none items-center gap-2 text-sm text-gray-700">
                      <Field id="lembreMe" type="checkbox" name="lembreMe" className="rounded border-gray-300 text-purple-600 focus:ring-purple-600" /> Manter sessão iniciada
                    </label>
                    <Link to="/login" className="text-sm font-medium text-purple-700 hover:underline">Esqueci a palavra-passe</Link>
                  </div>

                  {/* Submeter */}
                  <button type="submit" disabled={isSubmitting} aria-disabled={isSubmitting}
                    className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-3 font-semibold text-white shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2 disabled:opacity-70">
                    <span className="absolute inset-0 -translate-x-full bg-white/20 transition group-hover:translate-x-0" aria-hidden="true" />
                    <LogIn className="h-5 w-5" aria-hidden="true" /> {isSubmitting ? 'A aceder…' : 'Entrar'}
                    <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
                  </button>

                  <Link to="/register" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-[15px] font-semibold text-purple-900 hover:bg-purple-100">
                    Criar conta gratuita
                  </Link>
                </Form>
              )}
            </Formik>
          </section>

          {/* Painel info */}
          <aside className="order-last rounded-2xl border border-white/60 bg-white/60 p-8 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-md lg:order-first lg:p-10" data-aos="fade-right">
            <div className="flex items-center gap-3">
              <img src={imagem} alt="Logótipo Bibliotecário de Família" className="h-14 w-14" loading="lazy" decoding="async" />
              <div>
                <h2 className="bg-gradient-to-r from-blue-700 to-purple-700 bg-clip-text text-2xl font-extrabold text-transparent">Bibliotecário de Família</h2>
                <p className="text-sm text-gray-600">Plataforma para mediação da leitura infantil</p>
              </div>
            </div>

            <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1fr_1.2fr]">
              <ul className="space-y-4">
                <li className="flex items-start gap-3"><LibraryBig className="mt-0.5 h-5 w-5 text-purple-700" aria-hidden="true" />
                  <p className="text-gray-700"><span className="font-semibold">Recomendações por idade</span> e perfil da família</p>
                </li>
                <li className="flex items-start gap-3"><UserCircle2 className="mt-0.5 h-5 w-5 text-blue-700" aria-hidden="true" />
                  <p className="text-gray-700">Perfis de <span className="font-semibold">Pais</span>, <span className="font-semibold">Bibliotecários</span> e <span className="font-semibold">Admin</span></p>
                </li>
                <li className="flex items-start gap-3"><BookOpen className="mt-0.5 h-5 w-5 text-yellow-600" aria-hidden="true" />
                  <p className="text-gray-700">Guia de actividades e <span className="font-semibold">relatórios de progresso</span></p>
                </li>
              </ul>
              <img src={heroSide} alt="Ilustração de leitura em família" className="mx-auto w-full max-w-md drop-shadow-sm" loading="lazy" decoding="async" />
            </div>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-2 text-[13px] text-purple-900"><Shield className="h-4 w-4" aria-hidden="true" />Dados protegidos e utilização responsável</div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-[13px] text-purple-900">
              <Shield className="mt-0.5 h-4 w-4" aria-hidden="true" />
              <p>As tuas credenciais são processadas de forma segura. Bibliotecários devem indicar a instituição para validação.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
