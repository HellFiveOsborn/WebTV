/**
 * Verifica o "OK" (Enter) do D-pad: o item em foco e ativado.
 *
 *   1. Enter num card do grid abre o canal (novo contexto de URL);
 *   2. Enter num botao da barra executa a acao (vai para a categoria);
 *   3. Enter na tecla ativa do teclado virtual digita o caractere.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-dpad-ok.mjs
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

const browser = await chromium.connectOverCDP(CDP_URL)
const context = browser.contexts()[0]
const page = await context.newPage()
await page.setViewportSize({ width: 1600, height: 900 })

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

const focusName = () =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focused')
    if (!el) return null
    return el.querySelector('.card-name')?.textContent ?? el.textContent?.trim().slice(0, 30)
  })

// 1) Enter num botao da barra executa a acao.
await press('ArrowRight')
await press('ArrowRight')
const nav = await focusName()
console.log(`1) foco na barra: "${nav}"`)

await page.keyboard.press('Enter')
await page.waitForTimeout(800)
const titulo = await page.locator('.section-title').innerText().catch(() => null)
console.log(`2) Enter na barra -> titulo da pagina: "${titulo}"`)
console.log(`   navegou para a categoria: ${titulo && titulo !== 'Top 10' ? 'SIM' : 'NAO'}`)

// 2) Volta para a Home e entra no grid.
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
console.log(`3) voltou para a Home: ${(await page.locator('.top-body').count()) === 1}`)

// 3) Enter num card abre o canal (href do catalogo).
await page.getByRole('button', { name: 'Not\u00edcias', exact: true }).click()
await page.waitForTimeout(900)

// Navega o foco ate um card e aperta Enter.
await press('ArrowDown', 3)
const focado = await focusName()
console.log(`5) card em foco: "${focado}"`)

const hrefFocado = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  return el?.getAttribute('href') ?? null
})
console.log(`   href do card em foco: ${hrefFocado}`)

// Intercepta a abertura para nao navegar de verdade.
await page.evaluate(() => {
  window.__opened = null
  document.addEventListener(
    'click',
    e => {
      const a = e.target.closest?.('a[href]')
      if (a) {
        window.__opened = a.getAttribute('href')
        e.preventDefault()
      }
    },
    true,
  )
})

await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const opened = await page.evaluate(() => window.__opened)
console.log(`6) Enter abriu: ${opened}`)
console.log(
  `   bate com o href do card focado: ${opened === hrefFocado ? 'SIM' : `NAO (esperado ${hrefFocado})`}`,
)
console.log(
  `   o href e do catalogo (embedcanaisdetv.xyz): ${opened?.includes('embedcanaisdetv.xyz/e/index.php?canal=') ? 'SIM' : 'NAO'}`,
)

await page.close()
await browser.close()
