// client/src/api/client.ts
import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuth, normalizeRole, type Role } from '../store/auth'

/* ============================================================================
   Axios base
============================================================================ */

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

const REQ_TIMEOUT = 30000

// cliente principal autenticado
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // precisa do cookie httpOnly de refresh
  timeout: REQ_TIMEOUT,
})

// cliente público (sem bearer)
export const publicApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  timeout: REQ_TIMEOUT,
})

// cliente dedicado para /auth/refresh (evitar loop no interceptor)
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: REQ_TIMEOUT,
})

/* ============================================================================
   Interceptor REQUEST: mete Authorization: Bearer <token>
============================================================================ */
api.interceptors.request.use((config) => {
  // se o chamador definiu Authorization explicitamente, respeita
  if (config?.headers && 'Authorization' in config.headers) return config

  const token = useAuth.getState().accessToken
  if (token) {
    config.headers = config.headers ?? {}
    ;(config.headers as any).Authorization = `Bearer ${token}`
  }
  return config
})
// DTOs — mantém em sync com toDto()
export type ConsultaStatus = 'MARCADA' | 'RECUSADA' | 'RETORNADA' | 'CONCLUIDA' | 'CANCELADA'
export type Metodo = 'PRESENCIAL' | 'VIDEO'

export interface FilhoDTO {
  id: number
  nome: string
  idade: number
  genero: string
  perfilLeitor: string
}

export interface ConsultaDTO {
  id: number
  dataHora: string // ISO (ou local ISO se mudares)
  status: ConsultaStatus
  notas: string | null
  metodo: Metodo | null
  familiaId: number
  bibliotecarioId: number
  createdAt: string

  recusaMotivo: string | null
  retornoMotivo: string | null
  resultadoResumo: string | null
  resultadoEnviadoAt: string | null

  familiaNome: string
  familiaEmail: string | null
  bibliotecarioNome: string
  bibliotecarioEmail: string | null

  familiaTelefone: string | null
  familiaMorada: string | null
  familiaFilhos: FilhoDTO[]
}

export interface ConsultaListResponse {
  items: ConsultaDTO[]
  total: number
  page: number
  pageSize: number
  maxCreatedAt: string | null
}

export interface DisponibilidadeDia {
  data: string // YYYY-MM-DD
  slots: string[] // ISO(s) dos inícios
}
export interface DisponibilidadeResponse {
  bibliotecarioId: number
  desde: string
  ate: string
  dias: DisponibilidadeDia[]
}

/* ============================================================================
   Interceptor RESPONSE: refresh token automático
============================================================================ */

let isRefreshing = false
let queue: Array<(token: string | null) => void> = []

const pushQueue = (cb: (token: string | null) => void) => {
  queue.push(cb)
}
const flushQueue = (token: string | null) => {
  queue.forEach((fn) => fn(token))
  queue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined
    const status = error.response?.status ?? 0
    const url = (original?.url ?? '').toLowerCase()

    const isAuthRoute =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/me') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/logout')

    if (!original || status !== 401 || original._retry || isAuthRoute) {
      return Promise.reject(error)
    }

    original._retry = true

    // já está a refrescar → enfileira
    if (isRefreshing) {
      return new Promise((resolve) => {
        pushQueue((newToken) => {
          if (newToken) {
            original.headers = original.headers ?? {}
            ;(original.headers as any).Authorization = `Bearer ${newToken}`
          }
          resolve(api(original))
        })
      })
    }

    // este pedido inicia um refresh
    isRefreshing = true
    try {
      const auth = useAuth.getState()
      const body = auth.refreshToken ? { refreshToken: auth.refreshToken } : undefined

      const { data } = await refreshClient.post('/auth/refresh', body)

      const newToken: string | undefined = (data as any)?.accessToken
      const newUser = (data as any)?.user
      if (!newToken) throw new Error('Sem accessToken no refresh')

      // normalizar role / active
      if (newUser?.role) {
        const nr = normalizeRole(newUser.role)
        if (nr) newUser.role = nr
      }
      if (newUser) {
        const active =
          typeof newUser.active === 'boolean'
            ? newUser.active
            : typeof newUser.isActive === 'boolean'
              ? newUser.isActive
              : undefined
        if (active !== undefined) {
          newUser.active = active
          newUser.isActive = active
        }
      }

      // atualizar zustand
      auth.setAccessToken(newToken)
      if (newUser) {
        auth.setUser(newUser)
      }

      // libertar fila
      flushQueue(newToken)

      // repetir request original com token novo
      original.headers = original.headers ?? {}
      ;(original.headers as any).Authorization = `Bearer ${newToken}`
      return api(original)
    } catch (e) {
      flushQueue(null)
      useAuth.getState().logout()
      return Promise.reject(e)
    } finally {
      isRefreshing = false
    }
  },
)

/* ============================================================================
   Helpers utilitários
============================================================================ */

// constrói URL completa pra imagem
export const imageUrl = (p?: string | null) => {
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  const base = (api.defaults.baseURL || '').replace(/\/+$/, '')
  const rel = '/' + String(p).replace(/^\/+/, '')
  return base ? `${base}${rel}` : rel
}

// Date -> 'YYYY-MM-DD'
const toYMD = (d: string | Date): string => {
  const dt = typeof d === 'string' ? new Date(d) : d
  const y = dt.getFullYear()
  const m = `${dt.getMonth() + 1}`.padStart(2, '0')
  const day = `${dt.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

// extrai mensagem de erro Axios
export function parseApiError(err: unknown): string {
  const e = err as AxiosError<any>
  if (e?.response?.data) {
    const data = e.response.data as any
    if (typeof data === 'string') return data
    if (data?.message) return data.message as string
    if (Array.isArray(data?.errors)) return data.errors.join(', ')
  }
  return e?.message ?? 'Erro inesperado'
}

/* ============================================================================
   Tipos base
============================================================================ */

export type ID = string | number
export type Order = 'asc' | 'desc'

export type NotificacaoTipo = 'PEDIDO' | 'REQUISICAO' | 'MENSAGEM' | 'ATIVIDADE'

export interface ListParams {
  page?: number
  pageSize?: number
  q?: string
  sort?: string
  order?: Order
  [key: string]: any
}

export type PageT<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  [key: string]: any
}


/* ============================================================================
   Domínio: Utilizador / Família / Biblioteca
============================================================================ */

export interface FamiliaFilho {
  id?: ID
  nome: string
  idade: number
  genero: 'F' | 'M' | 'Outro'
  perfilLeitor: 'iniciante' | 'Dislexia' | 'autonomo'
}

export interface Familia {
  id: ID
  userId?: ID
  telefone: string
  morada: string
  interesses: string[]
  filhos?: FamiliaFilho[]
  createdAt?: string
  nome?: string
  email?: string | null
  bibliotecaId?: number | null
  bibliotecaNome?: string | null
  user?: {
    id: number
    name: string | null
    email: string | null
    role: Role | string
    bibliotecaId: number | null
    biblioteca: { id: number; nome: string } | null
  } | null
  [key: string]: any
}

export interface Biblioteca {
  id: ID
  nome: string
  local?: string | null
}

export interface User {
  id: ID
  name?: string | null
  email?: string | null
  role?: Role | string
  active?: boolean
  isActive?: boolean
  bibliotecaId?: ID | null
  biblioteca?: { id: number; nome: string; local?: string | null } | null
  bibliotecaNome?: string | null
  familia?: Familia | null
  stats?: {
    requisicoes: {
      total: number
      pendentes: number
      aprovadas: number
      negadas: number
      devolvidas: number
    }
    consultas: { comoFamilia: number; comoBibliotecario: number }
    mensagens: { recebidas: number; porLer: number; enviadas: number }
    notificacoesNaoLidas: number
    atividadesCriadas: number
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: any
}

/* ---------------- PedidoLoja (DTO alinhado ao backend) ---------------- */
export type PedidoLojaDTO = {
  id: number
  status: 'pendente' | 'confirmado' | 'enviado' | 'concluido' | 'cancelado'
  statusRaw:
    | 'PAGAMENTO_PENDENTE' | 'PAGO' | 'PAGAMENTO_FALHOU'
    | 'APROVADO' | 'ENVIADO' | 'CONCLUIDO' | 'CANCELADO'
  total: number
  totalPago: number
  pagamentoStatus: 'PENDENTE' | 'PAGO' | 'FALHOU' | null
  entregaTipo: 'domicilio' | 'biblioteca' | null
  entregaEndereco: string | null
  dataPedido: string | null

  // >>> adicionados:
  clienteId: number | null
  clienteNome: string | null
  clienteEmail: string | null

  itens: Array<{
    id: number
    livroId: number
    titulo: string
    quantidade: number
    precoUnit: number
    entregaStatus?: string | null
    entregueEm?: string | null
    canceladoEm?: string | null
    imagem?: string | null
  }>
}
/* ============================================================================
   Domínio: Livros
============================================================================ */

export type TipoAquisicao = 'compra' | 'emprestimo'

export interface Livro {
  id: number | string
  imagem?: string | null
  titulo: string
  autor: string
  faixaEtaria: string
  categoria: string
  preco: number | null
  descricao?: string | null
  quantidade: number
  tipoAquisicao: TipoAquisicao
  diasDevolucao: number | null
  bibliotecaId?: number | null
  createdAt?: string
  updatedAt?: string
  [x: string]: any
}

export type ComentarioDTO = {
  id: number
  user: string
  rating: number
  texto: string
  createdAt: string
}

/* ============================================================================
   Domínio: Carrinho / Pedido / Pagamento
============================================================================ */

export type PedidoStatus =
  | 'PAGAMENTO_PENDENTE'
  | 'PAGO'
  | 'PAGAMENTO_FALHOU'
  | 'APROVADO'
  | 'ENVIADO'
  | 'CONCLUIDO'
  | 'CANCELADO'
export type PedidoEntregaTipo = 'domicilio' | 'biblioteca' | null

export interface CarrinhoItem {
  id: number
  familiaId: number
  livroId: number
  quantidade: number
  precoUnit: number
  tituloSnapshot: string
  livro?: {
    id: number
    titulo: string
    preco: number | null
    tipoAquisicao: 'compra' | 'emprestimo'
    quantidade: number
    autor?: string | null
    imagem?: string | null
  }
}

export interface CarrinhoDTO {
  familiaId: number
  itens: CarrinhoItem[]
  createdAt?: string
  updatedAt?: string
}

export interface PedidoItem {
  id: number
  pedidoId: number
  livroId: number
  titulo: string
  precoUnit: number
  quantidade: number
}

// (mantida) linha compat de UI
export type PedidoUserRow = RequisicaoDTO & {
  createdAt?: string | null
  quantidadeSolicitada?: number | null
  quantidadeAprovada?: number | null
  pagamentoValor?: number | null
  pagamentoStatus?: string | null
  precoLivro?: number | null
  stockAtual?: number | null
  dataDevolucaoPrevista?: string | null
  devolvidoEm?: string | null
  
}

export interface PedidoDTO {
  id: number
  familiaId: number
  itens: {
    id: number
    livroId: number
    titulo: string
    precoUnit: number
    quantidade: number
  }[]
  total: number
  status:
    | 'PAGAMENTO_PENDENTE'
    | 'PAGO'
    | 'APROVADO'
    | 'ENVIADO'
    | 'CONCLUIDO'
    | 'CANCELADO'
  entregaTipo: 'domicilio' | 'biblioteca' | null
  entregaEndereco: string | null
  createdAt?: string
  updatedAt?: string
}

export interface PagamentoInitResponse {
  pagamentoId: number
  referencia: string
  valor: number
}

/* ============================================================================
   Domínio: Consultas
============================================================================ */

export interface Consulta {
  id: ID
  dataHora: string
  status: 'MARCADA' | 'RECUSADA' | 'RETORNADA' | 'CONCLUIDA' | 'CANCELADA'
  recusaMotivo?: string | null
  retornoMotivo?: string | null
  resultadoResumo?: string | null
  resultadoEnviadoAt?: string | null
  notas?: string | null

  familiaId: number
  bibliotecarioId: number
  createdAt?: string

  familiaNome?: string | null
  familiaEmail?: string | null
  bibliotecarioNome?: string | null
  bibliotecarioEmail?: string | null

  familiaTelefone?: string | null
  familiaMorada?: string | null
  familiaFilhos?: FamiliaFilho[]
}

/* ============================================================================
   Domínio: Eventos / Atividades
============================================================================ */

export type TempoFiltro = 'hoje' | 'futuras' | 'passadas' | 'todas'
export type StatusEvt = 'agendada' | 'em_andamento' | 'concluida'

export type ListEventosParams = {
  q?: string
  tempo?: TempoFiltro
  from?: string
  to?: string
  status?: StatusEvt | 'todas'
  page?: number
  pageSize?: number
  dataInicio?: string
  dataFim?: string
}

export type EventoPayload = {
  titulo: string
  descricao: string
  data: string // YYYY-MM-DD
  horario: string // "HH:MM - HH:MM"
  local: string
  vagas: number
  status?: StatusEvt
  imagem?: string | null
}

export type AtividadeDTO = {
  id: number
  titulo: string
  descricao: string
  data: string
  horario: string
  local: string
  vagas: number
  status: StatusEvt
  imagem?: string | null
  createdAt?: string
  updatedAt?: string

  inscritosAdultos?: number
  inscritosFilhos?: number
  inscritosTotal?: number
  inscritos?: number
  participantes?: number
  presentes?: number

  inscrito?: boolean
  presente?: boolean
}

export type Atividade = {
  id: number
  titulo: string
  descricao: string
  data: string
  horario: string
  local: string
  vagas: number
  status: StatusEvt
  imagem?: string | null
  participantes?: number
  inscritos?: number
  inscritosAdultos?: number
  inscritosFilhos?: number
  presentes?: number
  inscrito?: boolean
  presente?: boolean
  createdAt?: string
  updatedAt?: string
}

const toAtividade = (dto: AtividadeDTO): Atividade => {
  const total = dto.inscritosTotal ?? dto.inscritos ?? dto.participantes ?? 0
  return {
    id: dto.id,
    titulo: dto.titulo,
    descricao: dto.descricao,
    data: dto.data,
    horario: dto.horario,
    local: dto.local,
    vagas: dto.vagas,
    status: dto.status,
    imagem: dto.imagem ?? null,
    participantes: total,
    inscritos: total,
    inscritosAdultos: dto.inscritosAdultos,
    inscritosFilhos: dto.inscritosFilhos,
    presentes: dto.presentes ?? 0,
    inscrito: dto.inscrito,
    presente: dto.presente,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  }
}

export type HorarioSlot = {
  id?: number
  userId?: number
  weekday: number        // 0..6
  startMin: number       // 0..1439
  endMin: number         // 1..1440
  slotMin: number        // 5..240
  active: boolean
}

export type AdminInscricaoRow = {
  id: number
  modo: 'individual' | 'familia_total' | 'familia_parcial'
  presente: boolean
  qtdAdultos: number
  qtdFilhos: number
  createdAt?: string | null
  familia: {
    id: number
    responsavel: {
      id: number
      name: string | null
      email?: string | null
    }
  } | null
  utilizador: {
    id: number
    name: string | null
    email?: string | null
  } | null
}


export type RequisicaoDTO = {
  id: number
  livroId: number
  livroTitulo: string
  livroAutor?: string | null
  livroImagem?: string | null
  categoria?: string | null
  faixa?: string | null
  tipoAquisicao?: 'compra' | 'emprestimo' | null
  diasDevolucao?: number | null
  dataDevolucaoPrevista?: string | null

  nome: string
  dataPedido: string | null

  status: 'pendente' | 'confirmado' | 'rejeitado' | 'entregue' | 'devolvida'

    statusRaw:
    | 'PENDENTE'
    | 'APROVADA'          // empréstimo
    | 'NEGADA'
    | 'ENTREGUE'
    | 'DEVOLVIDA'
    | 'SAIU_PARA_ENTREGA'
    // pagamentos (comuns)
    | 'PAGAMENTO_PENDENTE'
    | 'PAGAMENTO_FALHOU'
    | 'PAGO'
    // loja (venda)
    | 'APROVADO'
    | 'ENVIADO'
    | 'CONCLUIDO'
    | 'CANCELADO'


  tipo: '' | 'domicilio' | 'biblioteca'
  dataResposta?: string | null
  horario?: string | null
  endereco?: string | null
familiaId?: number | null
  familiaEmail?: string | null
  bibliotecaId?: number | null
  motivoRecusa?: string | null
  entregueEm?: string | null

  pagamentoStatus?: 'PENDENTE' | 'PAGO' | 'FALHOU' | null
  pagamentoValor?: number | null

  // extras expostos pelo backend novo
  precoLivro?: number | null
  stockAtual?: number | null
  quantidadeSolicitada?: number | null
  quantidadeAprovada?: number | null
  devolvidoEm?: string | null
}

/* ============================================================================
   Normalização de User para Admin screens
============================================================================ */

export type UserListItem = {
  id: number
  name: string | null
  email: string | null
  role: Role | string
  active: boolean
  bibliotecaId: number | null
  biblioteca: {
    id: number
    nome: string
    local: string | null
  } | null
  bibliotecaNome?: string | null
  familia?: {
    id: number
    telefone: string
    morada: string
    interesses: any
  } | null
  stats?: {
    mensagensPorLer: number
    notificacoesNaoLidas: number
  }
}

const normalizeUser = (u: any): User => {
  if (!u || typeof u !== 'object') return u

  const nr = u.role ? normalizeRole(u.role) : undefined

  const active =
    typeof u.active === 'boolean'
      ? u.active
      : typeof u.isActive === 'boolean'
        ? u.isActive
        : undefined

  const biblioteca = u.biblioteca ?? null
  const bibliotecaNome =
    u.bibliotecaNome !== undefined ? u.bibliotecaNome : biblioteca?.nome ?? null

  return {
    ...u,
    role: nr ?? u.role,
    active,
    isActive: active,
    biblioteca,
    bibliotecaNome,
  }
}

const normalizeUserPage = <T extends Record<string, any>>(
  page: Page<T>,
): Page<any> => {
  return {
    ...page,
    items: page.items.map((it: any) => normalizeUser(it)),
  }
}

/* ============================================================================
   APIs
============================================================================ */

/* ---------------- Auth ---------------- */
export const AuthAPI = {
  login: async (payload: { email: string; password: string }) => {
    // backend responde { user, accessToken, refreshToken }
    const { data } = await api.post('/auth/login', payload, {
      headers: { Authorization: undefined },
    })

    const usr = (data as any).user
    if (usr?.role) {
      const nr = normalizeRole(usr.role)
      if (nr) usr.role = nr
    }
    if (usr) {
      const active =
        typeof usr.active === 'boolean'
          ? usr.active
          : typeof usr.isActive === 'boolean'
            ? usr.isActive
            : undefined
      if (active !== undefined) {
        usr.active = active
        usr.isActive = active
      }
    }

    useAuth.getState().login({
      user: usr,
      accessToken: (data as any).accessToken,
      refreshToken: (data as any).refreshToken ?? null,
      expiresAt: (data as any).expiresAt ?? null,
    })

    return data
  },

  registerFamilia: async (payload: {
    name: string
    email: string
    password: string
    telefone?: string
    morada?: string
    interesses?: string[]
    filhos?: Array<{
      nome: string
      idade: number
      genero: 'F' | 'M' | 'Outro'
      perfilLeitor: 'iniciante' | 'Dislexia' | 'autonomo'
    }>
    bibliotecaId?: number
  }) => {
    // /auth/register cria user PAI + familia
    // backend responde { user, accessToken, refreshToken }
    const { data } = await api.post('/auth/register', payload, {
      headers: { Authorization: undefined },
    })

    const usr = (data as any).user
    if (usr?.role) {
      const nr = normalizeRole(usr.role)
      if (nr) usr.role = nr
    }
    if (usr) {
      const active =
        typeof usr.active === 'boolean'
          ? usr.active
          : typeof usr.isActive === 'boolean'
            ? usr.isActive
            : undefined
      if (active !== undefined) {
        usr.active = active
        usr.isActive = active
      }
    }

    // login automático
    useAuth.getState().login({
      user: usr,
      accessToken: (data as any).accessToken,
      refreshToken: (data as any).refreshToken ?? null,
      expiresAt: (data as any).expiresAt ?? null,
    })

    return data
  },

  me: async () => {
    const { data } = await api.get('/auth/me')

    if ((data as any)?.role) {
      const nr = normalizeRole((data as any).role)
      if (nr) (data as any).role = nr
    }

    const active =
      typeof (data as any).active === 'boolean'
        ? (data as any).active
        : typeof (data as any).isActive === 'boolean'
          ? (data as any).isActive
          : undefined
    if (active !== undefined) {
      ;(data as any).active = active
      ;(data as any).isActive = active
    }

    return data
  },

  logout: async () => {
    try {
      await api.post(
        '/auth/logout',
        {},
        { headers: { Authorization: undefined } },
      )
    } catch {
      // ignora erro de logout
    }
    useAuth.getState().logout()
  },

  // normalmente chamado pelo interceptor
 refresh: (body?: { refreshToken?: string }) =>
    refreshClient.post('/auth/refresh', body).then((r) => r.data),
} as const

/* ---------------- Família (self PAI) ---------------- */
export type MeFamiliaResponse = {
  user: User | null
  familia: Familia | null
}
export const FamiliaAPI = {
  me: () =>
    api.get<MeFamiliaResponse>('/familia/me').then((r) => r.data),

  minha: async () => {
    const { data } = await api.get<MeFamiliaResponse>('/familia/me')
    return data.familia
  },
  meusFilhos: async (opts?: { signal?: AbortSignal }) => {
    const r = await api.get('/familia/minha/filhos', { signal: opts?.signal })
    return r.data as { familiaId: number | null, filhos: Array<{ id: number, nome: string }> }
  },
  atualizarMinha: (
    _id: ID,
    payload: {
      telefone?: string
      morada?: string
      interesses?: string[]
      user?: {
        name?: string
        email?: string
      }
    },
  ) =>
    api.put<any>('/familia', payload).then((r) => (r.data?.familia ?? r.data) as Familia),
} as const

/* ---------------- Admin - Famílias ---------------- */
export const FamiliasAdminAPI = {
  listar: (params?: ListParams) =>
    api
      .get<Page<Familia>>('/familia', { params })
      .then((r) => r.data),

  obter: (id: ID) =>
    api.get<Familia>(`/familia/${id}`).then((r) => r.data),

  criar: (payload: Partial<Familia>) =>
    api.post<Familia>('/familia', payload).then((r) => r.data),

  atualizar: (id: ID, payload: Partial<Familia>) =>
    api.put<Familia>(`/familia/${id}`, payload).then((r) => r.data),

  patch: (id: ID, payload: Partial<Familia>) =>
    api.patch<Familia>(`/familia/${id}`, payload).then((r) => r.data),

  remover: (id: ID) =>
    api.delete(`/familia/${id}`).then((r) => r.data),
} as const

/* ---------------- Livros ---------------- */
export const LivrosAPI = {
  listar: (params?: {
    page?: number
    pageSize?: number
    q?: string
    categoria?: string
    tipo?: 'compra' | 'emprestimo'
    faixa?: string
  }) =>
    api
      .get<{
        items: Livro[]
        total: number
        page: number
        pageSize: number
      }>('/livros', { params })
      .then((r) => r.data),

  detalhes: (id: number) =>
    api.get<Livro>(`/livros/${id}`).then((r) => r.data),

  // rota pública opcional
  obter: (id: ID) => publicApi.get<Livro>(`/livros/${id}`).then((r) => r.data),

  comentarios: {
    listar: (livroId: number) =>
      api
        .get<ComentarioDTO[]>(`/livros/${livroId}/comentarios`)
        .then((r) => r.data),

    criar: (livroId: number, payload: { rating: number; texto: string }) =>
      api
        .post<ComentarioDTO>(`/livros/${livroId}/comentarios`, payload)
        .then((r) => r.data),
  },

  criar: (payload: Partial<Livro>) =>
    api.post<Livro>('/livros', payload).then((r) => r.data),

  atualizar: (id: ID, payload: Partial<Livro>) =>
    api.put<Livro>(`/livros/${id}`, payload).then((r) => r.data),

  remover: (id: ID) =>
    api.delete(`/livros/${id}`).then((r) => r.data),

  uploadCapa: (id: ID, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api
      .post<Livro>(`/livros/${id}/capa`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
} as const

/* ---------------- Carrinho / Checkout / Pagamentos ---------------- */
export const CarrinhoAPI = {
  get(familiaId?: number) {
    const params = familiaId ? { familiaId } : undefined
    return api.get<CarrinhoDTO>('/carrinho', { params }).then((r) => r.data)
  },

  adicionarItem(livroId: number, quantidade = 1, familiaId?: number) {
    const params = familiaId ? { familiaId } : undefined
    return api
      .post<CarrinhoDTO>('/carrinho/itens', { livroId, quantidade }, { params })
      .then((r) => r.data)
  },

  atualizarItem(itemId: number, quantidade: number, familiaId?: number) {
    const params = familiaId ? { familiaId } : undefined
    return api
      .put<CarrinhoDTO>(`/carrinho/itens/${itemId}`, { quantidade }, { params })
      .then((r) => r.data)
  },

  removerItem(itemId: number, familiaId?: number) {
    const params = familiaId ? { familiaId } : undefined
    return api
      .delete<CarrinhoDTO>(`/carrinho/itens/${itemId}`, { params })
      .then((r) => r.data)
  },

  checkout(
    data: {
      entregaTipo: 'domicilio' | 'biblioteca'
      endereco?: string | null
    },
    familiaId?: number,
  ) {
    const params = familiaId ? { familiaId } : undefined
    return api.post('/carrinho/checkout', data, { params }).then((r) => r.data)
  },

  iniciarPagamento(
    pedidoId: number,
    metodo: 'CARTAO' | 'BISTP' | 'DINHEIRO' | 'MPESA' | 'M_PESA' = 'CARTAO',
  ) {
    return api
      .post<PagamentoInitResponse>(`/carrinho/pagamentos/${pedidoId}/iniciar`, {
        metodo,
      })
      .then((r) => r.data)
  },

  confirmarPagamento(pedidoId: number, referencia: string) {
    return api
      .post<PedidoDTO>(`/carrinho/pagamentos/${pedidoId}/confirmar`, {
        referencia,
      })
      .then((r) => r.data)
  },

  marcarFalhaPagamento(pedidoId: number) {
    return api
      .post<{ ok: true }>(`/carrinho/pagamentos/${pedidoId}/falhou`, {})
      .then((r) => r.data)
  },
} as const

/* ---------------- Pedidos da loja ---------------- */
export const PedidosLojaAPI = {
  // aceita filtro status do front: pendente|confirmado|enviado|concluido|cancelado
  minhas: (status?: 'pendente' | 'confirmado' | 'enviado' | 'concluido' | 'cancelado') =>
    api.get<PedidoLojaDTO[]>('/pedidos-loja/minhas', {
      params: status ? { status } : undefined,
    }).then(r => r.data),

  obter: (id: number) =>
    api.get<PedidoLojaDTO>(`/pedidos-loja/${id}`).then(r => r.data),

  patchStatus: (id: number, status:
    | 'PAGAMENTO_PENDENTE' | 'PAGO' | 'APROVADO'
    | 'ENVIADO' | 'CONCLUIDO' | 'CANCELADO'
  ) =>
    api.patch<PedidoLojaDTO>(`/pedidos-loja/${id}/status`, { status }).then(r => r.data),
} as const

/* ---------------- Requisições ---------------- */
export const RequisicoesAPI = {
  criar: (payload: {
    livroId: number
    familiaId?: number
    entregaTipo?: 'domicilio' | 'biblioteca'
    endereco?: string
  }) => api.post<RequisicaoDTO>('/requisicoes', payload).then((r) => r.data),
despachar: (id: number) =>
    api.post<RequisicaoDTO>(`/requisicoes/${id}/despachar`, {}).then(r => r.data),

  listar: (params?: {
    page?: number
    pageSize?: number
    q?: string
    status?:
      | 'PENDENTE'
      | 'APROVADA'
      | 'NEGADA'
      | 'ENTREGUE'
      | 'DEVOLVIDA'
      | 'PAGAMENTO_PENDENTE'
      | 'PAGAMENTO_FALHOU'
      | 'PAGO'
  }) =>
    api
      .get<{
        items: RequisicaoDTO[]
        total: number
        page: number
        pageSize: number
      }>('/requisicoes', { params })
      .then((r) => r.data),

 aprovar: (
    id: number,
    d: {
      entregaTipo: 'domicilio' | 'biblioteca'
      data: string // yyyy-mm-dd
      hora: string // HH:MM
      endereco?: string
    },
  ) => api.post<RequisicaoDTO>(`/requisicoes/${id}/aprovar`, d).then(r => r.data),

  rejeitar: (id: number) =>
    api.post<RequisicaoDTO>(`/requisicoes/${id}/cancelar`, {}).then((r) => r.data),

  entregar: (id: number) =>
    api.post<RequisicaoDTO>(`/requisicoes/${id}/entregar`, { confirmar: true }).then(
      (r) => r.data,
    ),

  devolver: (id: number) =>
    api.post<RequisicaoDTO>(`/requisicoes/${id}/devolver`, { confirmar: true }).then(
      (r) => r.data,
    ),

  editar: (
    id: number,
    d: {
      entregaTipo?: 'domicilio' | 'biblioteca'
      endereco?: string
    },
  ) => api.put<RequisicaoDTO>(`/requisicoes/${id}`, d).then((r) => r.data),

  cancelar: (id: number) =>
    api.post<RequisicaoDTO>(`/requisicoes/${id}/cancelar`, {}).then((r) => r.data),

  // legado (mantido no backend, sem mexer em stock)
  pagar: (id: number) =>
    api.post<RequisicaoDTO>(`/requisicoes/${id}/pagar`, { confirmar: true }).then(
      (r) => r.data,
    ),

  minhas: () => api.get<RequisicaoDTO[]>('/requisicoes/minhas').then((r) => r.data),

  minhasEmPosse: () =>
    api.get<RequisicaoDTO[]>('/requisicoes/minhas-em-posse').then((r) => r.data),
} as const

/* ---------------- Atividades / Eventos ---------------- */
export const AtividadesAPI = {
  async listar(params: ListEventosParams = {}, opts?: { signal?: AbortSignal }) {
    const query = {
      ...params,
      dataInicio: params.dataInicio ?? params.from,
      dataFim: params.dataFim ?? params.to,
    }

    const { data } = await api.get<{
      items: AtividadeDTO[]
      total: number
      page: number
      pageSize: number
    }>('/eventos', { params: query, signal: opts?.signal })

    return {
      items: data.items.map(toAtividade),
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
      raw: data.items,
    }
  },

  async obter(id: number) {
    const { data } = await api.get<AtividadeDTO>(`/eventos/${id}`)
    return toAtividade(data)
  },

  async criar(payload: EventoPayload) {
    const { data } = await api.post<AtividadeDTO>('/eventos', payload)
    return toAtividade(data)
  },

  async atualizar(id: number, payload: EventoPayload) {
    const { data } = await api.put<AtividadeDTO>(`/eventos/${id}`, payload)
    return toAtividade(data)
  },

  async patch(id: number, parc: Partial<EventoPayload>) {
    const { data } = await api.patch<AtividadeDTO>(`/eventos/${id}`, parc)
    return toAtividade(data)
  },

  async remover(id: number) {
    await api.delete(`/eventos/${id}`)
    return true
  },

  async uploadImagem(eventoId: number, file: File) {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post<AtividadeDTO>(
      `/eventos/${eventoId}/imagem`,
      form,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    return toAtividade(data)
  },

  async inscrever(
    eventoId: number,
    body: {
      familiaId?: number
      utilizadorId?: number
      todosFamilia?: boolean
      incluirResponsavel?: boolean
      filhosIds?: number[]
      numFilhosAcompanhantes?: number
    },
  ) {
    const { data } = await api.post(`/eventos/${eventoId}/inscricoes`, body)
    return data as {
      participante: {
        id: number
        eventoId: number
        familiaId: number | null
        utilizadorId: number | null
        qtdAdultos: number
        qtdFilhos: number
        modo: 'individual' | 'familia_total' | 'familia_parcial'
        presente: boolean
        createdAt: string
      }
      inscritosAdultos: number
      inscritosFilhos: number
      inscritosTotal: number
      vagas: number
    }
  },

  async cancelarMinhaInscricao(eventoId: number) {
    await api.delete(`/eventos/${eventoId}/inscricoes`)
    return true
  },

  async listarParticipantes(eventoId: number) {
    const { data } = await api.get<AdminInscricaoRow[]>(
      `/eventos/${eventoId}/inscricoes`,
    )
    return data
  },

  async removerInscricao(eventoId: number, participanteId: number) {
    await api.delete(`/eventos/${eventoId}/inscricoes/${participanteId}`)
    return true
  },

  async minhasInscricoes() {
    const { data } = await api.get<
      Array<{
        id: number
        presente: boolean
        qtdAdultos: number
        qtdFilhos: number
        createdAt?: string | null
        evento: {
          id: number
          titulo: string
          data: string | Date
          horario: string
          local: string
          vagas: number
          status: StatusEvt
          imagem?: string | null
        }
        familiaId: number | null
        utilizadorId: number | null
      }>
    >('/eventos/minhas-inscricoes')

    return data.map((r) => ({
      ...r,
      evento: {
        ...r.evento,
        data: toYMD(r.evento.data),
      },
    }))
  },

  async marcarPresencaSelf(eventoId: number) {
    const { data } = await api.post<{
      ok: true
      presente: true
      presentes?: number
    }>(`/eventos/${eventoId}/presenca/self`)
    return data
  },
} as const

/* ---------------- Utilizadores (Admin) ---------------- */
export const UtilizadoresAPI = {
  listar: (
    params?: ListParams & {
      role?:
        | 'todos'
        | 'administrador'
        | 'bibliotecario'
        | 'ADMIN'
        | 'BIBLIOTECARIO'
        | 'PAI'
      active?: boolean
      bibliotecaId?: ID
      semBiblioteca?: boolean
      withStats?: boolean
    },
  ) =>
    api
      .get<Page<UserListItem>>('/utilizadores', {
        params,
      })
      .then((r) => normalizeUserPage(r.data) as Page<UserListItem>),

  obter: (id: ID) =>
    api.get<User>(`/utilizadores/${id}`).then((r) => normalizeUser(r.data)),

  criar: (
    payload:
      | {
          nome: string
          email: string
          tipo: 'administrador' | 'bibliotecario'
          password: string
          ativo?: boolean
          bibliotecaId?: ID | null
        }
      | {
          name: string
          email: string
          role: Role
          password: string
          active?: boolean
          bibliotecaId?: ID | null
        },
  ) =>
    api
      .post<User>('/utilizadores', payload)
      .then((r) => normalizeUser(r.data)),

  atualizar: (
    id: ID,
    payload:
      | {
          nome: string
          email: string
          tipo: 'administrador' | 'bibliotecario'
          password?: string
          ativo?: boolean
          bibliotecaId?: ID | null
        }
      | {
          name: string
          email: string
          role: Role
          password?: string
          active?: boolean
          bibliotecaId?: ID | null
        },
  ) =>
    api
      .put<User>(`/utilizadores/${id}`, payload)
      .then((r) => normalizeUser(r.data)),

  patch: (
    id: ID,
    payload: Partial<{
      nome: string
      name: string
      email: string
      tipo: 'administrador' | 'bibliotecario'
      role: Role | 'ADMIN' | 'BIBLIOTECARIO' | 'PAI'
      password: string
      ativo: boolean
      active: boolean
      bibliotecaId: number | null
    }>,
  ) =>
    api
      .patch<User>(`/utilizadores/${id}`, payload)
      .then((r) => normalizeUser(r.data)),

  remover: (id: ID) =>
    api.delete(`/utilizadores/${id}`).then((r) => r.data),
} as const

/* ---------------- Bibliotecas ---------------- */
export const BibliotecasAPI = {
  // Lista pública
  listarPublic: (params?: { q?: string; page?: number; pageSize?: number }) =>
    api.get('/bibliotecas/public', { params }).then((r) => r.data),

  // Lista completa ADMIN
  listarAdmin: (params?: {
    q?: string
    page?: number
    pageSize?: number
    sort?: 'id' | 'nome'
    order?: 'asc' | 'desc'
  }) => api.get('/bibliotecas', { params }).then((r) => r.data),

  obter: (id: ID) =>
    api.get(`/bibliotecas/${id}`).then((r) => r.data),

  criar: (data: { nome: string; local?: string | null }) =>
    api.post('/bibliotecas', data).then((r) => r.data),

  atualizar: (id: ID, data: { nome?: string; local?: string | null }) =>
    api.put(`/bibliotecas/${id}`, data).then((r) => r.data),

  patch: (id: ID, data: { nome?: string; local?: string | null }) =>
    api.patch(`/bibliotecas/${id}`, data).then((r) => r.data),

  remover: (id: ID) =>
    api.delete(`/bibliotecas/${id}`).then((r) => r.data),
} as const

/* ---------------- Consultas ---------------- */
export const ConsultasAPI = {
  criar: (body: {
    dataHora: string | Date
    bibliotecarioId: number
    notas?: string
    metodo?: Metodo
    familiaId?: number
  }) => api.post<ConsultaDTO>('/consultas', body).then(r => r.data),

  listar: (q?: {
    page?: number
    pageSize?: number
    q?: string
    status?: ConsultaStatus
    desde?: string | Date
    ate?: string | Date
    bibliotecarioId?: number
    familiaId?: number
    bibliotecaId?: number // só ADMIN
  }) => api.get<ConsultaListResponse>('/consultas', { params: q }).then(r => r.data),

  get: (id: number) => api.get<ConsultaDTO>(`/consultas/${id}`).then(r => r.data),

  atualizar: (id: number, body: {
    dataHora?: string | Date
    bibliotecarioId?: number
    notas?: string
    status?: ConsultaStatus
    motivo?: string
    resultadoResumo?: string
    enviarResultadoAgora?: boolean
  }) => api.patch<ConsultaDTO>(`/consultas/${id}`, body).then(r => r.data),

  responder: (id: number, info: string) =>
    api.post<ConsultaDTO>(`/consultas/${id}/responder`, { info }).then(r => r.data),

  cancelar: (id: number, motivo?: string) =>
    api.post<ConsultaDTO>(`/consultas/${id}/cancelar`, { motivo }).then(r => r.data),

  disponibilidade: (p: { bibliotecarioId: number; dias?: number; desde?: string; ate?: string }) =>
    api.get<DisponibilidadeResponse>('/consultas/disponibilidade', { params: p }).then(r => r.data),

  bibliotecarios: (bibliotecaId?: number) =>
    api.get<Array<{ id: number; name: string; email: string }>>('/consultas/bibliotecarios', { params: { bibliotecaId } })
      .then(r => r.data),

  familias: (q?: string) =>
    api.get<Array<{ id: number; name: string; email: string }>>('/consultas/familias', { params: { q } })
      .then(r => r.data),
}


/* ---------------- Notificações / Mensagens / Stats / Uploads ---------------- */

export type NotificacaoDTO = {
  id: number
  userId: number
  type: NotificacaoTipo
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export type NotificacaoListParams = {
  tipo?: NotificacaoTipo
  apenasNaoLidas?: boolean
  limit?: number
  cursor?: number
}

export type NotificacaoListResponse = {
  items: NotificacaoDTO[]
  nextCursor: number | null
}

export type Mensagem = {
  id: number
  fromUserId: number
  toUserId: number
  body: string
  readAt?: string | null
  createdAt: string
}

export type Thread = {
  peer: { id: number; name: string | null; role: 'PAI' | 'BIBLIOTECARIO' | 'ADMIN' | null }
  lastMessage: Mensagem | null
  unread: number
}

export interface Notificacao {
  id: ID
  titulo?: string
  corpo?: string
  lida?: boolean
  userId?: number
  type?: string
  title?: string
  body?: string
  readAt?: string | null
  createdAt?: string
  [key: string]: any
}

export const NotificacoesAPI = {
  listar: (params?: NotificacaoListParams): Promise<NotificacaoListResponse> => {
    const q: any = {}
    if (params?.tipo) q.tipo = params.tipo
    if (typeof params?.apenasNaoLidas === 'boolean') {
      q.apenasNaoLidas = params.apenasNaoLidas ? '1' : '0'
    }
    if (params?.limit) q.limit = params.limit
    if (params?.cursor) q.cursor = params.cursor

    return api.get<NotificacaoListResponse>('/notificacoes', { params: q }).then((r) => r.data)
  },

  stats: () => api.get('/notificacoes/stats').then((r) => r.data),

  marcarLida: (id: ID) =>
    api.post<NotificacaoDTO>(`/notificacoes/${id}/read`).then((r) => r.data),

  marcarTodas: () =>
    api.post('/notificacoes/read-all').then((r) => r.data),

  criar: (d: {
    userId: number
    type: NotificacaoTipo
    title: string
    body?: string
  }) => api.post<NotificacaoDTO>('/notificacoes', d).then((r) => r.data),

  criarPedido: (d: { userId: number; title: string; body?: string }) =>
    api.post<NotificacaoDTO>('/notificacoes/pedido', d).then((r) => r.data),

  criarRequisicao: (d: { userId: number; title: string; body?: string }) =>
    api.post<NotificacaoDTO>('/notificacoes/requisicao', d).then((r) => r.data),

  criarMensagem: (d: { userId: number; title: string; body?: string }) =>
    api.post<NotificacaoDTO>('/notificacoes/mensagem', d).then((r) => r.data),

  criarAtividade: (d: { userId: number; title: string; body?: string }) =>
    api.post<NotificacaoDTO>('/notificacoes/atividade', d).then((r) => r.data),
} as const

// ---- MensagensAPI ajustado ao backend paginado ----
export const MensagensAPI = {
  // Threads: GET /mensagens/threads → Array<Thread>
  threads: () =>
    api.get<Thread[]>('/mensagens/threads').then(r => r.data),

  // Histórico: GET /mensagens?peerId=123 → Array<Mensagem>
  between: (peerId: number) =>
    api.get<Mensagem[]>('/mensagens', { params: { peerId } }).then(r => r.data),

  // Enviar: POST /mensagens
  send: (toUserId: number, body: string) =>
    api.post<Mensagem>('/mensagens', { toUserId, body }).then(r => r.data),

  // Marcar como lida (PATCH moderno)
  markRead: (id: ID) =>
    api.patch<Mensagem>(`/mensagens/${id}/read`, {}).then(r => r.data),

  // Compat (POST antigo)
  marcarLida: (id: ID) =>
    api.post<Mensagem>(`/mensagens/${id}/lida`, {}).then(r => r.data),

  peer: (id: number) =>
    api.get<User>(`/mensagens/peer/${id}`).then(r => r.data),

  // Peers válidos segundo regras (BIBLIOTECÁRIO⇄PAI mesma biblioteca; ADMIN pode filtrar)
  peers: (q?: string, bibliotecaId?: number) =>
    api.get<User[]>('/mensagens/peers', {
      params: { ...(q ? { q } : {}), ...(bibliotecaId ? { bibliotecaId } : {}) },
    }).then(r => r.data),
} as const

/* ---------------- Stats / Dashboard ---------------- */
// client/src/api/client.ts  (substitui só o bloco do StatsAPI)

type WithSignal = { signal?: AbortSignal }

// ---- Tipos de respostas (alinhar com o que o front usa) ----
type Periodo = 'dia' | 'mes' | 'ano'
type LineDatum = { label: string; count: number }
type FamilyStat = { family: string; count: number }
type TopBook = { name: string; value: number }

type KpisResponse = {
  familias: number
  livrosRequisitados: number
  consultas: number
  atividades: number
}

type KpisPlusResponse = {
  gerais: {
    familias: number
    livrosRequisitados: number
    consultas: number
    eventosFuturos: number
  }
  operacional: {
    pendentes: number
    aprovadasAtivas: number
    atrasadas: number
    eventosHoje: number
    ocupacaoMedia: number // 0..1
  }
  vendas: {
    comprasPagas: number
    receitaTotal: number
    topVendidos: Array<{ titulo: string; total: number }>
  }
  bibliotecario: null | {
    minhasConsultasHoje: number
    minhasConsultasMarcadas: number
    mensagensNaoLidas: number
    notificacoesNaoLidas?: number
  }
}

type InventarioAlertasResponse = {
  zeroStock: number
  lowStock: number
  emprestimoSemPrazo: number
}

type ReqStatusMap = Record<string, number>

type ConsultasResumoResponse = {
  porStatus: Array<{ status: string; total: number }>
  topBibliotecarios: Array<{ id: number; nome: string | null; total: number }>
}

type Page<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export const StatsAPI = {
  kpis: (o?: WithSignal) =>
    api.get<KpisResponse>('/stats/kpis', { signal: o?.signal }).then(r => r.data),

  // Nota: o backend atual ignora familiaId neste endpoint; se quiseres filtrar por família,
  // implementa no server. Mantive o campo aqui caso venhas a usar.
  requisicoesPorPeriodo: (p: { periodo: Periodo; familiaId?: ID; signal?: AbortSignal }) => {
    const params: any = { periodo: p.periodo }
    if (p.familiaId != null) params.familiaId = p.familiaId
    return api.get<LineDatum[]>('/stats/requisicoes', { params, signal: p.signal }).then(r => r.data)
  },

  requisicoesPorFamilia: (p?: ListParams & WithSignal) => {
    const { signal, ...params } = p ?? {}
    return api
      .get<Page<FamilyStat>>('/stats/requisicoes-por-familia', { params, signal })
      .then(r => r.data)
  },

  topLivros: (p?: { limit?: number } & WithSignal) => {
    const { signal, ...params } = p ?? {}
    return api.get<TopBook[]>('/stats/top-livros', { params, signal }).then(r => r.data)
  },

  kpisPlus: (o?: WithSignal) =>
    api.get<KpisPlusResponse>('/stats/kpis-plus', { signal: o?.signal }).then(r => r.data),

  inventarioAlertas: (o?: WithSignal) =>
    api.get<InventarioAlertasResponse>('/stats/inventario/alertas', { signal: o?.signal }).then(r => r.data),

  reqStatus: (o?: WithSignal) =>
    api.get<ReqStatusMap>('/stats/requisicoes/status', { signal: o?.signal }).then(r => r.data),

  consultasResumo: (o?: WithSignal) =>
    api.get<ConsultasResumoResponse>('/stats/consultas/resumo', { signal: o?.signal }).then(r => r.data),

  /* --------- ADMIN --------- */
  adminKpis: (o?: WithSignal) =>
    api.get('/stats/admin/kpis', { signal: o?.signal }).then(r => r.data),

  adminSeguranca: (o?: WithSignal) =>
    api.get('/stats/admin/seguranca', { signal: o?.signal }).then(r => r.data),

  adminAtividadesRecentes: (o?: WithSignal) =>
    api.get('/stats/admin/ultimas-atividades', { signal: o?.signal }).then(r => r.data),

  adminUsuariosRecentes: (o?: WithSignal) =>
    api.get('/stats/admin/usuarios-recentes', { signal: o?.signal }).then(r => r.data),
} as const

/* ---------------- Upload util ---------------- */
export async function downloadBlob(url: string, filename: string, params?: any) {
  const res = await api.get(url, {
    params,
    responseType: 'blob',
  })
  const blob = new Blob([res.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

/* ---------------- FilesAPI ---------------- */
export const FilesAPI = {
  uploadLivroCapa: LivrosAPI.uploadCapa,
  uploadEventoImagem: AtividadesAPI.uploadImagem,
  openUpload: (relOrAbsPath: string) => {
    const url = imageUrl(relOrAbsPath)
    if (url) window.open(url, '_blank')
  },
} as const

/* ---------------- Horário de Utilizadores (ADMIN) ---------------- */
export const UtilizadoresHorarioAPI = {
  async getHorario(userId: ID): Promise<HorarioSlot[]> {
    const { data } = await api.get(`/utilizadores/${userId}/horario`)
    return data as HorarioSlot[]
  },

  // Replace-all (usa o array completo)
  async setHorario(userId: ID, linhas: HorarioSlot[]): Promise<HorarioSlot[]> {
    const { data } = await api.put(`/utilizadores/${userId}/horario`, linhas)
    return data as HorarioSlot[]
  },

  // Atualiza parcialmente um slot existente
  async patchSlot(userId: ID, horarioId: ID, parc: Partial<HorarioSlot>): Promise<HorarioSlot> {
    const { data } = await api.patch(`/utilizadores/${userId}/horario/${horarioId}`, parc)
    return data as HorarioSlot
  },

  // Remove um slot
  async deleteSlot(userId: ID, horarioId: ID): Promise<true> {
    await api.delete(`/utilizadores/${userId}/horario/${horarioId}`)
    return true
  },

  // Conveniência: cria 1 slot novo via PUT (lê todos, acrescenta e substitui)
  async addSlot(userId: ID, novo: Omit<HorarioSlot, 'id' | 'userId'>): Promise<HorarioSlot[]> {
    const atuais = await this.getHorario(userId)
    const next = [...atuais, { ...novo, active: !!novo.active }]
    return this.setHorario(userId, next)
  },
} as const

/* também exportar o hook de auth */
export { useAuth } from '../store/auth'
