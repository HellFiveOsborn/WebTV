/**
 * Testes do cache do catalogo (frontend-v2/src/lib/catalogCache.ts).
 *
 * O cache usa o storage unificado (IndexedDB). Em Node nao ha IndexedDB,
 * entao o teste usa o fallback (localStorage fake) atraves do storage
 * injetavel - mesma abordagem dos demais modulos.
 *
 * Run: node --test frontend-v2/tests/catalogCache.test.mjs
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
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/cache')

/** Storage fake, com controle de quota e de excecoes. */
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

/** Catalogo minimo valido. */
function makeCatalog(count = 3) {
  return {
    channels: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      slug: `canal-${i + 1}`,
      name: `Canal ${i + 1}`,
      category: 'Teste',
      href: `https://exemplo.com/${i + 1}`,
      image: `https://exemplo.com/${i + 1}.png`,
      iframe: '',
    })),
    categories: ['Teste'],
    categoryOrder: ['Teste'],
    categoryLabels: {},
  }
}

/**
 * Compila os modulos TS (cache + storage) e importa os JS gerados.
 * O cache importa o storage, entao os dois precisam estar compilados.
 */
async function loadModules() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/catalogCache.ts'),
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

  const cacheFile = resolve(OUT_DIR, 'catalogCache.js')
  const storageFile = resolve(OUT_DIR, 'storage.js')
  assert.ok(existsSync(cacheFile), `modulo compilado nao encontrado: ${cacheFile}`)
  assert.ok(existsSync(storageFile), `modulo compilado nao encontrado: ${storageFile}`)

  return {
    cache: await import(pathToFileURL(cacheFile).href),
    storage: await import(pathToFileURL(storageFile).href),
  }
}

const { cache: mod, storage: storageMod } = await loadModules()
const {
  CACHE_VERSION,
  DEFAULT_TTL_MS,
  readCache,
  writeCache,
  clearCache,
  getCacheStatus,
  getTtlMs,
  resolveTtlMs,
  formatAge,
  isCatalogLike,
} = mod

/**
 * O storage unificado usa o IndexedDB quando existe. Em Node nao existe,
 * entao o teste desliga o IndexedDB e injeta um localStorage fake como
 * global - e assim que o modulo `storage` resolve o storage real.
 */
function useFakeStorage(storage) {
  const originalIdb = globalThis.indexedDB
  const originalLs = globalThis.localStorage

  globalThis.indexedDB = undefined
  globalThis.localStorage = storage

  return {
    storage,
    restore: () => {
      globalThis.indexedDB = originalIdb
      globalThis.localStorage = originalLs
    },
  }
}

/** Executa um teste com o storage fake injetado. */
async function withStorage(storage, fn) {
  const fake = useFakeStorage(storage)
  try {
    return await fn()
  } finally {
    fake.restore()
  }
}

test('cache: writeCache grava e readCache devolve a entrada', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(await writeCache(makeCatalog(), 'https://api.exemplo/channels', 1000), true)

    const entry = await readCache()
    assert.ok(entry, 'deveria ler a entrada gravada')
    assert.equal(entry.version, CACHE_VERSION)
    assert.equal(entry.savedAt, 1000)
    assert.equal(entry.origin, 'https://api.exemplo/channels')
    assert.equal(entry.catalog.channels.length, 3)
  })
})

test('cache: versao diferente e ignorada', async () => {
  const storage = makeStorage()
  const payload = JSON.stringify({
    version: CACHE_VERSION + 1,
    savedAt: Date.now(),
    origin: 'x',
    catalog: makeCatalog(),
  })

  await withStorage(storage, async () => {
    await storageMod.set('catalog', JSON.parse(payload))
    assert.equal(await readCache(), null)
  })
})

test('cache: catalogo invalido (sem canais) nao e aceito', () => {
  assert.equal(isCatalogLike({ channels: [], categories: [] }), false)
  assert.equal(isCatalogLike(makeCatalog()), true)
  assert.equal(isCatalogLike(null), false)
})

test('cache: status distingue fresco, expirado e inutilizavel', async () => {
  const storage = makeStorage()
  const now = 1_000_000

  await withStorage(storage, async () => {
    await writeCache(makeCatalog(), 'origem', now - 60_000)

    const fresh = await getCacheStatus({ ttlMs: DEFAULT_TTL_MS, now })
    assert.equal(fresh.fresh, true)
    assert.equal(fresh.usable, true)
    assert.equal(fresh.ageMs, 60_000)

    const expired = await getCacheStatus({ ttlMs: 30_000, now })
    assert.equal(expired.fresh, false)
    assert.equal(expired.usable, true, 'ainda pode ser usado como fallback')

    const tooOld = await getCacheStatus({ ttlMs: 30_000, maxAgeMs: 10_000, now })
    assert.equal(tooOld.fresh, false)
    assert.equal(tooOld.usable, false)
  })
})

test('cache: status sem entrada devolve tudo nulo', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    const status = await getCacheStatus()
    assert.equal(status.entry, null)
    assert.equal(status.ageMs, null)
    assert.equal(status.fresh, false)
    assert.equal(status.usable, false)
  })
})

test('cache: clearCache remove a entrada', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await writeCache(makeCatalog(), 'origem', Date.now())
    assert.ok(await readCache())

    await clearCache()
    assert.equal(await readCache(), null)
  })
})

test('cache: TTL por padrao e via VITE_CACHE_TTL_MS', () => {
  assert.equal(resolveTtlMs({}), DEFAULT_TTL_MS, 'sem env usa o padrao')
  assert.equal(resolveTtlMs({ VITE_CACHE_TTL_MS: '60000' }), 60000)
  assert.equal(
    resolveTtlMs({ VITE_CACHE_TTL_MS: 'invalido' }),
    DEFAULT_TTL_MS,
    'valor invalido volta ao padrao',
  )
  assert.equal(resolveTtlMs({ VITE_CACHE_TTL_MS: '0' }), DEFAULT_TTL_MS, 'valor <= 0 volta ao padrao')
  assert.equal(
    resolveTtlMs({ VITE_CACHE_TTL_MS: '-5' }),
    DEFAULT_TTL_MS,
    'valor negativo volta ao padrao',
  )
  assert.equal(getTtlMs(), DEFAULT_TTL_MS, 'getTtlMs sem env usa o padrao')
})

test('cache: formatAge formata a idade de forma legivel', () => {
  assert.equal(formatAge(null), '-')
  assert.equal(formatAge(45_000), '45s')
  assert.equal(formatAge(12 * 60_000), '12 min')
  assert.equal(formatAge(3 * 3_600_000), '3 h')
  assert.equal(formatAge(2 * 86_400_000), '2 d')
})
