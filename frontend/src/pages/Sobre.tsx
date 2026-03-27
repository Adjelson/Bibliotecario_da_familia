// Sobre.tsx
import { useState } from 'react';
import { FaBook, FaUsers, FaCalendarAlt, FaStar, FaQuestionCircle,
  FaEnvelope, FaChild,
  FaFacebookF, FaInstagram, FaLinkedin } from 'react-icons/fa';
import { GiFamilyHouse, GiBookshelf } from 'react-icons/gi';
import { motion, } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import imager from '../assets/biblioteca2.png'
import logoImg from '../assets/biblioteca.png'
import imagem from "../assets/react.svg";
export default function Sobre() {
  function PrimaryButton({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-white shadow-lg transition-all
      bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-500 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`}
    >
      {children}
    </Link>
  )
}
 const [open, setOpen] = useState(false)

  const features = [
    {
      icon: <GiBookshelf className="text-4xl text-blue-600" />,
      title: "Catálogo Completo",
      description: "Acesso a centenas de livros recomendados pelo Plano Nacional de Leitura"
    },
    {
      icon: <FaCalendarAlt className="text-4xl text-purple-600" />,
      title: "Consultas Personalizadas",
      description: "Agende encontros com bibliotecários especializados em literatura infantil"
    },
    {
      icon: <FaChild className="text-4xl text-yellow-500" />,
      title: "Sugestões por Idade",
      description: "Encontre os livros perfeitos para cada fase do desenvolvimento do seu filho"
    },
    {
      icon: <GiFamilyHouse className="text-4xl text-green-600" />,
      title: "Atividades em Família",
      description: "Descubra eventos e atividades para fortalecer os laços através da leitura"
    },
    {
      icon: <FaStar className="text-4xl text-orange-500" />,
      title: "Avaliações e Recomendações",
      description: "Compartilhe suas experiências e leia opiniões de outras famílias"
    },
    {
      icon: <FaQuestionCircle className="text-4xl text-red-500" />,
      title: "Suporte Especializado",
      description: "Tire todas suas dúvidas com nossa equipe de mediadores de leitura"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50  to-fuchsia-100 ">
        {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/50 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/40">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="group flex items-center gap-3">
            <img src={logoImg} alt="Logotipo Bibliotecário de Família" className="h-12 w-auto rounded-md" loading="eager" />
            <span className="hidden text-xl font-extrabold tracking-tight text-transparent sm:block bg-gradient-to-r from-indigo-700 to-fuchsia-600 bg-clip-text">
              Bibliotecário de Família
            </span>
          </Link>

          {/* desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <Link to="/sobre" className="text-sm font-medium text-gray-700 hover:text-indigo-700">
              Sobre
            </Link>
        

            <Link
              to="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold border-2 border-b-black text-indigo-700 bg-indigo-200 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Entrar
            </Link>
            <PrimaryButton to="/register" className="text-sm">
              <FaChild />
              Registar
            </PrimaryButton>
          </div>

          {/* mobile trigger */}
          <button
            aria-label="Abrir menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border md:hidden"
          >
            <span className="i-tabler-menu-2 sr-only" />
            <div className="h-4 w-4">
              <div className={`h-0.5 w-4 bg-gray-700 transition ${open ? 'translate-y-1 rotate-45' : ''}`} />
              <div className={`mt-1 h-0.5 w-4 bg-gray-700 transition ${open ? 'opacity-0' : ''}`} />
              <div className={`mt-1 h-0.5 w-4 bg-gray-700 transition ${open ? '-translate-y-1 -rotate-45' : ''}`} />
            </div>
          </button>
        </nav>

        {/* mobile menu */}
        {open && (
          <div className="border-t bg-white/90 px-6 pb-4 pt-2 md:hidden">
            <div className="flex flex-col gap-2">
          
              <div className="mt-2 flex items-center gap-2">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl px-4 py-2 text-center border-2 border-b-black text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  Entrar
                </Link>
                <PrimaryButton to="/register" className="flex-1 justify-center text-sm" >
                  <FaChild /> Registar
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </header>
      <div className=" mx-auto p-5  ">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-4">
            Sobre o Bibliotecário de Família
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Conectando famílias através da magia da leitura desde 2023
          </p>
        </motion.div>

        {/* Missão */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="bg-white rounded-2xl shadow-lg p-8 mb-16"
        >
          <h2 className="text-3xl font-bold text-blue-700 mb-6 text-center">Nossa Missão</h2>
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-lg text-gray-700 mb-4">
                O projeto <strong>Bibliotecário de Família</strong> nasceu da necessidade de fortalecer os laços familiares
                através da leitura compartilhada, promovendo o acesso ao livro desde o nascimento e eliminando
                barreiras ao acesso à cultura.
              </p>
              <p className="text-lg text-gray-700 mb-4">
                Inspirado no modelo dos médicos de família, nossa plataforma oferece acompanhamento personalizado
                do percurso leitor das crianças, com sugestões de leitura adequadas e boas práticas para este
                momento fundamental no desenvolvimento infantil.
              </p>
              <p className="text-lg text-gray-700">
                Acreditamos que cada história lida em família é uma memória criada e um vínculo fortalecido.
              </p>
            </div>
            <div className="bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl p-6 h-full flex items-center justify-center">
              <img src={imagem} alt="Logotipo" className='w-65 h-65' />
            </div>
          </div>
        </motion.div>

        {/* Funcionalidades */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h2 className="text-3xl font-bold max-w-6xl text-center text-purple-700 mb-12">Como Podemos Ajudar Sua Família</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                whileHover={{ y: -5 }}
                className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow"
              >
                <div className="mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Equipa */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white mb-16"
        >
          <h2 className="text-3xl font-bold mb-8 text-center">Nossa Equipa</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-white/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaBook className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-2">Bibliotecários Especializados</h3>
              <p className="text-blue-100">
                Profissionais capacitados em mediação de leitura e literatura infantil
              </p>
            </div>
            <div className="text-center">
              <div className="bg-white/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                <FaUsers className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-2">Educadores</h3>
              <p className="text-blue-100">
                Especialistas em desenvolvimento infantil e promoção da leitura
              </p>
            </div>
            <div className="text-center">
              <div className="bg-white/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
                <GiFamilyHouse className="text-3xl" />
              </div>
              <h3 className="text-xl font-bold mb-2">Mediação Familiar</h3>
              <p className="text-blue-100">
                Apoio para integrar a leitura na rotina familiar de forma natural
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Pronto para Começar?</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Junte-se a centenas de famílias que já transformaram sua relação com a leitura
          </p>
        {/*  <div className="flex flex-col sm:flex-row justify-center gap-4 p-5">
            <Link
              to="/register"
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold rounded-lg hover:shadow-lg transition-all"
            >
              Criar Minha Conta
            </Link>

          </div>*/} 
        </motion.div>
      </div>
          {/* Footer */}
      <footer className="bg-gradient-to-b from-purple-900 to-blue-900 text-white ">
        <div className="  grid md:grid-cols-4 gap-10 p-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={imager} alt="logotipo" className="w-41 h-25" />
            </div>
            <p className="text-sm text-blue-200">
              Transformando famílias através da leitura, uma história de cada vez.
            </p>
            <div className="flex gap-4 mt-4 text-lg text-blue-200">
              <a href="#" aria-label="Facebook" className="hover:text-yellow-300 transition">
                <FaFacebookF />
              </a>
              <a href="#" aria-label="Instagram" className="hover:text-yellow-300 transition">
                <FaInstagram />
              </a>
              <a href="#" aria-label="LinkedIn" className="hover:text-yellow-300 transition">
                <FaLinkedin />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-4 text-yellow-300">Navegação</h4>
            <ul className="space-y-2">
              <li className="hover:text-yellow-200 transition">Sobre Nós
              </li>
              <li className="hover:text-yellow-200 transition">Livros Recomendados
              </li>
              <li className="hover:text-yellow-200 transition">Blog
              </li>
              <li className="hover:text-yellow-200 transition">Perguntas Frequentes
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4 text-yellow-300">Recursos</h4>
            <ul className="space-y-2">
              <li className="hover:text-yellow-200 transition">Guias por Idade</li>
              <li className="hover:text-yellow-200 transition">Atividades</li>
              <li className="hover:text-yellow-200 transition">Dicas de Leitura</li>
              <li className="hover:text-yellow-200 transition">Bibliotecas Parceiras</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4 text-yellow-300">Contactos</h4>
            <ul className="space-y-2 text-sm text-blue-200">
              <li className="flex items-center gap-2"><FaEnvelope /> info@bibliotecariofamilia.st</li>
              <li>📞 +239 900 0000</li>
              <li>🕒 Seg-Sex: 9h-18h</li>
              <li className="text-yellow-300 hover:text-yellow-200 font-medium mt-4" >
                  Agende uma Consulta →
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 pt-8 mt-8 border-t border-blue-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-blue-300">
            <div>© 2025 Bibliotecário de Família. Todos os direitos reservados.</div>
            <div className="flex gap-4">
              <Link to="/privacidade" className="hover:text-yellow-200">Política de Privacidade</Link>
              <Link to="/termos" className="hover:text-yellow-200">Termos de Serviço</Link>
            </div>
          </div>
        </div>
      </footer>
   
    </div>
  );
}