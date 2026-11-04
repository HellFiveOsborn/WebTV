/**
 * E2E: o botao "v2" ao lado do botao de recarregar, no frontend v1.
 *
 * Verifica:
 *   - o botao existe na barra de ferramentas, ao lado do de recarregar;
 *   - ele e focavel pelo D-pad (o toolbar usa `useFocusable`);
 *   - ao clicar, navega para `/WebTV/v2/`.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend/tests/verify-v2-button.mjs
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
await page.setViewportSize({ width: 1400, height: 900 })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

await page.goto('http://localhost:3000/WebTV/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input', { timeout: 30000 })
await page.waitForTimeout(1500)

/* ------------------------------------------------------------------ *
 * 1) O botao existe
 * ------------------------------------------------------------------ */

const botao = page.getByRole('button', { name: 'Ir para a interface v2' })
check('o botao v2 existe', (await botao.count()) === 1)

const reload = page.locator('button').filter({ has: page.locator('svg') }).first()
check('o botao de recarregar existe', (await reload.count()) === 1)

/* ------------------------------------------------------------------ *
 * 2) Fica AO LADO do botao de recarregar (na mesma linha)
 * ------------------------------------------------------------------ */

const posicoes = await page.evaluate(() => {
  const v2 = document.querySelector('[aria-label="Ir para a interface v2"]');
  const reload = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg'));
  if (!v2 || !reload) return null;
  const a = v2.getBoundingClientRect();
  const b = reload.getBoundingClientRect();
  return {
    v2: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.width) },
    reload: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) },
  };
})

check('os dois botoes estao na mesma linha', !!posicoes && Math.abs(posicoes.v2.y - posicoes.reload.y) < 4,
  posicoes ? `v2.y=${posicoes.v2.y} reload.y=${posicoes.reload.y}` : '')
check('o botao v2 fica a DIREITA do de recarregar', !!posicoes && posicoes.v2.x > posicoes.reload.x,
  posicoes ? `v2.x=${posicoes.v2.x} reload.x=${posicoes.reload.x}` : '')

/* ------------------------------------------------------------------ *
 * 3) O D-pad alcança o botao
 *
 * O v1 usa `useFocusable(zone, index)` e um foco **virtual** (o
 * `FocusContext` marca o item com `ring-primary`; o `activeElement`
 * do DOM nao muda). O toolbar tem:
 *   toolbar-0 = SearchBar, toolbar-1 = Recarregar, toolbar-2 = v2.
 *
 * A 1a seta à direita vai para o botao de recarregar, a 2a para o v2.
 * ------------------------------------------------------------------ */

const focoNoV2 = async () =>
  page.evaluate(() => {
    const v2 = document.querySelector('[aria-label="Ir para a interface v2"]');
    return !!v2 && v2.className.includes('ring-primary');
  });

await page.keyboard.press('ArrowRight')
await page.waitForTimeout(400)
const focouReload = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).some(
    b => b.className.includes('ring-primary') && !b.getAttribute('aria-label'),
  ),
)

await page.keyboard.press('ArrowRight')
await page.waitForTimeout(400)
const focouV2 = await focoNoV2()

check(
  'o D-pad chega no botao de recarregar',
  focouReload,
  '1a seta à direita',
)
check(
  'o D-pad chega no botao v2',
  focouV2,
  '2a seta à direita',
)

/* ------------------------------------------------------------------ *
 * 4) Clique navega para a v2
 * ------------------------------------------------------------------ */

await botao.click()
await page.waitForTimeout(2500)

const url = page.url()
check(
  'o clique navega para a v2',
  /\/WebTV\/v2\/?/.test(url),
  url,
)

await page.close()
await browser.close()
process.exit(failed === 0 ? 0 : 1)
