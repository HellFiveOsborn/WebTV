/**
 * Verifica o posicionamento do carrossel: gutter lateral, arrows dentro
 * da area visivel e scroll sem estourar as bordas.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-carousel.mjs
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
await page.waitForSelector('.row-track', { timeout: 30000 })
await page.waitForTimeout(1500)

// 1) Medidas: o track, o titulo e o arrow devem respeitar o gutter.
const geo = await page.evaluate(() => {
  const title = document.querySelector('.row-title')
  const body = document.querySelector('.row-body')
  const track = document.querySelector('.row-track')
  const first = document.querySelector('.row-item')
  const arrowRight = document.querySelector('.row-arrow.right')
  const arrowLeft = document.querySelector('.row-arrow.left')
  const vw = window.innerWidth
  const r = el => (el ? el.getBoundingClientRect() : null)

  return {
    vw,
    titleLeft: r(title)?.left,
    bodyLeft: r(body)?.left,
    trackLeft: r(track)?.left,
    firstCardLeft: r(first)?.left,
    arrowRightLeft: r(arrowRight)?.left,
    arrowRightRight: r(arrowRight)?.right,
    arrowLeftLeft: r(arrowLeft)?.left,
    arrowLeftRight: r(arrowLeft)?.right,
  }
})

console.log('1) geometria (viewport 1600):')
console.log(`   titulo      left = ${geo.titleLeft?.toFixed(1)}`)
console.log(`   row-body    left = ${geo.bodyLeft?.toFixed(1)}`)
console.log(`   track       left = ${geo.trackLeft?.toFixed(1)}`)
console.log(`   1o card     left = ${geo.firstCardLeft?.toFixed(1)}`)
console.log(`   arrow left  [${geo.arrowLeftLeft?.toFixed(1)} .. ${geo.arrowLeftRight?.toFixed(1)}]`)
console.log(`   arrow right [${geo.arrowRightLeft?.toFixed(1)} .. ${geo.arrowRightRight?.toFixed(1)}]`)

const gutter = 1600 * 0.04
console.log(`   gutter esperado = ${gutter.toFixed(1)}`)
console.log(
  `   cards comecam no gutter: ${Math.abs(geo.firstCardLeft - gutter) < 2 ? 'SIM' : 'NAO (off ' + (geo.firstCardLeft - gutter).toFixed(1) + ')'}`,
)
console.log(
  `   arrow right dentro da viewport: ${geo.arrowRightRight <= 1600.5 ? 'SIM' : 'NAO (estoura ' + (geo.arrowRightRight - 1600).toFixed(1) + 'px)'}`,
)
console.log(
  `   arrow left existe (linha no inicio): ${geo.arrowLeftLeft === undefined ? 'NAO (correto: nada a revelar)' : 'SIM'}`,
)

// 2) Apos rolar, o arrow left aparece e tambem fica dentro da viewport.
await page.evaluate(() => {
  const track = document.querySelector('.row-track')
  track.scrollLeft = 400
})
await page.waitForTimeout(600)
const afterScroll = await page.evaluate(() => {
  const a = document.querySelector('.row-arrow.left')
  if (!a) return null
  const r = a.getBoundingClientRect()
  return { left: r.left, right: r.right }
})
console.log(
  `2) apos scroll, arrow left [${afterScroll?.left?.toFixed(1)} .. ${afterScroll?.right?.toFixed(1)}] - dentro da viewport: ${
    afterScroll && afterScroll.left >= -0.5 ? 'SIM' : 'NAO'
  }`,
)

const scrollOk = await page.evaluate(() => {
  const track = document.querySelector('.row-track')
  const first = document.querySelector('.row-item')
  track.scrollLeft = 400
  const r = first.getBoundingClientRect()
  return { scrollLeft: track.scrollLeft, firstLeft: r.left }
})
console.log(
  `   apos scroll 400px, 1o card left = ${scrollOk.firstLeft.toFixed(1)} (negativo = o card sai pela borda durante o scroll)`,
)

// 3) Hover mostra os arrows.
await page.evaluate(() => window.scrollTo(0, 700))
await page.waitForTimeout(600)
const body = page.locator('.row-body').first()
await body.hover()
await page.waitForTimeout(500)
const opacity = await page.evaluate(() => {
  const a = document.querySelector('.row-arrow.right')
  return a ? getComputedStyle(a).opacity : 'sem arrow'
})
console.log(`3) opacity do arrow no hover: ${opacity}`)
await page.screenshot({ path: `${OUT}-9-carrossel.png` })
console.log(`   screenshot: ${OUT}-9-carrossel.png`)

// 4) Sem overflow horizontal na pagina inteira.
const overflow = await page.evaluate(() => ({
  docScroll: document.documentElement.scrollWidth,
  viewport: window.innerWidth,
}))
console.log(
  `4) overflow horizontal da pagina: ${overflow.docScroll > overflow.viewport + 1 ? 'SIM (' + overflow.docScroll + ' > ' + overflow.viewport + ')' : 'NAO'}`,
)

await page.close()
await browser.close()
