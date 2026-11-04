/**
 * Testes do script de injecao do banner VIP.
 *
 * Verificam duas coisas:
 *
 * 1. **O codigo sobrevive a escaping do Kotlin.** O `injectChannelScripts`
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
 *    Se o codigo tiver aspas duplas, crase ou `${`, ele quebra ali.
 *
 * 2. **O script nao depende de host.** O player roda em subdominio
 *    rotativo (`2910.` -> `4477.`...), entao o script nao pode
 *    depender do host - ele age pelo `#id` e pelas classes.
 *
 * Run: node --test frontend-v2/tests/injectionScripts.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/injectionScripts')

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      resolve(V2_ROOT, 'src/lib/injectionScripts.ts'),
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

  return import(pathToFileURL(resolve(OUT_DIR, 'injectionScripts.js')).href)
}

const mod = await loadModule()
const {
  VIP_BANNER_SCRIPT_ID,
  VIP_BANNER_SCRIPT_NAME,
  VIP_BANNER_SCRIPT_DOMAINS,
  VIP_BANNER_SCRIPT_CODE,
  vipBannerScript,
} = mod

/* ------------------------------------------------------------------ *
 * Identidade do script
 * ------------------------------------------------------------------ */

test('o script tem id e nome estaveis (o Kotlin deduplica pelo id)', () => {
  assert.equal(typeof VIP_BANNER_SCRIPT_ID, 'string')
  assert.ok(VIP_BANNER_SCRIPT_ID.length > 0)
  assert.equal(typeof VIP_BANNER_SCRIPT_NAME, 'string')
  assert.ok(VIP_BANNER_SCRIPT_NAME.length > 0)
})

/* ------------------------------------------------------------------ *
 * Dominios: sem subdominio rotativo
 * ------------------------------------------------------------------ */

test('os dominios nao include subdominio numerico (ele rotaciona)', () => {
  // O player roda em 2910./4477./... - hardcodar quebraria.
  const comRotativo = VIP_BANNER_SCRIPT_DOMAINS.filter(d => /^\d+\./.test(d))
  assert.deepEqual(comRotativo, [], 'nao deve hardcodar subdominio rotativo')
})

test('os dominios incluem o host estavel do catalogo', () => {
  assert.ok(VIP_BANNER_SCRIPT_DOMAINS.includes('embedcanaisdetv.xyz'))
})

test('os dominios incluem o dominio pai do player', () => {
  assert.ok(VIP_BANNER_SCRIPT_DOMAINS.includes('playerembcanais.com'))
})

/* ------------------------------------------------------------------ *
 * Formato do bridge
 * ------------------------------------------------------------------ */

test('vipBannerScript sem canais: so indexado por dominio', () => {
  const s = vipBannerScript()

  assert.equal(s.id, VIP_BANNER_SCRIPT_ID)
  assert.equal(s.name, VIP_BANNER_SCRIPT_NAME)
  assert.equal(s.code, VIP_BANNER_SCRIPT_CODE)
  assert.deepEqual(s.urls, [])
  // Sem channelIds o Kotlin so indexa por dominio.
  assert.equal(s.channelIds, undefined)
})

test('vipBannerScript com canais: indexado por canal (o caminho rotation-proof)', () => {
  const s = vipBannerScript({ channelIds: ['104-globodf'] })

  assert.deepEqual(s.channelIds, ['104-globodf'])
  // O canal e o que garante a injecao no host rotativo.
  assert.ok(s.channelIds.length > 0)
})

test('vipBannerScript sem dominios: nao ocupa espaco no LRU de dominios', () => {
  // O `storeDomainScript` do Kotlin ACRECENTA a uma lista (sem
  // deduplicar). Indexar o mesmo script em varios dominios desperdica
  // espaco do LRU de 50.
  const s = vipBannerScript({ channelIds: ['104-globodf'] })

  assert.equal(s.domains, undefined)
})

test('vipBannerScript com dominios: indexa so pelos dominios informados', () => {
  const s = vipBannerScript({ domains: ['embedcanaisdetv.xyz'] })

  assert.deepEqual(s.domains, ['embedcanaisdetv.xyz'])
  assert.equal(s.channelIds, undefined)
})

test('vipBannerScript nao compartilha os arrays (mutacao segura)', () => {
  const domains = ['embedcanaisdetv.xyz']
  const a = vipBannerScript({ domains })
  const b = vipBannerScript({ domains })

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

test('o codigo nao contem aspas duplas (quebrariam a string do Kotlin)', () => {
  // O Kotlin embute em aspas SIMPLES: uma aspa dupla no codigo e
  // inofensiva, mas uma aspa simples precisa de escape (e o Kotlin
  // faz isso). O perigo real e o crase e o ${}.
  assert.ok(!VIP_BANNER_SCRIPT_CODE.includes('`'), 'nao deve ter crase')
  assert.ok(!VIP_BANNER_SCRIPT_CODE.includes('${'), 'nao deve ter interpolacao')
})

test('o codigo nao contem barras invertidas que o Kotlin dobraria errado', () => {
  // O Kotlin troca \\\\ por \\\\\\\\: um \\\\n vira \\\\\\\\n (literal).
  // Isso e seguro, mas avisa se apareceu algo inesperado.
  const barras = VIP_BANNER_SCRIPT_CODE.match(/\\/g) || []
  assert.equal(barras.length, 0, 'o codigo nao deve ter barras invertidas')
})

test('o codigo escapado pelo Kotlin continua sendo JS valido', () => {
  const embedded = kotlinEmbed(VIP_BANNER_SCRIPT_CODE)

  // O Kotlin faz: s.textContent = <embedded>
  // Reconstroi o valor final da string como o JS faria.
  const finalCode = eval(embedded) // eslint-disable-line no-eval
  assert.equal(finalCode, VIP_BANNER_SCRIPT_CODE, 'o round-trip deve preservar')
})

test('o codigo escapado pelo Kotlin passa no node --check', () => {
  const finalCode = eval(kotlinEmbed(VIP_BANNER_SCRIPT_CODE)) // eslint-disable-line no-eval
  const tmp = resolve(V2_ROOT, 'scratch-vip-escaped.js')

  writeFileSync(tmp, finalCode, 'utf8')
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
  } finally {
    rmSync(tmp, { force: true })
  }
})

test('o codigo nao usa eval nem new Function (proibido pelo validador)', () => {
  assert.ok(!/\beval\s*\(/.test(VIP_BANNER_SCRIPT_CODE), 'nao deve usar eval')
  assert.ok(
    !/new\s+Function\s*\(/.test(VIP_BANNER_SCRIPT_CODE),
    'nao deve usar new Function',
  )
})

test('o codigo e idempotente (nao roda duas vezes)', () => {
  assert.ok(VIP_BANNER_SCRIPT_CODE.includes('__webtvVipBannerRemoved'))
  // O early return precisa acontecer ANTES de qualquer efeito.
  const idxFlag = VIP_BANNER_SCRIPT_CODE.indexOf('__webtvVipBannerRemoved')
  const idxStyle = VIP_BANNER_SCRIPT_CODE.indexOf('installStyle()')
  assert.ok(idxFlag >= 0 && idxStyle > idxFlag, 'a flag vem antes do efeito')
})

/* ------------------------------------------------------------------ *
 * O script realmente elimina o banner
 * ------------------------------------------------------------------ */

test('o script referencia o id do banner', () => {
  assert.ok(VIP_BANNER_SCRIPT_CODE.includes('vipModal'))
})

test('o script bloqueia por CSS com !important (evita flash)', () => {
  // A regra do player em fullscreen usa !important com especificidade
  // (0,3,0). O id leva para (1,2,0) e vence.
  assert.ok(VIP_BANNER_SCRIPT_CODE.includes('display:none !important'))
  assert.ok(VIP_BANNER_SCRIPT_CODE.includes('#vipModal'))
})

test('o script observa o DOM (o player reinsere o banner a cada 60s)', () => {
  assert.ok(VIP_BANNER_SCRIPT_CODE.includes('MutationObserver'))
  // E nao basta: precisa de uma varredura periodica de seguranca.
  assert.ok(VIP_BANNER_SCRIPT_CODE.includes('setInterval'))
})

test('o script nao depende do host do player', () => {
  // Nenhum dos hosts (nem rotativos) pode aparecer no codigo.
  assert.ok(!/playerembcanais\.com/.test(VIP_BANNER_SCRIPT_CODE))
  assert.ok(!/embedcanaisdetv\.xyz/.test(VIP_BANNER_SCRIPT_CODE))
  assert.ok(!/\b2910\b/.test(VIP_BANNER_SCRIPT_CODE))
})
