// src/pages/Home.tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'framer-motion'
import heroSvg from '../assets/react.svg'
import logoImg from '../assets/biblioteca.png'
import logoImgw from '../assets/biblioteca2.png'
import { FaBookOpen,  FaStar, FaEnvelope, FaChild, FaHeart, FaFacebookF, FaInstagram, FaLinkedin } from 'react-icons/fa'
import { GiBookshelf } from 'react-icons/gi'

/* ----------------------------- helpers de UI ----------------------------- */
const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`py-16 md:py-20 ${className}`}><div className="mx-auto max-w-7xl px-6">{children}</div></section>
)

const PrimaryButton = ({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) => (
  <Link to={to} className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-white shadow-lg ring-1 ring-purple-300/40 transition-all bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-purple-400 ${className}`}>{children}</Link>
)

const GhostButton = ({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) => (
  <Link to={to} className={`inline-flex items-center gap-2 rounded-2xl border-2 border-purple-300/70 bg-white/40 px-6 py-3 font-semibold text-purple-800 shadow-sm backdrop-blur-sm transition hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-400 ${className}`}>{children}</Link>
)

export default function Home() {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  useEffect(() => { document.title = 'Bibliotecário de Família' }, [])
  const YEAR = useMemo(() => new Date().getFullYear(), [])

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: reduce ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.6, delay },
    viewport: { once: true, margin: '-80px' },
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-amber-50 text-gray-800 antialiased">
      {/* Skip to content */}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[999] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">Ir para o conteúdo</a>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/60 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/40">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3" aria-label="Principal">
          {/* Logo */}
          <Link to="/" className="group flex items-center gap-3">
            <img src={logoImg} alt="Logotipo Bibliotecário de Família" className="h-12 w-auto rounded-md" loading="eager" />
            <span className="hidden bg-gradient-to-r from-indigo-700 to-purple-600 bg-clip-text text-xl font-extrabold tracking-tight text-transparent sm:block">Bibliotecário de Família</span>
          </Link>

          {/* desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <Link to="/sobre" className="text-sm font-medium text-gray-700 transition hover:text-purple-700">Sobre</Link>
           <Link to="/login" className="rounded-xl border-2 border-purple-300/70 bg-purple-100/60 px-4 py-2 text-sm font-semibold text-purple-800 shadow-sm transition hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-400">Entrar</Link>
            <PrimaryButton to="/register" className="text-sm"><FaChild />Registar</PrimaryButton>
          </div>

          {/* mobile trigger */}
          <button aria-label="Abrir menu" aria-expanded={open} aria-controls="menu-mobile"
                  onClick={() => setOpen(v => !v)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-purple-200 bg-white/60 text-purple-800 shadow-sm backdrop-blur md:hidden">
            <span className="sr-only">Menu</span>
            <div className="h-4 w-4">
              <div className={`h-0.5 w-4 bg-purple-800 transition ${open ? 'translate-y-1 rotate-45' : ''}`} />
              <div className={`mt-1 h-0.5 w-4 bg-purple-800 transition ${open ? 'opacity-0' : ''}`} />
              <div className={`mt-1 h-0.5 w-4 bg-purple-800 transition ${open ? '-translate-y-1 -rotate-45' : ''}`} />
            </div>
          </button>
        </nav>

        {/* mobile menu */}
        {open && (
          <div id="menu-mobile" className="border-t border-purple-200/50 bg-white/90 px-6 pb-4 pt-2 shadow-sm backdrop-blur md:hidden">
            <div className="flex flex-col gap-4 text-sm font-medium text-purple-800">
              {[
                { to: '/sobre', label: 'Sobre' },
              ].map((i) => (
                <Link key={i.to} to={i.to} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 hover:bg-purple-50">{i.label}</Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Link to="/login" onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border-2 border-purple-300/70 bg-purple-100/60 px-4 py-2 text-center font-semibold text-purple-800 shadow-sm transition hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-400">
                  Entrar
                </Link>
                <PrimaryButton to="/register" className="flex-1 justify-center text-sm"><FaChild />Registar</PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <Section className="bg-gradient-to-r from-indigo-100 via-purple-50 to-amber-100 pt-10 md:pt-14">
        <div id="conteudo" className="flex flex-col items-center gap-10 md:flex-row md:gap-12">
          <motion.div {...fadeUp(0)} className="md:w-1/2">
            <h1 className="text-balance text-4xl font-extrabold leading-tight text-gray-900 md:text-5xl">
              Transforme <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">momentos</span> em memórias com leitura em família ✨
            </h1>
            <p className="mt-4 text-lg text-gray-700 md:text-xl">Sugestões personalizadas por idade, consultas com especialistas e atividades para tornar cada leitura especial.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryButton to="/login"><FaHeart />Começar agora</PrimaryButton>
              <GhostButton to="/sobre">Saber mais</GhostButton>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <div className="flex -space-x-2">{[1,2,3].map(i => <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-tr from-indigo-200 to-purple-200 shadow" />)}</div>
              <span>Mais de <strong className="text-purple-800">500 famílias</strong> já começaram 📈</span>
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="relative md:w-1/2">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-r from-indigo-200 via-purple-100 to-amber-100 blur-2xl" />
            <img src={heroSvg} alt="Família a ler junta" className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur" loading="eager" decoding="async" />
          </motion.div>
        </div>
      </Section>

      {/* Benefícios */}
      <Section className="bg-white/60 backdrop-blur-sm">
        <motion.div {...fadeUp(0)} className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Por que ler em família?</h2>
          <p className="mx-auto mt-2 max-w-3xl text-gray-700">A leitura partilhada desenvolve linguagem, imaginação e fortalece laços afetivos.</p>
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { icon: <FaChild className="text-4xl text-purple-600" />, title: 'Desenvolvimento Infantil', desc: 'Estimula linguagem, criatividade e pensamento crítico desde cedo.', ring: 'ring-purple-200/60' },
            { icon: <FaHeart className="text-4xl text-rose-500" />, title: 'Vínculos Afetivos', desc: 'Cria momentos calmos e quentes que ficam na memória.', ring: 'ring-rose-200/60' },
            { icon: <GiBookshelf className="text-4xl text-indigo-600" />, title: 'Hábito Saudável', desc: 'Rotina de leitura que beneficia toda a família.', ring: 'ring-indigo-200/60' },
          ].map((b, i) => (
            <motion.div key={i} {...fadeUp(0.1 + i * 0.1)} className={`rounded-2xl border border-white/70 bg-white p-6 shadow-sm ring-1 ${b.ring} transition hover:shadow-md`}>
              <div className="mb-3">{b.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900">{b.title}</h3>
              <p className="mt-1 text-gray-700">{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Como funciona */}
      <Section className="bg-gradient-to-br from-indigo-50 via-purple-50 to-amber-50">
        <motion.h2 {...fadeUp(0)} className="text-center text-3xl font-bold text-gray-900 md:text-4xl">Como transformar a rotina da sua família</motion.h2>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { icon: <FaBookOpen className="mx-auto text-5xl text-amber-500" />, title: '1. Sugestões certas', desc: 'Livros escolhidos por especialistas para cada fase.', emoji: '📚' },
          ].map((s, i) => (
            <motion.div key={i} {...fadeUp(0.1 + i * 0.1)} className="relative rounded-2xl bg-white p-8 shadow-md ring-1 ring-purple-200/50 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="absolute -right-3 -top-3 text-3xl">{s.emoji}</div>
              {s.icon}
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{s.title}</h3>
              <p className="mt-1 text-gray-700">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp(0.3)} className="mt-10 text-center">
          <PrimaryButton to="/familia" className="rounded-full px-8 py-4 text-base">Quero começar agora</PrimaryButton>
        </motion.div>
      </Section>

      {/* Depoimentos */}
      <Section className="bg-white">
        <motion.div {...fadeUp(0)} className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Histórias reais, sorrisos verdadeiros</h2>
          <p className="mx-auto mt-2 max-w-2xl text-gray-700">Famílias que já estão a criar uma rotina de leitura.</p>
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { quote: 'O Pedro agora pede para ler antes de dormir. Criar o hábito ficou fácil.', author: 'Mãe do Pedro (5)', tone: 'from-indigo-200 to-white' },
            { quote: 'As sugestões são tão boas que até nós, pais, nos divertimos com as histórias.', author: 'Pais da Ana (3)', tone: 'from-fuchsia-200 to-white' },
            { quote: "Em 2 meses, a Sofia já reconhece mais palavras e 'lê' para os bonecos.", author: 'Avó da Sofia (4)', tone: 'from-amber-200 to-white' },
          ].map((t, i) => (
            <motion.figure key={i} {...fadeUp(0.1 + i * 0.1)} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${t.tone} p-6 shadow-sm ring-1 ring-purple-200/40`}>
              <div className="pointer-events-none absolute -right-4 -bottom-6 text-[8rem] font-serif leading-none text-black/5">“</div>
              <blockquote className="relative z-10 text-gray-800">“{t.quote}”</blockquote>
              <figcaption className="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <span className="font-semibold text-purple-800">{t.author}</span>
                <div className="flex items-center text-amber-400" aria-label="5 estrelas">
                  {Array.from({ length: 5 }).map((_, s) => <FaStar key={s} className="h-4 w-4 flex-shrink-0" />)}
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </Section>

      {/* Missão */}
      <Section className="bg-gradient-to-br from-indigo-600 via-purple-500 to-fuchsia-400 text-white">
        <motion.div {...fadeUp(0)} className="text-center">
          <img src={logoImgw} alt="Logotipo Bibliotecário de Família" className="mx-auto h-16 w-auto rounded-md" loading="lazy" decoding="async" />
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">Nossa missão</h2>
          <p className="mx-auto mt-3 max-w-4xl text-lg text-white/90">Ajudar famílias a descobrirem a leitura partilhada, criando memórias enquanto desenvolvem habilidades essenciais para a vida — com curadoria humana (bibliotecários reais) e não só algoritmo.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-2xl">
            {['📚','🧸','🌈','✨','👨‍👩‍👧‍👦'].map((e, i) => (
              <motion.span key={i} animate={{ y: reduce ? 0 : [0, -8, 0] }} transition={{ duration: reduce ? 0 : 2, repeat: reduce ? 0 : Infinity, delay: i * 0.25 }}>{e}</motion.span>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* Equipa */}
      <Section className="bg-white">
        <motion.div {...fadeUp(0)} className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">Guardiã(o)s da leitura</h2>
          <p className="mx-auto mt-2 max-w-2xl text-gray-700">Pessoas que acreditam que um livro pode mudar uma infância.</p>
        </motion.div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {[
            { name: 'Dra. Isabel Brito', role: 'Literatura Infantil', emoji: '👓' },
            { name: 'Teresa Revez', role: 'Bibliotecária', emoji: '🧚' },
            { name: 'Miguel Santos', role: 'Curadoria', emoji: '📖' },
            { name: 'Equipa Tech', role: 'Produto & Engenharia', emoji: '💻' },
          ].map((p, i) => (
            <motion.div key={i} {...fadeUp(0.1 + i * 0.1)} className="rounded-2xl border border-white/60 bg-gradient-to-b from-indigo-50 to-purple-50 p-6 shadow-sm ring-1 ring-purple-200/50">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-200 to-purple-200 text-3xl text-purple-900 shadow-inner ring-1 ring-purple-300/50">{p.emoji}</div>
              <h3 className="text-lg font-semibold text-purple-800">{p.name}</h3>
              <p className="text-sm text-gray-700">{p.role}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* CTA final */}
      <Section className="bg-gradient-to-r from-amber-100 to-amber-200">
        <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl rounded-3xl border-4 border-purple-200 bg-white p-8 text-center shadow-xl ring-1 ring-purple-200/60">
          <h2 className="text-2xl font-bold text-purple-800 md:text-3xl">Pronto para começar?</h2>
          <p className="mx-auto mt-2 max-w-xl text-gray-700">10 minutos de leitura por dia. Memórias para a vida inteira. É gratuito começar.</p>
          <PrimaryButton to="/register" className="mt-6 rounded-full px-10 py-4">Criar conta gratuita</PrimaryButton>
        </motion.div>
      </Section>

      {/* Footer */}
      <footer className="bg-gradient-to-b from-purple-900 to-indigo-900 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <img src={logoImg} alt="Logotipo Bibliotecário de Família" className="h-12 w-auto rounded-md" loading="lazy" />
              <span className="text-lg font-bold">Bibliotecário de Família</span>
            </div>
            <p className="text-sm text-indigo-200">Aproximando famílias através da leitura, uma história de cada vez.</p>
            <div className="mt-4 flex gap-4 text-indigo-200">
              <a href="#" aria-label="Facebook" className="transition hover:text-amber-300"><FaFacebookF /></a>
              <a href="#" aria-label="Instagram" className="transition hover:text-amber-300"><FaInstagram /></a>
              <a href="#" aria-label="LinkedIn" className="transition hover:text-amber-300"><FaLinkedin /></a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-amber-300">Navegação</h4>
            <ul className="space-y-2 text-indigo-200">
              <li><Link to="/sobre" className="transition hover:text-amber-200">Sobre nós</Link></li>
              <li className="transition hover:text-amber-200">Livros recomendados</li>
              <li><Link to="/" className="transition hover:text-amber-200">Blog</Link></li>
              <li className="transition hover:text-amber-200">Perguntas frequentes</li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-amber-300">Recursos</h4>
            <ul className="space-y-2 text-indigo-200">
              <li><Link to="/familia/guia" className="transition hover:text-amber-200">Guias por idade</Link></li>
              <li className="transition hover:text-amber-200">Atividades</li>
              <li className="transition hover:text-amber-200">Dicas de leitura</li>
              <li className="transition hover:text-amber-200">Bibliotecas parceiras</li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-amber-300">Contactos</h4>
            <ul className="space-y-2 text-sm text-indigo-200">
              <li className="flex items-center gap-2"><FaEnvelope /> info@bibliotecariofamilia.st</li>
              <li>📞 +239 900 0000</li>
              <li>🕒 Seg–Sex: 9h–18h</li>
              <li className="mt-3"><Link to="/familia/consultas" className="font-medium text-amber-300 transition hover:text-amber-200">Agende uma consulta →</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 text-center text-sm text-indigo-200 md:flex-row md:text-left">
            <div>© {YEAR} Bibliotecário de Família. Todos os direitos reservados.</div>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/privacidade" className="transition hover:text-amber-200">Política de Privacidade</Link>
              <Link to="/termos" className="transition hover:text-amber-200">Termos de Serviço</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
