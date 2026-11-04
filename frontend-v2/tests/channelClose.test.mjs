/**
 * Testes do contrato de fechamento de canal (frontend-v2/src/lib/channelClose.ts).
 *
 * ## O que e testado
 *
 * 1. **As teclas de "Back"** - as mesmas da v1 (`Escape`, `Backspace`,
 *    `BrowserBack`, `GoBack`). O `Backspace` faltava na v2: o D-pad
 *    antigo do Android TV mandava essa tecla.
 *
 * 2. **A ordem dos eventos de fechamento**:
 *
 *    ```
 *    channel:closing -> player:closed -> channel:close
 *    ```
 *
 *    O `player:closed` e o unico que o guard do Kotlin assina - e o
 *    que faz o app voltar para a grade.
 *
 * 3. **O payload no nivel raiz** - o `WebTVBridge` do Kotlin le
 *    `json.getString("channelId")`, entao `channelId`/`channelName`
 *    nao podem estar dentro de um objeto `payload`.
 *
 * 4. **Fecha so uma vez** - o `player:closed` faz o Kotlin navegar
 *    para a grade; emitir duas vezes fecharia o canal duas vezes.
 *
 * Run: node --test frontend-v2/tests/channelClose.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/channelClose')

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      resolve(V2_ROOT, 'src/lib/channelClose.ts'),
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

  return import(pathToFileURL(resolve(OUT_DIR, 'channelClose.js')).href)
}

const mod = await loadModule()
const {
  BACK_KEYS,
  CLOSE_EVENTS,
  isBackKey,
  buildClosePayload,
  emitCloseEvents,
} = mod

/* ------------------------------------------------------------------ *
 * As teclas de "Back"
 * ------------------------------------------------------------------ */

test('as teclas de Back sao as mesmas da v1', () => {
  // Paridade com `frontend/src/lib/shouldCloseOnKeyDown.ts`.
  assert.deepEqual([...BACK_KEYS].sort(), [
    'Backspace',
    'BrowserBack',
    'Escape',
    'GoBack',
  ])
})

test('isBackKey reconhece as teclas de "voltar"', () => {
  for (const key of ['Escape', 'Backspace', 'BrowserBack', 'GoBack']) {
    assert.ok(isBackKey(key), `${key} precisa ser um Back`)
  }
})

test('isBackKey nao confunde outras teclas com "voltar"', () => {
  for (const key of [
    'Enter',
    ' ',
    'ArrowLeft',
    'ArrowUp',
    'ArrowDown',
    'ArrowRight',
    'Tab',
    'BackspaceX',
    '',
  ]) {
    assert.equal(isBackKey(key), false, `${key} nao e um Back`)
  }
})

test('isBackKey aguenta valor ausente', () => {
  assert.equal(isBackKey(undefined), false)
  assert.equal(isBackKey(null), false)
})

/* ------------------------------------------------------------------ *
 * O payload
 * ------------------------------------------------------------------ */

test('o payload traz channelId/channelName no nivel raiz', () => {
  const payload = buildClosePayload('104-globodf', 'Globo DF', 1234)

  assert.equal(payload.channelId, '104-globodf')
  assert.equal(payload.channelName, 'Globo DF')
  assert.equal(payload.timestamp, 1234)

  // O Kotlin faz `json.getString("channelId")` - o campo precisa estar
  // na raiz, nao dentro de um `payload`.
  const json = JSON.parse(JSON.stringify(payload))
  assert.equal(typeof json.channelId, 'string')
  assert.equal(typeof json.channelName, 'string')
  assert.equal(json.payload, undefined)
})

/* ------------------------------------------------------------------ *
 * A ordem dos eventos
 * ------------------------------------------------------------------ */

test('os eventos de fechamento saem na ordem do contrato', () => {
  assert.deepEqual([...CLOSE_EVENTS], [
    'channel:closing',
    'player:closed',
    'channel:close',
  ])
})

test('emitCloseEvents emite os tres eventos, na ordem', () => {
  const emitted = []
  const ok = emitCloseEvents(
    (type, payload) => emitted.push({ type, payload }),
    { channelId: '1-amazonprimevideo', channelName: 'Amazon Prime', now: 99 },
  )

  assert.equal(ok, true)
  assert.deepEqual(
    emitted.map(e => e.type),
    ['channel:closing', 'player:closed', 'channel:close'],
  )
})

test('todos os eventos levam o mesmo payload, na raiz', () => {
  const emitted = []
  emitCloseEvents(
    (type, payload) => emitted.push({ type, payload }),
    { channelId: '104-globodf', channelName: 'Globo DF', now: 7 },
  )

  assert.equal(emitted.length, 3)
  for (const { payload } of emitted) {
    assert.equal(payload.channelId, '104-globodf')
    assert.equal(payload.channelName, 'Globo DF')
    assert.equal(payload.timestamp, 7)
  }
})

/* ------------------------------------------------------------------ *
 * Fecha so uma vez
 * ------------------------------------------------------------------ */

test('emitCloseEvents nao emite nada quando o canal ja foi fechado', () => {
  const emitted = []
  const ok = emitCloseEvents(
    (type, payload) => emitted.push({ type, payload }),
    {
      channelId: '1-amazonprimevideo',
      channelName: 'Amazon Prime',
      alreadyClosed: true,
    },
  )

  assert.equal(ok, false)
  assert.equal(emitted.length, 0, 'o fechamento nao pode ser duplicado')
})

test('o segundo fechamento e ignorado (o app nao recarrega duas vezes)', () => {
  const emitted = []
  const emit = (type, payload) => emitted.push({ type, payload })

  // 1) Fecha.
  emitCloseEvents(emit, {
    channelId: '1-amazonprimevideo',
    channelName: 'Amazon Prime',
    alreadyClosed: false,
  })

  // 2) Fecha de novo (o `alreadyClosed` ja esta marcado).
  emitCloseEvents(emit, {
    channelId: '1-amazonprimevideo',
    channelName: 'Amazon Prime',
    alreadyClosed: true,
  })

  assert.equal(
    emitted.filter(e => e.type === 'player:closed').length,
    1,
    'o player:closed precisa sair uma vez so (o Kotlin navega com ele)',
  )
})

/* ------------------------------------------------------------------ *
 * O guard do Kotlin (integracao)
 * ------------------------------------------------------------------ */

test('o guard do Kotlin recebe o payload do player:closed na raiz', () => {
  // Reproduz o guard do Kotlin:
  //
  //   window.WebTV.events.on('player:closed', (event) => {
  //     WebTVBridge.onPlayerClosed(JSON.stringify(event));
  //   });
  //
  // O `WebTVBridge` le `json.getString("channelId")` - se o payload
  // tivesse um nivel a mais, o Kotlin lancaria JSONException.
  const bridgeCalls = []
  const kotlinBridge = {
    onPlayerClosed(payload) {
      const json = JSON.parse(payload)
      // `getString` do Android: lanca se o campo nao existir.
      if (typeof json.channelId !== 'string') throw new Error('JSONException')
      if (typeof json.channelName !== 'string') throw new Error('JSONException')
      bridgeCalls.push(json)
    },
  }

  emitCloseEvents(
    (type, payload) => {
      if (type !== 'player:closed') return
      kotlinBridge.onPlayerClosed(JSON.stringify(payload))
    },
    { channelId: '104-globodf', channelName: 'Globo DF', now: 1 },
  )

  assert.equal(bridgeCalls.length, 1)
  assert.equal(bridgeCalls[0].channelId, '104-globodf')
  assert.equal(bridgeCalls[0].channelName, 'Globo DF')
})
