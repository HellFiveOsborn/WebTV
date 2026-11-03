/**
 * Cache EXPIRADO + API fora: o app deve manter o dado velho em tela
 * (stale-while-revalidate) e avisar que a revalidacao falhou.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-cache-stale.mjs
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

const statuses = async () =>
  (await page.locator('.status').allInnerTexts()).map(t => t.replace(/\n/g, ' ')).join(' | ')

// 1) Carrega com API no ar (popula o cache).
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.grid', { timeout: 30000 })
await page.waitForTimeout(2000)
console.log('1) 1a carga:', await statuses())

// 2) Envelhece o cache (1 h > TTL de 30 min) e derruba a API.
await page.evaluate(() => {
  const key = 'webtv:v2:catalog'
  const entry = JSON.parse(localStorage.getItem(key))
  entry.savedAt = Date.now() - 60 * 60 * 1000
  localStorage.setItem(key, JSON.stringify(entry))
})
await page.route('**/api/channels', route => route.abort())
await page.route('**/api/embedcanais/**', route => route.abort())
await page.route('**://api.allorigins.win/**', route => route.abort())
await page.route('**://api.codetabs.com/**', route => route.abort())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

console.log('2) cache expirado + rede toda fora:', await statuses())
const cards = await page.locator('.grid .card').count()
console.log(`   cards renderizados: ${cards} (deve ser 156 - dado velho mantido)`)
await page.screenshot({ path: `${OUT}-4-stale.png` })
console.log(`   screenshot: ${OUT}-4-stale.png`)

await page.unroute('**/api/channels')
await page.unroute('**/api/embedcanais/**')
await page.unroute('**://api.allorigins.win/**')
await page.unroute('**://api.codetabs.com/**')
await page.close()
await browser.close()
