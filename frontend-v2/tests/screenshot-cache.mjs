/**
 * Captura de tela da v2 com cache, para conferencia visual.
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/screenshot-cache.mjs
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

// 1) Limpa o cache para forcar a 1a carga (com API).
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.grid', { timeout: 30000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}-1-api.png`, fullPage: false })
console.log(`1) 1a carga (API): ${OUT}-1-api.png`)
console.log('   ', (await page.locator('.status').first().innerText()).replace(/\n/g, ' '))

// 2) 2a carga: deve usar o cache (sem requisicao).
const page2 = await context.newPage()
await page2.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page2.waitForSelector('.grid', { timeout: 30000 })
await page2.waitForTimeout(2000)
await page2.screenshot({ path: `${OUT}-2-cache.png`, fullPage: false })
console.log(`2) 2a carga (cache): ${OUT}-2-cache.png`)
console.log('   ', (await page2.locator('.status').first().innerText()).replace(/\n/g, ' '))
console.log('   ', (await page2.locator('.status').nth(1).innerText()).replace(/\n/g, ' '))

await page2.close()
await page.close()
await browser.close()
