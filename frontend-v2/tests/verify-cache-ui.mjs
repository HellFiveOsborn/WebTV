/**
 * Verificacao manual do cache na UI: botao "Limpar cache" e fallback quando
 * a API esta fora do ar (rota /api/channels bloqueada).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-cache-ui.mjs
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
const OUT = process.env.OUT || resolve(REPO_ROOT, 'scratch/v2-cache')

const browser = await chromium.connectOverCDP(CDP_URL)
const context = browser.contexts()[0]
const page = await context.newPage()

const status = async () => (await page.locator('.status').first().innerText()).replace(/\n/g, ' ')
const statuses = async () =>
  (await page.locator('.status').allInnerTexts()).map(t => t.replace(/\n/g, ' ')).join(' | ')

// --- 1) Cache limpo + 1a carga via API ---
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.grid', { timeout: 30000 })
await page.waitForTimeout(2000)
console.log('1) 1a carga:', await status())

// --- 2) API fora do ar, mas cache presente: deve mostrar os canais do cache ---
await page.route('**/api/channels', route => route.abort())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
console.log('2) API fora + cache presente:', await statuses())
const cards = await page.locator('.grid .card').count()
console.log(`   cards renderizados: ${cards}`)
await page.screenshot({ path: `${OUT}-3-api-fora.png` })
console.log(`   screenshot: ${OUT}-3-api-fora.png`)
await page.unroute('**/api/channels')

// --- 3) Botao "Limpar cache": apaga e recarrega ---
const hadCache = await page.evaluate(() => !!localStorage.getItem('webtv:v2:catalog'))
await page.getByRole('button', { name: 'Limpar cache' }).click()
await page.waitForTimeout(3500)
const nowCache = await page.evaluate(() => !!localStorage.getItem('webtv:v2:catalog'))
console.log(`3) Limpar cache: tinha=${hadCache} -> tem=${nowCache} (repopulado pela nova consulta)`)
console.log('   ', await status())

await page.close()
await browser.close()
