/**
 * Verifica a busca em tela cheia: abre pelo icone, mostra teclado e
 * microfone, filtra os canais e fecha corretamente.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-search.mjs
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
await page.waitForTimeout(1200)

// 1) A barra superior tem apenas o icone de busca (sem campo inline).
const inlineField = await page.locator('.search-input').count()
console.log(`1) campo inline na header: ${inlineField} (esperado: 0)`)
console.log(`   icone de busca: ${await page.locator('[aria-label="Pesquisar"]').count()}`)

// 2) Clique no icone abre a tela cheia.
await page.locator('[aria-label="Pesquisar"]').click()
await page.waitForSelector('.search-overlay', { timeout: 10000 })
await page.waitForTimeout(600)
console.log('2) overlay de busca aberto')

const focused = await page.evaluate(() => document.activeElement?.className)
console.log(`   foco no campo: ${focused}`)

// 3) Teclado e microfone presentes.
console.log(`   botao de microfone: ${await page.locator('[aria-label="Pesquisar por voz"]').count()}`)
console.log(`   botao de fechar: ${await page.locator('[aria-label="Fechar busca"]').count()}`)

await page.screenshot({ path: `${OUT}-10-busca.png` })
console.log(`   screenshot: ${OUT}-10-busca.png`)

// 4) Digitar filtra os canais.
await page.locator('.search-overlay-input').fill('glob')
await page.waitForTimeout(900)
const results = await page.locator('.section-title').innerText()
const cards = await page.locator('.grid .card').count()
console.log(`4) busca "glob": ${results} | ${cards} cards`)

// 5) O microfone reage (no Edge, a Web Speech API existe).
const micSupported = await page.evaluate(() => {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
})
console.log(`5) Web Speech API disponivel: ${micSupported}`)

// O botao do campo e o do teclado virtual: usa o do campo (mais especifico).
await page.locator('[aria-label="Pesquisar por voz (campo)"]').click()
await page.waitForTimeout(1500)
const micState = await page.evaluate(() => {
  const btn = document.querySelector('.mic-button')
  return {
    listening: btn?.classList.contains('listening'),
    erro: document.querySelector('.search-overlay-error')?.textContent ?? null,
  }
})
console.log(`   estado do microfone: ${JSON.stringify(micState)}`)
await page.screenshot({ path: `${OUT}-11-busca-mic.png` })
console.log(`   screenshot: ${OUT}-11-busca-mic.png`)

// 6) Enter fecha a busca.
await page.locator('.search-overlay-input').press('Enter')
await page.waitForTimeout(500)
console.log(`6) Enter fecha: ${(await page.locator('.search-overlay').count()) === 0}`)

// 7) O X tambem fecha.
await page.locator('[aria-label="Pesquisar"]').click()
await page.waitForSelector('.search-overlay', { timeout: 10000 })
await page.locator('[aria-label="Fechar busca"]').click()
await page.waitForTimeout(400)
console.log(`7) X fecha: ${(await page.locator('.search-overlay').count()) === 0}`)

// 8) O filtro continua aplicado depois de fechar.
console.log(`8) filtro mantido: ${await page.locator('.section-title').innerText()}`)

await page.close()
await browser.close()
