/**
 * E2E: integracao da v2 com o app Kotlin (Events API).
 *
 * Simula o lado Kotlin do contrato:
 *
 *   1. o guard do Kotlin se inscreve em `window.WebTV.events` e le o
 *      payload NO NIVEL RAIZ (`event.id`);
 *   2. os eventos sao entregues ao "bridge" (`WebTVBridge.onXxx`);
 *   3. o Kotlin injeta um evento de volta (`window.WebTV.events.emit`);
 *
 * Verifica:
 *   - `window.WebTV.events` existe e o flag `__webtvAppBridgeInjected`
 *     esta ligado (sem isso o Kotlin nunca assina nada);
 *   - clicar num card emite `channel:clicked` com `id`/`name`/`type` no
 *     nivel raiz (o `WebTVBridge.onChannelClicked` le do nivel raiz);
 *   - `app:loaded` sai com a contagem de canais e categorias;
 *   - `scripts:loaded` entrega os scripts ao Kotlin;
 *   - `scripts:preloaded` diz quais scripts valem para a URL do canal;
 *   - `search:changed` e `category:changed` saem nas trocas de tela;
 *   - `window.WebTV.channel.close()` fecha o canal e avisa o Kotlin.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-bridge.mjs
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
await page.setViewportSize({ width: 1600, height: 900 })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

/*
 * O lado Kotlin do contrato, instalado ANTES de qualquer script da
 * pagina (como o app real, que faz `addJavascriptInterface` antes de
 * carregar a URL).
 *
 * O guard e copiado de `MainActivity.injectEventListenerGuard`, com uma
 * correcao: o listener recebe o PAYLOAD (nao o evento), que e o que o
 * `appBridge.js` do Kotlin entrega.
 */
await page.addInitScript(() => {
  window.__kotlinCalls = []
  window.__kotlinEvents = []

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
    onFocusChanged: record('onFocusChanged'),
    onNavigatedHome: record('onNavigatedHome'),
    onScriptRetrieved: record('onScriptRetrieved'),
    onScriptsPreloaded: record('onScriptsPreloaded'),
    onScriptsLoaded: record('onScriptsLoaded'),
    onListenersReady: () => window.__kotlinCalls.push({ name: 'onListenersReady' }),
  }
  window.WebTVBridge = bridge

  // O guard real do Kotlin so assina com os tres requisitos:
  // window.WebTV, window.WebTV.events e __webtvAppBridgeInjected.
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
        window.__kotlinEvents.push({ type, payload })
        bridge[method](JSON.stringify(payload))
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

    // O Kotlin liga este flag DEPOIS de assinar (e a v2 espera por ele
    // antes de emitir `app:loaded` e `scripts:loaded`).
    window.__webtvListenersActive = true
    window.__kotlinReady = true
  }
  tryInstall()
})

await page.goto('http://localhost:3001/WebTV/v2/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top-body', { timeout: 30000 })
await page.waitForTimeout(1500)

/* ------------------------------------------------------------------ *
 * 1) O app Kotlin encontra o bus
 * ------------------------------------------------------------------ */

const env = await page.evaluate(() => ({
  temWebTV: typeof window.WebTV !== 'undefined',
  temEvents: typeof window.WebTV?.events?.on === 'function',
  temEmit: typeof window.WebTV?.events?.emit === 'function',
  flag: window.__webtvAppBridgeInjected === true,
  guardPronto: window.__webtvListenersActive === true,
}))

check('window.WebTV existe', env.temWebTV)
check('window.WebTV.events.on existe', env.temEvents)
check('window.WebTV.events.emit existe', env.temEmit)
check('flag __webtvAppBridgeInjected ligado', env.flag)
check('o guard do Kotlin assinou os eventos', env.guardPronto)

/* ------------------------------------------------------------------ *
 * 2) app:loaded
 * ------------------------------------------------------------------ */

await page.waitForTimeout(800)
const appLoaded = await page.evaluate(() =>
  window.__kotlinCalls.find(c => c.name === 'onAppLoaded'),
)

check('app:loaded chegou ao Kotlin', !!appLoaded)
if (appLoaded) {
  check(
    'app:loaded com 156 canais',
    appLoaded.payload.channels === 156,
    `recebido: ${appLoaded.payload.channels}`,
  )
  check(
    'app:loaded com 7 categorias',
    appLoaded.payload.categories === 7,
    `recebido: ${appLoaded.payload.categories}`,
  )
}

/* ------------------------------------------------------------------ *
 * 3) channel:clicked (o contrato critico: payload no nivel raiz)
 * ------------------------------------------------------------------ */

await page.locator('.card').first().click()
await page.waitForTimeout(900)

const clicked = await page.evaluate(() =>
  window.__kotlinCalls.find(c => c.name === 'onChannelClicked'),
)

check('channel:clicked chegou ao Kotlin', !!clicked)
if (clicked) {
  const p = clicked.payload
  // O Kotlin faz `json.getString("id")` - se o id nao estiver no nivel
  // raiz, o `JSONException` quebraria o app.
  check('channel:clicked tem "id" no nivel raiz', typeof p.id === 'string', `id: ${p.id}`)
  check('channel:clicked tem "name" no nivel raiz', typeof p.name === 'string', `name: ${p.name}`)
  check(
    'channel:clicked tem "type" valido',
    ['iframe', 'redirect', 'mixed'].includes(p.type),
    `type: ${p.type}`,
  )
  check('channel:clicked sem "payload" aninhado', p.payload === undefined)
}

/* ------------------------------------------------------------------ *
 * 4) scripts:loaded e scripts:preloaded
 * ------------------------------------------------------------------ */

const scriptsLoaded = await page.evaluate(() =>
  window.__kotlinCalls.find(c => c.name === 'onScriptsLoaded'),
)
check('scripts:loaded chegou ao Kotlin', !!scriptsLoaded)
if (scriptsLoaded) {
  check(
    'scripts:loaded com a lista de scripts',
    Array.isArray(scriptsLoaded.payload.scripts) && scriptsLoaded.payload.scripts.length > 0,
    `scripts: ${scriptsLoaded.payload.scripts?.length}`,
  )
}

const preloaded = await page.evaluate(() =>
  window.__kotlinCalls.filter(c => c.name === 'onScriptsPreloaded'),
)
check('scripts:preloaded chegou ao Kotlin', preloaded.length > 0)
if (preloaded.length > 0) {
  const p = preloaded[0].payload
  check('scripts:preloaded tem "url"', typeof p.url === 'string', `url: ${p.url}`)
  check(
    'scripts:preloaded tem a lista de scripts',
    Array.isArray(p.scripts) && p.scripts.length > 0,
    `scripts: ${p.scripts?.length}`,
  )
}

/* ------------------------------------------------------------------ *
 * 5) search:changed e category:changed
 * ------------------------------------------------------------------ */

await page.getByRole('button', { name: 'Pesquisar' }).click()
await page.waitForTimeout(600)
await page.locator('.search-overlay-input').fill('globo')
await page.waitForTimeout(700)

const search = await page.evaluate(() =>
  window.__kotlinCalls.find(c => c.name === 'onSearchChanged'),
)
check('search:changed chegou ao Kotlin', !!search)
if (search) {
  check(
    'search:changed com o termo',
    search.payload.query === 'globo',
    `query: ${search.payload.query}`,
  )
}

// Limpa a busca (a overlay fecha sozinha quando o campo esvazia).
await page.locator('.search-overlay-input').fill('')
await page.waitForTimeout(800)

await page.getByRole('button', { name: 'Esportes', exact: true }).click()
await page.waitForTimeout(700)

const category = await page.evaluate(() =>
  window.__kotlinCalls.find(c => c.name === 'onCategoryChanged'),
)
check('category:changed chegou ao Kotlin', !!category)
if (category) {
  check(
    'category:changed com o id da categoria',
    typeof category.payload.categoryId === 'string',
    `categoryId: ${category.payload.categoryId}`,
  )
  check(
    'category:changed com o nome da categoria',
    typeof category.payload.categoryName === 'string',
    `categoryName: ${category.payload.categoryName}`,
  )
}

/* ------------------------------------------------------------------ *
 * 6) window.WebTV.channel.close()
 * ------------------------------------------------------------------ */

const closeResult = await page.evaluate(async () => {
  window.__kotlinCalls.length = 0
  const api = window.WebTV?.channel
  if (!api?.close) return { erro: 'sem window.WebTV.channel.close' }

  api.close()
  await new Promise(r => setTimeout(r, 300))

  return {
    chamadas: window.__kotlinCalls.map(c => c.name),
    activeId: api.activeId,
    activeName: api.activeName,
  }
})

check(
  'channel.close() avisou o Kotlin',
  closeResult.chamadas?.includes('onPlayerClosed') ||
    closeResult.chamadas?.includes('onChannelClosed'),
  `chamadas: ${closeResult.chamadas?.join(', ')}`,
)
check('channel.close() limpou o canal ativo', closeResult.activeId === null)

/* ------------------------------------------------------------------ *
 * 7) Evento injetado pelo Kotlin (Kotlin -> JS)
 * ------------------------------------------------------------------ */

const injected = await page.evaluate(async () => {
  window.__kotlinEvents.length = 0
  // O Kotlin injeta eventos na pagina (evaluateJavascript).
  window.WebTV.events.emit('player:closed', {
    channelId: 'inexistente',
    channelName: 'Teste',
    timestamp: Date.now(),
  })
  await new Promise(r => setTimeout(r, 200))
  return window.__kotlinEvents.filter(e => e.type === 'player:closed')
})

check(
  'o evento injetado pelo Kotlin volta para a pagina',
  injected.length === 1,
  `eventos: ${injected.length}`,
)
if (injected.length === 1) {
  check(
    'o evento injetado traz o payload no nivel raiz',
    injected[0].payload.channelName === 'Teste',
  )
}

console.log(failed === 0 ? '\nOK: bridge com o Kotlin funcionando' : `\nFALHAS: ${failed}`)
await page.close()
await browser.close()
process.exit(failed === 0 ? 0 : 1)
