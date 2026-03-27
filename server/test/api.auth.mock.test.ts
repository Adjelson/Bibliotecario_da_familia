// server/test/api.auth.mock.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

/** 0) Mocks globais (ENV + PRISMA) — DEVEM vir ANTES de importar a app */
vi.mock('../src/env', () => ({
    ENV: {
        PORT: 4000,
        CORS_ORIGIN: 'http://localhost:5173',
        JWT_ACCESS_SECRET: 'access-secret-de-teste',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_SECRET: 'refresh-secret-de-teste',
        JWT_REFRESH_EXPIRES: '7d',
        BCRYPT_SALT_ROUNDS: 10,
        COOKIE_SECURE: false,
        COOKIE_SAMESITE: 'lax',
    },
}))

// Mock do Prisma com “base de dados” em memória
vi.mock('../src/prisma', () => {
    type Role = 'PAI' | 'BIBLIOTECARIO' | 'ADMIN'

    type User = {
        id: number
        name: string
        email: string
        passwordHash: string
        role: Role
        isActive: boolean
        bibliotecaId?: number | null
    }

    type Familia = {
        id: number
        userId: number
        telefone?: string
        morada?: string
        interesses?: string
    }

    type Livro = {
        id: number
        titulo: string
        autor?: string | null
        categoria?: string | null
        imagem?: string | null
        createdAt: Date
    }

    type Requisicao = {
        id: number
        livroId: number
        familiaId: number
        status: 'PENDENTE' | 'NEGADA' | 'APROVADA' | 'DEVOLVIDA'
        entregaTipo?: 'domicilio' | 'biblioteca' | null
        endereco?: string | null
        createdAt: Date
        entregaData?: Date | null
        entregaEndereco?: string | null
    }

    type Consulta = {
        id: number
        dataHora: Date
        metodo: 'PRESENCIAL' | 'VIDEO'
        bibliotecarioId: number
        familiaId: number
        status: 'MARCADA' | 'CONCLUIDA' | 'CANCELADA'
        notas?: string | null
    }

    type Notificacao = {
        id: number
        userId: number
        type: string
        title: string
        body: string
    }

    type Atividade = {
        id: number
        userId: number
        action: string
        meta?: any
    }

    type Evento = {
        id: number
        titulo: string
        descricao: string
        data: Date         // YYYY-MM-DD (00:00)
        horario: string    // "HH:MM - HH:MM"
        local: string
        vagas: number
        imagem?: string | null
        status?: 'agendada' | 'em_andamento' | 'concluida'
        createdAt: Date
        updatedAt: Date
    }

    type EventoParticipante = {
        id: number
        eventoId: number
        familiaId?: number | null
        utilizadorId?: number | null
        presente?: boolean
        createdAt?: Date
    }

    const store = {
        users: [] as User[],
        familias: [] as Familia[],
        livros: [] as Livro[],
        requisicoes: [] as Requisicao[],
        consultas: [] as Consulta[],
        notificacoes: [] as Notificacao[],
        atividades: [] as Atividade[],
        eventos: [] as Evento[],
        inscritos: [] as EventoParticipante[],
    }

    let seq = 1
    const nextId = () => seq++

    function pick<T extends object>(obj: T, shape: any) {
        if (!shape || typeof shape !== 'object') return obj
        const out: any = {}
        for (const k of Object.keys(shape)) {
            if (shape[k]) out[k] = (obj as any)[k]
        }
        return out
    }

    const prisma = {
        // ---------------- USER ----------------
        user: {
            create: vi.fn(async ({ data }: { data: Partial<User> }) => {
                const rec: User = {
                    id: nextId(),
                    name: data.name!,
                    email: data.email!,
                    passwordHash: data.passwordHash!,
                    role: data.role as any,
                    isActive: data.isActive ?? true,
                    bibliotecaId: data.bibliotecaId ?? 1,
                }
                store.users.push(rec)
                return rec
            }),
            findUnique: vi.fn(async ({ where }: any) => {
                if ('email' in where) return store.users.find(u => u.email === where.email) ?? null
                if ('id' in where) return store.users.find(u => u.id === where.id) ?? null
                return null
            }),
            findMany: vi.fn(async (args: any = {}) => {
                let arr = [...store.users]
                const where = args.where ?? {}

                // formas suportadas: { role: 'BIBLIOTECARIO' } ou { role: { equals: '...' } } ou { role: { in: [...] } }
                if (typeof where.role === 'string') arr = arr.filter(u => u.role === where.role)
                if (where.role?.equals) arr = arr.filter(u => u.role === where.role.equals)
                if (Array.isArray(where.role?.in)) arr = arr.filter(u => where.role.in.includes(u.role))
                if (typeof where.isActive === 'boolean') arr = arr.filter(u => u.isActive === where.isActive)
                if (where.bibliotecaId?.equals !== undefined) {
                    arr = arr.filter(u => u.bibliotecaId === where.bibliotecaId.equals)
                }

                if (args.select) return arr.map(u => pick(u, args.select))
                return arr
            }),
        },

        // --------------- FAMILIA --------------
        familia: {
            create: vi.fn(async ({ data }: any) => {
                const rec: Familia = {
                    id: nextId(),
                    userId: data.userId,
                    telefone: data.telefone,
                    morada: data.morada,
                    interesses: data.interesses,
                }
                store.familias.push(rec)
                return rec
            }),
            findUnique: vi.fn(async ({ where, select }: any) => {
                let fam: Familia | undefined
                if ('id' in where) fam = store.familias.find(f => f.id === where.id)
                else if ('userId' in where) fam = store.familias.find(f => f.userId === where.userId)
                if (!fam) return null
                if (select) return pick(fam, select)
                return fam
            }),
        },

        // ---------------- LIVRO ----------------
        livro: {
            create: vi.fn(async ({ data }: any) => {
                const rec: Livro = {
                    id: nextId(),
                    titulo: data.titulo,
                    autor: data.autor ?? null,
                    categoria: data.categoria ?? null,
                    imagem: null,
                    createdAt: new Date(),
                }
                store.livros.push(rec)
                return rec
            }),
            count: vi.fn(async ({ where }: any = {}) => {
                if (!where?.OR?.length) return store.livros.length
                const term = (where.OR[0]?.titulo?.contains ?? '').toLowerCase()
                return store.livros.filter(l => (l.titulo ?? '').toLowerCase().includes(term)).length
            }),
            findMany: vi.fn(async ({ where, skip = 0, take = 50 }: any = {}) => {
                let arr = [...store.livros]
                if (where?.OR?.length) {
                    const term = (where.OR[0]?.titulo?.contains ?? '').toLowerCase()
                    arr = arr.filter(l => (l.titulo ?? '').toLowerCase().includes(term))
                }
                arr.sort((a, b) => +b.createdAt - +a.createdAt || a.titulo.localeCompare(b.titulo))
                return arr.slice(skip, skip + take)
            }),
            update: vi.fn(async ({ where: { id }, data }: any) => {
                const i = store.livros.findIndex(l => l.id === id)
                if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
                store.livros[i] = { ...store.livros[i], ...data }
                return store.livros[i]
            }),
            findUnique: vi.fn(async ({ where: { id }, select }: any) => {
                const l = store.livros.find(li => li.id === id) ?? null
                if (!l) return null
                return select ? pick(l, select) : l
            }),
        },

        // -------------- REQUISICAO ------------
        requisicao: {
            create: vi.fn(async ({ data, include }: any) => {
                const rec: Requisicao = {
                    id: nextId(),
                    livroId: data.livroId,
                    familiaId: data.familiaId,
                    status: data.status ?? 'PENDENTE',
                    entregaTipo: data.entregaTipo ?? null,
                    entregaEndereco: data.entregaEndereco ?? null,
                    createdAt: new Date(),
                }
                store.requisicoes.push(rec)

                if (!include) return rec as any
                const out: any = { ...rec }

                if (include.livro) {
                    const liv = store.livros.find(l => l.id === rec.livroId) ?? null
                    out.livro = include.livro.select ? pick(liv ?? {}, include.livro.select) : liv
                }
                if (include.familia) {
                    const fam = store.familias.find(f => f.id === rec.familiaId) ?? null
                    if (fam) {
                        let user: any = null
                        const incUser = include.familia.include?.user
                        if (incUser) {
                            const u = store.users.find(us => us.id === fam.userId) ?? null
                            user = incUser === true ? u : (incUser.select ? pick(u ?? {}, incUser.select) : u)
                        }
                        out.familia = { ...fam, user }
                    } else {
                        out.familia = null
                    }
                }
                return out
            }),

            findUnique: vi.fn(async ({ where: { id }, include }: any) => {
                const r = store.requisicoes.find(x => x.id === id) ?? null
                if (!r || !include) return r as any
                const out: any = { ...r }
                if (include.livro) {
                    const liv = store.livros.find(l => l.id === r.livroId) ?? null
                    out.livro = include.livro.select ? pick(liv ?? {}, include.livro.select) : liv
                }
                if (include.familia) {
                    const fam = store.familias.find(f => f.id === r.familiaId) ?? null
                    if (fam) {
                        let user: any = null
                        const incUser = include.familia.include?.user
                        if (incUser) {
                            const u = store.users.find(us => us.id === fam.userId) ?? null
                            user = incUser === true ? u : (incUser.select ? pick(u ?? {}, incUser.select) : u)
                        }
                        out.familia = { ...fam, user }
                    } else out.familia = null
                }
                return out
            }),

            update: vi.fn(async ({ where: { id }, data, include }: any) => {
                const i = store.requisicoes.findIndex(r => r.id === id)
                if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
                store.requisicoes[i] = { ...store.requisicoes[i], ...data }
                const rec = store.requisicoes[i]
                if (!include) return rec as any
                const out: any = { ...rec }
                if (include.livro) {
                    const liv = store.livros.find(l => l.id === rec.livroId) ?? null
                    out.livro = include.livro.select ? pick(liv ?? {}, include.livro.select) : liv
                }
                if (include.familia) {
                    const fam = store.familias.find(f => f.id === rec.familiaId) ?? null
                    if (fam) {
                        const incUser = include.familia.include?.user
                        const u = store.users.find(us => us.id === fam.userId) ?? null
                        out.familia = { ...fam, user: incUser ? (incUser.select ? pick(u ?? {}, incUser.select) : u) : undefined }
                    } else out.familia = null
                }
                return out
            }),
        },

        // ---------------- CONSULTA -------------
        consulta: {
            findFirst: vi.fn(async ({ where }: any) => {
                return store.consultas.find(c =>
                    (where?.bibliotecarioId ? c.bibliotecarioId === where.bibliotecarioId : true) &&
                    (where?.status ? c.status === where.status : true) &&
                    (where?.dataHora?.gte ? c.dataHora >= new Date(where.dataHora.gte) : true) &&
                    (where?.dataHora?.lte ? c.dataHora <= new Date(where.dataHora.lte) : true)
                ) ?? null
            }),

            create: vi.fn(async ({ data, include }: any) => {
                const rec: Consulta = {
                    id: nextId(),
                    dataHora: new Date(data.dataHora),
                    metodo: data.metodo,
                    bibliotecarioId: data.bibliotecarioId,
                    familiaId: data.familiaId,
                    status: data.status ?? 'MARCADA',
                    notas: data.notas ?? null,
                }
                store.consultas.push(rec)

                if (!include) return rec as any

                const fam = store.familias.find(f => f.id === rec.familiaId) ?? null
                const famUser = fam ? store.users.find(u => u.id === fam.userId) ?? null : null
                const bibliotecario = store.users.find(u => u.id === rec.bibliotecarioId) ?? null

                return {
                    ...rec,
                    familia: include.familia ? {
                        ...(include.familia.include?.filhos ? { filhos: [] } : {}),
                        ...(include.familia.include?.user ? (include.familia.include.user === true ? famUser : pick(famUser ?? {}, include.familia.include.user.select)) : {}),
                        ...(fam ? { id: fam.id, userId: fam.userId } : {}),
                    } : undefined,
                    bibliotecario: include.bibliotecario
                        ? (include.bibliotecario.select ? pick(bibliotecario ?? {}, include.bibliotecario.select) : bibliotecario)
                        : undefined,
                } as any
            }),

            count: vi.fn(async ({ where }: any = {}) => {
                return prisma.consulta.findMany({ where }).then((arr: any[]) => arr.length)
            }),

            findMany: vi.fn(async ({ where, orderBy, skip = 0, take = 20, include }: any = {}) => {
                let arr = [...store.consultas]
                if (where?.familiaId) arr = arr.filter(c => c.familiaId === where.familiaId)
                if (where?.bibliotecarioId) arr = arr.filter(c => c.bibliotecarioId === where.bibliotecarioId)
                if (where?.status) arr = arr.filter(c => c.status === where.status)
                if (where?.dataHora?.gte) arr = arr.filter(c => c.dataHora >= new Date(where.dataHora.gte))
                if (where?.dataHora?.lte) arr = arr.filter(c => c.dataHora <= new Date(where.dataHora.lte))
                if (Array.isArray(where?.OR)) {
                    const term = (where.OR[0]?.notas?.contains ?? '').toLowerCase()
                    arr = arr.filter(c => (c.notas ?? '').toLowerCase().includes(term))
                }
                if (orderBy?.dataHora === 'desc') arr.sort((a, b) => +b.dataHora - +a.dataHora)
                if (orderBy?.dataHora === 'asc') arr.sort((a, b) => +a.dataHora - +b.dataHora)
                arr = arr.slice(skip, skip + take)

                if (!include) return arr as any
                return arr.map(rec => {
                    const fam = store.familias.find(f => f.id === rec.familiaId) ?? null
                    const famUser = fam ? store.users.find(u => u.id === fam.userId) ?? null : null
                    const bibliotecario = store.users.find(u => u.id === rec.bibliotecarioId) ?? null
                    return {
                        ...rec,
                        familia: include.familia ? {
                            ...(include.familia.include?.filhos ? { filhos: [] } : {}),
                            ...(include.familia.include?.user ? (include.familia.include.user === true ? famUser : pick(famUser ?? {}, include.familia.include.user.select)) : {}),
                            ...(fam ? { id: fam.id, userId: fam.userId } : {}),
                        } : undefined,
                        bibliotecario: include.bibliotecario
                            ? (include.bibliotecario.select ? pick(bibliotecario ?? {}, include.bibliotecario.select) : bibliotecario)
                            : undefined,
                    } as any
                })
            }),

            findUnique: vi.fn(async ({ where: { id }, include }: any) => {
                const rec = store.consultas.find(c => c.id === id) ?? null
                if (!rec || !include) return rec as any
                const fam = store.familias.find(f => f.id === rec.familiaId) ?? null
                const famUser = fam ? store.users.find(u => u.id === fam.userId) ?? null : null
                const bibliotecario = store.users.find(u => u.id === rec.bibliotecarioId) ?? null
                return {
                    ...rec,
                    familia: include.familia ? {
                        ...(include.familia.include?.filhos ? { filhos: [] } : {}),
                        ...(include.familia.include?.user ? (include.familia.include.user === true ? famUser : pick(famUser ?? {}, include.familia.include.user.select)) : {}),
                        ...(fam ? { id: fam.id, userId: fam.userId } : {}),
                    } : undefined,
                    bibliotecario: include.bibliotecario
                        ? (include.bibliotecario.select ? pick(bibliotecario ?? {}, include.bibliotecario.select) : bibliotecario)
                        : undefined,
                } as any
            }),

            update: vi.fn(async ({ where: { id }, data }: any) => {
                const i = store.consultas.findIndex(c => c.id === id)
                if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
                store.consultas[i] = { ...store.consultas[i], ...data }
                return store.consultas[i]
            }),

            delete: vi.fn(async ({ where: { id } }: any) => {
                const i = store.consultas.findIndex(c => c.id === id)
                if (i >= 0) store.consultas.splice(i, 1)
                return {}
            }),
        },

        // ------- NOTIFICACAO + ATIVIDADE -------
        notificacao: {
            create: vi.fn(async ({ data }: any) => {
                const rec: Notificacao = { id: nextId(), ...data }
                store.notificacoes.push(rec)
                return rec
            }),
            createMany: vi.fn(async ({ data }: { data: any[] }) => {
                const created = (data ?? []).map(d => ({ id: nextId(), ...d }))
                store.notificacoes.push(...created)
                return { count: created.length }
            }),
        },
        atividade: {
            create: vi.fn(async ({ data }: any) => {
                const rec: Atividade = { id: nextId(), ...data }
                store.atividades.push(rec)
                return rec
            }),
        },

        // ----------------- EVENTO --------------
        evento: {
            create: vi.fn(async ({ data }: any) => {
                const now = new Date()
                const rec: Evento = {
                    id: nextId(),
                    titulo: data.titulo,
                    descricao: data.descricao,
                    data: new Date(data.data),
                    horario: data.horario,
                    local: data.local,
                    vagas: data.vagas,
                    imagem: data.imagem ?? null,
                    status: data.status ?? 'agendada',
                    createdAt: now,
                    updatedAt: now,
                }
                store.eventos.push(rec)
                return rec
            }),
            count: vi.fn(async ({ where }: any = {}) => {
                let arr = [...store.eventos]
                if (where?.status) arr = arr.filter(e => e.status === where.status)
                if (where?.data?.gte) arr = arr.filter(e => +e.data >= +new Date(where.data.gte))
                if (where?.data?.lte) arr = arr.filter(e => +e.data <= +new Date(where.data.lte))
                if (where?.data?.gt) arr = arr.filter(e => +e.data > +new Date(where.data.gt))
                if (where?.data?.lt) arr = arr.filter(e => +e.data < +new Date(where.data.lt))
                if (Array.isArray(where?.OR)) {
                    const term = (where.OR[0]?.titulo?.contains ?? where.OR[1]?.descricao?.contains ?? where.OR[2]?.local?.contains ?? '').toLowerCase()
                    arr = arr.filter(e => [e.titulo, e.descricao, e.local].some(v => (v ?? '').toLowerCase().includes(term)))
                }
                return arr.length
            }),
            findMany: vi.fn(async ({ where, skip = 0, take = 20, include }: any = {}) => {
                let arr = [...store.eventos]
                if (where?.status) arr = arr.filter(e => e.status === where.status)
                if (where?.data?.gte) arr = arr.filter(e => +e.data >= +new Date(where.data.gte))
                if (where?.data?.lte) arr = arr.filter(e => +e.data <= +new Date(where.data.lte))
                if (where?.data?.gt) arr = arr.filter(e => +e.data > +new Date(where.data.gt))
                if (where?.data?.lt) arr = arr.filter(e => +e.data < +new Date(where.data.lt))
                if (Array.isArray(where?.OR)) {
                    const term = (where.OR[0]?.titulo?.contains ?? where.OR[1]?.descricao?.contains ?? where.OR[2]?.local?.contains ?? '').toLowerCase()
                    arr = arr.filter(e => [e.titulo, e.descricao, e.local].some(v => (v ?? '').toLowerCase().includes(term)))
                }
                arr.sort((a, b) => (+a.data - +b.data) || a.titulo.localeCompare(b.titulo))
                arr = arr.slice(skip, skip + take)
                if (include?._count?.select?.participantes) {
                    return arr.map(e => ({
                        ...e,
                        _count: { participantes: store.inscritos.filter(i => i.eventoId === e.id).length },
                    }))
                }
                return arr
            }),
            findUnique: vi.fn(async ({ where: { id }, include }: any) => {
                const e = store.eventos.find(ev => ev.id === id) ?? null
                if (!e) return null
                const base: any = { ...e }
                if (include?._count?.select?.participantes) {
                    base._count = { participantes: store.inscritos.filter(i => i.eventoId === id).length }
                }
                if (include?.participantes) {
                    base.participantes = store.inscritos.filter(i => i.eventoId === id).map(i => ({ ...i, evento: e }))
                }
                return base
            }),
            update: vi.fn(async ({ where: { id }, data, include }: any) => {
                const i = store.eventos.findIndex(ev => ev.id === id)
                if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
                store.eventos[i] = { ...store.eventos[i], ...data, updatedAt: new Date() }
                const e: any = { ...store.eventos[i] }
                if (include?._count?.select?.participantes) {
                    e._count = { participantes: store.inscritos.filter(p => p.eventoId === id).length }
                }
                return e
            }),
            delete: vi.fn(async ({ where: { id } }: any) => {
                const i = store.eventos.findIndex(ev => ev.id === id)
                if (i >= 0) store.eventos.splice(i, 1)
                return {}
            }),
        },

        // --------- EVENTO PARTICIPANTE ---------
        eventoParticipante: {
            create: vi.fn(async ({ data }: any) => {
                const rec: EventoParticipante = {
                    id: nextId(),
                    eventoId: data.eventoId,
                    familiaId: data.familiaId ?? null,
                    utilizadorId: data.utilizadorId ?? null,
                    presente: !!data.presente,
                    createdAt: new Date(),
                }
                store.inscritos.push(rec)
                return rec
            }),
            findFirst: vi.fn(async ({ where, select }: any) => {
                const match = store.inscritos.find(i =>
                    i.eventoId === where.eventoId &&
                    (
                        (where.familiaId !== undefined && i.familiaId === where.familiaId) ||
                        (where.utilizadorId !== undefined && i.utilizadorId === where.utilizadorId) ||
                        (Array.isArray(where.OR) && where.OR.some((c: any) =>
                            (c.familiaId && i.familiaId === c.familiaId) ||
                            (c.utilizadorId && i.utilizadorId === c.utilizadorId)
                        ))
                    )
                )
                if (!match) return null
                return select ? pick(match, select) : match
            }),
            findUnique: vi.fn(async ({ where: { id } }: any) => store.inscritos.find(i => i.id === id) ?? null),
            count: vi.fn(async ({ where }: any = {}) => {
                return store.inscritos.filter(i =>
                    (!where?.eventoId || i.eventoId === where.eventoId) &&
                    (where?.presente === undefined || i.presente === where.presente)
                ).length
            }),
            findMany: vi.fn(async ({ where, orderBy, include, select }: any = {}) => {
                let arr = [...store.inscritos]
                if (where?.eventoId) arr = arr.filter(i => i.eventoId === where.eventoId)
                if (Array.isArray(where?.OR)) {
                    arr = arr.filter(i =>
                        where.OR.some((cond: any) =>
                            (cond.utilizadorId && i.utilizadorId === cond.utilizadorId) ||
                            (cond.familia && cond.familia.userId && (() => {
                                const fam = store.familias.find(f => f.id === i.familiaId)
                                const u = fam ? store.users.find(us => us.id === fam.userId) : null
                                return !!(u && u.id === cond.familia.userId)
                            })())
                        )
                    )
                }
                if (orderBy?.id === 'asc') arr.sort((a, b) => a.id - b.id)
                if (select) return arr.map(p => pick(p, select))
                if (include) {
                    return arr.map(p => ({
                        ...p,
                        familia: include.familia ? (p.familiaId ? {
                            id: p.familiaId,
                            user: include.familia.select?.user ? (() => {
                                const fam = store.familias.find(f => f.id === p.familiaId)
                                const u = fam ? store.users.find(us => us.id === fam.userId) : null
                                return u ? pick(u, include.familia.select.user) : null
                            })() : undefined
                        } : null) : undefined,
                        utilizador: include.utilizador ? (p.utilizadorId ? (() => {
                            const u = store.users.find(us => us.id === p.utilizadorId)
                            return u ? pick(u, include.utilizador.select ?? { id: true, name: true, email: true }) : null
                        })() : null) : undefined,
                        evento: include.evento ? store.eventos.find(e => e.id === p.eventoId) : undefined,
                    }))
                }
                return arr
            }),
            update: vi.fn(async ({ where: { id }, data }: any) => {
                const i = store.inscritos.findIndex(x => x.id === id)
                if (i < 0) throw Object.assign(new Error('not found'), { code: 'P2025' })
                store.inscritos[i] = { ...store.inscritos[i], ...data }
                return store.inscritos[i]
            }),
            delete: vi.fn(async ({ where: { id } }: any) => {
                const i = store.inscritos.findIndex(x => x.id === id)
                if (i >= 0) store.inscritos.splice(i, 1)
                return {}
            }),
            groupBy: vi.fn(async ({ where }: any) => {
                const idsIn: number[] | undefined = where?.eventoId?.in
                const onlyPresent = !!where?.presente
                const filtered = store.inscritos.filter(i =>
                    (!idsIn || idsIn.includes(i.eventoId)) &&
                    (!onlyPresent || i.presente)
                )
                const map = new Map<number, number>()
                filtered.forEach(i => map.set(i.eventoId, (map.get(i.eventoId) ?? 0) + 1))
                return Array.from(map.entries()).map(([eventoId, n]) => ({ eventoId, _count: { _all: n } }))
            }),
        },
    }

    return { prisma, __store: store }
})

/** 1) Agora podemos importar a app já com os mocks aplicados */
import { app } from '../src/app'

/** Helpers */
async function seedUser(email: string, password: string, role: 'PAI' | 'BIBLIOTECARIO' | 'ADMIN', bibliotecaId?: number | null) {
    const { prisma } = await import('../src/prisma')
    const passwordHash = await bcrypt.hash(password, 10)
    return prisma.user.create({ data: { name: role, email, passwordHash, role, isActive: true, bibliotecaId: bibliotecaId ?? 1 } })
}
async function seedFamiliaForUser(userId: number) {
    const mod: any = await import('../src/prisma')
    return mod.prisma.familia.create({
        data: { userId, telefone: '910000000', morada: 'Rua Exemplo, 1', interesses: 'leitura' },
    })
}
async function seedLivro(titulo = 'Algoritmos Modernos') {
    const mod: any = await import('../src/prisma')
    return mod.prisma.livro.create({ data: { titulo, autor: 'Autor Desconhecido', categoria: 'Geral' } })
}
async function login(email: string, password: string) {
    const res = await request(app).post('/auth/login').send({ email, password })
    expect(res.status).toBe(200)
    const token = res.body.accessToken as string
    const raw = res.headers['set-cookie'] as unknown
    const cookies: string[] = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : [])
    return { token, cookies }
}

/** ============================== TESTES =============================== */
describe('Fluxos principais (mock, sem BD)', () => {
    let pai: any, bib: any, admin: any, familiaDoPai: any, livroA: any

    beforeAll(async () => {
        pai = await seedUser('pai@ex.com', '123456', 'PAI', 1)
        bib = await seedUser('bib@ex.com', '123456', 'BIBLIOTECARIO', 1)
        admin = await seedUser('adm@ex.com', '123456', 'ADMIN', 1)
        familiaDoPai = await seedFamiliaForUser(pai.id)
        livroA = await seedLivro('Introdução à Programação')
    })

    // ------------------ REQUISIÇÕES ------------------
    it('PAI cria requisição; pode editar dentro da janela; bloqueia fora da janela; bibliotecário pode rejeitar', async () => {
        const { token: tokenPai } = await login('pai@ex.com', '123456')
        // 1) criar (PAI não envia familiaId; servidor deduz pela sessão)
        const r1 = await request(app).post('/requisicoes').set('Authorization', `Bearer ${tokenPai}`)
            .send({ livroId: livroA.id, entregaTipo: 'biblioteca' })
        expect([201, 200]).toContain(r1.status)
        const reqId = (r1.body.id ?? r1.body?.data?.id ?? r1.body?.requisicao?.id) || r1.body?.id
        expect(reqId).toBeTruthy()
        // 2) editar dentro da janela
        const r2 = await request(app).put(`/requisicoes/${reqId}`).set('Authorization', `Bearer ${tokenPai}`)
            .send({ entregaTipo: 'domicilio', endereco: 'Rua das Flores, 10' })
        expect([200, 204]).toContain(r2.status)

        // 3) simular >30 min e tentar editar — deve falhar
        const { __store } = (await import('../src/prisma')) as any
        const rec = __store.requisicoes.find((x: any) => x.id === reqId)!
        rec.createdAt = new Date(Date.now() - 31 * 60 * 1000)

        const r3 = await request(app).put(`/requisicoes/${reqId}`).set('Authorization', `Bearer ${tokenPai}`)
            .send({ entregaTipo: 'biblioteca' })
        expect([400, 403, 409]).toContain(r3.status)
        // opcional: garantir que a mensagem é a esperada
        if (r3.status === 400) {
            expect(String(r3.body?.message ?? '').toLowerCase()).toMatch(/janela|expirad|tempo|fora do prazo/)
        }
        // 4) bibliotecário REJEITA uma pendente
        const rNew = await request(app).post('/requisicoes').set('Authorization', `Bearer ${tokenPai}`)
            .send({ livroId: livroA.id, entregaTipo: 'biblioteca' })
        expect([201, 200]).toContain(rNew.status)
        const reqId2 = rNew.body.id

        const { token: tokenBib } = await login('bib@ex.com', '123456')
        const r4 = await request(app).post(`/requisicoes/${reqId2}/rejeitar`).set('Authorization', `Bearer ${tokenBib}`)
            .send({})
        expect([200, 204]).toContain(r4.status)
    })

    // ------------------ CONSULTAS ------------------
    it('PAI marca consulta; cria notificação ao bibliotecário e regista atividade', async () => {
        const { token: tokenPai } = await login('pai@ex.com', '123456')

        // ≥ 4 dias para cumprir a antecedência (rota impõe 3 dias)
        const when = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
        const c1 = await request(app)
            .post('/consultas')
            .set('Authorization', `Bearer ${tokenPai}`)
            .send({ dataHora: when, metodo: 'PRESENCIAL', bibliotecarioId: bib.id })
        expect([201, 200]).toContain(c1.status)

        const { __store } = (await import('../src/prisma')) as any
        const notifToBib = __store.notificacoes.find((n: any) =>
            n.userId === bib.id && String(n.type).includes('CONSULTA')
        )
        expect(notifToBib).toBeTruthy()
        const atividadeDoPai = __store.atividades.find((a: any) =>
            a.userId === pai.id && String(a.action).includes('CONSULTA')
        )
        expect(atividadeDoPai).toBeTruthy()
    })

    // ------------------ ATIVIDADES/EVENTOS ------------------
    it('Utilizador inscreve-se num evento; listagem reflete “inscrito”', async () => {
        const { token: tokenBib } = await login('bib@ex.com', '123456')
        const dataStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // YYYY-MM-DD

        const createEvt = await request(app)
            .post('/eventos')
            .set('Authorization', `Bearer ${tokenBib}`)
            .send({
                titulo: 'Clube de Leitura',
                descricao: 'Discussão mensal',
                data: dataStr,
                horario: '18:00 - 19:30',
                local: 'Sala A',
                vagas: 50,
            })
        expect(createEvt.status).toBe(201)
        const evId = createEvt.body.id

        const { token: tokenPai } = await login('pai@ex.com', '123456')
        const resp = await request(app)
            .post(`/eventos/${evId}/inscricoes`)
            .set('Authorization', `Bearer ${tokenPai}`)
            .send({})
        expect([200, 201, 204]).toContain(resp.status)

        const { __store } = (await import('../src/prisma')) as any
        const inscricao = __store.inscritos.find((i: any) => i.eventoId === evId && (i.familiaId || i.utilizadorId === pai.id))
        expect(inscricao).toBeTruthy()
    })
})
