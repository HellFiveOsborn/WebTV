/**
 * Testes do override da URL da API (frontend-v2/src/lib/apiUrl.ts).
 *
 * O override usa o storage unificado (IndexedDB). Em Node nao ha
 * IndexedDB, entao o teste desliga o IndexedDB e injeta um localStorage
 * fake - mesma abordagem dos demais modulos.
 *
 * Regra de ouro: a URL e usada EXATAMENTE como digitada. O app nao
 * completa nem ajusta o caminho.
 *
 * Run: node --test frontend-v2/tests/apiUrl.test.mjs
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
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/apiUrl')

/** Storage fake. */
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    failOnSet: false,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem(key, value) {
      if (this.failOnSet) throw new Error('quota exceeded')
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

/** Compila os modulos TS (apiUrl + storage) e importa os JS gerados. */
async function loadModules() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/apiUrl.ts'),
      resolve(V2_ROOT, 'src/lib/storage.ts'),
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--outDir',
      OUT_DIR,
    ],
    { cwd: REPO_ROOT, stdio: 'pipe' },
  )

  const apiUrlFile = resolve(OUT_DIR, 'apiUrl.js')
  const storageFile = resolve(OUT_DIR, 'storage.js')
  assert.ok(existsSync(apiUrlFile), `modulo compilado nao encontrado: ${apiUrlFile}`)
  assert.ok(existsSync(storageFile), `modulo compilado nao encontrado: ${storageFile}`)

  return {
    apiUrl: await import(pathToFileURL(apiUrlFile).href),
    storage: await import(pathToFileURL(storageFile).href),
  }
}

const { apiUrl: mod } = await loadModules()
const {
  NAMESPACE,
  CHANNELS_PATH,
  normalizeApiUrl,
  isValidApiUrl,
  resolveChannelsUrl,
  readApiUrl,
  writeApiUrl,
  clearApiUrl,
  pickApiUrl,
} = mod

/** Injeta o localStorage fake e desliga o IndexedDB. */
async function withStorage(storage, fn) {
  const originalIdb = globalThis.indexedDB
  const originalLs = globalThis.localStorage

  globalThis.indexedDB = undefined
  globalThis.localStorage = storage

  try {
    return await fn()
  } finally {
    globalThis.indexedDB = originalIdb
    globalThis.localStorage = originalLs
  }
}

/* ------------------------------------------------------------------ *
 * Normalizacao e validacao
 * ------------------------------------------------------------------ */

test('apiUrl: normalizeApiUrl recorta espacos e a barra final', () => {
  assert.equal(
    normalizeApiUrl('  https://api.exemplo.com/channels  '),
    'https://api.exemplo.com/channels',
  )
  assert.equal(normalizeApiUrl('https://api.exemplo.com/channels/'), 'https://api.exemplo.com/channels')
  assert.equal(normalizeApiUrl('https://api.exemplo.com/channels///'), 'https://api.exemplo.com/channels')
  assert.equal(normalizeApiUrl(''), '')
  assert.equal(normalizeApiUrl('   '), '')
})

test('apiUrl: isValidApiUrl aceita http(s) e caminho relativo', () => {
  assert.equal(isValidApiUrl('https://api.exemplo.com/channels'), true)
  assert.equal(isValidApiUrl('http://api.exemplo.com/channels'), true)
  assert.equal(isValidApiUrl('/api/channels'), true)
})

test('apiUrl: isValidApiUrl recusa o que nao serve', () => {
  assert.equal(isValidApiUrl(''), false)
  assert.equal(isValidApiUrl('   '), false)
  assert.equal(isValidApiUrl('api.exemplo.com/channels'), false)
  assert.equal(isValidApiUrl('ftp://api.exemplo.com/channels'), false)
  assert.equal(isValidApiUrl('javascript:alert(1)'), false)
})

/* ------------------------------------------------------------------ *
 * Base -> endpoint (/channels)
 * ------------------------------------------------------------------ */

test('apiUrl: a base vira o endpoint com /channels', () => {
  assert.equal(resolveChannelsUrl('https://api.exemplo.com'), 'https://api.exemplo.com/channels')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/'), 'https://api.exemplo.com/channels')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/v1'), 'https://api.exemplo.com/v1/channels')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/api'), 'https://api.exemplo.com/api/channels')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/v2beta1'), 'https://api.exemplo.com/v2beta1/channels')
})

test('apiUrl: um endpoint ja completo NAO ganha /channels de novo', () => {
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/channels'), 'https://api.exemplo.com/channels')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/channels/'), 'https://api.exemplo.com/channels')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/v1/channels'), 'https://api.exemplo.com/v1/channels')
})

test('apiUrl: um path que o app nao conhece e usado como esta', () => {
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/tv'), 'https://api.exemplo.com/tv')
  assert.equal(resolveChannelsUrl('https://api.exemplo.com/catalogo'), 'https://api.exemplo.com/catalogo')
})

test('apiUrl: a base nao quebra a query string', () => {
  assert.equal(
    resolveChannelsUrl('https://api.exemplo.com?token=abc'),
    'https://api.exemplo.com/channels?token=abc',
  )
})

test('apiUrl: caminho relativo tambem ganha o /channels', () => {
  assert.equal(resolveChannelsUrl('/api'), '/api/channels')
  assert.equal(resolveChannelsUrl('/api/channels'), '/api/channels')
  assert.equal(resolveChannelsUrl('/'), CHANNELS_PATH)
})

test('apiUrl: URL vazia fica vazia', () => {
  assert.equal(resolveChannelsUrl(''), '')
  assert.equal(resolveChannelsUrl('   '), '')
})

/* ------------------------------------------------------------------ *
 * Escolha da URL
 * ------------------------------------------------------------------ */

test('apiUrl: sem override, vale a URL base do build', () => {
  assert.equal(pickApiUrl(null, 'https://api.exemplo.com'), 'https://api.exemplo.com')
  assert.equal(pickApiUrl(undefined, '/api'), '/api')
  assert.equal(pickApiUrl('', 'https://api.exemplo.com'), 'https://api.exemplo.com')
})

test('apiUrl: o override vence a URL do build', () => {
  assert.equal(
    pickApiUrl('https://outra.exemplo.com', 'https://api.exemplo.com'),
    'https://outra.exemplo.com',
  )
})

test('apiUrl: override invalido nao derruba a URL do build', () => {
  assert.equal(pickApiUrl('nao-e-url', 'https://api.exemplo.com'), 'https://api.exemplo.com')
  assert.equal(pickApiUrl('javascript:alert(1)', 'https://api.exemplo.com'), 'https://api.exemplo.com')
})

/* ------------------------------------------------------------------ *
 * Leitura e escrita
 * ------------------------------------------------------------------ */

test('apiUrl: sem override salvo, readApiUrl devolve null', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(await readApiUrl(), null)
  })
})

test('apiUrl: grava e le de volta', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(await writeApiUrl('https://api.exemplo.com'), true)
    assert.equal(await readApiUrl(), 'https://api.exemplo.com')
  })
})

test('apiUrl: a URL gravada e normalizada', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await writeApiUrl('  https://api.exemplo.com/  ')
    assert.equal(await readApiUrl(), 'https://api.exemplo.com')
  })
})

test('apiUrl: writeApiUrl recusa URL invalida', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(await writeApiUrl(''), false)
    assert.equal(await writeApiUrl('nao-e-url'), false)
    assert.equal(await writeApiUrl('javascript:alert(1)'), false)
    assert.equal(await readApiUrl(), null)
  })
})

test('apiUrl: clearApiUrl apaga o override', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await writeApiUrl('https://api.exemplo.com/channels')
    await clearApiUrl()
    assert.equal(await readApiUrl(), null)
  })
})

test('apiUrl: valor corrompido no storage devolve null (nao trava a app)', async () => {
  const storage = makeStorage({
    'webtv:v2:db:apiUrl': JSON.stringify({ url: 42 }),
  })
  await withStorage(storage, async () => {
    assert.equal(await readApiUrl(), null)
  })
})

test('apiUrl: URL invalida gravada direto no storage devolve null', async () => {
  const storage = makeStorage({
    'webtv:v2:db:apiUrl': JSON.stringify({ url: 'javascript:alert(1)' }),
  })
  await withStorage(storage, async () => {
    assert.equal(await readApiUrl(), null)
  })
})

test('apiUrl: storage que lanca no setItem nao quebra o app', async () => {
  const storage = makeStorage()
  storage.failOnSet = true

  await withStorage(storage, async () => {
    assert.equal(await writeApiUrl('https://api.exemplo.com/channels'), false)
    assert.equal(await readApiUrl(), null)
  })
})

test('apiUrl: o namespace do storage e "apiUrl"', () => {
  assert.equal(NAMESPACE, 'apiUrl')
})
