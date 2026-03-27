// src/pages/GuiaFamilia.tsx
import { useEffect, useState } from 'react'
import AOS from 'aos'
import 'aos/dist/aos.css'
import {
  Lightbulb,
  BookOpen,
  CalendarDays,
  Star,
  MessagesSquare,
  Baby,
  Users,
  Clock4,
  LineChart,
  HelpCircle,
  ArrowRight,
  Check
} from 'lucide-react'
import familyReadingImg from '../../assets/undraw_team-collaboration_phnf.svg'

export default function GuiaFamilia() {
  const [activeTab, setActiveTab] = useState<'guia' | 'dicas' | 'faq'>('guia')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'Guia para Pais e Familiares | Bibliotecário de Família'
    AOS.init({ duration: 700, once: true, offset: 80, easing: 'ease-out-cubic' })
  }, [])

  const passos = [
    {
      icon: BookOpen,
      title: 'Explorar Sugestões',
      desc: 'Descobre livros adequados à idade na nossa curadoria especial.',
      details:
        'A equipa de bibliotecários selecciona mensalmente títulos por faixa etária, temas e competências a desenvolver.',
      action: 'Ver sugestões',
      href: '/familia/requisitar',
    },
    {
      icon: CalendarDays,
      title: 'Agendar Consulta',
      desc: 'Marca uma sessão individual com o bibliotecário de família.',
      details:
        'Sessões de 30 minutos para orientação sobre hábitos, dificuldades específicas e indicações precisas para o vosso caso.',
      action: 'Agendar agora',
      href: '/familia/consultas',
    },
    {
      icon: Star,
      title: 'Avaliar Leituras',
      desc: 'Partilha experiências e ajuda outras famílias.',
      details:
        'As avaliações alimentam o algoritmo para recomendações mais acertadas a perfis semelhantes.',
      action: 'Avaliar livros',
      href: '/familia/livros',
    },
    {
      icon: MessagesSquare,
      title: 'Conversar com Especialista',
      desc: 'Tira dúvidas em tempo real com a nossa equipa.',
      details:
        'Chat disponível das 8h às 20h para orientações rápidas sobre leitura familiar.',
      action: 'Abrir chat',
      href: '/ajuda',
    },
  ] as const

  const dicas = [
    {
      title: 'Criar o Hábito',
      icon: Clock4,
      items: [
        'Define um “horário mágico” diário (10–15 minutos).',
        'Deixa livros acessíveis em diferentes divisões.',
        'Associa a leitura a momentos prazerosos, não obrigatórios.',
      ],
    },
    {
      title: 'Envolver as Crianças',
      icon: Baby,
      items: [
        'Permite que a criança escolha 1 em cada 3 livros.',
        'Usa vozes diferentes para os personagens.',
        'Relaciona as histórias com experiências pessoais.',
      ],
    },
    {
      title: 'Famílias com Várias Idades',
      icon: Users,
      items: [
        'Prefere livros com camadas de interpretação.',
        'Rodas de leitura em que cada um lê ao seu ritmo.',
        'Livros sem texto para criar histórias em conjunto.',
      ],
    },
    {
      title: 'Acompanhar o Progresso',
      icon: LineChart,
      items: [
        'Mantém um diário de leitura (reacções, preferências).',
        'Celebra marcos (ex.: primeiro livro lido sozinho).',
        'Observa evolução de vocabulário e criatividade.',
      ],
    },
  ] as const

  const faqs = [
    {
      q: 'O meu filho só quer ler o mesmo livro repetidamente. O que fazer?',
      a: 'É comum e saudável. A repetição traz conforto e domínio. Propõe variações: novas vozes, finais alternativos ou livros com temas semelhantes.',
    },
    {
      q: 'Como lidar com a diferença de idades entre irmãos?',
      a: 'Opta por livros com diferentes camadas de significado. Faz perguntas adaptadas a cada idade. Títulos interactivos ou sem texto envolvem todos.',
    },
    {
      q: 'Não pára quieto durante a leitura. Insisto?',
      a: 'Crianças podem “escutar com o corpo”. Permite movimento enquanto lês. Experimenta livros curtos, com rimas ou participação activa.',
    },
  ] as const

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef4ff] via-[#f8f6ff] to-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Cabeçalho */}
        <header className="mb-8 text-center" data-aos="fade-up">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-200">
            <Lightbulb className="h-4 w-4" /> Guia para Pais e Familiares
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700">
            Torna a leitura um ritual de família
          </h1>
          <p className="mt-2 text-gray-600 max-w-2xl mx-auto">
            Passos práticos, dicas e respostas rápidas para começares hoje mesmo.
          </p>
        </header>

        {/* Abas */}
        <nav className="mb-8 flex flex-wrap justify-center gap-1 border-b border-gray-200" aria-label="Navegação do guia">
          {[
            { id: 'guia', label: 'Guia Rápido', icon: Lightbulb },
            { id: 'dicas', label: 'Dicas Práticas', icon: Baby },
            { id: 'faq', label: 'Perguntas Frequentes', icon: HelpCircle },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition ${
                activeTab === (tab.id as typeof activeTab)
                  ? 'text-blue-700 border-b-2 border-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" /> {tab.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo */}
        <section className="mb-16">
          {activeTab === 'guia' && (
            <div data-aos="fade-up">
              {/* Passos */}
              <div className="mb-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {passos.map((p, idx) => (
                  <article
                    key={p.title}
                    data-aos="zoom-in"
                    data-aos-delay={idx * 80}
                    className="cursor-pointer rounded-xl bg-white p-6 shadow-sm transition hover:shadow-lg"
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                    aria-expanded={expanded === idx}
                  >
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                      <p.icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">{p.title}</h2>
                    <p className="mt-1 text-sm text-gray-600">{p.desc}</p>
                    {/* expansão */}
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                        expanded === idx ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="mt-3 text-sm text-gray-700">{p.details}</p>
                        <a
                          href={p.href}
                          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
                        >
                          {p.action} <ArrowRight className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* Destaque */}
              <div className="overflow-hidden rounded-xl bg-white shadow-sm md:flex">
                <div className="p-8 md:w-1/2">
                  <h3 className="text-2xl font-bold text-gray-900">Leitura em família</h3>
                  <p className="mt-3 text-gray-600">
                    Criar momentos de leitura partilhada fortalece vínculos e desenvolve competências cognitivo‑emocionais.
                    Estudos indicam ganhos consistentes de vocabulário, atenção e empatia.
                  </p>
                  <ul className="mt-6 space-y-3">
                    {[
                      '10–15 minutos diários fazem diferença.',
                      'O exemplo dos pais é o maior motivador.',
                      'Diversificar géneros alarga o repertório.',
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-gray-700">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-center bg-blue-50 p-8 md:w-1/2">
                  <img src={familyReadingImg} alt="Família a ler" className="max-h-80" loading="lazy" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dicas' && (
            <div data-aos="fade-up" className="grid gap-6 md:grid-cols-2">
              {dicas.map((d, idx) => (
                <article key={d.title} data-aos="fade-up" data-aos-delay={idx * 80} className="rounded-xl bg-white p-6 shadow-sm hover:shadow-lg">
                  <div className="mb-4 flex items-center gap-3">
                    <d.icon className="h-5 w-5 text-blue-700" />
                    <h2 className="text-lg font-semibold text-gray-900">{d.title}</h2>
                  </div>
                  <ul className="space-y-3">
                    {d.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-gray-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}

          {activeTab === 'faq' && (
            <div data-aos="fade-up" className="space-y-4">
              {faqs.map((f, idx) => (
                <article
                  key={f.q}
                  className="cursor-pointer rounded-xl bg-white p-6 shadow-sm transition hover:shadow-lg"
                  onClick={() => setExpanded(expanded === idx ? null : idx)}
                  aria-expanded={expanded === idx}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-base font-semibold text-gray-900">{f.q}</h3>
                    <svg
                      className={`h-5 w-5 text-blue-700 transition-transform ${expanded === idx ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      expanded === idx ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="mt-3 text-gray-600">{f.a}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Rodapé/CTA */}
        <section className="rounded-xl bg-white p-8 text-center shadow-sm" data-aos="zoom-in">
          <h2 className="text-2xl font-bold text-gray-900">Precisas de ajuda personalizada?</h2>
          <p className="mx-auto mt-2 max-w-2xl text-gray-600">
            Os bibliotecários de família estão disponíveis para orientar a selecção de livros, rotinas e desafios específicos.
          </p>
          <a
            href="/familia/consultas"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white shadow transition hover:bg-blue-700"
          >
            <MessagesSquare className="h-4 w-4" /> Falar com um especialista
          </a>
        </section>
      </div>
    </div>
  )
}
