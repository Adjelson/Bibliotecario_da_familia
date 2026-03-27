// src/pages/Ajuda.tsx
import { useEffect, useMemo, useState, type JSX } from 'react'
import AOS from 'aos'
import 'aos/dist/aos.css'
import { Disclosure } from '@headlessui/react'
import { FaQuestionCircle, FaChevronDown, FaSearch } from 'react-icons/fa'
import { Link, useInRouterContext } from 'react-router-dom'

/** Usa <Link> se existir Router; caso contrário, usa <a> para evitar o erro do basename */
function SafeLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const inRouter = useInRouterContext()
  return inRouter
    ? <Link to={to} className={className}>{children}</Link>
    : <a href={to} className={className}>{children}</a>
}

interface FAQ {
  pergunta: string
  resposta: JSX.Element | string
  tags?: string[]
}

const faqsBase: FAQ[] = [
  {
    pergunta: 'Como posso reservar um livro sugerido?',
    resposta: (
      <>
        Na secção <strong>Sugestões</strong>, clica em <em>Reservar</em> junto ao título que queres. Podes acompanhar o estado em{' '}
        <SafeLink to="/familia/pedido" className="text-blue-700 underline">Meus Pedidos</SafeLink>.
      </>
    ),
    tags: ['reserva', 'sugestões', 'livros'],
  },
  {
    pergunta: 'Posso alterar a biblioteca associada à minha conta?',
    resposta: (
      <>
        Sim. Em <SafeLink to="/perfil" className="text-blue-700 underline">Meu Perfil</SafeLink> podes atualizar a <strong>Biblioteca preferida</strong>.
        Recomenda-se manter a biblioteca onde costumas levantar livros.
      </>
    ),
    tags: ['perfil', 'biblioteca', 'preferida'],
  },
  {
    pergunta: 'Como recebo a newsletter?',
    resposta: (
      <>
        A newsletter fica ativa por omissão no registo. Podes ativar/desativar em{' '}
        <SafeLink to="/perfil" className="text-blue-700 underline">Meu Perfil</SafeLink> → Preferências.
      </>
    ),
    tags: ['newsletter', 'email'],
  },
  {
    pergunta: 'Quem valida os livros recomendados?',
    resposta: (
      <>
        As sugestões são triadas por <strong>bibliotecários</strong> e ajustadas a <strong>idade</strong> e <strong>interesses</strong> da família.
      </>
    ),
    tags: ['recomendações', 'idade', 'interesses'],
  },
  {
    pergunta: 'Como marcar consulta com o bibliotecário de família?',
    resposta: (
      <>
        Acede a <SafeLink to="/familia/consultas" className="text-blue-700 underline">Minhas Consultas</SafeLink> e escolhe uma data/hora.
        Recebes confirmação por email.
      </>
    ),
    tags: ['consulta', 'agendamento', 'bibliotecário'],
  },
  {
    pergunta: 'Esqueci a palavra-passe. E agora?',
    resposta: (
      <>
        Vai a <SafeLink to="/recuperar" className="text-blue-700 underline">Recuperar Palavra-passe</SafeLink> e segue as instruções enviadas para o teu email.
      </>
    ),
    tags: ['password', 'recuperar', 'login'],
  },
  {
    pergunta: 'Como são tratados os dados da minha família?',
    resposta: (
      <>
        Seguimos princípios de <strong>minimização</strong> e <strong>finalidade</strong> apenas para personalização da leitura.
        Lê a nossa <SafeLink to="/privacidade" className="text-blue-700 underline">Política de Privacidade</SafeLink>.
      </>
    ),
    tags: ['privacidade', 'dados', 'segurança'],
  },
  {
    pergunta: 'Como elimino a minha conta?',
    resposta: (
      <>
        Em <SafeLink to="/perfil" className="text-blue-700 underline">Meu Perfil</SafeLink> → Definições, clica em <em>Eliminar conta</em>.
        Os dados associados são removidos após o período legal.
      </>
    ),
    tags: ['conta', 'eliminar', 'dados'],
  },
]

export default function Ajuda() {
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = 'Ajuda e FAQ'
    AOS.init({ duration: 600, once: true, offset: 80, easing: 'ease-out-cubic' })
  }, [])

  const faqs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return faqsBase
    return faqsBase.filter((f) => {
      const hay = `${f.pergunta} ${typeof f.resposta === 'string' ? f.resposta : ''} ${(f.tags || []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [query])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4">
      <div className="mx-auto max-w-4xl" data-aos="fade-up">
        <h1 className="mb-2 text-center text-3xl font-extrabold tracking-tight text-blue-700 md:text-4xl">
          ❓ Ajuda e Perguntas Frequentes
        </h1>
        <p className="mx-auto mb-6 max-w-2xl text-center text-gray-600">
          Encontra respostas rápidas sobre reservas, consultas, perfil e privacidade.
        </p>

        {/* Pesquisa */}
        <div className="mx-auto mb-8 max-w-md">
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3 top-3.5 text-gray-500" />
            <input
              type="search"
              placeholder="Pesquisar na ajuda…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white px-9 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <Disclosure key={i} as="div" className="rounded-xl border border-white/60 bg-white/80 shadow-sm backdrop-blur-md" data-aos="fade-up" data-aos-delay={i * 60}>
              {({ open }) => (
                <>
                  <Disclosure.Button className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left">
                    <div className="flex items-center gap-2 text-blue-700">
                      <FaQuestionCircle className="h-5 w-5" />
                      <span className="font-semibold">{f.pergunta}</span>
                    </div>
                    <FaChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </Disclosure.Button>
                  <Disclosure.Panel className="px-5 pb-5 text-sm text-gray-700">
                    {typeof f.resposta === 'string' ? <p>{f.resposta}</p> : f.resposta}
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>
          ))}

          {faqs.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              Nenhum resultado para "{query}". Tenta outras palavras.
            </div>
          )}
        </div>

        {/* Ajuda adicional */}
        <div className="mt-10 rounded-xl border border-purple-200 bg-purple-50 p-5 text-[14px] text-purple-900" data-aos="fade-up">
          Precisas de mais ajuda? Contacta-nos em{' '}
          <a href="mailto:info@bibliotecariofamilia.st" className="underline">info@bibliotecariofamilia.st</a>
          {' '}ou consulta a nossa{' '}
          <SafeLink to="/privacidade" className="underline">Política de Privacidade</SafeLink>.
        </div>
      </div>
    </div>
  )
}
