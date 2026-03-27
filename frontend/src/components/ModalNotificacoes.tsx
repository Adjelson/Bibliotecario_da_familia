import { Dialog, Transition } from '@headlessui/react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  FaEnvelope,
  FaBook,
  FaUsers,
  FaTimes,
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
} from 'react-icons/fa'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useAuth } from '../store/auth'
import { API_BASE_URL, NotificacoesAPI } from '../api/client'

export type NotificacaoDTO = {
  id: number | string
  type?: string
  title?: string
  body?: string
  readAt?: string | null
  createdAt?: string
  // legado
  titulo?: string
  corpo?: string
  lida?: boolean
  data?: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
}

/* ===================== Helpers ===================== */
const asNumberId = (id: number | string) =>
  Number.isFinite(Number(id)) ? Number(id) : 0

const getTitulo = (n: NotificacaoDTO) =>
  n.title ?? n.titulo ?? 'Notificação'

const getCorpo = (n: NotificacaoDTO) => n.body ?? n.corpo ?? ''

const getData = (n: NotificacaoDTO) => n.createdAt ?? n.data ?? ''

const isLida = (n: NotificacaoDTO) => n.lida ?? Boolean(n.readAt)

// normaliza string para facilitar matching (remove acentos, põe caps, troca espaços por _)
const norm = (s?: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-]+/g, '_')

function Icone({ tipo }: { tipo?: string }) {
  const t = norm(tipo)
  if (t.includes('MENSAGEM'))
    return <FaEnvelope className="text-orange-500 text-lg" aria-hidden />
  if (t.includes('PEDIDO') || t.includes('REQUISIC'))
    return <FaBook className="text-emerald-600 text-lg" aria-hidden />
  if (t.includes('ATIVID') || t.includes('ACTIVID'))
    return <FaUsers className="text-purple-500 text-lg" aria-hidden />
  if (t.includes('GUIA'))
    return <FaBook className="text-blue-500 text-lg" aria-hidden />
  if (t.includes('CONSULT'))
    return <FaBook className="text-indigo-600 text-lg" aria-hidden />
  return (
    <FaExclamationTriangle
      className="text-yellow-500 text-lg"
      aria-hidden
    />
  )
}

// tenta extrair um ID de dentro do texto p.ex. "Pedido #123"
function extractFirstId(text?: string | null): number | null {
  if (!text) return null
  const m = text.match(/(?:#|id[:=]\s*|n[ºo]\s*)?(\d{1,8})/i)
  return m ? Number(m[1]) : null
}

/** Rotas da família para abrir ao clicar na notificação */
function deriveNotifLink(n: NotificacaoDTO): string {
  const t = norm(n.type)
  const blob = norm(`${getTitulo(n)} ${getCorpo(n)}`)
  const id =
    extractFirstId(getTitulo(n)) ?? extractFirstId(getCorpo(n))

  if (t.includes('MENSAGEM') || blob.includes('MENSAGEM')) {
    return `/familia/mensagem${id ? `?id=${id}` : ''}`
  }
  if (
    t.includes('PEDIDO') ||
    t.includes('REQUISIC') ||
    blob.includes('PEDID') ||
    blob.includes('REQUISIC')
  ) {
    return `/familia/pedido${id ? `?req=${id}` : ''}`
  }
  if (
    t.includes('ATIVID') ||
    t.includes('ACTIVID') ||
    blob.includes('ATIVID') ||
    blob.includes('ACTIVID')
  ) {
    return `/familia/atividades${id ? `?id=${id}` : ''}`
  }
  if (t.includes('CONSULT') || blob.includes('CONSULT')) {
    return `/familia/consultas${id ? `?id=${id}` : ''}`
  }
  if (t.includes('GUIA') || blob.includes('GUIA')) {
    return `/familia/guia`
  }
  if (
    t.includes('LIVRO') ||
    t.includes('EXPLOR') ||
    t.includes('RECOMENDA') ||
    blob.includes('LIVRO') ||
    blob.includes('EXPLOR') ||
    blob.includes('RECOMENDA')
  ) {
    return `/familia/requisitar`
  }

  return '/familia'
}

// ordena notificações: mais recente primeiro
function sortNotifs(a: NotificacaoDTO, b: NotificacaoDTO) {
  const ad = new Date(getData(a) || 0).getTime()
  const bd = new Date(getData(b) || 0).getTime()
  if (ad !== bd) return bd - ad
  return asNumberId(b.id) - asNumberId(a.id)
}

// junta listas (mantém leitura otimista)
function mergeNotifs(
  prev: NotificacaoDTO[],
  incoming: NotificacaoDTO[],
) {
  const byId = new Map<string, NotificacaoDTO>()
  // incoming primeiro (sobrepõe), depois prev (mantém marcações locais)
  ;[...prev, ...incoming].forEach((n) => {
    const k = String(n.id)
    const old = byId.get(k)
    byId.set(k, { ...(old ?? {}), ...n })
  })
  return Array.from(byId.values()).sort(sortNotifs)
}

/* ===================== Hook de stream (SSE -> polling fallback) ===================== */
function useNotificacoesLive(enabled: boolean) {
  const { isAuthenticated } = useAuth()
  const [items, setItems] = useState<NotificacaoDTO[]>([])
  const [cursor, setCursor] = useState<number | null>(null) // nextCursor do backend
  const [usingSSE, setUsingSSE] = useState(false)

  // otimista local
  const markLocalRead = (id: number) =>
    setItems((xs) =>
      xs.map((n) =>
        asNumberId(n.id) === id
          ? {
              ...n,
              readAt: n.readAt ?? new Date().toISOString(),
              lida: true,
            }
          : n,
      ),
    )

  const markAllLocalRead = () =>
    setItems((xs) => {
      const now = new Date().toISOString()
      return xs.map((n) =>
        isLida(n)
          ? n
          : {
              ...n,
              readAt: n.readAt ?? now,
              lida: true,
            },
      )
    })

  useEffect(() => {
    if (!enabled || !isAuthenticated) return
    let closed = false
    let sse: EventSource | null = null
    let timer: number | null = null
    let interval = 4000

    const pull = async () => {
      try {
        const res = await NotificacoesAPI.listar({
          limit: 50,
          cursor: cursor ?? undefined,
        })
        const arr = res?.items ?? []
        setItems((old) => mergeNotifs(old, arr))
        if (
          typeof res?.nextCursor === 'number' ||
          res?.nextCursor === null
        ) {
          setCursor(res.nextCursor)
        }
        interval = 4000
      } catch {
        interval = Math.min(interval + 2000, 20000)
      } finally {
        if (!closed) {
          timer = window.setTimeout(
            pull,
            interval,
          ) as unknown as number
        }
      }
    }

    const startPolling = () => {
      setUsingSSE(false)
      if (timer) window.clearTimeout(timer)
      pull()
      document.addEventListener('visibilitychange', onVis)
    }

    const onVis = () => {
      if (document.visibilityState === 'visible' && timer) {
        window.clearTimeout(timer)
        timer = window.setTimeout(
          pull,
          200,
        ) as unknown as number
      }
    }

    const startSSE = () => {
      try {
        const url =
          new URL('/notificacoes/stream', API_BASE_URL).toString() +
          (cursor
            ? `?cursor=${encodeURIComponent(cursor)}`
            : '')
        const ev = new EventSource(url, { withCredentials: true })
        sse = ev
        setUsingSSE(true)

        ev.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            if (Array.isArray(data?.items)) {
              setItems((old) =>
                mergeNotifs(old, data.items as NotificacaoDTO[]),
              )
              if (
                typeof data?.nextCursor === 'number' ||
                data?.nextCursor === null
              ) {
                setCursor(data.nextCursor)
              }
            } else if (data && typeof data === 'object') {
              setItems((old) =>
                mergeNotifs(old, [data as NotificacaoDTO]),
              )
            }
          } catch {
            // se vier payload não-JSON, ignoramos
          }
        }
        ev.onerror = () => {
          ev.close()
          startPolling()
        }

        // faz também um fetch inicial
        pull()
      } catch {
        startPolling()
      }
    }

    // se a aba não está visível, evita stream contínuo
    if (document.visibilityState !== 'visible') {
      startPolling()
    } else {
      startSSE()
    }

    return () => {
      closed = true
      if (sse) sse.close()
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isAuthenticated])

  // ações remotas com marcação otimista
  const marcarLida = async (id: number) => {
    markLocalRead(id)
    try {
      await NotificacoesAPI.marcarLida(id)
    } catch {
      // mantemos como lida localmente por UX
    }
  }

  const marcarTodas = async () => {
    markAllLocalRead()
    try {
      await NotificacoesAPI.marcarTodas()
    } catch {
      // idem
    }
  }

  return { items, marcarLida, marcarTodas, usingSSE }
}

/* ===================== Componente ===================== */
export default function ModalNotificacoes({ isOpen, onClose }: Props) {
  // Força rerender se estado global de auth mudar (logout, etc.)
  useAuth()
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  // Apenas quando aberto fazemos stream/update ao vivo
  const { items, marcarLida, marcarTodas, usingSSE } =
    useNotificacoesLive(isOpen)

  const empty = items.length === 0

  const tituloA11y = useMemo(
    () => (usingSSE ? 'Notificações (em tempo real)' : 'Notificações'),
    [usingSSE],
  )

  const handleItemClick = async (id: number) => {
    try {
      await marcarLida(id)
    } finally {
      onClose()
    }
  }

  return (
    <Transition
      appear
      show={isOpen}
      as={Fragment}
    >
      <Dialog
        as="div"
        className="relative z-50"
        onClose={onClose}
        initialFocus={closeBtnRef}
        aria-labelledby="dialog-notif-title"
      >
        {/* backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            aria-hidden="true"
          />
        </Transition.Child>

        {/* content */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white shadow-xl">
                {/* header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
                  <div className="flex items-center justify-between">
                    <Dialog.Title
                      id="dialog-notif-title"
                      className="flex items-center gap-2 text-xl font-bold"
                    >
                      <FaBell aria-hidden /> {tituloA11y}
                    </Dialog.Title>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async () => {
                          try {
                            await marcarTodas()
                            toast.success(
                              'Todas as notificações marcadas como lidas',
                            )
                          } catch {
                            toast.error(
                              'Falha ao marcar todas',
                            )
                          }
                        }}
                        className="rounded-full bg-white/20 px-2 py-1 text-xs transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/60"
                        aria-label="Marcar todas como lidas"
                      >
                        Marcar todas
                      </button>
                      <button
                        ref={closeBtnRef}
                        onClick={onClose}
                        className="rounded-full p-1 transition hover:bg.white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
                        aria-label="Fechar"
                      >
                        <FaTimes aria-hidden />
                      </button>
                    </div>
                  </div>
                  <Dialog.Description className="sr-only">
                    Lista de notificações recentes
                  </Dialog.Description>
                </div>

                {/* list */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {empty ? (
                    <div className="p-6 text-center">
                      <FaCheckCircle
                        className="mx-auto mb-3 text-4xl text-green-500"
                        aria-hidden
                      />
                      <p className="text-gray-600">
                        Nenhuma notificação nova
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Está tudo em dia.
                      </p>
                    </div>
                  ) : (
                    <ul
                      className="divide-y divide-gray-100"
                      role="list"
                      aria-label="Notificações"
                    >
                      {items.map((n) => {
                        const lida = isLida(n)
                        const href = deriveNotifLink(n)
                        const idNum = asNumberId(n.id)

                        return (
                          <li key={String(n.id)}>
                            <Link
                              to={href}
                              preload="intent"
                              onClick={() =>
                                handleItemClick(idNum)
                              }
                              className="block"
                              aria-label={`${getTitulo(n)}${
                                lida ? '' : ' — não lida'
                              }`}
                            >
                              <motion.div
                                initial={{
                                  opacity: 0,
                                  x: 10,
                                }}
                                animate={{
                                  opacity: 1,
                                  x: 0,
                                }}
                                className={`p-4 transition hover:bg-gray-50 ${
                                  !lida
                                    ? 'bg-blue-50'
                                    : ''
                                }`}
                              >
                                <div className="flex gap-3">
                                  <div className="mt-1">
                                    <Icone
                                      tipo={n.type}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex justify-between">
                                      <p
                                        className={`truncate text-sm font-medium ${
                                          !lida
                                            ? 'text-blue-800'
                                            : 'text-gray-700'
                                        }`}
                                      >
                                        {getTitulo(n)}
                                      </p>

                                      <button
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          marcarLida(
                                            idNum,
                                          )
                                            .then(
                                              () =>
                                                toast.success(
                                                  'Notificação marcada como lida',
                                                ),
                                            )
                                            .catch(
                                              () =>
                                                toast.error(
                                                  'Falha ao marcar como lida',
                                                ),
                                            )
                                        }}
                                        className="text-xs text-gray-400 transition hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 rounded"
                                        aria-label="Marcar como lida"
                                        title="Marcar como lida"
                                      >
                                        <FaCheckCircle aria-hidden />
                                      </button>
                                    </div>

                                    <p className="mt-1 text-sm text-gray-600">
                                      {getCorpo(n)}
                                    </p>

                                    {getData(n) ? (
                                      <p className="mt-2 text-xs text-gray-400">
                                        {getData(n)}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </motion.div>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {/* footer */}
                <div className="bg-gray-50 p-3">
                  <button
                    onClick={onClose}
                    className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 py-2 text-white transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    Fechar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
