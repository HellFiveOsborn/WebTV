/**
 * Testes da entrega dos scripts ao app Kotlin (frontend-v2/src/lib/useBridge.ts).
 *
 * ## O que e testado
 *
 * O Kotlin indexa os scripts recebidos no `scripts:loaded` em tres maps LRU
 * de 50 entradas:
 *
 * - `channelScripts[channelId]`
 * - `domainScripts[host]`
 * - `urlScripts[url]`
 *
 * E `storeChannelScript` **ACRESCENTA** a uma lista (sem deduplicar):
 *
 * ```kotlin
 * fun storeChannelScript(channelId: String, scriptId: String, name: String, code: String) {
 *     channelScripts.getOrPut(channelId) { mutableListOf() }.add(Triple(scriptId, name, code))
 * }
 * ```
 *
 * ## O problema que estes testes travam
 *
 * O script do Gist ("EmbedDeCanais Player Simples") traz **70 `channelIds`**
 * da v1 (`1779525189328`, ...). Como o LRU tem 50 vagas, indexar o gist
 * **antes** do canal da v2 expulsa o canal - e o script do canal (player
 * simples + banner) nunca e injetado.
 *
 * A ordem do payload resolve: **gist primeiro, scripts da v2 depois**. O
 * canal indexado por ultimo fica como a entrada mais recente do LRU.
 *
 * Run: node --test frontend-v2/tests/bridgeScripts.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')

/** Lê o fonte do `useBridge.ts` (o modulo depende de React). */
const SOURCE = readFileSync(resolve(V2_ROOT, 'src/lib/useBridge.ts'), 'utf8')

/* ------------------------------------------------------------------ *
 * A ordem do payload
 * ------------------------------------------------------------------ */

/** Extrai o corpo da funcao `emitScriptsLoaded`. */
function emitScriptsLoadedBody() {
  const start = SOURCE.indexOf('const emitScriptsLoaded = useCallback(')
  assert.ok(start > 0, 'nao encontrei emitScriptsLoaded')
  const end = SOURCE.indexOf('}, [])', start)
  assert.ok(end > start, 'nao encontrei o fim de emitScriptsLoaded')
  return SOURCE.slice(start, end)
}

test('emitScriptsLoaded monta o payload com o gist primeiro', () => {
  const body = emitScriptsLoadedBody()

  const iGist = body.indexOf('toBridgeScripts(scriptsRef.current)')
  const iVip = body.indexOf('vipBannerScript(')
  const iSimple = body.indexOf('simplePlayerScript(')

  assert.ok(iGist > 0, 'nao achei o gist no payload')
  assert.ok(iVip > 0, 'nao achei o banner no payload')
  assert.ok(iSimple > 0, 'nao achei o player simples no payload')

  // O gist precisa vir ANTES: ele enche as 50 vagas do LRU.
  assert.ok(
    iGist < iVip,
    'o gist precisa ser indexado antes do canal da v2 (LRU de 50)',
  )
  assert.ok(
    iVip < iSimple,
    'o banner e indexado antes do player simples',
  )
})

test('emitScriptsLoaded entrega o player simples no payload', () => {
  const body = emitScriptsLoadedBody()

  assert.ok(
    body.includes('simplePlayerScript('),
    'o script do player simples precisa ser entregue ao Kotlin',
  )
  assert.ok(
    body.includes('SIMPLE_PLAYER_SCRIPT_DOMAINS'),
    'o player simples precisa dos dominios estaveis',
  )
})

test('emitScriptsLoaded indexa o player simples pelo canal aberto', () => {
  const body = emitScriptsLoadedBody()

  // O canal e o que garante a injecao no host rotativo.
  assert.ok(
    body.includes('channelIds: channelId ? [channelId] : undefined'),
    'o script precisa ser indexado pelo canal',
  )
})

/* ------------------------------------------------------------------ *
 * A simulacao do LRU do Kotlin
 * ------------------------------------------------------------------ */

/**
 * Reproduz o LRU do Kotlin.
 *
 * `LinkedHashMap(capacity, 0.75f, true)` = accessOrder (o `get` move a
 * entrada para o fim) e `removeEldestEntry` quando `size > capacity`.
 */
class KotlinLru {
  constructor(capacity) {
    this.capacity = capacity
    this.map = new Map()
  }

  get(key) {
    if (!this.map.has(key)) return undefined
    const value = this.map.get(key)
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  put(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value)
    }
  }

  /** `kotlin.collections.getOrPut`. */
  getOrPut(key, defaultValue) {
    const value = this.get(key)
    if (value !== undefined) return value
    const answer = defaultValue()
    this.put(key, answer)
    return answer
  }

  /** Inspecao sem reordenar. */
  peek(key) {
    return this.map.get(key)
  }

  get size() {
    return this.map.size
  }
}

/** Simula o `onScriptsLoaded` do Kotlin (`WebTVBridge.kt`). */
function indexScripts(channelScripts, payload) {
  for (const script of payload) {
    for (const channelId of script.channelIds ?? []) {
      channelScripts.getOrPut(channelId, () => []).push(script.id)
    }
  }
}

/** O gist real: 3 scripts, um com 70 `channelIds` da v1. */
const GIST = [
  { id: 'gist-embehub', channelIds: undefined },
  { id: 'gist-globoplay', channelIds: undefined },
  {
    id: 'gist-player-simples',
    channelIds: Array.from({ length: 70 }, (_, i) => `v1-id-${i}`),
  },
]

const V2_CHANNEL = '1-amazonprimevideo'
const PLAYER_ID = 'webtv-embedcanais-simple-player'
const VIP_ID = 'webtv-vip-banner-remover'

/** Monta o payload na ordem que o `emitScriptsLoaded` usa. */
function buildPayload(channelId, order) {
  const vip = {
    id: VIP_ID,
    channelIds: channelId ? [channelId] : undefined,
  }
  const simple = {
    id: PLAYER_ID,
    channelIds: channelId ? [channelId] : undefined,
  }
  return order === 'gist-first'
    ? [...GIST, vip, simple]
    : [vip, simple, ...GIST]
}

test('com a ordem nova, o canal da v2 sobrevive ao LRU de 50', () => {
  const channelScripts = new KotlinLru(50)

  // Startup: `scripts:loaded` sem canal.
  indexScripts(channelScripts, buildPayload(undefined, 'gist-first'))
  // Abertura do canal: `scripts:loaded` com o canal.
  indexScripts(channelScripts, buildPayload(V2_CHANNEL, 'gist-first'))

  const scripts = channelScripts.peek(V2_CHANNEL)
  assert.ok(scripts, 'o canal da v2 foi expulso do LRU')
  assert.ok(scripts.includes(PLAYER_ID), 'o player simples nao foi indexado')
  assert.ok(scripts.includes(VIP_ID), 'o banner nao foi indexado')
})

test('com a ordem antiga, o canal da v2 era expulso (o bug)', () => {
  const channelScripts = new KotlinLru(50)

  indexScripts(channelScripts, buildPayload(undefined, 'v2-first'))
  indexScripts(channelScripts, buildPayload(V2_CHANNEL, 'v2-first'))

  const scripts = channelScripts.peek(V2_CHANNEL)
  assert.equal(
    scripts,
    undefined,
    'a ordem antiga expulsa o canal - e o player simples nunca era injetado',
  )
})

test('o player simples sobrevive a varias aberturas de canal', () => {
  const channelScripts = new KotlinLru(50)

  indexScripts(channelScripts, buildPayload(undefined, 'gist-first'))
  for (let i = 0; i < 5; i++) {
    indexScripts(channelScripts, buildPayload(`${i}-canal`, 'gist-first'))
  }

  // O ultimo canal aberto e o que esta ativo no Kotlin.
  const scripts = channelScripts.peek('4-canal')
  assert.ok(scripts, 'o ultimo canal aberto foi expulso')
  assert.ok(scripts.includes(PLAYER_ID))
})
