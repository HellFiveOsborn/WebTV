/**
 * Verifica o modal de configuracoes: abre pelo icone de engrenagem,
 * fecha por Esc / botao X / clique no fundo, e concentra o foco.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-settings-modal.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333'
const APP_URL = process.env.APP_URL || 'http://localhost:3001/WebTV/v2/'
const OUT = process.env.OUT || resolve(REPO_ROOT, 'scratch/v2-ui')

const browser = await chromium.connectOverCDP(CDP_URL)
const context = browser.contexts()[0]
const page = await context.newPage()
await page.setViewportSize({ width: 1600, height: 900 })

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

// 1) Abre o modal pelo icone de engrenagem.
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
console.log('1) modal aberto')
console.log(
  '   role=dialog:',
  await page.locator('[role="dialog"]').getAttribute('role'),
  '| aria-modal:',
  await page.locator('[role="dialog"]').getAttribute('aria-modal'),
)
console.log('   titulo:', await page.locator('.modal-title').innerText())
console.log(
  '   fundo escurecido:',
  await page.evaluate(() => {
    const el = document.querySelector('.modal-backdrop')
    return el ? getComputedStyle(el).position : 'ausente'
  }),
)
await page.screenshot({ path: `${OUT}-5-modal.png` })
console.log(`   screenshot: ${OUT}-5-modal.png`)

// 2) O foco esta dentro do modal?
const focusedInside = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  return !!(dialog && document.activeElement && dialog.contains(document.activeElement))
})
console.log(`2) foco dentro do modal: ${focusedInside}`)

// 3) Esc fecha.
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log(`3) Esc fecha: ${(await page.locator('[role="dialog"]').count()) === 0}`)

// 4) Botao X fecha.
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await page.getByRole('button', { name: 'Fechar' }).click()
await page.waitForTimeout(500)
console.log(`4) botao X fecha: ${(await page.locator('[role="dialog"]').count()) === 0}`)

// 5) Clique no fundo fecha.
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await page.locator('.modal-backdrop').click({ position: { x: 30, y: 30 } })
await page.waitForTimeout(500)
console.log(`5) clique no fundo fecha: ${(await page.locator('[role="dialog"]').count()) === 0}`)

// 6) As opcoes de cache estao no modal (e nao no rodape).
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
const modalText = await page.locator('[role="dialog"]').innerText()
console.log('6) opcoes no modal:', modalText.replace(/\n/g, ' | '))
console.log(
  '   rodape removido:',
  (await page.locator('.footer').count()) === 0,
  '| mencoes de debug no body:',
  (await page.evaluate(() =>
    document.body.innerText.includes('embedcanais.online. Clique no card')
  )) === false,
)

await page.close()
await browser.close()
