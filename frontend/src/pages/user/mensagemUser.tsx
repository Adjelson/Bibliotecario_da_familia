import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '@headlessui/react'
import {
  FaComments, FaSearch, FaPaperPlane, FaUserCircle, FaSync,
  FaPlus, FaCheckDouble, FaCheck, FaArrowLeft, FaTimes,
  FaEllipsisV, FaUserFriends, FaExclamationTriangle
} from 'react-icons/fa'
import { toast } from 'sonner'
import {
  MensagensAPI,
  UtilizadoresAPI,
  parseApiError,
  type User,
  type Thread as ApiThread,
  type Mensagem,
} from '../../api/client'
import { useAuth } from '../../store/auth'

type Role = 'PAI' | 'BIBLIOTECARIO' | 'ADMIN'

function usePrefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function fingerprintMessages(list: Mensagem[]) {
  return list.map((m) => `${String(m.id)}:${m.readAt ?? ''}`).join('|')
}

// Mantém ordenação estável e atualiza apenas o necessário
function mergeThreadsStable(prev: ApiThread[], next: ApiThread[]) {
  const map = new Map(next.map(t => [t.peer.id, t]))
  const out: ApiThread[] = prev.map(p => {
    const n = map.get(p.peer.id)
    if (!n) return p
    const changedUnread = n.unread !== p.unread
    const changedLast =
      (n.lastMessage?.id ?? '') !== (p.lastMessage?.id ?? '') ||
      (n.lastMessage?.readAt ?? '') !== (p.lastMessage?.readAt ?? '')
    return changedUnread || changedLast ? { ...p, unread: n.unread, lastMessage: n.lastMessage } : p
  })
  // adiciona novos peers no topo
  next.forEach(n => { if (!out.find(p => p.peer.id === n.peer.id)) out.unshift(n) })
  return out
}

export default function MensagensBibliotecario() {
  const me = useAuth((s) => s.user)
  const myId = Number(me?.id ?? 0)

  const [threads, setThreads] = useState<ApiThread[]>([])
  const [query, setQuery] = useState('')
  const [loadingThreads, setLoadingThreads] = useState(false)

  const [peerId, setPeerId] = useState<number | null>(null)
  const [peerName, setPeerName] = useState<string>('')
  const [peerInfo, setPeerInfo] = useState<User | null>(null)

  const [messages, setMessages] = useState<Mensagem[]>([])
  const [loadingMsgsInitial, setLoadingMsgsInitial] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const markedRead = useRef<Set<string>>(new Set())
  const msgsFingerprintRef = useRef<string>('')

  // Novo chat (selecionar família)
  const [openNew, setOpenNew] = useState(false)
  const [loadingPeers, setLoadingPeers] = useState(false)
  const [peers, setPeers] = useState<User[]>([])
  const [qPeer, setQPeer] = useState('')

  const [isThreadListOpen, setIsThreadListOpen] = useState(true) // mobile toggle
  const prefersReduced = usePrefersReducedMotion()

  const MAX_LEN = 1000

  const scrollToBottom = (force?: boolean) => {
    const el = logRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (force || nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' })
    }
  }

  const peersFiltrados = useMemo(() => {
    const t = qPeer.trim().toLowerCase()
    if (!t) return peers
    return peers.filter(
      (p) => (p.name ?? '').toLowerCase().includes(t) || (p.email ?? '').toLowerCase().includes(t),
    )
  }, [peers, qPeer])

  const fmtHour = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT') + ' ' + fmtHour(iso)
  const lastPreview = (t: ApiThread) => {
    const lastMsg = t.lastMessage?.body ?? ''
    return lastMsg.length > 35 ? lastMsg.substring(0, 35) + '...' : lastMsg || '—'
  }

  const filteredThreads = useMemo(() => {
    const t = query.trim().toLowerCase()
    if (!t) return threads
    return threads.filter((th) => (th.peer.name ?? '').toLowerCase().includes(t))
  }, [threads, query])

  async function loadThreads(showSpinner = false) {
    if (showSpinner) setLoadingThreads(true)
    try {
      const resp = await MensagensAPI.threads()
      setThreads(prev => mergeThreadsStable(prev, resp))
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      if (showSpinner) setLoadingThreads(false)
    }
  }

  async function loadMessages(id: number, isInitial = false) {
    if (isInitial) setLoadingMsgsInitial(true)
    else setRefreshing(true)

    try {
      setForbidden(false)
      const resp = await MensagensAPI.between(id)

      const fp = fingerprintMessages(resp)
      if (fp !== msgsFingerprintRef.current) {
        setMessages(() => resp)
        msgsFingerprintRef.current = fp
      }

      const toMark = resp
        .filter((m) => m.toUserId === myId && !m.readAt)
        .map((m) => String(m.id))
        .filter((sid) => !markedRead.current.has(sid))

      for (const sid of toMark) {
        markedRead.current.add(sid)
        MensagensAPI.markRead(sid).catch(() => {})
      }

      setThreads((arr) => arr.map((t) => (t.peer.id === id ? { ...t, unread: 0 } : t)))

      const last = resp[resp.length - 1]
      if (last && (last.fromUserId === myId)) scrollToBottom(true)
      else scrollToBottom(false)
    } catch (e: any) {
      const status = e?.response?.status
      const msg = parseApiError(e)
      if (status === 403 || /perm/i.test(String(msg))) {
        setForbidden(true)
      }
      if (isInitial) toast.error(msg)
      setMessages([])
      msgsFingerprintRef.current = ''
    } finally {
      if (isInitial) setLoadingMsgsInitial(false)
      else setRefreshing(false)
    }
  }

  async function sendMessage() {
    if (!peerId || !text.trim() || forbidden) return
    setSending(true)
    try {
      const body = text.trim().slice(0, MAX_LEN)
      const msg = await MensagensAPI.send(peerId, body)
      setText('')
      setMessages((prev) => [...prev, msg])
      msgsFingerprintRef.current = fingerprintMessages([...messages, msg])

      // sobe thread ativa
      setThreads((arr) => {
        const idx = arr.findIndex((t) => t.peer.id === peerId)
        const updated: ApiThread =
          idx >= 0
            ? { ...arr[idx], lastMessage: msg, unread: 0 }
            : { peer: { id: peerId!, name: peerName, role: 'PAI' as Role }, lastMessage: msg, unread: 0 }
        if (idx >= 0) {
          const copy = [...arr]
          copy.splice(idx, 1)
          return [updated, ...copy]
        }
        return [updated, ...arr]
      })

      scrollToBottom(true)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  async function loadPeerInfo(id: number) {
    try {
      const userInfo = await UtilizadoresAPI.obter(id)
      setPeerInfo(userInfo)
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 403) {
        setPeerInfo(null)
      } else {
        console.error('Erro ao carregar informações do utilizador:', e)
      }
    }
  }

  async function abrirNovoChat() {
    setOpenNew(true)
    setLoadingPeers(true)
    try {
      let list: User[] = []
      try { list = await MensagensAPI.peers() } catch {}
      // fallback: carregar peers a partir das threads atuais
      if (!list.length && threads.length) {
        const ids = Array.from(new Set(threads.map((t) => t.peer.id)))
        const loaded: User[] = []
        for (const id of ids) {
          try { loaded.push(await UtilizadoresAPI.obter(id)) } catch {}
        }
        list = loaded
      }
      setPeers(list)
      setQPeer('')
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoadingPeers(false)
    }
  }

  // Poll leve de threads
  useEffect(() => {
    let alive = true
    const loop = async () => {
      if (!alive) return
      await loadThreads(false).catch(() => {})
      if (!alive) return
      setTimeout(loop, 30000)
    }
    loop()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll de mensagens da conversa ativa
  useEffect(() => {
    if (!peerId) return
    setLoadingMsgsInitial(true)
    setForbidden(false)
    msgsFingerprintRef.current = ''
    markedRead.current.clear()
    loadMessages(peerId, true)
    loadPeerInfo(peerId)

    let alive = true
    const loop = async () => {
      if (!alive) return
      await loadMessages(peerId, false)
      if (!alive) return
      setTimeout(loop, 5000)
    }
    loop()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId])

  // Ajustar altura do textarea automaticamente
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  const openThread = (id: number, name: string) => {
    setPeerId(id)
    setPeerName(name)
    setIsThreadListOpen(false)
    setPeerInfo(null)
  }

  const onChangeText = (val: string) => {
    if (val.length <= MAX_LEN) setText(val)
    else setText(val.slice(0, MAX_LEN))
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:ring-2 focus:ring-blue-600">
        Saltar para o conteúdo
      </a>

      <header className="sticky top-0 z-20 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsThreadListOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              aria-label="Abrir lista de conversas"
            >
              <FaComments className="text-blue-600 text-xl" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FaUserFriends className="text-blue-600" /> Mensagens
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={abrirNovoChat}
              className="hidden sm:flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              title="Nova conversa"
            >
              <FaPlus className="text-sm" /> Nova conversa
            </button>
            <button
              onClick={() => loadThreads(true)}
              className="p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              aria-label="Atualizar conversas"
            >
              <FaSync className={`text-gray-600 ${loadingThreads ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-0 sm:px-4 py-0 sm:py-6">
        <div className="flex h-[calc(100vh-4.5rem)] sm:h-[calc(100vh-7rem)] bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Sidebar - Lista de conversas */}
          <aside className={`${isThreadListOpen ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-1/3 xl:w-1/4 border-r`}>
            <div className="p-4 border-b">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <label htmlFor="thread-search" className="sr-only">Procurar conversa</label>
                  <FaSearch className="absolute left-3 top-3 text-gray-400" />
                  <input
                    id="thread-search"
                    type="search"
                    placeholder="Procurar conversa…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={abrirNovoChat}
                  className="sm:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  title="Nova conversa"
                  aria-label="Nova conversa"
                >
                  <FaPlus />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto" role="region" aria-label="Lista de conversas">
              {loadingThreads ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-sm text-gray-600">A carregar conversas...</p>
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="p-6 text-center">
                  <FaComments className="mx-auto text-gray-300 text-3xl mb-2" />
                  <p className="text-sm text-gray-600">Nenhuma conversa encontrada.</p>
                  <button
                    onClick={abrirNovoChat}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Iniciar uma conversa
                  </button>
                </div>
              ) : (
                <ul role="list" className="divide-y divide-gray-100">
                  {filteredThreads.map((t) => {
                    const last = lastPreview(t)
                    const isActive = t.peer.id === peerId
                    const label = t.peer.name ?? `Utilizador #${t.peer.id}`
                    return (
                      <li key={t.peer.id}>
                        <button
                          aria-current={isActive ? 'true' : undefined}
                          aria-label={`Abrir conversa com ${label}`}
                          onClick={() => openThread(t.peer.id, label)}
                          className={`flex w-full items-center gap-3 p-3 text-left transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive ? 'bg-blue-50' : ''}`}
                        >
                          <div className="relative">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <FaUserCircle className="h-6 w-6 text-blue-600" aria-hidden />
                            </div>
                            {t.unread > 0 && (
                              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                                {t.unread}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="truncate font-medium text-gray-900">{label}</span>
                              <span className="ml-2 shrink-0 text-xs text-gray-500">
                                {t.lastMessage?.createdAt ? fmtHour(t.lastMessage.createdAt) : ''}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="truncate text-sm text-gray-600">{last}</span>
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Área de conversa */}
          <section className={`${isThreadListOpen ? 'hidden' : 'flex'} lg:flex flex-col w-full lg:w-2/3 xl:w-3/4`}>
            {peerId ? (
              <>
                <div className="flex items-center justify-between border-b p-4">
                  <div className="flex items-center gap-3">
                    <button
                      className="lg:hidden p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      onClick={() => setIsThreadListOpen(true)}
                      aria-label="Voltar à lista de conversas"
                    >
                      <FaArrowLeft />
                    </button>
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <FaUserCircle className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{peerName}</div>
                      <div className="text-xs text-gray-600">
                        {peerInfo?.email ? peerInfo.email : 'ID #' + peerId}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadMessages(peerId, true)}
                      className="p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      aria-label="Atualizar mensagens"
                    >
                      <FaSync className={`${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
                      <FaEllipsisV className="text-gray-600" />
                    </button>
                  </div>
                </div>

                {forbidden && (
                  <div className="px-4 py-3 bg-yellow-50 text-yellow-900 border-b border-yellow-200 flex items-start gap-2">
                    <FaExclamationTriangle className="mt-0.5" />
                    <div className="text-sm">
                      Sem permissão para conversar com este utilizador. Verifique o papel (PAI/BIBLIOTECARIO), estado ativo e a mesma biblioteca.
                    </div>
                  </div>
                )}

                <div
                  ref={logRef}
                  className="flex-1 overflow-auto p-4 space-y-4 bg-gray-50"
                  role="log"
                  aria-live="polite"
                >
                  {loadingMsgsInitial ? (
                    <div className="flex justify-center items-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : messages.length === 0 && !forbidden ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6">
                      <FaComments className="text-gray-300 text-4xl mb-4" />
                      <h3 className="font-medium text-gray-700">Nenhuma mensagem ainda</h3>
                      <p className="text-sm text-gray-500 mt-1">Diga um olá para iniciar a conversa!</p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isMine = m.fromUserId === myId
                      const content = m.body ?? ''
                      return (
                        <div key={String(m.id)} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${isMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 shadow-sm'}`}>
                            <div className="whitespace-pre-wrap break-words">{content}</div>
                            <div className={`mt-2 flex items-center gap-1 text-xs ${isMine ? 'text-blue-100' : 'text-gray-500'}`}>
                              <span>{fmtHour(m.createdAt)}</span>
                              {isMine && (m.readAt ? (
                                <span title={`Lida ${fmtDate(m.readAt)}`} className="inline-flex items-center gap-1">
                                  <FaCheckDouble aria-hidden /> <span className="hidden sm:inline">Lida</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <FaCheck aria-hidden /> <span className="hidden sm:inline">Enviada</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t p-4 bg-white">
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (!sending) sendMessage() }}
                  >
                    <div className="flex-1 relative">
                      <label htmlFor="msg-textarea" className="sr-only">Mensagem</label>
                      <textarea
                        ref={textareaRef}
                        id="msg-textarea"
                        rows={1}
                        value={text}
                        disabled={!peerId || forbidden}
                        aria-disabled={!peerId || forbidden}
                        onChange={(e) => onChangeText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (!sending && text.trim() && !forbidden) sendMessage()
                          }
                        }}
                        placeholder={forbidden ? 'Sem permissão para enviar mensagens…' : 'Escreva a sua mensagem…'}
                        className="w-full resize-none rounded-lg border border-gray-300 p-3 pr-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                      <div className="absolute right-3 bottom-3 text-sm text-gray-500">
                        {text.length}/{MAX_LEN}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={!peerId || !text.trim() || sending || forbidden}
                      className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                      aria-label="Enviar mensagem"
                    >
                      {sending ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <FaPaperPlane />
                      )}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <FaComments className="text-gray-300 text-5xl mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">Selecione uma conversa</h3>
                <p className="text-gray-500 mb-6">Escolha uma conversa na lista para começar a trocar mensagens.</p>
                <button
                  onClick={() => setIsThreadListOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <FaArrowLeft className="text-sm" />
                  Ver conversas
                </button>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Modal: Nova conversa (selecionar família) */}
      <Dialog open={openNew} onClose={() => setOpenNew(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <Dialog.Title className="text-lg font-bold text-gray-900">Nova conversa</Dialog.Title>
                <button
                  onClick={() => setOpenNew(false)}
                  className="p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  aria-label="Fechar"
                >
                  <FaTimes className="text-gray-500" />
                </button>
              </div>

              <p className="mb-4 text-sm text-gray-700">Selecione uma família da sua biblioteca.</p>

              <div className="relative mb-4">
                <label htmlFor="peer-search" className="sr-only">Pesquisar família</label>
                <FaSearch className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  id="peer-search"
                  type="search"
                  placeholder="Pesquisar por nome ou e-mail…"
                  value={qPeer}
                  onChange={(e) => setQPeer(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="max-h-60 overflow-auto rounded-lg border border-gray-200" role="region" aria-label="Resultados de utilizadores">
                {loadingPeers ? (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-sm text-gray-600">A carregar...</span>
                  </div>
                ) : peersFiltrados.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-gray-600">Nenhum utilizador encontrado.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100" role="list">
                    {peersFiltrados.map((p) => (
                      <li key={String(p.id)}>
                        <button
                          onClick={() => { setOpenNew(false); openThread(Number(p.id), p.name ?? `Utilizador #${p.id}`) }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg transition-colors"
                          aria-label={`Iniciar conversa com ${p.name ?? `Utilizador #${p.id}`}`}
                        >
                          <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                            <FaUserCircle className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-gray-900">{p.name ?? `Utilizador #${p.id}`}</div>
                            <div className="truncate text-sm text-gray-600">{p.email ?? '—'}</div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setOpenNew(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
