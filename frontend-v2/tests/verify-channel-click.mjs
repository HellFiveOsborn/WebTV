/**
 * Verifica o clique no card: deve apontar para o "redirect" do canal
 * (o player no site de origem) e nao para um link quebrado.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-channel-click.mjs
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

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(2000)

// 1) Todos os cards tem href absoluto?
const cards = await page.evaluate(() =>
  [...document.querySelectorAll('.card')].map(a => ({
    href: a.getAttribute('href'),
    target: a.getAttribute('target'),
    name: a.querySelector('.card-name')?.textContent,
  })),
)

const broken = cards.filter(c => !c.href || !/^https?:\/\//.test(c.href))
console.log(`1) cards renderizados: ${cards.length}`)
console.log(`   hrefs invalidos: ${broken.length}`)
if (broken.length) console.log('   ', JSON.stringify(broken.slice(0, 3)))
console.log(`   target="_blank" em todos: ${cards.every(c => c.target === '_blank')}`)
console.log(`   exemplo: ${cards[0]?.name} -> ${cards[0]?.href}`)

// 2) O href bate com o href do catalogo?
const expected = await page.evaluate(async () => {
  const res = await fetch('/WebTV/v2/data/embedcanais.json')
  const j = await res.json()
  return j.channels.map(c => c.href)
})
const hrefSet = new Set(expected)
const mismatch = cards.filter(c => !hrefSet.has(c.href))
console.log(`2) hrefs fora do catalogo: ${mismatch.length}`)

// 3) O clique realmente navega (abre aba nova com o redirect)?
const before = context.pages().length
await page.locator('.top-thumb').click()
await page.waitForTimeout(2500)
const after = context.pages()
console.log(`3) abas antes=${before} depois=${after.length}`)
if (after.length > before) {
  const opened = after[after.length - 1]
  console.log(`   url aberta: ${opened.url()}`)
  await opened.close()
}

// 4) Nomes duplicados: o React key usa id (nao slug)?
const dupIds = await page.evaluate(() => {
  const names = [...document.querySelectorAll('.card-name')].map(n => n.textContent)
  const counts = {}
  for (const n of names) counts[n] = (counts[n] || 0) + 1
  return Object.entries(counts).filter(([, v]) => v > 1).map(([k, v]) => `${k}:${v}`)
})
console.log(`4) nomes repetidos na home (Top10 + linhas): ${dupIds.join(', ') || 'nenhum'}`)

await page.close()
await browser.close()
