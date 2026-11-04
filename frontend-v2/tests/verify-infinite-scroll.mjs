/**
 * Verifica a rolagem infinita dos carrosseis:
 *   - a linha carrega mais canais ao deslizar para a direita
 *   - o DOM mantem poucos cards (janela virtual)
 *   - ao voltar, os canais descarregados voltam
 *   - a barra de rolagem nao muda de tamanho
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-infinite-scroll.mjs
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
await page.waitForSelector('.row-track', { timeout: 30000 })
await page.waitForTimeout(1500)

// A linha de Esportes (70 canais) e a 2a do catalogo.
const rowIndex = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.row')]
  const i = rows.findIndex(r => r.querySelector('.row-title')?.textContent?.includes('Esportes'))
  return i
})
console.log(`1) linha de Esportes = indice ${rowIndex}`)

const state = () =>
  page.evaluate(idx => {
    const row = document.querySelectorAll('.row')[idx]
    const track = row.querySelector('.row-track')
    const items = row.querySelectorAll('.row-item')
    const names = [...items].map(el => el.querySelector('.card-name')?.textContent)
    return {
      total: row.querySelector('.row-subtitle')?.textContent,
      cardsNoDom: items.length,
      scrollWidth: track.scrollWidth,
      clientWidth: track.clientWidth,
      scrollLeft: Math.round(track.scrollLeft),
      primeiro: names[0],
      ultimo: names[names.length - 1],
      spacerEsq: row.querySelector('.row-spacer')?.style.width ?? null,
    }
  }, rowIndex)

const inicial = await state()
console.log('2) estado inicial:')
console.log(`   ${inicial.total} | cards no DOM: ${inicial.cardsNoDom} | scrollWidth: ${inicial.scrollWidth}`)
console.log(`   primeiro: ${inicial.primeiro} | ultimo: ${inicial.ultimo}`)

// 3) Rola varias vezes para a direita.
for (let i = 0; i < 12; i++) {
  await page.evaluate(idx => {
    const row = document.querySelectorAll('.row')[idx]
    row.querySelector('.row-track').scrollLeft += 900
  }, rowIndex)
  await page.waitForTimeout(280)
}
await page.waitForTimeout(900)

const depois = await state()
console.log('3) apos rolar para a direita:')
console.log(`   cards no DOM: ${depois.cardsNoDom} | scrollWidth: ${depois.scrollWidth} | scrollLeft: ${depois.scrollLeft}`)
console.log(`   primeiro: ${depois.primeiro} | ultimo: ${depois.ultimo}`)
console.log(
  `   janela deslizou: ${depois.primeiro !== inicial.primeiro ? 'SIM' : 'NAO'}`,
)
console.log(
  `   scrollWidth estavel: ${Math.abs(depois.scrollWidth - inicial.scrollWidth) < inicial.clientWidth * 0.2 ? 'SIM' : 'NAO (' + inicial.scrollWidth + ' -> ' + depois.scrollWidth + ')'}`,
)
console.log(
  `   DOM limitado (nao 70 cards): ${depois.cardsNoDom <= 24 ? 'SIM (' + depois.cardsNoDom + ')' : 'NAO (' + depois.cardsNoDom + ')'}`,
)

// 4) Volta para o inicio: os canais descarregados voltam a ser montados.
await page.evaluate(idx => {
  const row = document.querySelectorAll('.row')[idx]
  row.querySelector('.row-track').scrollLeft = 0
}, rowIndex)
await page.waitForTimeout(1200)

const volta = await state()
console.log('4) apos voltar ao inicio:')
console.log(`   cards no DOM: ${volta.cardsNoDom} | primeiro: ${volta.primeiro} | scrollLeft: ${volta.scrollLeft}`)
console.log(
  `   voltou ao primeiro canal: ${volta.primeiro === inicial.primeiro ? 'SIM' : 'NAO (' + volta.primeiro + ')'}`,
)

await page.screenshot({ path: `${OUT}-14-infinito.png` })
console.log(`   screenshot: ${OUT}-14-infinito.png`)

// 5) O botao Inicio limpa a busca.
await page.locator('[aria-label="Pesquisar"]').click()
await page.waitForSelector('.search-overlay-input', { timeout: 10000 })
await page.locator('.search-overlay-input').fill('glob')
await page.waitForTimeout(900)
console.log(`5) com busca preenchida: ${await page.locator('.section-title').innerText()}`)

await page.getByRole('button', { name: 'Inicio', exact: true }).click()
await page.waitForTimeout(900)
const voltou = await page.locator('.row-title').first().innerText()
const buscaLimpa = await page.locator('.search-overlay-input').count()
console.log(`   apos clicar Inicio: titulo = "${voltou}" | overlay de busca aberto: ${buscaLimpa}`)
console.log(`   home voltou: ${voltou.includes('Top 10') ? 'SIM' : 'NAO'}`)

await page.close()
await browser.close()
