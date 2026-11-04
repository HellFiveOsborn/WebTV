/**
 * Testes da sessao de canal (frontend-v2/src/lib/channelSession.ts).
 *
 * Verificam o tipo do canal (o que o Kotlin le em `onChannelClicked`)
 * e a chave do canal (o `id` que o Kotlin usa para deduplicar).
 *
 * Run: node --test frontend-v2/tests/channelSession.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/channelSession')

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      resolve(V2_ROOT, 'src/lib/channelSession.ts'),
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

  return import(pathToFileURL(resolve(OUT_DIR, 'channelSession.js')).href)
}

const { iframeSrc, channelTypeOf, playerUrlOf, channelKeyOf } = await loadModule()

/** Um canal do catalogo, no formato do parser. */
function channel(overrides = {}) {
  return {
    id: 42,
    slug: 'globosp',
    name: 'Globo SP',
    category: 'Canais Abertos',
    href: 'https://embedcanaisdetv.xyz/e/index.php?canal=globosp/',
    image: 'https://example.com/globosp.png',
    iframe:
      '<iframe src="https://embedcanaisdetv.xyz/e/index.php?canal=globosp" allow="autoplay" frameborder="0"></iframe>',
    ...overrides,
  }
}

/* ------------------------------------------------------------------ *
 * iframeSrc
 * ------------------------------------------------------------------ */

test('iframeSrc extrai o src da tag iframe', () => {
  assert.equal(
    iframeSrc(
      '<iframe src="https://embedcanaisdetv.xyz/e/index.php?canal=globosp" allow="autoplay"></iframe>',
    ),
    'https://embedcanaisdetv.xyz/e/index.php?canal=globosp',
  )
})

test('iframeSrc aceita aspas simples', () => {
  assert.equal(
    iframeSrc("<iframe src='https://exemplo.com/a'></iframe>"),
    'https://exemplo.com/a',
  )
})

test('iframeSrc devolve string vazia sem src', () => {
  assert.equal(iframeSrc(''), '')
  assert.equal(iframeSrc('<iframe></iframe>'), '')
})

/* ------------------------------------------------------------------ *
 * channelTypeOf
 * ------------------------------------------------------------------ */

test('channelTypeOf: com href e redirect (o WebView navega)', () => {
  // A v2 nao tem player embutido: o card e um link e o Kotlin navega
  // o WebView. O tipo "redirect" e o que arma a injecao de scripts.
  assert.equal(channelTypeOf(channel()), 'redirect')
})

test('channelTypeOf: sem href, mas com iframe, e iframe', () => {
  assert.equal(channelTypeOf(channel({ href: '' })), 'iframe')
})

test('channelTypeOf: sem href e sem iframe, cai em redirect', () => {
  assert.equal(channelTypeOf(channel({ href: '', iframe: '' })), 'redirect')
})

/* ------------------------------------------------------------------ *
 * playerUrlOf
 * ------------------------------------------------------------------ */

test('playerUrlOf usa a href (a pagina do canal)', () => {
  assert.equal(
    playerUrlOf(channel()),
    'https://embedcanaisdetv.xyz/e/index.php?canal=globosp/',
  )
})

test('playerUrlOf cai no src do iframe quando nao ha href', () => {
  assert.equal(
    playerUrlOf(channel({ href: '' })),
    'https://embedcanaisdetv.xyz/e/index.php?canal=globosp',
  )
})

test('playerUrlOf devolve string vazia sem nenhum endereco', () => {
  assert.equal(playerUrlOf(channel({ href: '', iframe: '' })), '')
})

/* ------------------------------------------------------------------ *
 * channelKeyOf
 * ------------------------------------------------------------------ */

test('channelKeyOf monta a chave unica do canal', () => {
  assert.equal(channelKeyOf(channel()), '42-globosp')
})

test('channelKeyOf diferencia o slug repetido (tnt em duas categorias)', () => {
  const a = channel({ id: 69, slug: 'tnt', name: 'TNT' })
  const b = channel({ id: 97, slug: 'tnt', name: 'TNT' })

  assert.notEqual(channelKeyOf(a), channelKeyOf(b))
})
