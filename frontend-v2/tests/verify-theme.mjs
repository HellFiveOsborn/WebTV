/**
 * Verifica o tema claro/escuro: alternancia pelo toggle, persiste no
 * storage unificado (IndexedDB) e nao deixa "flash" ao recarregar.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-theme.mjs
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

const theme = () => page.evaluate(() => document.documentElement.dataset.theme)

/** Apaga TODO o storage local (IndexedDB + localStorage). */
const clearStorage = () =>
  page.evaluate(
    () =>
      new Promise(resolve => {
        localStorage.clear()
        const req = indexedDB.deleteDatabase('webtv-v2')
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      }),
  )

/** Le o tema guardado no IndexedDB. */
const storedTheme = () =>
  page.evaluate(
    () =>
      new Promise(resolve => {
        const req = indexedDB.open('webtv-v2')
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('theme')) {
            resolve(null)
            db.close()
            return
          }
          const tx = db.transaction('theme', 'readonly')
          const get = tx.objectStore('theme').get('')
          get.onsuccess = () => {
            resolve(get.result?.theme ?? null)
            db.close()
          }
          get.onerror = () => {
            resolve(null)
            db.close()
          }
        }
        req.onerror = () => resolve(null)
      }),
  )

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await clearStorage()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1200)

// 1) Padrao = dark
console.log(`1) tema padrao: ${await theme()} (esperado: dark)`)

// 2) Abre o modal e alterna o tema
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}-6-modal-dark.png` })
console.log(`   screenshot (modal dark): ${OUT}-6-modal-dark.png`)

await page.getByRole('switch', { name: 'Tema escuro' }).click()
await page.waitForTimeout(600)
console.log(`2) apos toggle: ${await theme()} (esperado: light)`)
console.log(`   salvo no IndexedDB: ${await storedTheme()}`)

await page.screenshot({ path: `${OUT}-7-modal-light.png` })
console.log(`   screenshot (modal light): ${OUT}-7-modal-light.png`)

// 3) Fecha o modal e ve a home clara
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}-8-home-light.png` })
console.log(`3) screenshot (home light): ${OUT}-8-home-light.png`)

// 4) Persiste apos recarregar
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(800)
console.log(`4) apos reload: ${await theme()} (esperado: light)`)

// 5) Sem preferencia => volta pro dark
await clearStorage()
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(600)
console.log(`5) sem preferencia: ${await theme()} (esperado: dark)`)

await page.close()
await browser.close()
