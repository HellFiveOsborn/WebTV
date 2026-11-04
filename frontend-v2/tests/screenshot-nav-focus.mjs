/**
 * Captura o foco da NAVBAR (foco num item de texto) e do MODAL.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/screenshot-nav-focus.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

const OUT = 'C:/Users/canal/AppData/Local/Temp/opencode/opencode'
const browser = await chromium.connectOverCDP(
  process.env.CDP_URL || 'http://127.0.0.1:9333',
)
const page = await browser.contexts()[0].newPage()
await page.setViewportSize({ width: 1600, height: 900 })

await page.goto('http://localhost:3001/WebTV/v2/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

// 1) Navbar: foca "Esportes".
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
}
await page.waitForTimeout(600)
await page.screenshot({
  path: `${OUT}/focus-nav.png`,
  clip: { x: 0, y: 0, width: 1600, height: 70 },
})
console.log('focus-nav.png (navbar)')

const nav = await page.evaluate(() => {
  const focado = document.querySelector('.dpad-focused')
  const outros = [...document.querySelectorAll('.nav-link')].filter(
    b => b !== focado,
  )
  return {
    foco: focado?.textContent?.trim(),
    focoPeso: focado ? getComputedStyle(focado).fontWeight : null,
    focoCor: focado ? getComputedStyle(focado).color : null,
    vizinhosOpacity: outros.map(b => getComputedStyle(b).opacity),
  }
})
console.log(JSON.stringify(nav, null, 1))

// 2) Modal: foco no toggle (halo no botao deslizante).
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await page.waitForTimeout(700)
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/focus-modal2.png` })
console.log('focus-modal2.png (modal)')

const modal = await page.evaluate(() => {
  const t = document.querySelector('.settings-toggle.dpad-focused')
  const s = t ? getComputedStyle(t, '::after') : null
  return {
    toggleFoco: !!t,
    transformDoToggle: t ? getComputedStyle(t).transform : null,
    halo: s?.boxShadow ?? null,
  }
})
console.log(JSON.stringify(modal, null, 1))

await page.close()
await browser.close()
