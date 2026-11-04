/**
 * Verifica a navegacao por D-pad no GRID (categoria/busca) e na BUSCA:
 *
 *   1. no grid, as setas andam em linha e em coluna;
 *   2. no grid, quando a linha acaba, "direita" avanca linearmente;
 *   3. na busca, as setas ficam com o teclado virtual;
 *   4. na busca, Esc fecha;
 *   5. na busca, o teclado virtual digita com Enter.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-dpad-grid.mjs
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

/** Estado do foco. */
const focusState = () =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focused')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      name: el.querySelector('.card-name')?.textContent ?? el.textContent?.trim().slice(0, 30),
      x: Math.round(r.left),
      y: Math.round(r.top),
      inGrid: !!el.closest('.grid'),
    }
  })

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(200)
  }
}

// --- GRID -------------------------------------------------------------
// "Filmes e Series" tem 31 canais: o grid tem varias linhas, o que
// permite verificar a navegacao vertical.
await page.getByRole('button', { name: 'Filmes e S\u00e9ries', exact: true }).click()
await page.waitForTimeout(1000)

const cards = await page.locator('.grid .card').count()
const rows = await page.evaluate(() => {
  const tops = new Set(
    [...document.querySelectorAll('.grid .card')].map(
      c => Math.round(c.getBoundingClientRect().top),
    ),
  )
  return tops.size
})
console.log(`1) grid aberto: ${cards} cards em ${rows} linhas`)

// Entra no grid: o foco comeca na barra, entao desce ate o grid.
await press('ArrowDown', 3)
const g1 = await focusState()
console.log(`2) foco no grid: ${JSON.stringify(g1)}`)
console.log(`   dentro do grid: ${g1?.inGrid ? 'SIM' : 'NAO'}`)

// Direita: avanca na mesma linha.
await press('ArrowRight')
const g2 = await focusState()
console.log(`3) apos direita: ${JSON.stringify(g2)}`)
console.log(`   mesma linha (y igual): ${g1?.y === g2?.y ? 'SIM' : 'NAO'}`)

// Baixo: desce uma linha (mantem a coluna).
await press('ArrowDown')
const g3 = await focusState()
console.log(`4) apos baixo: ${JSON.stringify(g3)}`)
console.log(`   desceu (y maior): ${g3?.y > g2?.y ? 'SIM' : 'NAO'}`)
console.log(`   preservou a coluna (x proximo): ${Math.abs((g3?.x ?? 0) - (g2?.x ?? 0)) < 60 ? 'SIM' : 'NAO'}`)

// Cima: volta.
await press('ArrowUp')
const g4 = await focusState()
console.log(`5) apos cima: ${JSON.stringify(g4)}`)
console.log(`   voltou (y menor): ${g4?.y < g3?.y ? 'SIM' : 'NAO'}`)

// Direita ate o fim da linha: o grid deve avancar linearmente.
await press('ArrowRight', 8)
const g5 = await focusState()
console.log(`6) 8x direita: ${JSON.stringify(g5)}`)

await page.screenshot({ path: `${OUT}-16-dpad-grid.png` })
console.log(`   screenshot: ${OUT}-16-dpad-grid.png`)

// --- BUSCA ------------------------------------------------------------
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Pesquisar' }).click()
await page.waitForSelector('.search-overlay', { timeout: 10000 })
await page.waitForTimeout(800)

const b1 = await focusState()
console.log(`7) foco na busca: ${JSON.stringify(b1)}`)

// As setas devem ficar com o teclado virtual (nao mover o foco da pagina).
await page.locator('.vkb').click({ position: { x: 5, y: 5 } })
await press('ArrowRight', 2)
const vkbActive = await page.evaluate(() => {
  const el = document.querySelector('.vkb-key.active')
  return el ? el.getAttribute('aria-label') || el.textContent : null
})
console.log(`8) tecla ativa do teclado virtual: ${vkbActive}`)
console.log(`   o foco da pagina nao mudou: ${b1?.name === (await focusState())?.name ? 'SIM' : 'NAO'}`)

// Enter digita.
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
console.log(`9) Enter digitou: "${await page.locator('.search-overlay-input').inputValue()}"`)

// Esc fecha a busca.
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log(`10) Esc fecha a busca: ${(await page.locator('.search-overlay').count()) === 0}`)

await page.close()
await browser.close()
