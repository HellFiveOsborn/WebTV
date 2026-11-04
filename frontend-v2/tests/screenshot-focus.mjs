/**
 * Captura o novo visual do foco do D-pad (elevacao + vizinhos
 * esmaecidos, sem anel de contorno).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/screenshot-focus.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

const browser = await chromium.connectOverCDP(
  process.env.CDP_URL || 'http://127.0.0.1:9333',
)
const page = await browser.contexts()[0].newPage()
await page.setViewportSize({ width: 1600, height: 900 })

await page.goto('http://localhost:3001/WebTV/v2/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

// 1) Foco na linha de canais.
await press('ArrowDown', 2)
await press('ArrowRight', 3)
await page.waitForTimeout(900)
await page.screenshot({ path: 'C:/Users/canal/AppData/Local/Temp/opencode/opencode/focus-row.png' })
console.log('focus-row.png (linha de canais)')

// Mede o estado visual.
const medido = await page.evaluate(() => {
  const focado = document.querySelector('.dpad-focused')
  const vizinhos = [...document.querySelectorAll('.row-item')]
    .filter(el => !el.contains(focado))
    .slice(0, 3)
    .map(el => {
      const s = getComputedStyle(el.querySelector('.card'))
      return { opacity: s.opacity, filter: s.filter }
    })
  const s = focado ? getComputedStyle(focado) : null
  return {
    focoTransform: s?.transform,
    focoBoxShadow: s?.boxShadow,
    focoOutline: s?.outline,
    vizinhos,
  }
})
console.log(JSON.stringify(medido, null, 1))

// 2) Foco no Top 10.
await page.evaluate(() => window.scrollTo(0, 0))
await press('ArrowUp', 4)
await page.waitForTimeout(900)
await page.screenshot({ path: 'C:/Users/canal/AppData/Local/Temp/opencode/opencode/focus-top.png' })
console.log('focus-top.png (Top 10)')

// 3) Foco no grid.
await page.getByRole('button', { name: 'Filmes e S\u00e9ries', exact: true }).click()
await page.waitForTimeout(1000)
await press('ArrowDown', 3)
await press('ArrowRight', 2)
await page.waitForTimeout(900)
await page.screenshot({ path: 'C:/Users/canal/AppData/Local/Temp/opencode/opencode/focus-grid.png' })
console.log('focus-grid.png (grid)')

// 4) Foco no modal (toggle com halo).
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await page.waitForTimeout(700)
await press('ArrowDown')
await page.waitForTimeout(700)
await page.screenshot({ path: 'C:/Users/canal/AppData/Local/Temp/opencode/opencode/focus-modal.png' })
console.log('focus-modal.png (modal)')

const halo = await page.evaluate(() => {
  const t = document.querySelector('.settings-toggle.dpad-focused')
  if (!t) return null
  const s = getComputedStyle(t, '::after')
  return { boxShadow: s.boxShadow }
})
console.log('halo do toggle:', JSON.stringify(halo))

await page.close()
await browser.close()
