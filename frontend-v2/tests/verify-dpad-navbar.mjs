/**
 * Verifica a navegacao por D-pad na BARRA SUPERIOR (navbar).
 *
 * Regressao importante: quando o foco chegava ao fim da lista, o
 * motor devolvia o item ANTERIOR - a navegacao parecia invertida e
 * "pulava" entre os itens.
 *
 * Cobre:
 *   1. a ordem para a direita e estrita (sem inversao, sem salto);
 *   2. a ordem para a esquerda e estrita;
 *   3. no fim da lista, o foco PARA (nao da a volta);
 *   4. a ordem se mantem em telas estreitas (navbar rolavel).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-dpad-navbar.mjs
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

const browser = await chromium.connectOverCDP(CDP_URL)

let falhas = 0
const ok = (cond, msg) => {
  console.log(`   ${cond ? 'SIM' : 'NAO'}${cond ? '' : ' <- FALHOU'}: ${msg}`)
  if (!cond) falhas++
}

/**
 * Roda a sequencia de setas e devolve os rotulos focados.
 *
 * @param key        tecla pressionada
 * @param quantidade quantas vezes
 */
async function sequencia(page, key, quantidade) {
  const labels = []
  for (let i = 0; i < quantidade; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(180)
    labels.push(
      await page.evaluate(() => {
        const el = document.querySelector('.dpad-focused')
        if (!el) return null
        const text = el.classList.contains('nav-link')
          ? el.textContent?.trim()
          : null
        return text || el.getAttribute('aria-label') || el.tagName
      }),
    )
  }
  return labels
}

for (const [w, h] of [
  [1600, 900],
  [960, 540],
]) {
  const page = await browser.contexts()[0].newPage()
  await page.setViewportSize({ width: w, height: h })
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.top-body', { timeout: 30000 })
  await page.waitForTimeout(1200)

  const esperado = await page.evaluate(() =>
    [...document.querySelectorAll('.topbar-inner [data-dpad-item]')].map(el =>
      el.classList.contains('nav-link')
        ? el.textContent?.trim()
        : el.getAttribute('aria-label'),
    ),
  )

  console.log(`\n=== ${w}x${h} ===`)
  console.log(`   itens na barra: ${esperado.join(' | ')}`)

  // 1) Direita: a ordem deve ser estrita.
  const paraDireita = await sequencia(page, 'ArrowRight', esperado.length + 3)
  console.log(`   -> direita: ${paraDireita.join(' | ')}`)

  let ordemOk = true
  for (let i = 1; i < esperado.length; i++) {
    if (paraDireita[i] !== esperado[i]) ordemOk = false
  }
  ok(
    ordemOk,
    `a ordem para a direita segue a ordem da barra (sem inversao/salto)`,
  )

  // 2) No fim da lista, o foco PARA (nao da a volta).
  ok(
    paraDireita.slice(esperado.length).every(l => l === esperado[esperado.length - 1]),
    `no fim da lista o foco PARA em "${esperado[esperado.length - 1]}"`,
  )

  // 3) Esquerda: a ordem tambem deve ser estrita (do fim para o inicio).
  // A sequencia COMECA no item em foco (o ultimo, "Configuracoes") e
  // a primeira seta para a esquerda vai para o penultimo ("Pesquisar").
  const paraEsquerda = await sequencia(page, 'ArrowLeft', esperado.length + 3)
  console.log(`   <- esquerda: ${paraEsquerda.join(' | ')}`)

  let voltaOk = true
  for (let i = 0; i < esperado.length - 1; i++) {
    const esperadoVolta = esperado[esperado.length - 2 - i]
    if (paraEsquerda[i] !== esperadoVolta) voltaOk = false
  }
  ok(voltaOk, `a ordem para a esquerda e a inversa exata`)

  // 4) No inicio da lista, o foco PARA.
  ok(
    paraEsquerda.slice(esperado.length - 1).every(l => l === esperado[0]),
    `no inicio da lista o foco PARA em "${esperado[0]}"`,
  )

  // 5) Nao pode haver mais de um item com o anel de foco.
  const multiplos = await page.evaluate(
    () => document.querySelectorAll('.dpad-focused').length,
  )
  ok(multiplos === 1, `apenas um item tem o anel de foco (${multiplos})`)

  await page.close()
}

await browser.close()

console.log(falhas === 0 ? '\nOK: navbar navega em ordem estrita' : `\nFALHAS: ${falhas}`)
process.exit(falhas === 0 ? 0 : 1)
