/**
 * Captura de tela da nova UI da v2 (visual de catalogo de streaming).
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/screenshot-ui.mjs
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

// 1) Home
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}-1-home.png` })
console.log(`1) home: ${OUT}-1-home.png`)
console.log('   ', (await page.locator('.top-title').innerText()))

// 2) Scroll para as linhas horizontais
await page.evaluate(() => window.scrollTo(0, 620))
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}-2-rows.png` })
console.log(`2) linhas: ${OUT}-2-rows.png`)

// 3) Categoria
await page.evaluate(() => window.scrollTo(0, 0))
await page.getByRole('button', { name: 'Esportes', exact: true }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}-3-categoria.png` })
console.log(`3) categoria: ${OUT}-3-categoria.png`)
console.log('   ', (await page.locator('.section-title').innerText()))

// 4) Busca
await page.getByRole('button', { name: 'Inicio' }).click()
await page.waitForTimeout(400)
await page.locator('.search-input').fill('glob')
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}-4-busca.png` })
console.log(`4) busca: ${OUT}-4-busca.png`)
console.log('   ', (await page.locator('.section-title').innerText()))

await page.close()
await browser.close()
