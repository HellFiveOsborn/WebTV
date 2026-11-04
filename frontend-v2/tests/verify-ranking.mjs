/**
 * Verifica o ranking adaptativo do Top 10: abrir um canal muda o
 * ranking (o historico de uso e salvo e o Top 10 se reordena).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-ranking.mjs
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
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

// 1) Top 10 inicial (visitante novo).
const top10 = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.top-list .card-name, .top-title')].map(el => el.textContent),
  )

const initial = await top10()
console.log('1) Top 10 inicial (visitante novo):')
console.log(`   ${initial.join(' | ')}`)
console.log(`   subtitulo: ${await page.locator('.row-subtitle').first().innerText()}`)

// 2) Abre um canal de outra categoria (Gloob, Infantil) 3x.
const gloob = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')]
  const target = cards.find(c => c.querySelector('.card-name')?.textContent === 'Gloob')
  if (!target) return null
  target.setAttribute('data-test', 'gloob')
  return target.getAttribute('href')
})
console.log(`2) canal Gloob encontrado: ${gloob}`)

for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-test="gloob"]')
    if (el) el.click()
  })
  await page.waitForTimeout(600)
  // Fecha a aba que o clique abriu (o card abre em nova aba).
  const extra = context.pages()
  if (extra.length > 1) {
    const opened = extra[extra.length - 1]
    if (opened !== page) await opened.close().catch(() => {})
  }
}

// 3) O historico foi salvo.
const usage = await page.evaluate(() => localStorage.getItem('webtv:v2:usage'))
console.log(`3) historico salvo: ${usage ? usage.slice(0, 120) : 'NENHUM'}`)

// 4) Recarrega: o ranking deve refletir o uso.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

const after = await top10()
console.log('4) Top 10 depois do uso:')
console.log(`   ${after.join(' | ')}`)
console.log(`   subtitulo: ${await page.locator('.row-subtitle').first().innerText()}`)

console.log(
  `5) Gloob subiu para o topo: ${after[0] === 'Gloob' ? 'SIM' : 'NAO (1o = ' + after[0] + ')'}`,
)

// 6) Os motivos do #1 aparecem na UI.
const reasons = await page.locator('.top-reason').allInnerTexts()
console.log(`6) sinais exibidos no #1: ${reasons.join(' / ') || '(nenhum)'}`)

await page.screenshot({ path: `${OUT}-13-ranking.png` })
console.log(`   screenshot: ${OUT}-13-ranking.png`)

await page.close()
await browser.close()
