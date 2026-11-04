/**
 * Testes do catalogo de scripts (frontend-v2/src/lib/scripts.ts).
 *
 * O Kotlin indexa os scripts por canal/URL/dominio e injeta os que
 * casam com a pagina do canal. O filtro por dominio e URL e o mesmo da
 * v1 (`ScriptManager.getScriptsForUrl`).
 *
 * Run: node --test frontend-v2/tests/scripts.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/scripts')

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      resolve(V2_ROOT, 'src/lib/scripts.ts'),
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

  return import(pathToFileURL(resolve(OUT_DIR, 'scripts.js')).href)
}

const { domainOf, normalizeScripts, scriptsForUrl, toBridgeScripts } = await loadModule()

/* ------------------------------------------------------------------ *
 * domainOf
 * ------------------------------------------------------------------ */

test('domainOf extrai o host sem o www', () => {
  assert.equal(domainOf('https://embedcanaisdetv.xyz/e/index.php?canal=x'), 'embedcanaisdetv.xyz')
  assert.equal(domainOf('https://www.exemplo.com/a'), 'exemplo.com')
})

test('domainOf devolve string vazia para URL invalida', () => {
  assert.equal(domainOf('nao-e-url'), '')
  assert.equal(domainOf(''), '')
})

/* ------------------------------------------------------------------ *
 * normalizeScripts
 * ------------------------------------------------------------------ */

test('normalizeScripts mantem os scripts validos', () => {
  const out = normalizeScripts([
    {
      id: 'webtv-player-1',
      name: 'EmbedDeCanais Player Simples',
      code: 'console.log(1)',
      domains: ['embedcanaisdetv.xyz', 'playerembcanais.com'],
      urls: ['https://embedcanaisdetv.xyz/e/index.php?canal=globosp'],
      channelIds: ['1', '2'],
    },
  ])

  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'webtv-player-1')
  assert.equal(out[0].domains.length, 2)
  assert.deepEqual(out[0].channelIds, ['1', '2'])
})

test('normalizeScripts garante listas vazias (o Kotlin le com getJSONArray)', () => {
  const out = normalizeScripts([{ name: 'x', code: 'y' }])

  assert.equal(out.length, 1)
  assert.deepEqual(out[0].domains, [])
  assert.deepEqual(out[0].urls, [])
  assert.equal(out[0].channelIds, undefined)
  // O id precisa existir: o Kotlin usa como chave de deduplicacao.
  assert.equal(typeof out[0].id, 'string')
})

test('normalizeScripts descarta o que nao tem codigo', () => {
  assert.equal(normalizeScripts([{ name: 'sem codigo' }]).length, 0)
  assert.equal(normalizeScripts([null, 'texto', 42]).length, 0)
  assert.equal(normalizeScripts(null).length, 0)
  assert.equal(normalizeScripts('nao e array').length, 0)
})

/* ------------------------------------------------------------------ *
 * scriptsForUrl
 * ------------------------------------------------------------------ */

const scripts = [
  {
    id: 's1',
    name: 'EmbedDeCanais',
    code: 'a',
    domains: ['embedcanaisdetv.xyz', 'playerembcanais.com'],
    urls: [],
  },
  {
    id: 's2',
    name: 'EmbedHUB',
    code: 'b',
    domains: ['embehub.site'],
    urls: [],
  },
  {
    id: 's3',
    name: 'GloboPlay',
    code: 'c',
    domains: [],
    urls: ['https://globo.com/live/1'],
  },
]

test('scriptsForUrl casa pelo dominio', () => {
  const found = scriptsForUrl(scripts, 'https://embedcanaisdetv.xyz/e/index.php?canal=globosp/')
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 's1')
})

test('scriptsForUrl casa pela URL exata', () => {
  const found = scriptsForUrl(scripts, 'https://globo.com/live/1')
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 's3')
})

test('scriptsForUrl nao casa com dominio diferente', () => {
  const found = scriptsForUrl(scripts, 'https://outrosite.com/x')
  assert.equal(found.length, 0)
})

test('scriptsForUrl nao casa por substring (o dominio precisa ser exato)', () => {
  // "embedcanaisdetv.xyz.evil.com" nao deve casar com o dominio do script.
  const found = scriptsForUrl(scripts, 'https://embedcanaisdetv.xyz.evil.com/x')
  assert.equal(found.length, 0)
})

test('scriptsForUrl com URL vazia devolve lista vazia', () => {
  assert.equal(scriptsForUrl(scripts, '').length, 0)
})

/* ------------------------------------------------------------------ *
 * toBridgeScripts
 * ------------------------------------------------------------------ */

test('toBridgeScripts gera o formato que o Kotlin indexa', () => {
  const out = toBridgeScripts(scripts)

  assert.equal(out.length, 3)
  assert.equal(out[0].id, 's1')
  assert.equal(out[0].name, 'EmbedDeCanais')
  assert.equal(out[0].code, 'a')
  assert.ok(Array.isArray(out[0].domains))
  assert.ok(Array.isArray(out[0].urls))
  // O Kotlin le `channelIds` com optJSONArray: pode faltar.
  assert.equal(out[0].channelIds, undefined)
})
