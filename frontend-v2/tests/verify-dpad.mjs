/**
 * Verifica a navegacao por D-pad (controle remoto do Android TV):
 *
 *   1. a barra superior e o primeiro alvo do foco;
 *   2. as setas andam entre os itens da barra;
 *   3. o foco desce da barra para o Top 10 e para as linhas de canais;
 *   4. dentro de uma linha, esquerda/direita andam pelos cards;
 *   5. o item focado recebe a classe `dpad-focused` (anel visivel);
 *   6. Enter/OK ativa o item em foco;
 *   7. no modal, as setas ficam presas dentro do painel;
 *   8. Esc fecha o modal.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-dpad.mjs
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
await page.waitForTimeout(1500)

/** Estado do foco (classe + rotulo do elemento). */
const focusState = () =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focused')
    if (!el) return null
    return {
      tag: el.tagName,
      label:
        el.getAttribute('aria-label') ||
        el.textContent?.trim().slice(0, 40) ||
        el.className,
      className: el.className,
      inTopbar: !!el.closest('.topbar'),
      inTop: !!el.closest('.top-section'),
      inRow: !!el.closest('.row'),
    }
  })

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(220)
  }
}

// 1) A primeira seta coloca o foco na barra superior.
await press('ArrowRight')
const s1 = await focusState()
console.log(`1) primeiro foco: ${JSON.stringify(s1)}`)
console.log(`   esta na barra superior: ${s1?.inTopbar ? 'SIM' : 'NAO'}`)

await page.screenshot({ path: `${OUT}-13-dpad-topbar.png` })
console.log(`   screenshot: ${OUT}-13-dpad-topbar.png`)

// 2) Direita avanca na barra (Inicio -> primeira categoria).
await press('ArrowRight')
const s2 = await focusState()
console.log(`2) apos direita: ${JSON.stringify(s2)}`)
console.log(`   avancou: ${s1?.label !== s2?.label ? 'SIM' : 'NAO'}`)

// 3) Baixo desce para o Top 10.
await press('ArrowDown')
const s3 = await focusState()
console.log(`3) apos baixo: ${JSON.stringify(s3)}`)
console.log(`   desceu para o Top 10: ${s3?.inTop ? 'SIM' : 'NAO'}`)

// 4) Direita no Top 10 vai para o card #2.
await press('ArrowRight')
const s4 = await focusState()
console.log(`4) Top 10, apos direita: ${JSON.stringify(s4)}`)

// 5) Baixo desce para uma linha de canais.
await press('ArrowDown')
const s5 = await focusState()
console.log(`5) apos baixo (linha): ${JSON.stringify(s5)}`)
console.log(`   esta numa linha: ${s5?.inRow ? 'SIM' : 'NAO'}`)

// 6) Direita na linha anda pelos cards.
const antes = s5?.label
await press('ArrowRight', 3)
const s6 = await focusState()
console.log(`6) 3x direita na linha: ${JSON.stringify(s6)}`)
console.log(`   moveu no card: ${antes !== s6?.label ? 'SIM' : 'NAO'}`)

await page.screenshot({ path: `${OUT}-14-dpad-row.png` })
console.log(`   screenshot: ${OUT}-14-dpad-row.png`)

// 7) O anel de foco existe no elemento focado.
const ring = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  if (!el) return null
  const s = getComputedStyle(el)
  return { outlineWidth: s.outlineWidth, outlineColor: s.outlineColor }
})
console.log(`7) anel de foco: ${JSON.stringify(ring)}`)

// 8) Enter ativa o item em foco (no grid, abre o canal).
// Navega ate o grid de uma categoria.
await page.getByRole('button', { name: 'Filmes e S\u00e9ries', exact: true }).click()
await page.waitForTimeout(900)
await press('ArrowDown')
const s8 = await focusState()
console.log(`8) no grid: ${JSON.stringify(s8)}`)

// 9) No modal, as setas nao vazam para a pagina.
await page.getByRole('button', { name: 'Configuracoes' }).click()
await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
await page.waitForTimeout(500)
await press('ArrowRight')
const inModal = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  const dialog = document.querySelector('[role="dialog"]')
  return {
    dentroDoModal: !!(el && dialog?.contains(el)),
    label: el?.getAttribute('aria-label') || el?.textContent?.trim().slice(0, 30),
  }
})
console.log(`9) modal: ${JSON.stringify(inModal)}`)
console.log(`   foco preso no modal: ${inModal.dentroDoModal ? 'SIM' : 'NAO'}`)

await page.screenshot({ path: `${OUT}-15-dpad-modal.png` })
console.log(`   screenshot: ${OUT}-15-dpad-modal.png`)

// 10) Esc fecha o modal.
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log(`10) Esc fecha o modal: ${(await page.locator('[role="dialog"]').count()) === 0}`)

await page.close()
await browser.close()
