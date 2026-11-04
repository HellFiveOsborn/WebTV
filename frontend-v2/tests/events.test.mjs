/**
 * Testes do barramento de eventos (frontend-v2/src/lib/events.ts).
 *
 * O ponto critico: o guard do Kotlin faz `const channelId = event.id` e
 * o `WebTVBridge` le `json.getString("id")` no NIVEL RAIZ do JSON. Se o
 * listener recebesse `{type, payload, timestamp}`, o Kotlin quebraria.
 *
 * Estes testes fixam esse contrato.
 *
 * Run: node --test frontend-v2/tests/events.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const REPO_ROOT = resolve(V2_ROOT, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/events')

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      resolve(V2_ROOT, 'src/lib/events.ts'),
      '--outDir',
      OUT_DIR,
      '--module',
      'esnext',
      '--target',
      'es2020',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
      '--strict',
      '--lib',
      'es2020,dom',
    ],
    { stdio: 'pipe', cwd: V2_ROOT },
  )

  const file = resolve(OUT_DIR, 'events.js')
  return import(pathToFileURL(file).href)
}

/**
 * Ambiente de browser falso: `window` com `dispatchEvent`,
 * `postMessage` e um `WebTVBridge` que registra as chamadas.
 */
function makeWindow() {
  const bridgeCalls = []
  const dispatched = []
  const posted = []

  const win = {
    WebTVBridge: {
      onAppLoaded(payload) {
        bridgeCalls.push({ method: 'onAppLoaded', payload: JSON.parse(payload) })
      },
      onChannelClicked(payload) {
        bridgeCalls.push({ method: 'onChannelClicked', payload: JSON.parse(payload) })
      },
      onPlayerOpened(payload) {
        bridgeCalls.push({ method: 'onPlayerOpened', payload: JSON.parse(payload) })
      },
      onPlayerClosed(payload) {
        bridgeCalls.push({ method: 'onPlayerClosed', payload: JSON.parse(payload) })
      },
      onChannelClosed(payload) {
        bridgeCalls.push({ method: 'onChannelClosed', payload: JSON.parse(payload) })
      },
      onSearchChanged(payload) {
        bridgeCalls.push({ method: 'onSearchChanged', payload: JSON.parse(payload) })
      },
      onCategoryChanged(payload) {
        bridgeCalls.push({ method: 'onCategoryChanged', payload: JSON.parse(payload) })
      },
      onNavigatedHome(payload) {
        bridgeCalls.push({ method: 'onNavigatedHome', payload: JSON.parse(payload) })
      },
      onScriptsPreloaded(payload) {
        bridgeCalls.push({ method: 'onScriptsPreloaded', payload: JSON.parse(payload) })
      },
      onScriptsLoaded(payload) {
        bridgeCalls.push({ method: 'onScriptsLoaded', payload: JSON.parse(payload) })
      },
    },
    dispatchEvent(event) {
      dispatched.push(event)
      return true
    },
    postMessage(data) {
      posted.push(data)
    },
  }

  return { win, bridgeCalls, dispatched, posted }
}

const mod = await loadModule()
const { EventBus, bridgeMethodFor, installEventBus, notifyBridge, emitWhenBridgeReady, isBridgeReady } =
  mod

/* ------------------------------------------------------------------ *
 * bridgeMethodFor
 * ------------------------------------------------------------------ */

test('bridgeMethodFor: converte o nome do evento no metodo do Kotlin', () => {
  assert.equal(bridgeMethodFor('channel:clicked'), 'onChannelClicked')
  assert.equal(bridgeMethodFor('player:opened'), 'onPlayerOpened')
  assert.equal(bridgeMethodFor('player:closed'), 'onPlayerClosed')
  assert.equal(bridgeMethodFor('app:loaded'), 'onAppLoaded')
  assert.equal(bridgeMethodFor('search:changed'), 'onSearchChanged')
  assert.equal(bridgeMethodFor('category:changed'), 'onCategoryChanged')
  assert.equal(bridgeMethodFor('navigated:home'), 'onNavigatedHome')
  assert.equal(bridgeMethodFor('scripts:preloaded'), 'onScriptsPreloaded')
  assert.equal(bridgeMethodFor('scripts:loaded'), 'onScriptsLoaded')
  // O Kotlin expoe `onChannelClosed` (com "d"), nao `onChannelClose`.
  assert.equal(bridgeMethodFor('channel:close'), 'onChannelClosed')
})

/* ------------------------------------------------------------------ *
 * CONTRATO CRITICO: o listener recebe o PAYLOAD
 * ------------------------------------------------------------------ */

test('o listener recebe o PAYLOAD no nivel raiz (o que o Kotlin le)', () => {
  const bus = new EventBus()
  let received = null

  bus.on('channel:clicked', payload => {
    received = payload
  })

  bus.emit('channel:clicked', { id: '42-globo', name: 'Globo', type: 'redirect' })

  assert.ok(received, 'o listener deve ser chamado')
  // Exatamente como o Kotlin faz:
  assert.equal(received.id, '42-globo')
  assert.equal(received.name, 'Globo')
  assert.equal(received.type, 'redirect')
  // E nao dentro de `payload`:
  assert.equal(received.payload, undefined)
})

test('o payload serializado tem os campos no nivel raiz (JSON do Kotlin)', () => {
  const bus = new EventBus()
  const { win } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    // O guard do Kotlin serializa o payload e o WebTVBridge le do nivel raiz.
    const json = JSON.stringify({ id: '42-globo', name: 'Globo', type: 'redirect' })
    const parsed = JSON.parse(json)
    assert.equal(parsed.getString?.('id'), undefined) // sanity: e objeto comum
    assert.equal(parsed.id, '42-globo')
  } finally {
    globalThis.window = original
  }
})

test('todos os eventos do Kotlin tem o metodo correspondente', () => {
  const { win } = makeWindow()
  const methods = Object.keys(win.WebTVBridge)

  const required = [
    'app:loaded',
    'channel:clicked',
    'player:opened',
    'player:closed',
    'channel:close',
    'search:changed',
    'category:changed',
    'navigated:home',
    'scripts:preloaded',
    'scripts:loaded',
  ]

  for (const type of required) {
    const method = bridgeMethodFor(type)
    assert.ok(
      methods.includes(method),
      `o bridge precisa expor ${method} (evento ${type})`,
    )
  }
})

/* ------------------------------------------------------------------ *
 * Emissao
 * ------------------------------------------------------------------ */

test('emit notifica os listeners com o payload', () => {
  const bus = new EventBus()
  const seen = []

  bus.on('search:changed', p => seen.push(p.query))
  bus.emit('search:changed', { query: 'globo' })

  assert.deepEqual(seen, ['globo'])
})

test('emit dispara o CustomEvent webtv:event e o postMessage', () => {
  const bus = new EventBus()
  const { win, dispatched, posted } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    bus.emit('app:loaded', { channels: 156, categories: 7, timestamp: 1 })

    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0].type, 'webtv:event')
    assert.equal(dispatched[0].detail.type, 'app:loaded')
    assert.equal(dispatched[0].detail.payload.channels, 156)

    assert.equal(posted.length, 1)
    assert.equal(posted[0].source, 'webtv')
    assert.equal(posted[0].event.type, 'app:loaded')
  } finally {
    globalThis.window = original
  }
})

test('o listener pode ser removido com o retorno do on()', () => {
  const bus = new EventBus()
  let count = 0

  const off = bus.on('category:changed', () => count++)
  bus.emit('category:changed', { categoryId: 'x', categoryName: 'X' })
  off()
  bus.emit('category:changed', { categoryId: 'y', categoryName: 'Y' })

  assert.equal(count, 1)
})

test('um erro no listener nao quebra os demais', () => {
  const bus = new EventBus()
  let reached = false

  bus.on('search:changed', () => {
    throw new Error('boom')
  })
  bus.on('search:changed', () => {
    reached = true
  })

  bus.emit('search:changed', { query: 'x' })
  assert.equal(reached, true)
})

test('o historico guarda os ultimos 100 eventos', () => {
  const bus = new EventBus()
  for (let i = 0; i < 120; i++) {
    bus.emit('search:changed', { query: String(i) })
  }

  const history = bus.getHistory()
  assert.equal(history.length, 100)
  assert.equal(history[0].payload.query, '20')
  assert.equal(history[99].payload.query, '119')
})

test('getHistory filtra por tipo', () => {
  const bus = new EventBus()
  bus.emit('app:loaded', { channels: 1, categories: 1, timestamp: 1 })
  bus.emit('search:changed', { query: 'a' })
  bus.emit('search:changed', { query: 'b' })

  assert.equal(bus.getHistory('search:changed').length, 2)
  assert.equal(bus.getHistory(['app:loaded']).length, 1)
  assert.equal(bus.getHistory('category:changed').length, 0)
})

/* ------------------------------------------------------------------ *
 * installEventBus
 * ------------------------------------------------------------------ */

test('installEventBus publica o bus em window.WebTV.events', () => {
  const { win } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    installEventBus()

    assert.ok(win.WebTV, 'window.WebTV deve existir')
    assert.ok(win.WebTV.events, 'window.WebTV.events deve existir')
    assert.equal(typeof win.WebTV.events.on, 'function')
    assert.equal(typeof win.WebTV.events.emit, 'function')
  } finally {
    globalThis.window = original
  }
})

test('installEventBus liga o flag __webtvAppBridgeInjected', () => {
  const { win } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    installEventBus()
    // Sem este flag o guard do Kotlin NUNCA assina os eventos.
    assert.equal(win.__webtvAppBridgeInjected, true)
  } finally {
    globalThis.window = original
  }
})

test('installEventBus preserva o bus que o Kotlin ja injetou', () => {
  const { win } = makeWindow()
  const kotlinBus = { on: () => () => {}, emit: () => {} }
  win.WebTV = { events: kotlinBus }

  const original = globalThis.window
  globalThis.window = win

  try {
    installEventBus()
    // O bus do Kotlin (appBridge.js) nao pode ser sobrescrito.
    assert.equal(win.WebTV.events, kotlinBus)
  } finally {
    globalThis.window = original
  }
})

/* ------------------------------------------------------------------ *
 * emitWhenBridgeReady
 * ------------------------------------------------------------------ */

test('emitWhenBridgeReady espera o Kotlin assinar os eventos', async () => {
  const { win } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    // O bridge existe, mas o guard ainda nao assinou.
    win.__webtvListenersActive = false

    // `installEventBus` publica o bus SINGLETON em `window.WebTV.events`
    // - e nele que o listener precisa estar.
    installEventBus()

    let received = null
    window.WebTV.events.on('app:loaded', p => {
      received = p
    })

    // Usa o bus instalado (o `emit` precisa ir para o window).
    emitWhenBridgeReady('app:loaded', { channels: 156, categories: 7, timestamp: 1 })

    // Ainda nao assinou: nada foi entregue.
    await new Promise(r => setTimeout(r, 400))
    assert.equal(received, null, 'nao deve emitir antes do Kotlin assinar')

    // O Kotlin assina (liga o flag).
    win.__webtvListenersActive = true
    await new Promise(r => setTimeout(r, 400))

    assert.ok(received, 'deve emitir assim que o Kotlin assinar')
    assert.equal(received.channels, 156)
  } finally {
    globalThis.window = original
  }
})

test('emitWhenBridgeReady emite na hora sem o app Kotlin', () => {
  const { win } = makeWindow()
  const original = globalThis.window
  // Sem WebTVBridge: e o site web (a v2 no navegador).
  globalThis.window = { ...win, WebTVBridge: undefined }

  try {
    installEventBus()
    let received = null
    window.WebTV.events.on('app:loaded', p => {
      received = p
    })

    emitWhenBridgeReady('app:loaded', { channels: 1, categories: 1, timestamp: 1 })
    assert.ok(received, 'sem o app Kotlin, o evento sai na hora')
  } finally {
    globalThis.window = original
  }
})

test('isBridgeReady le o flag do Kotlin', () => {
  const { win } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    win.__webtvListenersActive = false
    assert.equal(isBridgeReady(), false)
    win.__webtvListenersActive = true
    assert.equal(isBridgeReady(), true)
  } finally {
    globalThis.window = original
  }
})

/* ------------------------------------------------------------------ *
 * notifyBridge
 * ------------------------------------------------------------------ */

test('notifyBridge chama o metodo do Kotlin com o payload em JSON', () => {
  const { win, bridgeCalls } = makeWindow()
  const original = globalThis.window
  globalThis.window = win

  try {
    const ok = notifyBridge('channel:clicked', {
      id: '7-sbt',
      name: 'SBT',
      type: 'redirect',
    })

    assert.equal(ok, true)
    assert.equal(bridgeCalls.length, 1)
    assert.equal(bridgeCalls[0].method, 'onChannelClicked')
    // Nivel raiz - e assim que o WebTVBridge le.
    assert.equal(bridgeCalls[0].payload.id, '7-sbt')
    assert.equal(bridgeCalls[0].payload.type, 'redirect')
  } finally {
    globalThis.window = original
  }
})

test('notifyBridge devolve false sem bridge ou sem metodo', () => {
  const { win } = makeWindow()
  const original = globalThis.window

  // Sem bridge nenhum.
  globalThis.window = { ...win, WebTVBridge: undefined }
  try {
    assert.equal(notifyBridge('player:opened', {}), false)
  } finally {
    globalThis.window = original
  }

  // Com bridge, mas sem o metodo do evento.
  globalThis.window = win
  try {
    assert.equal(notifyBridge('evento:inexistente', {}), false)
  } finally {
    globalThis.window = original
  }
})
