/**
 * E2E: o script de injecao elimina o banner VIP no player real.
 *
 * Reproduz exatamente o que o Kotlin faz:
 *
 * ```kotlin
 * val escapedCode = code.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
 * var s = document.createElement('script');
 * s.textContent = '$escapedCode';
 * document.body.appendChild(s);
 * ```
 *
 * E monitora o player por > 130 s (o banner aparece em ~60 s e
 * reaparece a cada 60 s), registrando QUALQUER instante em que ele
 * fica realmente visivel.
 *
 * O banner so aparece quando o player esta em fullscreen ou no
 * `playerShell` - aqui verificamos o DOM e o estilo computado, que e
 * o que o usuario ve.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-vip-banner.mjs
 */

import { readFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const V2_ROOT = resolve(REPO_ROOT, 'frontend-v2')

const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

/** Extrai o codigo do script do modulo TS (como o build faz). */
function extractCode() {
  const src = readFileSync(resolve(V2_ROOT, 'src/lib/injectionScripts.ts'), 'utf8')
  const match = src.match(
    /export const VIP_BANNER_SCRIPT_CODE = `([\s\S]*?)`\r?\n/,
  )
  if (!match) throw new Error('nao encontrei VIP_BANNER_SCRIPT_CODE')
  return match[1].replace(/\\`/g, '`').replace(/\$\{/g, '${')
}

/** Reproduz o escaping exato do `injectChannelScripts` do Kotlin. */
function kotlinEscape(code) {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

const CODE = extractCode()

const browser = await chromium.connectOverCDP(
  process.env.CDP_URL || 'http://127.0.0.1:9333',
)
const page = await browser.contexts()[0].newPage()
await page.setViewportSize({ width: 1400, height: 900 })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

// O player redireciona do catalogo para o host rotativo. Pegamos o
// host real da resposta.
const canalUrl = 'https://embedcanaisdetv.xyz/e/index.php?canal=globodf/'

// Monitor: registra QUALQUER instante em que o #vipModal fica visivel.
await page.addInitScript(() => {
  window.__vipAppeared = []
  const watch = () => {
    const m = document.getElementById('vipModal')
    if (!m) return
    const cs = getComputedStyle(m)
    const r = m.getBoundingClientRect()
    const visivel =
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      parseFloat(cs.opacity || '1') > 0.05 &&
      r.width > 0 &&
      r.height > 0
    const last = window.__vipAppeared[window.__vipAppeared.length - 1]
    if (visivel && (!last || last.visivel !== true)) {
      window.__vipAppeared.push({
        visivel: true,
        at: Math.round(performance.now()),
        display: cs.display,
        opacity: cs.opacity,
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    } else if (!visivel && last && last.visivel === true) {
      window.__vipAppeared.push({ visivel: false, at: Math.round(performance.now()) })
    }
  }
  setInterval(watch, 50)
  new MutationObserver(watch).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  })
})

await page.goto(canalUrl, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

const hostReal = new URL(page.url()).hostname
console.log(`player real: ${page.url()}`)

// --- 1) Injeta como o Kotlin faz -------------------------------------
await page.evaluate(embedded => {
  const s = document.createElement('script')
  s.textContent = embedded
  document.body.appendChild(s)
}, kotlinEscape(CODE).replace(/\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\'/g, "'"))

await page.waitForTimeout(800)

const pos = await page.evaluate(() => ({
  flag: window.__webtvVipBannerRemoved === true,
  styleExiste: !!document.getElementById('webtv-vip-banner-blocker'),
  bannerExiste: !!document.getElementById('vipModal'),
  observer: !!window.__webtvVipBannerObserver,
  timer: !!window.__webtvVipBannerTimer,
}))

check('o script rodou (flag definida)', pos.flag)
check('o CSS de bloqueio foi instalado', pos.styleExiste)
check('o MutationObserver foi instalado', pos.observer)
check('a varredura periodica foi instalada', pos.timer)
check('o #vipModal foi removido do DOM', !pos.bannerExiste)

// --- 2) Monitora por 130 s (cobre 2 ciclos de 60 s) ------------------
console.log('monitorando 130s (2 ciclos do banner)...')
const deadline = Date.now() + 130000
let log = []
while (Date.now() < deadline) {
  await page.waitForTimeout(5000)
  log = await page.evaluate(() => window.__vipAppeared)
  const visiveis = log.filter(e => e.visivel === true)
  if (visiveis.length > 0) break
}

const visiveis = log.filter(e => e.visivel === true)
check(
  'o banner NUNCA ficou visivel em 130s',
  visiveis.length === 0,
  visiveis.length > 0 ? `apareceu ${visiveis.length}x: ${JSON.stringify(visiveis)}` : '',
)

const fim = await page.evaluate(() => ({
  bannerExiste: !!document.getElementById('vipModal'),
  styleExiste: !!document.getElementById('webtv-vip-banner-blocker'),
  log: window.__vipAppeared,
}))

// Mesmo que o jogador reinsira o elemento, ele nao pode ficar visivel.
check('o #vipModal nao esta no DOM no final', !fim.bannerExiste)
check('o CSS de bloqueio continua instalado', fim.styleExiste)

console.log(`host testado: ${hostReal}`)
console.log(
  `eventos de visibilidade: ${fim.log.length ? JSON.stringify(fim.log) : 'nenhum (banner nunca apareceu)'}`,
)

await page.close()
await browser.close()
process.exit(failed === 0 ? 0 : 1)
