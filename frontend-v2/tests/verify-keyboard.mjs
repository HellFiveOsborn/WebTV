/**
 * Verifica o teclado virtual: digitar pelas teclas, apagar, trocar para
 * simbolos e navegar pelo controle remoto (setas + Enter).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-keyboard.mjs
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
await page.waitForTimeout(1000)

await page.locator('[aria-label="Pesquisar"]').click()
await page.waitForSelector('.vkb', { timeout: 10000 })
await page.waitForTimeout(500)

// 1) O teclado virtual tem as teclas esperadas.
const keys = await page.locator('.vkb-key').count()
console.log(`1) teclas do teclado virtual: ${keys}`)

// 2) Clicar nas letras preenche o campo.
await page.locator('.vkb-key', { hasText: /^g$/ }).click()
await page.locator('.vkb-key', { hasText: /^l$/ }).click()
await page.locator('.vkb-key', { hasText: /^o$/ }).click()
await page.waitForTimeout(700)
const value = await page.locator('.search-overlay-input').inputValue()
console.log(`2) digitando g+l+o -> "${value}" (esperado: glo)`)
console.log(`   filtros na tela: ${await page.locator('.section-title').innerText()}`)

// 3) Backspace apaga.
await page.locator('[aria-label="Apagar"]').click()
await page.waitForTimeout(400)
console.log(`3) apos backspace -> "${await page.locator('.search-overlay-input').inputValue()}"`)

// 4) Espaco.
await page.locator('[aria-label="Espaco"]').click()
await page.waitForTimeout(300)
console.log(`4) apos espaco -> "${await page.locator('.search-overlay-input').inputValue()}"`)

// 5) Troca para simbolos.
await page.locator('[aria-label="Trocar para simbolos"]').click()
await page.waitForTimeout(400)
console.log(`5) titulo do teclado: ${await page.locator('.vkb-title').innerText()}`)
await page.locator('.vkb-key', { hasText: /^7$/ }).click()
await page.waitForTimeout(300)
console.log(`   digitou 7 -> "${await page.locator('.search-overlay-input').inputValue()}"`)
await page.locator('[aria-label="Trocar para letras"]').click()
await page.waitForTimeout(300)

// 6) D-pad: setas movem a tecla ativa, Enter digita.
// Observacao: limpar o campo fecha a busca (a overlay e modal), entao
// usa as teclas do teclado virtual para digitar em vez do campo.
await page.locator('.vkb').click({ position: { x: 5, y: 5 } })
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(300)
const active = await page.evaluate(() => {
  const el = document.querySelector('.vkb-key.active')
  return el ? { label: el.getAttribute('aria-label'), text: el.textContent } : null
})
console.log(`6) tecla ativa apos 2x ArrowRight: ${JSON.stringify(active)}`)

await page.keyboard.press('Enter')
await page.waitForTimeout(400)
console.log(`   Enter digitou -> "${await page.locator('.search-overlay-input').inputValue()}"`)

await page.screenshot({ path: `${OUT}-12-teclado.png` })
console.log(`   screenshot: ${OUT}-12-teclado.png`)

// 7) Recolher / reabrir o teclado.
await page.locator('[aria-label="Recolher teclado"]').click()
await page.waitForTimeout(400)
console.log(`7) teclado recolhido: ${(await page.locator('.vkb').count()) === 0}`)
console.log(`   botao "Mostrar teclado": ${await page.locator('.vkb-show').count()}`)
await page.locator('.vkb-show').click()
await page.waitForTimeout(400)
console.log(`   reaberto: ${(await page.locator('.vkb').count()) === 1}`)

// 8) Botao Buscar fecha a busca.
await page.locator('.vkb-key--ok').click()
await page.waitForTimeout(500)
console.log(`8) botao Buscar fecha: ${(await page.locator('.search-overlay').count()) === 0}`)

await page.close()
await browser.close()
