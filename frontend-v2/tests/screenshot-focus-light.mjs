/**
 * Captura o foco do D-pad no TEMA CLARO (para conferir que o
 * esmaecimento e a elevacao continuam legiveis).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/screenshot-focus-light.mjs
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

// Liga o tema claro pelo storage unificado (IndexedDB).
await page.evaluate(
  () =>
    new Promise(resolve => {
      const req = indexedDB.open('webtv-v2')
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('theme')) {
          db.close()
          resolve()
          return
        }
        const tx = db.transaction('theme', 'readwrite')
        tx.objectStore('theme').put({ theme: 'light' }, '')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
      }
      req.onerror = () => resolve()
    }),
)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

console.log('tema:', await page.evaluate(() => document.documentElement.dataset.theme))

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

// Grid no tema claro.
await page.getByRole('button', { name: 'Filmes e S\u00e9ries', exact: true }).click()
await page.waitForTimeout(1000)
await press('ArrowDown', 3)
await press('ArrowRight', 2)
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/focus-light-grid.png` })
console.log('focus-light-grid.png')

const medido = await page.evaluate(() => {
  const card = document.querySelector('.dpad-focused')
  const outros = [...document.querySelectorAll('.grid .card')]
    .filter(c => c !== card)
    .slice(0, 3)
    .map(c => {
      const s = getComputedStyle(c)
      return { opacity: s.opacity, filter: s.filter }
    })
  const s = card ? getComputedStyle(card) : null
  return {
    focoTransform: s?.transform,
    focoSombra: s?.boxShadow,
    vizinhos: outros,
  }
})
console.log(JSON.stringify(medido, null, 1))

// Volta para o tema escuro (nao deixar o storage alterado).
await page.evaluate(
  () =>
    new Promise(resolve => {
      const req = indexedDB.open('webtv-v2')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('theme', 'readwrite')
        tx.objectStore('theme').put({ theme: 'dark' }, '')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
      }
      req.onerror = () => resolve()
    }),
)
console.log('tema restaurado para dark')

await page.close()
await browser.close()
