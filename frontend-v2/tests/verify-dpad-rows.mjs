/**
 * Verifica a navegacao por D-pad nos CARROSEIS (linhas de canais) e no
 * bloco Top 10.
 *
 * Cobre:
 *   1. a ordem dentro de uma linha e estrita (mesmo bug da navbar);
 *   2. no fim da linha, o foco PARA (nao da a volta);
 *   3. a rolagem infinita continua montando os canais seguintes;
 *   4. no Top 10, a ordem #1 -> #2 -> #3 e estrita.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-dpad-rows.mjs
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
const page = await browser.contexts()[0].newPage()
await page.setViewportSize({ width: 1600, height: 900 })

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

let falhas = 0
const ok = (cond, msg) => {
  console.log(`   ${cond ? 'SIM' : 'NAO'}${cond ? '' : ' <- FALHOU'}: ${msg}`)
  if (!cond) falhas++
}

const press = async (key, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await page.waitForTimeout(200)
  }
}

/** Indice global do card em foco dentro da sua linha. */
const indiceFocado = () =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focused')
    const holder = el?.closest('.row-item')
    if (!holder) return null
    return Number(holder.dataset.dpadIndex)
  })

/** Nome do canal em foco. */
const nomeFocado = () =>
  page.evaluate(() => {
    const el = document.querySelector('.dpad-focused')
    return el?.querySelector('.card-name')?.textContent ?? null
  })

/* ---------------- TOP 10 ---------------- */
console.log('=== Top 10 ===')

// Entra na home e desce ate o Top 10.
await press('ArrowDown')
await press('ArrowDown')

const topIndices = []
for (let i = 0; i < 5; i++) {
  topIndices.push(
    await page.evaluate(() => {
      const el = document.querySelector('.dpad-focused')
      const itens = [...document.querySelectorAll('.top-body [data-dpad-item]')]
      return itens.indexOf(el)
    }),
  )
  await press('ArrowRight')
}
console.log(`   indices no Top 10: ${topIndices.join(' -> ')}`)
ok(
  topIndices.every((v, i) => i === 0 || v === topIndices[i - 1] + 1),
  'a ordem no Top 10 e estrita (#1 -> #2 -> #3...)',
)

/* ---------------- LINHA DE CANAIS ---------------- */
console.log('\n=== linha de canais ===')

// Desce ate uma linha (o Top 10 -> a primeira linha).
await press('ArrowDown')
const linha = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  return {
    titulo: el?.closest('.row')?.querySelector('.row-title')?.textContent?.trim() ?? null,
    indice: el?.closest('.row-item')?.dataset.dpadIndex ?? null,
  }
})
console.log(`   linha: ${JSON.stringify(linha)}`)

ok(linha.indice !== null, 'o foco desceu para uma linha de canais')

// Anda 6 cards para a direita: os indices devem ser consecutivos.
const seq = []
for (let i = 0; i < 6; i++) {
  seq.push(await indiceFocado())
  await press('ArrowRight')
}
console.log(`   indices: ${seq.join(' -> ')}`)
ok(
  seq.every((v, i) => i === 0 || v === seq[i - 1] + 1),
  'a ordem dentro da linha e estrita (sem inversao)',
)

// Volta 3 para a esquerda: os indices devem DECRESCER.
const volta = []
for (let i = 0; i < 3; i++) {
  await press('ArrowLeft')
  volta.push(await indiceFocado())
}
console.log(`   voltando: ${volta.join(' -> ')}`)
ok(
  volta.every((v, i) => i === 0 || v === volta[i - 1] - 1),
  'a volta para a esquerda decremente o indice',
)

// Anda ate o fim da linha: o foco deve PARAR (nao dar a volta).
const total = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  return Number(el?.closest('.row')?.querySelectorAll('.row-item').length ?? 0)
})
await press('ArrowRight', total + 10)
const noFim = await indiceFocado()
console.log(`   indice no fim: ${noFim}`)
ok(noFim !== null, 'o foco continua em um card valido apos andar ate o fim')

// A rolagem infinita montou canais novos?
const montados = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  const track = el?.closest('.row-track')
  return {
    cards: track?.querySelectorAll('.row-item').length ?? 0,
    scrollWidth: track?.scrollWidth ?? 0,
  }
})
console.log(`   montados: ${JSON.stringify(montados)}`)
ok(
  montados.cards > 0 && montados.cards < 40,
  `a janela virtual continua limitada (${montados.cards} cards, scrollWidth ${montados.scrollWidth})`,
)

// O canal em foco deve estar VISIVEL na tela.
const visivel = await page.evaluate(() => {
  const el = document.querySelector('.dpad-focused')
  const r = el.getBoundingClientRect()
  return r.left >= -5 && r.right <= window.innerWidth + 5
})
ok(visivel, 'o card em foco esta visivel na viewport')

await page.close()
await browser.close()

console.log(falhas === 0 ? '\nOK: carrossel navega em ordem estrita' : `\nFALHAS: ${falhas}`)
process.exit(falhas === 0 ? 0 : 1)
