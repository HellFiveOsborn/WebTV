/**
 * Testes do storage unificado (frontend-v2/src/lib/storage.ts).
 *
 * O storage usa IndexedDB quando disponivel e cai para o localStorage.
 * Em Node nao ha IndexedDB, entao os testes exercitam o caminho de
 * fallback (localStorage fake) e a conversao da migracao.
 *
 * Run: node --test frontend-v2/tests/storage.test.mjs
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
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/storage')

/** Storage fake (o IndexedDB nao existe em Node). */
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

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
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

  const outFile = resolve(OUT_DIR, 'storage.js')
  assert.ok(existsSync(outFile), `modulo compilado nao encontrado: ${outFile}`)
  return import(pathToFileURL(outFile).href)
}

const mod = await loadModule()
const { get, set, remove, clearAll, info, convertLegacy, NAMESPACES, LEGACY_KEYS } = mod

test('storage: os namespaces esperados existem', () => {
  assert.deepEqual([...NAMESPACES], ['catalog', 'usage', 'theme', 'apiUrl'])
})

test('storage: grava, le e apaga um valor', async () => {
  const storage = makeStorage()

  assert.equal(await set('theme', { theme: 'light' }, storage), true)
  assert.deepEqual(await get('theme', null, storage), { theme: 'light' })

  await remove('theme', storage)
  assert.equal(await get('theme', null, storage), null)
})

test('storage: devolve o fallback quando nao ha dado', async () => {
  const storage = makeStorage()
  assert.equal(await get('catalog', 'vazio', storage), 'vazio')
})

test('storage: namespaces sao isolados entre si', async () => {
  const storage = makeStorage()

  await set('catalog', { a: 1 }, storage)
  await set('usage', { b: 2 }, storage)

  assert.deepEqual(await get('catalog', null, storage), { a: 1 })
  assert.deepEqual(await get('usage', null, storage), { b: 2 })
})

test('storage: remove apaga so o namespace indicado', async () => {
  const storage = makeStorage()

  await set('catalog', { a: 1 }, storage)
  await set('usage', { b: 2 }, storage)
  await remove('catalog', storage)

  assert.equal(await get('catalog', null, storage), null)
  assert.deepEqual(await get('usage', null, storage), { b: 2 })
})

test('storage: clearAll apaga tudo', async () => {
  const storage = makeStorage()

  await set('catalog', { a: 1 }, storage)
  await set('usage', { b: 2 }, storage)
  await set('theme', { theme: 'dark' }, storage)

  await clearAll(storage)

  for (const ns of NAMESPACES) {
    assert.equal(await get(ns, null, storage), null, `namespace ${ns} deveria estar vazio`)
  }
})

test('storage: storage que lanca no setItem nao quebra o app', async () => {
  const storage = makeStorage()
  storage.failOnSet = true

  assert.equal(await set('theme', { theme: 'light' }, storage), false)
  assert.equal(await get('theme', 'fallback', storage), 'fallback')
})

test('storage: JSON corrompido no fallback devolve o default', async () => {
  const storage = makeStorage({ 'webtv:v2:db:theme': '{nao e json' })
  assert.equal(await get('theme', 'fallback', storage), 'fallback')
})

test('storage: sem storage devolve o fallback', async () => {
  assert.equal(await get('theme', 'fallback', null), 'fallback')
  assert.equal(await set('theme', { theme: 'light' }, null), false)
})

test('storage: a migracao do catalog legado funciona', () => {
  const legacy = {
    version: 1,
    savedAt: 12345,
    origin: 'https://api.exemplo/channels',
    catalog: { channels: [{ id: 1 }], categories: ['Teste'] },
  }

  const migrated = convertLegacy('catalog', legacy)
  assert.equal(migrated.savedAt, 12345)
  assert.equal(migrated.origin, 'https://api.exemplo/channels')
  assert.deepEqual(migrated.catalog.channels, [{ id: 1 }])
})

test('storage: a migracao do usage legado funciona', () => {
  const legacy = {
    version: 1,
    entries: {
      gloob: { count: 3, lastOpenedAt: 100, firstOpenedAt: 50 },
      invalido: { count: 0, lastOpenedAt: 100 },
    },
  }

  const migrated = convertLegacy('usage', legacy)
  assert.deepEqual(Object.keys(migrated), ['gloob'])
  assert.equal(migrated.gloob.count, 3)
  assert.equal(migrated.gloob.firstOpenedAt, 50)
})

test('storage: a migracao do theme legado funciona', () => {
  assert.deepEqual(convertLegacy('theme', 'light'), { theme: 'light' })
  assert.deepEqual(convertLegacy('theme', 'dark'), { theme: 'dark' })
  assert.equal(convertLegacy('theme', 'azul'), undefined)
})

test('storage: a migracao ignora dados invalidos', () => {
  assert.equal(convertLegacy('catalog', { version: 1 }), undefined)
  assert.equal(convertLegacy('catalog', null), undefined)
  assert.equal(convertLegacy('usage', { version: 1 }), undefined)
  assert.equal(convertLegacy('usage', { version: 1, entries: {} }), undefined)
})

test('storage: os dados legados sao lidos e migrados automaticamente', async () => {
  const storage = makeStorage({
    [LEGACY_KEYS.theme]: JSON.stringify('light'),
    [LEGACY_KEYS.usage]: JSON.stringify({
      version: 1,
      entries: { gloob: { count: 2, lastOpenedAt: 10, firstOpenedAt: 5 } },
    }),
  })

  assert.deepEqual(await get('theme', null, storage), { theme: 'light' })
  assert.deepEqual(await get('usage', null, storage), {
    gloob: { count: 2, lastOpenedAt: 10, firstOpenedAt: 5 },
  })

  // A chave legada foi removida depois da migracao.
  assert.equal(storage.map.has(LEGACY_KEYS.theme), false)
  assert.equal(storage.map.has(LEGACY_KEYS.usage), false)
})

test('storage: info reporta o backend e os namespaces com dados', async () => {
  const storage = makeStorage()
  await set('theme', { theme: 'dark' }, storage)

  const data = await info(storage)
  assert.equal(data.backend, 'localstorage')
  assert.ok(data.namespaces.includes('theme'))
  assert.equal(data.hasLegacyData, false)
})

test('storage: info detecta dados legados', async () => {
  const storage = makeStorage({ [LEGACY_KEYS.catalog]: '{}' })
  const data = await info(storage)
  assert.equal(data.hasLegacyData, true)
})
