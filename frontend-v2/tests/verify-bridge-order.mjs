/**
 * E2E: a ordem de carregamento real (Kotlin injeta a `appBridge.js`).
 *
 * No app de verdade, a `appBridge.js` (asset do Kotlin) e injetada no
 * `onPageFinished` - DEPOIS do bundle da v2 rodar. Ela:
 *
 *   1. sai cedo se `__webtvAppBridgeInjected` estiver ligado;
 *   2. se nao sair, sobrescreve `window.WebTV.events.on/emit` e
 *      encaminha o `webtv:event` para o `emit` dele.
 *
 * Este teste reproduz os dois cenarios com a `appBridge.js` REAL do
 * repositorio Kotlin (o arquivo e lido do disco e injetado na pagina).
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-bridge-order.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

const APP_BRIDGE = readFileSync(
  resolve(REPO_ROOT, 'kotlin-app/app/src/main/assets/scripts/appBridge.js'),
  'utf8',
)

const browser = await chromium.connectOverCDP(
  process.env.CDP_URL || 'http://127.0.0.1:9333',
)

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

/**
 * Cenario 1 (o real): a v2 roda primeiro, o Kotlin injeta a
 * `appBridge.js` depois. O flag faz a `appBridge.js` sair cedo e o bus
 * da v2 continua no lugar.
 */
async function cenarioV2Primeiro() {
  const page = await browser.contexts()[0].newPage()
  await page.setViewportSize({ width: 1400, height: 900 })

  await page.addInitScript(() => {
    window.__kotlinCalls = []
    const record = name => payload => {
      window.__kotlinCalls.push({ name, payload: JSON.parse(payload) })
    }
    const bridge = {
      onAppLoaded: record('onAppLoaded'),
      onChannelClicked: record('onChannelClicked'),
      onPlayerOpened: record('onPlayerOpened'),
      onPlayerClosed: record('onPlayerClosed'),
      onChannelClosed: record('onChannelClosed'),
      onSearchChanged: record('onSearchChanged'),
      onCategoryChanged: record('onCategoryChanged'),
      onNavigatedHome: record('onNavigatedHome'),
      onScriptsPreloaded: record('onScriptsPreloaded'),
      onScriptsLoaded: record('onScriptsLoaded'),
      onScriptRetrieved: record('onScriptRetrieved'),
      onFocusChanged: record('onFocusChanged'),
    }
    window.WebTVBridge = bridge

    // O guard do Kotlin (MainActivity.injectEventListenerGuard).
    const ready = () =>
      typeof window.WebTV !== 'undefined' &&
      typeof window.WebTV.events !== 'undefined' &&
      window.__webtvAppBridgeInjected

    const tryInstall = () => {
      if (!ready()) {
        setTimeout(tryInstall, 100)
        return
      }
      const on = (type, method) =>
        window.WebTV.events.on(type, payload => {
          bridge[method](JSON.stringify(payload))
        })
      on('app:loaded', 'onAppLoaded')
      on('channel:clicked', 'onChannelClicked')
      on('player:opened', 'onPlayerOpened')
      on('player:closed', 'onPlayerClosed')
      on('channel:close', 'onChannelClosed')
      on('search:changed', 'onSearchChanged')
      on('category:changed', 'onCategoryChanged')
      on('navigated:home', 'onNavigatedHome')
      on('script:retrieved', 'onScriptRetrieved')
      on('scripts:preloaded', 'onScriptsPreloaded')
      on('scripts:loaded', 'onScriptsLoaded')
      window.__webtvListenersActive = true
    }
    tryInstall()
  })

  await page.goto('http://localhost:3001/WebTV/v2/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.top-body', { timeout: 30000 })
  await page.waitForTimeout(1200)

  // O Kotlin injeta a appBridge.js (como faz no onPageFinished).
  await page.evaluate(code => {
    const s = document.createElement('script')
    s.textContent = code
    document.body.appendChild(s)
  }, APP_BRIDGE)
  await page.waitForTimeout(500)

  const state = await page.evaluate(() => ({
    temOn: typeof window.WebTV?.events?.on === 'function',
    temEmit: typeof window.WebTV?.events?.emit === 'function',
    temListenersInternos: Boolean(window.WebTV?.events?._listeners),
    flag: window.__webtvAppBridgeInjected === true,
  }))

  check('C1: o bus da v2 continua no lugar apos a appBridge.js', state.temOn)
  check('C1: o emit continua funcionando', state.temEmit)
  check(
    'C1: a appBridge.js NAO sobrescreveu o bus (sem _listeners)',
    !state.temListenersInternos,
  )

  // O evento ainda chega ao Kotlin.
  await page.locator('.card').first().click()
  await page.waitForTimeout(700)

  const clicked = await page.evaluate(() =>
    window.__kotlinCalls.find(c => c.name === 'onChannelClicked'),
  )
  check('C1: channel:clicked chegou ao Kotlin', !!clicked)
  if (clicked) {
    check('C1: id no nivel raiz', typeof clicked.payload.id === 'string')
  }

  await page.close()
}

/**
 * Cenario 2 (defensivo): o Kotlin injetou a `appBridge.js` ANTES da
 * v2 rodar. A v2 precisa PRESERVAR o bus do Kotlin (o guard ja assinou
 * nele) e fazer os eventos chegarem.
 */
async function cenarioKotlinPrimeiro() {
  const page = await browser.contexts()[0].newPage()
  await page.setViewportSize({ width: 1400, height: 900 })

  await page.addInitScript({ content: APP_BRIDGE })

  await page.addInitScript(() => {
    window.__kotlinCalls = []
    const record = name => payload => {
      window.__kotlinCalls.push({ name, payload: JSON.parse(payload) })
    }
    const bridge = {
      onAppLoaded: record('onAppLoaded'),
      onChannelClicked: record('onChannelClicked'),
      onPlayerOpened: record('onPlayerOpened'),
      onPlayerClosed: record('onPlayerClosed'),
      onChannelClosed: record('onChannelClosed'),
      onSearchChanged: record('onSearchChanged'),
      onCategoryChanged: record('onCategoryChanged'),
      onNavigatedHome: record('onNavigatedHome'),
      onScriptsPreloaded: record('onScriptsPreloaded'),
      onScriptsLoaded: record('onScriptsLoaded'),
      onScriptRetrieved: record('onScriptRetrieved'),
      onFocusChanged: record('onFocusChanged'),
    }
    window.WebTVBridge = bridge

    const tryInstall = () => {
      if (
        typeof window.WebTV === 'undefined' ||
        typeof window.WebTV.events === 'undefined' ||
        !window.__webtvAppBridgeInjected
      ) {
        setTimeout(tryInstall, 50)
        return
      }
      const on = (type, method) =>
        window.WebTV.events.on(type, payload => {
          bridge[method](JSON.stringify(payload))
        })
      on('app:loaded', 'onAppLoaded')
      on('channel:clicked', 'onChannelClicked')
      on('player:opened', 'onPlayerOpened')
      on('player:closed', 'onPlayerClosed')
      on('channel:close', 'onChannelClosed')
      on('search:changed', 'onSearchChanged')
      on('category:changed', 'onCategoryChanged')
      on('navigated:home', 'onNavigatedHome')
      on('script:retrieved', 'onScriptRetrieved')
      on('scripts:preloaded', 'onScriptsPreloaded')
      on('scripts:loaded', 'onScriptsLoaded')
      window.__webtvListenersActive = true
    }
    tryInstall()
  })

  await page.goto('http://localhost:3001/WebTV/v2/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.top-body', { timeout: 30000 })
  await page.waitForTimeout(1500)

  const state = await page.evaluate(() => ({
    temOn: typeof window.WebTV?.events?.on === 'function',
    temListenersInternos: Boolean(window.WebTV?.events?._listeners),
  }))

  check('C2: o bus do Kotlin foi preservado', state.temListenersInternos)

  // O clique tem de chegar ao Kotlin (que assinou o bus DELE).
  await page.locator('.card').first().click()
  await page.waitForTimeout(800)

  const clicked = await page.evaluate(() =>
    window.__kotlinCalls.find(c => c.name === 'onChannelClicked'),
  )
  check('C2: channel:clicked chegou ao Kotlin', !!clicked)
  if (clicked) {
    check('C2: id no nivel raiz', typeof clicked.payload.id === 'string')
    check('C2: name no nivel raiz', typeof clicked.payload.name === 'string')
  }

  // E o evento injetado pelo Kotlin tem de chegar na v2.
  const injetado = await page.evaluate(async () => {
    window.WebTV.events.emit('player:closed', {
      channelId: 'x',
      channelName: 'Y',
      timestamp: Date.now(),
    })
    await new Promise(r => setTimeout(r, 200))
    return window.__kotlinCalls.filter(c => c.name === 'onPlayerClosed').length
  })
  check('C2: o evento injetado pelo Kotlin nao deu laco', injetado <= 1, `chamadas: ${injetado}`)

  await page.close()
}

await cenarioV2Primeiro()
await cenarioKotlinPrimeiro()

console.log(failed === 0 ? '\nOK: as duas ordens de carregamento funcionam' : `\nFALHAS: ${failed}`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
