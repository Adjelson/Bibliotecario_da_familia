import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { FamiliaAPI, type Familia } from '../../api/client'
import { useAuth, normalizeRole, type User as StoreUser, type Role } from '../../store/auth'
import {
  FaEdit, FaSave, FaTimes,
  FaUser, FaEnvelope, FaIdCard, FaUniversity,
  FaHome, FaListUl, FaChild
} from 'react-icons/fa'

/* =========================================================================
   Tipagem / Normalização
   ========================================================================= */

type UiUser = Omit<StoreUser, 'createdAt' | 'updatedAt'> & {
  biblioteca?: { id: number; nome: string; local?: string | null } | null
  bibliotecaNome?: string | null
  createdAt?: string
  updatedAt?: string
}

function toUiUser(u: any | null | undefined): UiUser | null {
  if (!u) return null

  const roleNorm = normalizeRole(u.role) ?? 'PAI'
  const active: boolean =
    typeof u.isActive === 'boolean'
      ? u.isActive
      : typeof u.active === 'boolean'
      ? u.active
      : true

  return {
    id: Number(u.id),
    name: u.name ?? null,
    email: u.email ?? null,
    role: roleNorm as Role,
    active,
    isActive: active,
    bibliotecaId: u.bibliotecaId ?? null,
    biblioteca: u.biblioteca
      ? {
          id: Number(u.biblioteca.id),
          nome: String(u.biblioteca.nome),
          local: u.biblioteca.local ?? null,
        }
      : null,
    bibliotecaNome:
      u.bibliotecaNome ??
      u.biblioteca?.nome ??
      null,
    familia: u.familia ?? null,
  }
}

/* =========================================================================
   UI Helpers (Section / Field / Input / Buttons / Toast)
   ========================================================================= */

function Section({
  title,
  icon,
  children,
  description,
}: {
  title: string
  icon?: React.ReactNode
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b bg-gradient-to-r from-indigo-50 via-violet-50 to-fuchsia-50">
        <div className="flex items-center gap-2">
          {icon && <div className="text-indigo-600">{icon}</div>}
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            {title}
          </h2>
        </div>
        {description && (
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        )}
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-gray-300 px-3 py-2',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
        'placeholder:text-gray-400',
        props.className || '',
      ].join(' ')}
    />
  )
}

function Button({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'rounded-xl px-4 py-2 font-medium',
        'bg-indigo-600 text-white hover:bg-indigo-700',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className || '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'rounded-xl px-3 py-1.5 font-medium',
        'bg-white border border-gray-200',
        'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500',
        'disabled:opacity-60',
        className || '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs">
      {children}
    </span>
  )
}

/** toast minimalista local */
function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const [type, setType] = useState<'success' | 'error' | 'info'>('info')
  const show = (m: string, t: 'success' | 'error' | 'info' = 'info') => {
    setMsg(m)
    setType(t)
    clearTimeout((show as any)._t)
    ;(show as any)._t = setTimeout(() => setMsg(null), 3000)
  }
  const node = msg ? (
    <div
      className={[
        'fixed bottom-4 right-4 z-50 rounded-xl px-4 py-2 shadow-md text-white',
        type === 'success'
          ? 'bg-emerald-600'
          : type === 'error'
          ? 'bg-red-600'
          : 'bg-gray-800',
      ].join(' ')}
    >
      {msg}
    </div>
  ) : null
  return { show, Toast: () => node }
}

/* =========================================================================
   Página Perfil
   ========================================================================= */

export default function Perfil() {
  const auth = useAuth()
  const { show, Toast } = useToast()

  const [loading, setLoading] = useState(true)

  // user normalizado (auth.user como fallback)
  const [user, setUser] = useState<UiUser | null>(
    toUiUser(auth.user),
  )

  // dados da família (telefone, morada, interesses, filhos[])
  const [familia, setFamilia] = useState<Familia | null>(null)

  // estado de edição
  const [editing, setEditing] = useState(false)

  // campos editáveis
  const [uName, setUName] = useState('')
  const [uEmail, setUEmail] = useState('')

  const [fTelefone, setFTelefone] = useState('')
  const [fMorada, setFMorada] = useState('')
  const [fInteresses, setFInteresses] = useState('') // CSV

  // role
  const roleStr = String(
    user?.role ?? auth.role?.() ?? '',
  ).toUpperCase()
  const isPai = roleStr === 'PAI'

  /* -------------------------------------------------
     fetchAll: carrega /familia/me
     ------------------------------------------------- */
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      // API definida no client.ts:
      // FamiliaAPI.me() -> { user, familia }
      const me = await FamiliaAPI.me()

      const normalizedUser =
        toUiUser(me.user) ?? toUiUser(auth.user)

      setUser(normalizedUser)
      setFamilia(me.familia ?? null)

      // preencher campos locais
      if (normalizedUser) {
        setUName(normalizedUser.name ?? '')
        setUEmail(normalizedUser.email ?? '')
      }
      if (me.familia) {
        setFTelefone(me.familia.telefone ?? '')
        setFMorada(me.familia.morada ?? '')
        setFInteresses(
          Array.isArray(me.familia.interesses)
            ? me.familia.interesses.join(', ')
            : '',
        )
      }
    } catch (e: any) {
      show(
        e?.message || 'Falha ao carregar o perfil',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }, [auth.user, show])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  /* -------------------------------------------------
     Biblioteca (apenas visual)
     ------------------------------------------------- */
  const bibliotecaNome =
    user?.biblioteca?.nome ??
    user?.bibliotecaNome ??
    '—'

  /* -------------------------------------------------
     Interesses -> pills
     ------------------------------------------------- */
  const interessesArr = useMemo(() => {
    if (
      familia?.interesses &&
      Array.isArray(familia.interesses)
    ) {
      return familia.interesses
    }
    return []
  }, [familia])

  /* -------------------------------------------------
     acções de edição
     ------------------------------------------------- */

  function startEdit() {
    if (!isPai) {
      show(
        'Só contas de família podem editar estes dados.',
        'info',
      )
      return
    }
    if (!familia) {
      show(
        'Sem família associada. Pede a um administrador.',
        'info',
      )
      return
    }
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)

    // repor valores originais
    if (user) {
      setUName(user.name ?? '')
      setUEmail(user.email ?? '')
    }
    if (familia) {
      setFTelefone(familia.telefone ?? '')
      setFMorada(familia.morada ?? '')
      setFInteresses(
        Array.isArray(familia.interesses)
          ? familia.interesses.join(', ')
          : '',
      )
    }
  }

  async function saveEdit() {
    if (!familia) {
      show(
        'Sem família associada. Nada para guardar.',
        'info',
      )
      setEditing(false)
      return
    }

    // montar payload só com campos alterados
    const interessesNew = fInteresses
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const payload: any = {}

    // família
    if (fTelefone !== familia.telefone)
      payload.telefone = fTelefone
    if (fMorada !== familia.morada)
      payload.morada = fMorada
    if (
      JSON.stringify(interessesNew) !==
      JSON.stringify(familia.interesses ?? [])
    ) {
      payload.interesses = interessesNew
    }

    // user interno
    const patchUser: any = {}
    if (uName !== (user?.name ?? ''))
      patchUser.name = uName
    if (uEmail !== (user?.email ?? ''))
      patchUser.email = uEmail

    if (Object.keys(patchUser).length > 0) {
      payload.user = patchUser
    }

    if (Object.keys(payload).length === 0) {
      // nada mudou
      setEditing(false)
      return
    }

    try {
      // client.ts:
      // FamiliaAPI.atualizarMinha(...) => PUT /familia
      await FamiliaAPI.atualizarMinha(
        familia.id,
        payload,
      )

      // Atenção: a nossa implementação actual de atualizarMinha
      // devolve só familia (ou {familia}). Então:
      // - vamos refazer fetchAll() para sincronizar tudo.
      setEditing(false)
      show('Perfil atualizado!', 'success')

      // recarrega tudo do servidor para manter user/familia coerentes
      fetchAll()
    } catch (e: any) {
      show(
        e?.message || 'Erro ao gravar alterações',
        'error',
      )
    }
  }

  /* -------------------------------------------------
     Render loading inicial
     ------------------------------------------------- */
  if (loading && !user) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="h-40 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }

  /* -------------------------------------------------
     Avatar iniciais
     ------------------------------------------------- */
  const initials = (uName || user?.name || '—')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  /* -------------------------------------------------
     JSX
     ------------------------------------------------- */
  return (
    <div className="mx-auto p-6 space-y-6">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-3xl border border-gray-100 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 opacity-90" />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-xl font-bold">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight drop-shadow-sm">
                {uName || user?.name || 'Utilizador'}
              </h1>

              <p className="text-white/90 text-sm mt-1 flex items-center gap-2">
                <FaEnvelope /> {uEmail || user?.email || '—'}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <FaIdCard /> {String(user?.role ?? roleStr ?? '—')}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs">
                  <FaUniversity /> {bibliotecaNome}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs">
                  <FaChild /> {(familia?.filhos?.length ?? 0)}{' '}
                  filhos
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!editing ? (
              <GhostButton
                onClick={startEdit}
                disabled={!isPai || !familia}
                aria-label="Editar perfil"
                className="bg-white/95 hover:bg-white"
              >
                <FaEdit /> <span>Editar</span>
              </GhostButton>
            ) : (
              <>
                <GhostButton
                  onClick={cancelEdit}
                  aria-label="Cancelar edição"
                  className="bg-white/95 hover:bg-white"
                >
                  <FaTimes /> <span>Cancelar</span>
                </GhostButton>
                <Button
                  onClick={saveEdit}
                  aria-label="Guardar alterações"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <FaSave /> <span>Guardar</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SECÇÃO: Conta */}
      <Section
        title="Dados da Conta"
        icon={<FaUser />}
        description={
          editing
            ? 'Pode alterar o nome e o email da sua conta.'
            : 'Informações básicas.'
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nome">
            {editing ? (
              <Input
                value={uName}
                onChange={(e) => setUName(e.target.value)}
              />
            ) : (
              <Input
                value={user?.name || ''}
                readOnly
              />
            )}
          </Field>

          <Field label="Email">
            {editing ? (
              <Input
                type="email"
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
              />
            ) : (
              <Input
                value={user?.email || ''}
                readOnly
              />
            )}
          </Field>

          <Field label="Biblioteca">
            <Input
              value={bibliotecaNome}
              readOnly
            />
          </Field>
        </div>
      </Section>

      {/* SECÇÃO: Família */}
      <Section
        title="Perfil de Família"
        icon={<FaListUl />}
        description={
          familia
            ? editing
              ? 'Edite os dados e guarde para aplicar.'
              : 'Dados da família associada à sua conta.'
            : 'Sem registo de família associado.'
        }
      >
        {familia ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Telefone">
                {editing ? (
                  <Input
                    value={fTelefone}
                    onChange={(e) =>
                      setFTelefone(e.target.value)
                    }
                    placeholder="Ex.: 912 345 678"
                  />
                ) : (
                  <Input
                    value={familia.telefone || ''}
                    readOnly
                  />
                )}
              </Field>

              <Field label="Morada">
                {editing ? (
                  <Input
                    value={fMorada}
                    onChange={(e) =>
                      setFMorada(e.target.value)
                    }
                    placeholder="Rua, nº, localidade"
                  />
                ) : (
                  <Input
                    value={familia.morada || ''}
                    readOnly
                  />
                )}
              </Field>

              <Field label="Interesses (CSV)">
                {editing ? (
                  <Input
                    placeholder="aventura, ficção científica…"
                    value={fInteresses}
                    onChange={(e) =>
                      setFInteresses(e.target.value)
                    }
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {interessesArr.length ? (
                      interessesArr.map(
                        (i, idx) => (
                          <Pill
                            key={`${i}-${idx}`}
                          >
                            {i}
                          </Pill>
                        ),
                      )
                    ) : (
                      <span className="text-sm text-gray-500">
                        Sem interesses registados.
                      </span>
                    )}
                  </div>
                )}
              </Field>
            </div>

            {/* Só mostramos info de filhos, leitura-only.
                Gestão de filhos foi removida porque não tens
                endpoints no client.ts para criar/editar/remover. */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FaChild className="text-indigo-600" />{' '}
                Filhos
              </h3>

              <div className="overflow-auto rounded-xl border border-gray-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2">
                        Nome
                      </th>
                      <th className="px-3 py-2">
                        Idade
                      </th>
                      <th className="px-3 py-2">
                        Género
                      </th>
                      <th className="px-3 py-2">
                        Perfil de Leitor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {familia.filhos &&
                    familia.filhos.length ? (
                      familia.filhos.map(
                        (f: any) => (
                          <tr
                            key={f.id}
                            className="border-t"
                          >
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {f.nome}
                            </td>
                            <td className="px-3 py-2">
                              {f.idade}
                            </td>
                            <td className="px-3 py-2">
                              {f.genero}
                            </td>
                            <td className="px-3 py-2">
                              {f.perfilLeitor}
                            </td>
                          </tr>
                        ),
                      )
                    ) : (
                      <tr>
                        <td
                          className="px-3 py-3 text-gray-500"
                          colSpan={4}
                        >
                          Nenhum filho
                          registado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!isPai && (
                <p className="text-xs text-gray-500 mt-2">
                  Apenas contas de família podem
                  alterar estes dados.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <FaHome className="text-gray-400" /> Pede
            a um administrador para associar uma
            família à tua conta.
          </div>
        )}
      </Section>

      {/* Nota de segurança / password
          Removido bloco de alteração de password porque
          no teu client.ts não existe AuthAPI.changePassword
          nem rota correspondente no backend atual.
      */}

      <Toast />
    </div>
  )
}
