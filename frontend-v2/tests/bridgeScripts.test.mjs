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

test('emitScriptsLoaded NAO usa unshift (o script do canal ficaria antes do gist)', () => {
  // O `unshift` colocaria o script do canal ANTES do gist no payload. O
  // Kotlin indexa na ordem do payload, entao a chave do canal entraria
  // primeiro no LRU de 50 - e o gist (70 channelIds) a expulsaria.
  const body = emitScriptsLoadedBody()

  assert.ok(
    !/unshift\(/.test(body),
    'nao pode usar unshift: o canal precisa ser indexado depois do gist',
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

test('emitScriptsLoaded repassa nome e logo do canal para a faixa', () => {
  const body = emitScriptsLoadedBody()

  assert.ok(
    body.includes('channel,'),
    'o player simples precisa receber os dados do canal',
  )

  const start = SOURCE.indexOf('const openChannel = useCallback(')
  assert.ok(start > 0, 'nao encontrei openChannel')
  const end = SOURCE.indexOf('setActive({ channel, key, type, url })', start)
  assert.ok(end > start, 'nao encontrei o fim de openChannel')

  const openBody = SOURCE.slice(start, end)
  assert.ok(
    openBody.includes(
      'emitScriptsLoaded(key, { name: channel.name, image: channel.image })',
    ),
    'a abertura do canal precisa entregar nome e logo',
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

test('um script da v2 antes do gist faz o BANNER ser expulso', () => {
  // O `channelScripts` do Kotlin guarda uma LISTA por canal. O que
  // importa e a POSICAO da CHAVE do canal no LRU, nao a do script.
  //
  // Se o banner fosse indexado antes do gist (com `unshift`), a chave do
  // canal entraria primeiro no LRU de 50 - e o gist (70 channelIds) a
  // expulsaria. O banner (e o player simples) ficariam sem injetar.
  const channelScripts = new KotlinLru(50)

  const vip = { id: VIP_ID, channelIds: [V2_CHANNEL] }
  const simple = { id: PLAYER_ID, channelIds: [V2_CHANNEL] }

  // Banner na frente (o que o `unshift` faria), player simples atras.
  indexScripts(channelScripts, [vip, ...GIST, simple])

  const scripts = channelScripts.peek(V2_CHANNEL)
  assert.ok(scripts, 'o canal esta no LRU')
  assert.ok(
    !scripts.includes(VIP_ID),
    'com o banner indexado antes do gist, ele seria expulso do LRU',
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

/* ------------------------------------------------------------------ *
 * A corrida: o gist resolvendo DEPOIS do clique no canal
 * ------------------------------------------------------------------ */

test('openChannel guarda o canal aberto para a reemissao tardia', () => {
  const start = SOURCE.indexOf('const openChannel = useCallback(')
  assert.ok(start > 0, 'nao encontrei openChannel')
  const end = SOURCE.indexOf('setActive({ channel, key, type, url })', start)
  assert.ok(end > start, 'nao encontrei o fim de openChannel')

  const body = SOURCE.slice(start, end)
  assert.ok(
    body.includes('openedChannelRef.current = {'),
    'o canal aberto precisa ser guardado antes do gist resolver',
  )
  assert.ok(body.includes('name: channel.name'), 'o nome precisa ser guardado')
  assert.ok(body.includes('image: channel.image'), 'o logo precisa ser guardado')
})

test('se o gist resolver depois do clique, o canal e reindexado por ultimo', () => {
  const start = SOURCE.indexOf('void fetchScripts().then(scripts => {')
  assert.ok(start > 0, 'nao encontrei o fetchScripts')
  const end = SOURCE.indexOf('\n    })', start)
  assert.ok(end > start, 'nao encontrei o fim do fetchScripts')

  const body = SOURCE.slice(start, end)

  // O gist precisa virar o `scriptsRef` ANTES da reemissao: e a
  // reemissao que reindexa o canal aberto depois dos 70 channelIds.
  const iAssign = body.indexOf('scriptsRef.current = scripts')
  const iReemit = body.indexOf('emitScriptsLoaded(opened.key')
  assert.ok(iAssign > 0, 'o gist precisa ser guardado')
  assert.ok(iReemit > iAssign, 'o canal precisa ser reindexado depois do gist')
  assert.ok(
    body.includes('emitScriptsLoaded(opened.key, { name: opened.name, image: opened.image })'),
    'a reemissao precisa manter nome e logo da faixa',
  )
})

test('sem a reemissao tardia, o gist que resolve depois expulsa o canal', () => {
  const channelScripts = new KotlinLru(50)

  // Clique no canal antes do gist resolver: so o canal e indexado.
  indexScripts(channelScripts, buildPayload(V2_CHANNEL, 'gist-first'))
  assert.ok(channelScripts.peek(V2_CHANNEL), 'o canal foi indexado no clique')

  // O gist resolve atrasado: os 70 channelIds enchem o LRU de 50.
  indexScripts(channelScripts, buildPayload(undefined, 'gist-first'))
  assert.equal(
    channelScripts.peek(V2_CHANNEL),
    undefined,
    'e a corrida que expulsava o canal (o bug)',
  )
})

test('com a reemissao tardia, o canal sobrevive ao LRU de 50', () => {
  const channelScripts = new KotlinLru(50)

  indexScripts(channelScripts, buildPayload(V2_CHANNEL, 'gist-first'))
  indexScripts(channelScripts, buildPayload(undefined, 'gist-first'))
  // O fix: reemite `scripts:loaded` com o canal aberto por ultimo.
  indexScripts(channelScripts, buildPayload(V2_CHANNEL, 'gist-first'))

  const scripts = channelScripts.peek(V2_CHANNEL)
  assert.ok(scripts, 'a reemissao tardia precisa salvar o canal')
  assert.ok(scripts.includes(PLAYER_ID), 'o player simples nao foi indexado')
  assert.ok(scripts.includes(VIP_ID), 'o banner nao foi indexado')
})

/* ------------------------------------------------------------------ *
 * O fechamento do canal
 * ------------------------------------------------------------------ */

/** Extrai o corpo da funcao `closeChannel`. */
function closeChannelBody() {
  const start = SOURCE.indexOf('const closeChannel = useCallback(')
  assert.ok(start > 0, 'nao encontrei closeChannel')
  const end = SOURCE.indexOf('}, [])', start)
  assert.ok(end > start, 'nao encontrei o fim de closeChannel')
  return SOURCE.slice(start, end)
}

test('closeChannel emite os eventos FORA do updater do setActive', () => {
  // O updater do `setActive` pode ser executado mais de uma vez pelo
  // React (StrictMode, render concorrente). Emitir o `player:closed`
  // de dentro dele faria o app fechar, recarregar a grade e fechar de
  // novo.
  const body = closeChannelBody()

  assert.ok(
    !/setActive\s*\(\s*current\s*=>/.test(body),
    'closeChannel nao pode usar um updater com efeito colateral',
  )
  assert.ok(
    body.includes('activeRef.current'),
    'o canal ativo vem de um ref (espelho do estado)',
  )
  assert.ok(
    body.includes('setActive(null)'),
    'o estado e limpo com setActive(null)',
  )
})

test('closeChannel usa o contrato de fechamento (emitCloseEvents)', () => {
  const body = closeChannelBody()

  assert.ok(
    body.includes('emitCloseEvents('),
    'os eventos precisam sair pelo modulo de contrato (lib/channelClose.ts)',
  )
  assert.ok(
    body.includes('channelId: current.key'),
    'o payload precisa do id do canal',
  )
  assert.ok(
    body.includes('channelName: current.channel.name'),
    'o payload precisa do nome do canal',
  )
})

test('closeChannel limpa a API do canal (activeId/activeName)', () => {
  // O Kotlin e o site leem `window.WebTV.channel.activeId`.
  const body = closeChannelBody()

  assert.ok(body.includes('api.activeId = null'))
  assert.ok(body.includes('api.activeName = null'))
})

test('closeChannel fecha so uma vez (o alreadyClosed trava o segundo)', () => {
  const body = closeChannelBody()

  assert.ok(
    body.includes('const alreadyClosed = closedRef.current'),
    'o fechamento precisa ler o flag antes de marcar',
  )
  assert.ok(
    body.includes('closedRef.current = true'),
    'o fechamento precisa marcar o canal como fechado',
  )
  assert.ok(
    body.includes('alreadyClosed,'),
    'o flag precisa ser repassado para o contrato',
  )
})

test('o listener de player:closed/channel:close nao emite nada', () => {
  // O Kotlin injeta o `player:closed` quando o canal fecha. Se o
  // listener re-emitisse, teriamos um laco
  // (`player:closed` -> Kotlin -> `player:closed` -> ...).
  const start = SOURCE.indexOf('const onClosed = (payload:')
  assert.ok(start > 0, 'nao encontrei onClosed')
  const end = SOURCE.indexOf('const offPlayer', start)
  assert.ok(end > start, 'nao encontrei o fim de onClosed')

  const body = SOURCE.slice(start, end)
  assert.ok(
    !body.includes('eventBus.emit('),
    'o listener so limpa o estado - nao pode emitir',
  )
  assert.ok(body.includes('activeRef.current = null'))
  assert.ok(body.includes('setActive(null)'))
})

test('openChannel arma o espelho do canal e libera o fechamento', () => {
  const start = SOURCE.indexOf('const openChannel = useCallback(')
  assert.ok(start > 0, 'nao encontrei openChannel')
  const end = SOURCE.indexOf('setActive({ channel, key, type, url })', start)
  assert.ok(end > start, 'nao encontrei o fim de openChannel')

  const body = SOURCE.slice(start, end)
  assert.ok(
    body.includes('activeRef.current = { channel, key, type, url }'),
    'o canal aberto precisa ser espelhado no ref',
  )
  assert.ok(
    body.includes('closedRef.current = false'),
    'um canal novo pode ser fechado de novo',
  )
})

test('o D-pad usa as teclas de Back da v1 (inclui Backspace)', () => {
  // O `Backspace` faltava: o D-pad antigo do Android TV mandava essa
  // tecla, e a v1 a tratava (`shouldCloseOnKeyDown.ts`).
  const dpad = readFileSync(resolve(V2_ROOT, 'src/components/DpadContext.tsx'), 'utf8')

  assert.ok(
    dpad.includes("import { isBackKey } from '../lib/channelClose.js'"),
    'o D-pad precisa usar o conjunto de teclas de Back',
  )
  assert.ok(
    dpad.includes('if (isBackKey(e.key))'),
    'o tratamento do Back precisa usar isBackKey',
  )
  assert.ok(
    !dpad.includes("e.key === 'BrowserBack'"),
    'a lista antiga (sem Backspace) nao pode ficar',
  )
})

test('o player simples recebe o id do canal (para fechar na pagina do canal)', () => {
  // Na pagina do canal nao existe `window.WebTV.channel.activeId` - o
  // id precisa viajar no script, senao o "Back" nao consegue fechar.
  const body = emitScriptsLoadedBody()

  assert.ok(
    body.includes('channel: channelId ? { id: channelId, ...channel } : channel'),
    'o player simples precisa receber o id do canal',
  )
})
