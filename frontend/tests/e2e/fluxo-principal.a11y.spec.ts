// tests/e2e/fluxo-consulta.spec.ts
import { test, expect } from '@playwright/test'

const USER_EMAIL = 'edmar@gmail.com'
const USER_PASS  = 'adjelson'

// YYYY-MM-DD a N dias de hoje
function yyyymmddPlus(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
})

test('Login → Minhas Consultas → Criar pedido', async ({ page }) => {
  // 1) Ir diretamente para /login
  await page.goto('/login')

  // 2) Preencher credenciais
  const email = page.getByRole('textbox', { name: /email/i })
  await expect(email).toBeVisible()
  await email.fill(USER_EMAIL)

  // usa o aria-label "Palavra-passe" do input, não o botão
  await page.getByLabel(/^palavra-passe$/i).fill(USER_PASS)

  await page.getByRole('button', { name: /entrar|iniciar sessão/i }).click()

  // 3) Aterrar na área da família
  await expect(page).toHaveURL(/\/familia(?:\/|$)/i, { timeout: 15_000 })

  // 4) Ir para Minhas Consultas
  await page.getByRole('link', { name: /minhas consultas/i }).first().click()
  await expect(page).toHaveURL(/\/familia\/consultas/i)

  // 5) Preencher formulário de marcação
  const selectB = page.locator('select#bibliotecarioId')
  await expect(selectB).toBeVisible()
  // Aguarda as opções carregarem (pelo menos 1 bibliotecário além do "Seleciona…")
  await page.waitForFunction(() => {
    const sel = document.querySelector('select#bibliotecarioId') as HTMLSelectElement | null
    return !!sel && sel.options.length > 1 && sel.options[1].value !== ''
  })
  await selectB.selectOption({ index: 1 })

// Método (continua igual)
await page
  .getByRole('group', { name: /método da consulta/i })
  .getByText(/^presencial$/i)
  .click()
await expect(page.getByRole('radio', { name: /^presencial$/i })).toBeChecked()

// 👉 Data e Hora por ID (robusto p/ inputs nativos)
await expect(page.locator('#data')).toBeVisible()
await page.locator('#data').fill(yyyymmddPlus(4))

await expect(page.locator('#hora')).toBeVisible()
await page.locator('#hora').fill('19:30')

// Notas (igual)
const notas = page.getByLabel(/^notas/i)
if (await notas.count()) {
  await notas.fill('E2E: pedido de consulta automatizado.')
}

// Enviar (igual)
await page.getByRole('button', { name: /enviar solicitação/i }).click()

// Sucesso (igual)
const toast = page.getByText(/consulta marcada com sucesso/i)
await Promise.race([
  toast.waitFor({ state: 'visible', timeout: 10000 }),
  (async () => {
    await expect(page.getByRole('heading', { name: /histórico de consultas/i }))
      .toBeVisible({ timeout: 10000 })
  })(),
])


})