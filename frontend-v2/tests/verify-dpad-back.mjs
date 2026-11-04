/**
 * E2E: o "Back" do controle remoto fecha o canal aberto (na grade).
 *
 * ## O que e verificado
 *
 * 1. **O Back fecha o canal**: com um canal aberto, `Escape` (e
 *    `Backspace`, o D-pad antigo) chamam o `closeChannel` da v2.
 *
 * 2. **Os eventos saem na ordem do contrato**:
 *    `channel:closing` -> `player:closed` -> `channel:close`, todos com
 *    `channelId`/`channelName` no nivel raiz (e o que o `WebTVBridge` do
 *    Kotlin le).
 *
 * 3. **O Kotlin e avisado**: o guard do Kotlin (simulado aqui) recebe o
 *    `player:closed` e chama o `onPlayerClosed`.
 *
 * 4. **Fecha so uma vez**: um segundo "Back" nao duplica o fechamento
 *    (o `player:closed` faz o app navegar para a grade).
 *
 * 5. **A API do canal e limpa**: `window.WebTV.channel.activeId` volta a
 *    `null` depois do fechamento.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-dpad-back.mjs
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

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

const browser = await chromium.connectOverCDP(CDP_URL)
const context = browser.contexts()[0]
const page = await context.newPage()
await page.setViewportSize({ width: 1600, height: 900 })

// O lado Kotlin do contrato (o guard de `MainActivity.injectEventListenerGuard`).
await page.addInitScript(() => {
  window.__kotlinCalls = []
  window.__kotlinEvents = []

  const record = name => payload => {
    window.__kotlinCalls.push({ name, payload: JSON.parse(payload) })
  }

  window.WebTVBridge = {
    onAppLoaded: record('onAppLoaded'),
    onChannelClicked: record('onChannelClicked'),
    onPlayerOpened: record('onPlayerOpened'),
    onPlayerClosed: record('onPlayerClosed'),
    onChannelClosed: record('onChannelClosed'),
    onSearchChanged: record('onSearchChanged'),
    onCategoryChanged: record('onCategoryChanged'),
    onFocusChanged: record('onFocusChanged'),
    onNavigatedHome: record('onNavigatedHome'),
    onScriptRetrieved: record('onScriptRetrieved'),
    onScriptsPreloaded: record('onScriptsPreloaded'),
    onScriptsLoaded: record('onScriptsLoaded'),
    onListenersReady: () => window.__kotlinCalls.push({ name: 'onListenersReady' }),
  }

  const tryInstall = () => {
    if (
      typeof window.WebTV === 'undefined' ||
      typeof window.WebTV.events === 'undefined' ||
      !window.__webtvAppBridgeInjected
    ) {
      setTimeout(tryInstall, 100)
      return
    }

    const on = (type, method) =>
      window.WebTV.events.on(type, payload => {
        window.__kotlinEvents.push({ type, payload })
        window.WebTVBridge[method](JSON.stringify(payload))
      })

    on('app:loaded', 'onAppLoaded')
    on('channel:clicked', 'onChannelClicked')
    on('player:opened', 'onPlayerOpened')
    on('player:closed', 'onPlayerClosed')
    on('channel:close', 'onChannelClosed')
    on('search:changed', 'onSearchChanged')
    on('category:changed', 'onCategoryChanged')
    on('focus:changed', 'onFocusChanged')
    on('navigated:home', 'onNavigatedHome')
    on('script:retrieved', 'onScriptRetrieved')
    on('scripts:preloaded', 'onScriptsPreloaded')
    on('scripts:loaded', 'onScriptsLoaded')

    window.__webtvListenersActive = true
  }
  tryInstall()
})

await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

// Impede a navegacao do `<a target="_blank">` (o clique ainda chega no
// React, entao o canal e aberto normalmente).
await page.evaluate(() => {
  document.addEventListener(
    'click',
    e => {
      const a = e.target.closest?.('a[href]')
      if (a) e.preventDefault()
    },
    true,
  )
})

/** Abre um canal (clica no primeiro card) e devolve o id. */
async function openChannel() {
  await page.evaluate(() => {
    // Cancela a assinatura anterior (senao cada fechamento seria
    // contado duas vezes).
    if (window.__closeOffs) window.__closeOffs.forEach(off => off())

    window.__kotlinCalls.length = 0
    window.__kotlinEvents.length = 0
    window.__closeEvents = []
    window.__closeOffs = ['channel:closing', 'player:closed', 'channel:close'].map(type =>
      window.WebTV.events.on(type, payload =>
        window.__closeEvents.push({ type, payload }),
      ),
    )
  })

  await page.locator('.card').first().click()
  await page.waitForTimeout(700)

  return page.evaluate(() => ({
    activeId: window.WebTV?.channel?.activeId ?? null,
    clicked: window.__kotlinCalls.filter(c => c.name === 'onChannelClicked').length,
  }))
}

/** Aperta uma tecla e devolve o que o app recebeu. */
async function pressBack(key) {
  await page.keyboard.press(key)
  await page.waitForTimeout(500)

  return page.evaluate(() => ({
    chamadas: window.__kotlinCalls.map(c => c.name),
    eventos: (window.__closeEvents || []).map(e => e.type),
    payloads: (window.__closeEvents || []).map(e => e.payload),
    activeId: window.WebTV?.channel?.activeId ?? null,
  }))
}

/* ------------------------------------------------------------------ *
 * 1) O Backspace fecha o canal (D-pad antigo, paridade com a v1)
 * ------------------------------------------------------------------ */

const aberto1 = await openChannel()
check('o canal foi aberto (channel:clicked)', aberto1.clicked === 1)
check('o canal ativo foi publicado', !!aberto1.activeId, String(aberto1.activeId))

const backspace = await pressBack('Backspace')
check(
  'o Backspace fechou o canal (paridade com a v1)',
  backspace.eventos.length >= 3,
  `eventos: ${backspace.eventos.join(', ')}`,
)
check(
  'os eventos saem na ordem do contrato',
  JSON.stringify(backspace.eventos) ===
    JSON.stringify(['channel:closing', 'player:closed', 'channel:close']),
  backspace.eventos.join(', '),
)
check(
  'o Kotlin foi avisado (onPlayerClosed)',
  backspace.chamadas.includes('onPlayerClosed'),
  `chamadas: ${backspace.chamadas.join(', ')}`,
)
check(
  'o player:closed leva channelId/channelName na raiz',
  typeof backspace.payloads.find(p => p.channelId !== undefined)?.channelId ===
    'string',
  JSON.stringify(backspace.payloads),
)
check(
  'o player:closed leva o id do canal aberto',
  backspace.payloads.find(p => p.channelId !== undefined)?.channelId ===
    aberto1.activeId,
  `${backspace.payloads.find(p => p.channelId !== undefined)?.channelId} (esperado ${aberto1.activeId})`,
)
check('a API do canal foi limpa', backspace.activeId === null, String(backspace.activeId))

/* ------------------------------------------------------------------ *
 * 2) O Escape fecha o canal (e nao duplica o fechamento)
 * ------------------------------------------------------------------ */

const aberto2 = await openChannel()
check('um segundo canal foi aberto', !!aberto2.activeId, String(aberto2.activeId))

const escape = await pressBack('Escape')
check(
  'o Escape fechou o canal',
  escape.eventos.length >= 3,
  `eventos: ${escape.eventos.join(', ')}`,
)
check(
  'os eventos saem na ordem do contrato',
  JSON.stringify(escape.eventos) ===
    JSON.stringify(['channel:closing', 'player:closed', 'channel:close']),
  escape.eventos.join(', '),
)
check(
  'o fechamento nao foi duplicado',
  escape.chamadas.filter(c => c === 'onPlayerClosed').length === 1,
  `chamadas: ${escape.chamadas.join(', ')}`,
)
check('a API do canal foi limpa', escape.activeId === null, String(escape.activeId))

/* ------------------------------------------------------------------ *
 * 3) Sem canal aberto, o Back nao fecha nada
 * ------------------------------------------------------------------ */

await page.evaluate(() => {
  window.__kotlinCalls.length = 0
  window.__closeEvents = []
})
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const semCanal = await page.evaluate(() => ({
  chamadas: (window.__kotlinCalls || []).map(c => c.name),
  eventos: (window.__closeEvents || []).map(e => e.type),
}))
check(
  'sem canal aberto, o Back nao emite fechamento',
  semCanal.eventos.length === 0,
  `eventos: ${semCanal.eventos.join(', ')}`,
)

console.log(failed === 0 ? '\nOK: o Back fecha o canal' : `\nFALHAS: ${failed}`)
await page.close()
await browser.close()
process.exit(failed === 0 ? 0 : 1)
