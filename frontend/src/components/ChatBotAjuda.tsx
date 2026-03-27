// ChatBotAjuda.tsx
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { FaComments, FaPaperPlane, FaRobot, FaUser, FaBook, FaCalendarAlt, FaStar, FaQuestion } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function ChatBotAjuda() {
  const [open, setOpen] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [conversa, setConversa] = useState<Array<{ autor: string; texto: string; icone?: ReactNode }>>([]);
  const [carregando, setCarregando] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Mensagem inicial quando o chat é aberto
  useEffect(() => {
    if (open && conversa.length === 0) {
      setConversa([{
        autor: 'bot',
        texto: 'Olá família leitora! Sou o Bino, seu assistente de leitura. Como posso ajudar hoje?',
        icone: <FaRobot className="text-purple-500" />
      }]);
    }
  }, [open]);

  // Rolagem automática para a última mensagem
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversa]);

  const enviarMensagem = () => {
    if (!mensagem.trim()) return;
    
    // Adiciona mensagem do usuário
    const novaConversa = [...conversa, {
      autor: 'user',
      texto: mensagem,
      icone: <FaUser className="text-blue-500" />
    }];
    
    setConversa(novaConversa);
    setMensagem('');
    setCarregando(true);
    
    // Simula tempo de resposta
    setTimeout(() => {
      const resposta = gerarResposta(mensagem);
      setConversa([...novaConversa, resposta]);
      setCarregando(false);
    }, 800);
  };

  const gerarResposta = (texto: string): { autor: string; texto: string; icone?: ReactNode } => {
    const t = texto.toLowerCase();
    
    // Sugestões de livros
    if (t.includes('livro') || t.includes('sugest') || t.includes('ler') || t.includes('leitura')) {
      return {
        autor: 'bot',
        texto: 'Tenho ótimas sugestões de leitura para sua família! 🎉\n\n1. Para ver recomendações por idade, acesse "Sugestões" no menu.\n2. Posso indicar livros sobre: animais, aventura, família...\n\nSobre qual tema gostaria de sugestões?',
        icone: <FaBook className="text-yellow-500" />
      };
    }
    
    // Consultas com bibliotecário
    if (t.includes('consulta') || t.includes('marcar') || t.includes('encontro')) {
      return {
        autor: 'bot',
        texto: 'As consultas com nosso bibliotecário são mágicas! ✨\n\nVocê pode:\n1. Agendar online na seção "Consultas"\n2. Escolher horários pela manhã ou tarde\n3. Ser presencial ou virtual\n\nQuer que eu mostre os horários disponíveis?',
        icone: <FaCalendarAlt className="text-green-500" />
      };
    }
    
    // Avaliações
    if (t.includes('avaliar') || t.includes('opinião') || t.includes('gostei')) {
      return {
        autor: 'bot',
        texto: 'Que legal que quer compartilhar sua experiência! 🌟\n\nNa seção "Avaliações" você pode:\n1. Dar estrelinhas para os livros\n2. Escrever o que mais gostou\n3. Ver o que outras famílias acharam\n\nVamos registrar sua opinião?',
        icone: <FaStar className="text-yellow-400" />
      };
    }
    
    // Saudação
    if (t.includes('olá') || t.includes('oi') || t.includes('bom dia') || t.includes('boa tarde') || t.includes('boa noite')) {
      return {
        autor: 'bot',
        texto: `${t.includes('bom dia') ? 'Bom dia' : t.includes('boa tarde') ? 'Boa tarde' : t.includes('boa noite') ? 'Boa noite' : 'Olá'}! 🌈\n\nSou o Bino, seu amigo da leitura em família. Posso ajudar com:\n- Sugestões de livros\n- Agendamentos\n- Dicas de leitura\n\nComo posso fazer seu dia mais literário hoje?`,
        icone: <FaRobot className="text-purple-500" />
      };
    }
    
    // Default
    return {
      autor: 'bot',
      texto: 'Hmm, não entendi muito bem... 🤔\n\nPosso te ajudar com:\n1. Sugestões de livros\n2. Agendar consultas\n3. Avaliar suas leituras\n\nOu tente me perguntar de outra forma!',
      icone: <FaQuestion className="text-red-400" />
    };
  };

  const quickReplies = [
    { pergunta: 'Livros para 5 anos?', icone: <FaBook /> },
    { pergunta: 'Como marcar consulta?', icone: <FaCalendarAlt /> },
    { pergunta: 'Dicas de leitura?', icone: <FaStar /> }
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25 }}
            className="bg-white w-80 shadow-2xl rounded-xl border-2 border-purple-300 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-purple-600 to-blue-500 p-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FaRobot className="text-xl" />
                <h3 className="font-bold">Assistente Bino</h3>
              </div>
              <button 
                onClick={() => setOpen(false)}
                className="text-white hover:text-yellow-200 transition"
                aria-label="Fechar chat"
              >
                ×
              </button>
            </div>
            
            <div className="h-64 overflow-y-auto p-4 bg-gradient-to-b from-blue-50 to-purple-50">
              {conversa.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: msg.autor === 'user' ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex mb-3 ${msg.autor === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-xs p-3 rounded-lg ${msg.autor === 'user' 
                    ? 'bg-blue-500 text-white rounded-br-none' 
                    : 'bg-white border border-purple-200 rounded-bl-none shadow-sm'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {msg.icone}
                      <span className="font-semibold text-xs">
                        {msg.autor === 'user' ? 'Você' : 'Bino'}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-line">{msg.texto}</p>
                  </div>
                </motion.div>
              ))}
              
              {carregando && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start mb-3"
                >
                  <div className="bg-white border border-purple-200 rounded-lg rounded-bl-none p-3 max-w-xs">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
              
              {conversa.length === 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-2 space-y-2"
                >
                  <p className="text-xs text-gray-500 text-center">Experimente perguntar:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {quickReplies.map((qr, i) => (
                      <motion.button
                        key={i}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setMensagem(qr.pergunta);
                          setTimeout(() => {
                            const button = document.querySelector('button[type="submit"]') as HTMLButtonElement;
                            button?.click();
                          }, 100);
                        }}
                        className="text-xs bg-white border border-purple-200 rounded-full px-3 py-1 flex items-center gap-1 shadow-sm hover:bg-purple-50 transition"
                      >
                        {qr.icone} {qr.pergunta}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
              
              <div ref={chatEndRef} />
            </div>
            
            <div className="p-3 border-t border-purple-100 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviarMensagem();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  className="flex-1 border border-purple-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                  placeholder="Escreva sua mensagem..."
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  aria-label="Digite sua mensagem"
                />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  disabled={!mensagem.trim()}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 text-white p-2 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Enviar mensagem"
                >
                  <FaPaperPlane />
                </motion.button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => {
          setOpen(!open);
          if (!open) {
            toast.info('Converse com o Bino, seu assistente de leitura!');
          }
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`p-4 rounded-full shadow-lg flex items-center justify-center ${open 
          ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white' 
          : 'bg-gradient-to-br from-yellow-400 to-orange-400 text-white'}`}
        aria-label="Abrir chat de ajuda"
      >
        {open ? <FaComments className="w-6 h-6" /> : (
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <FaComments className="w-6 h-6" />
          </motion.div>
        )}
      </motion.button>
    </div>
  );
}