/**
 * Testes do script de injecao "player simples" (EmbedDeCanais).
 *
 * Verificam quatro coisas:
 *
 * 1. **O codigo evoluiu do script da v1.** O miolo (descoberta da URL,
 *    Hls.js, contrato `window.WebTV.player`) continua o mesmo de
 *    `frontend/docs/scripts/embedcanais-simple-player.js`, mas a v2 tem
 *    mudancas proprias: sem selo "LIVE", sem controles nativos e com a
 *    faixa de informacoes do canal (nome, logo e hora) no OK.
 *
 * 2. **O codigo sobrevive a escaping do Kotlin.** O `injectChannelScripts`
 *    embute o codigo numa string JS de aspas simples:
 *
 *    ```kotlin
 *    val escapedCode = code.replace("\\", "\\\\")
 *                          .replace("'", "\\'")
 *                          .replace("\n", "\\n")
 *                          .replace("\r", "")
 *    var s = document.createElement('script');
 *    s.textContent = '$escapedCode';
 *    ```
 *
 * 3. **O script nao depende de host.** O player roda em subdominio
 *    rotativo (`2910.` -> `4477.`...), entao o script nao pode
 *    depender do host - ele age pelo `window.vipPlayer` e pelo DOM.
 *
 * 4. **O script passa no validador do admin**: sem `eval`, sem
 *    `new Function`, sem chaves desbalanceadas.
 *
 * Run: node --test frontend-v2/tests/simplePlayerScript.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const V2_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/simplePlayerScript')

/** O arquivo-fonte do script (copiado da v1). */
const SOURCE_FILE = resolve(V2_ROOT, 'src/lib/embedcanais-simple-player.js')

/** O original da v1, para comparar. */
const V1_FILE = resolve(REPO_ROOT, 'frontend/docs/scripts/embedcanais-simple-player.js')

/**
 * Compila o modulo TS e importa o JS gerado.
 *
 * O `?raw` do Vite nao existe no `tsc` puro, entao o import e
 * reescrito para um modulo que expoe o texto do arquivo.
 */
async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const shim = resolve(OUT_DIR, 'rawShim.js')
  writeFileSync(
    shim,
    `export default ${JSON.stringify(readFileSync(SOURCE_FILE, 'utf8'))}\n`,
    'utf8',
  )
  // O TS strict exige a declaracao do modulo importado.
  writeFileSync(
    resolve(OUT_DIR, 'rawShim.d.ts'),
    'declare const codigo: string\nexport default codigo\n',
    'utf8',
  )

  // Copia o TS trocando o import `?raw` pelo shim.
  const src = readFileSync(resolve(V2_ROOT, 'src/lib/simplePlayerScript.ts'), 'utf8')
  const patched = src.replace(
    "import SIMPLE_PLAYER_SOURCE from './embedcanais-simple-player.js?raw'",
    "import SIMPLE_PLAYER_SOURCE from './rawShim.js'",
  )
  const patchedFile = resolve(OUT_DIR, 'simplePlayerScript.ts')
  writeFileSync(patchedFile, patched, 'utf8')

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      patchedFile,
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

  return import(pathToFileURL(resolve(OUT_DIR, 'simplePlayerScript.js')).href)
}

const mod = await loadModule()
const {
  SIMPLE_PLAYER_SCRIPT_ID,
  SIMPLE_PLAYER_SCRIPT_NAME,
  SIMPLE_PLAYER_SCRIPT_DOMAINS,
  SIMPLE_PLAYER_SCRIPT_CODE,
  simplePlayerScript,
} = mod

/* ------------------------------------------------------------------ *
 * Identidade do script
 * ------------------------------------------------------------------ */

test('o script tem id e nome estaveis (o Kotlin deduplica pelo id)', () => {
  assert.equal(typeof SIMPLE_PLAYER_SCRIPT_ID, 'string')
  assert.ok(SIMPLE_PLAYER_SCRIPT_ID.length > 0)
  assert.equal(typeof SIMPLE_PLAYER_SCRIPT_NAME, 'string')
  assert.ok(SIMPLE_PLAYER_SCRIPT_NAME.length > 0)
})

/* ------------------------------------------------------------------ *
 * O codigo e o da v1, intacto
 * ------------------------------------------------------------------ */

test('o script da v2 evoluiu do original da v1 (miolo compartilhado)', () => {
  const v1 = readFileSync(V1_FILE, 'utf8')
  const marcadores = [
    '__webtv_embedcanais_simple',
    'vipPlayer.options.source',
    'hls.loadSource',
    'window.WebTV.player',
  ]

  for (const marcador of marcadores) {
    assert.ok(v1.includes(marcador), `a v1 perdeu o marcador ${marcador}`)
    assert.ok(
      SIMPLE_PLAYER_SCRIPT_CODE.includes(marcador),
      `a v2 perdeu o marcador ${marcador}`,
    )
  }

  assert.notEqual(
    SIMPLE_PLAYER_SCRIPT_CODE,
    v1,
    'a v2 tem a faixa de informacoes propria e nao e mais copia literal',
  )
})

test('o script nao esta vazio e tem o IIFE', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.length > 10000)
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('__webtv_embedcanais_simple'))
})

/* ------------------------------------------------------------------ *
 * Dominios: sem subdominio rotativo
 * ------------------------------------------------------------------ */

test('os dominios nao include subdominio numerico (ele rotaciona)', () => {
  const comRotativo = SIMPLE_PLAYER_SCRIPT_DOMAINS.filter(d => /^\d+\./.test(d))
  assert.deepEqual(comRotativo, [], 'nao deve hardcodar subdominio rotativo')
})

test('os dominios incluem o host estavel do catalogo', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_DOMAINS.includes('embedcanaisdetv.xyz'))
})

test('os dominios incluem o dominio pai do player', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_DOMAINS.includes('playerembcanais.com'))
})

/* ------------------------------------------------------------------ *
 * Formato do bridge
 * ------------------------------------------------------------------ */

test('simplePlayerScript sem canais: so indexado por dominio', () => {
  const s = simplePlayerScript()

  assert.equal(s.id, SIMPLE_PLAYER_SCRIPT_ID)
  assert.equal(s.name, SIMPLE_PLAYER_SCRIPT_NAME)
  assert.equal(s.code, SIMPLE_PLAYER_SCRIPT_CODE)
  assert.deepEqual(s.urls, [])
  // Sem channelIds o Kotlin so indexa por dominio.
  assert.equal(s.channelIds, undefined)
})

test('simplePlayerScript com canais: indexado por canal (o caminho rotation-proof)', () => {
  const s = simplePlayerScript({ channelIds: ['1-amazonprimevideo'] })

  assert.deepEqual(s.channelIds, ['1-amazonprimevideo'])
  // O canal e o que garante a injecao no host rotativo.
  assert.ok(s.channelIds.length > 0)
})

test('simplePlayerScript sem canal: entrega o codigo base intacto', () => {
  assert.equal(simplePlayerScript().code, SIMPLE_PLAYER_SCRIPT_CODE)
  assert.equal(simplePlayerScript({ channel: {} }).code, SIMPLE_PLAYER_SCRIPT_CODE)
})

test('simplePlayerScript embute nome e logo do canal na faixa', () => {
  const image = 'https://1.embedcanaisdetv.com/images/globo.webp'
  const s = simplePlayerScript({
    channelIds: ['104-globodf'],
    channel: { name: 'Globo DF', image },
  })

  const prefix = 'window.__webtv_channel_info = '
  assert.ok(s.code.startsWith(prefix), 'o prefixo do canal precisa vir primeiro')
  const end = s.code.indexOf(';\n')
  assert.ok(end > prefix.length)
  assert.deepEqual(JSON.parse(s.code.slice(prefix.length, end)), {
    name: 'Globo DF',
    image,
  })
  assert.ok(s.code.endsWith(SIMPLE_PLAYER_SCRIPT_CODE), 'o corpo base vem depois')
})

test('o prefixo do canal sobrevive ao escaping do Kotlin', () => {
  const code = simplePlayerScript({
    channel: {
      name: "Canal d'Avila <HD>",
      image: 'https://exemplo.test/logo.png?a=1&b=2',
    },
  }).code

  const finalCode = eval(kotlinEmbed(code)) // eslint-disable-line no-eval
  assert.equal(finalCode, code, 'o round-trip deve preservar o prefixo')
  assert.ok(!code.includes('</script>'), 'nao deve conter fechamento de script')
})

test('simplePlayerScript sem dominios: nao ocupa espaco no LRU de dominios', () => {
  // O `storeDomainScript` do Kotlin ACRECENTA a uma lista (sem
  // deduplicar). Indexar o mesmo script em varios dominios desperdica
  // espaco do LRU de 50.
  const s = simplePlayerScript({ channelIds: ['1-amazonprimevideo'] })

  assert.equal(s.domains, undefined)
})

test('simplePlayerScript com dominios: indexa so pelos dominios informados', () => {
  const s = simplePlayerScript({ domains: ['embedcanaisdetv.xyz'] })

  assert.deepEqual(s.domains, ['embedcanaisdetv.xyz'])
  assert.equal(s.channelIds, undefined)
})

test('simplePlayerScript nao compartilha os arrays (mutacao segura)', () => {
  const domains = ['embedcanaisdetv.xyz']
  const a = simplePlayerScript({ domains })
  const b = simplePlayerScript({ domains })

  a.domains.push('invasor.test')
  assert.ok(!b.domains.includes('invasor.test'))
  // E nao altera o array de entrada.
  assert.deepEqual(domains, ['embedcanaisdetv.xyz'])
})

/* ------------------------------------------------------------------ *
 * O codigo sobrevive ao escaping do Kotlin
 * ------------------------------------------------------------------ */

/**
 * Reproduz o escaping exato do `injectChannelScripts`:
 *
 * ```kotlin
 * code.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
 * ```
 */
function kotlinEscape(code) {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

/** Reproduz a string JS que o Kotlin monta: `'$escapedCode'`. */
function kotlinEmbed(code) {
  return "'" + kotlinEscape(code) + "'"
}

test('o codigo nao contem crase nem interpolacao (quebrariam a string do Kotlin)', () => {
  // O Kotlin embute em aspas SIMPLES: uma aspa dupla no codigo e
  // inofensiva, mas uma aspa simples precisa de escape (e o Kotlin
  // faz isso). O perigo real e o crase e o ${}.
  assert.ok(!SIMPLE_PLAYER_SCRIPT_CODE.includes('`'), 'nao deve ter crase')
  assert.ok(!SIMPLE_PLAYER_SCRIPT_CODE.includes('${'), 'nao deve ter interpolacao')
})

test('o codigo escapado pelo Kotlin continua sendo JS valido', () => {
  const embedded = kotlinEmbed(SIMPLE_PLAYER_SCRIPT_CODE)

  // O Kotlin faz: s.textContent = <embedded>
  // Reconstroi o valor final da string como o JS faria.
  const finalCode = eval(embedded) // eslint-disable-line no-eval
  assert.equal(finalCode, SIMPLE_PLAYER_SCRIPT_CODE, 'o round-trip deve preservar')
})

test('o codigo escapado pelo Kotlin passa no node --check', () => {
  const finalCode = eval(kotlinEmbed(SIMPLE_PLAYER_SCRIPT_CODE)) // eslint-disable-line no-eval
  const tmp = resolve(V2_ROOT, 'scratch-simple-player-escaped.js')

  writeFileSync(tmp, finalCode, 'utf8')
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
  } finally {
    rmSync(tmp, { force: true })
  }
})

/* ------------------------------------------------------------------ *
 * O validador do admin
 * ------------------------------------------------------------------ */

test('o codigo nao usa eval nem new Function (proibido pelo validador)', () => {
  assert.ok(!/\beval\s*\(/.test(SIMPLE_PLAYER_SCRIPT_CODE), 'nao deve usar eval')
  assert.ok(
    !/new\s+Function\s*\(/.test(SIMPLE_PLAYER_SCRIPT_CODE),
    'nao deve usar new Function',
  )
})

test('o codigo tem as chaves balanceadas', () => {
  // O validador do admin rejeita scripts com chaves desbalanceadas.
  const code = SIMPLE_PLAYER_SCRIPT_CODE
  // Ignora strings, comentarios e regex: conta so o que importa pro
  // validador (que faz a mesma conta ingenua).
  const abre = (code.match(/\{/g) || []).length
  const fecha = (code.match(/\}/g) || []).length
  assert.equal(abre, fecha, `chaves desbalanceadas: ${abre} abre / ${fecha} fecha`)
})

/* ------------------------------------------------------------------ *
 * O script realmente troca o player
 * ------------------------------------------------------------------ */

test('o script e idempotente (nao roda duas vezes)', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('__webtv_embedcanais_simple'))
  // O early return precisa acontecer ANTES de qualquer efeito.
  const idxFlag = SIMPLE_PLAYER_SCRIPT_CODE.indexOf('__webtv_embedcanais_simple')
  const idxDoc = SIMPLE_PLAYER_SCRIPT_CODE.indexOf('document.documentElement.innerHTML')
  assert.ok(idxFlag >= 0 && idxDoc > idxFlag, 'a flag vem antes do efeito')
})

test('o script substitui o DOM por um <video> unico', () => {
  // O player pesado (Clappr + P2P) e trocado por um <video> so.
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('document.documentElement.innerHTML'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('webtv-player-video'))
})

test('o script nao mostra o selo LIVE nem os controles nativos', () => {
  assert.ok(!SIMPLE_PLAYER_SCRIPT_CODE.includes('webtv-status'))
  assert.ok(!SIMPLE_PLAYER_SCRIPT_CODE.includes('setStatus('))
  assert.ok(
    !/<video[^>]*\bcontrols\b/.test(SIMPLE_PLAYER_SCRIPT_CODE),
    'o <video> nao pode ter o atributo controls',
  )
})

test('o script monta a faixa de informacoes do canal', () => {
  for (const id of [
    'webtv-info',
    'webtv-info-logo',
    'webtv-info-name',
    'webtv-info-time',
  ]) {
    assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes(id), `faltou ${id}`)
  }
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('__webtv_channel_info'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('formatClock'))
})

test('o OK/Enter abre a faixa e nao alterna play/pause', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('var KEY_INFO = [13, 23, 66]'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('var KEY_PLAY_PAUSE = [32, 179, 415]'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('toggleInfo()'))
})

test('o script usa Hls.js (o player minimo)', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('hls.js'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('hls.loadSource'))
})

test('o script descobre a URL do manifesto pelo player (sem interceptar XHR)', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('vipPlayer'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('vipCdnHost'))
})

test('o script mantem o contrato window.WebTV.player (o app depende dele)', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('window.WebTV.player'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('getStatus'))
})

test('o script remove o banner VIP e os HUDs', () => {
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('vipModal'))
  assert.ok(SIMPLE_PLAYER_SCRIPT_CODE.includes('p2pHud'))
})

test('o script nao depende do host do player', () => {
  // Os hosts aparecem so em COMENTARIOS (documentacao). O que nao pode
  // aparecer e no CODIGO - o script age pelo `window.vipPlayer` e pelo
  // DOM, e por isso funciona em qualquer instancia rotativa.
  const codigo = SIMPLE_PLAYER_SCRIPT_CODE
    .split('\n')
    .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n')

  assert.ok(!/playerembcanais\.com/.test(codigo), 'nao deve citar o host no codigo')
  assert.ok(!/embedcanaisdetv\.xyz/.test(codigo), 'nao deve citar o host no codigo')
  assert.ok(!/\b2910\b/.test(codigo), 'nao deve hardcodar subdominio numerico')
  assert.ok(!/\b4477\b/.test(codigo), 'nao deve hardcodar subdominio numerico')
})
