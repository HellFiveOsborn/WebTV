/**
 * Testes do cache local do catalogo (frontend-v2/src/lib/catalogCache.ts).
 *
 * O modulo nao importa nada de proposito, para poder ser compilado isolado
 * para Node. O teste compila o .ts com o tsc do projeto e importa o .js
 * gerado - mesma abordagem usada em frontend/tests para os modulos do v1.
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

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  // Chama o tsc do node_modules local (evita npx, que falha no spawn do Win).
  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/catalogCache.ts'),
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

  const outFile = resolve(OUT_DIR, 'catalogCache.js')
  assert.ok(existsSync(outFile), `modulo compilado nao encontrado: ${outFile}`)
  // No Windows, import() exige URL file:// (path absoluto vira 'e:\...').
  return import(pathToFileURL(outFile).href)
}

const mod = await loadModule()
const {
  CACHE_KEY,
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

test('cache: writeCache grava e readCache devolve a entrada', () => {
  const storage = makeStorage()
  const catalog = makeCatalog()

  assert.equal(writeCache(catalog, 'https://api.exemplo/channels', storage, 1000), true)

  const entry = readCache(storage)
  assert.ok(entry, 'deveria ler a entrada gravada')
  assert.equal(entry.version, CACHE_VERSION)
  assert.equal(entry.savedAt, 1000)
  assert.equal(entry.origin, 'https://api.exemplo/channels')
  assert.equal(entry.catalog.channels.length, 3)
})

test('cache: sem storage nada e gravado e nada quebra', () => {
  const catalog = makeCatalog()
  assert.equal(writeCache(catalog, 'origem', null, 1000), false)
  assert.equal(readCache(null), null)
  assert.equal(clearCache(null), undefined)
})

test('cache: storage que lanca no setItem nao quebra o app', () => {
  const storage = makeStorage()
  storage.failOnSet = true
  assert.equal(writeCache(makeCatalog(), 'origem', storage, 1000), false)
})

test('cache: JSON corrompido e descartado (e a entrada removida)', () => {
  const storage = makeStorage({ [CACHE_KEY]: '{isto nao e json' })

  assert.equal(readCache(storage), null)
  assert.equal(storage.map.has(CACHE_KEY), false, 'entrada corrompida deveria ser removida')
})

test('cache: versao diferente e ignorada', () => {
  const payload = JSON.stringify({
    version: CACHE_VERSION + 1,
    savedAt: Date.now(),
    origin: 'x',
    catalog: makeCatalog(),
  })
  const storage = makeStorage({ [CACHE_KEY]: payload })

  assert.equal(readCache(storage), null)
})

test('cache: catalogo invalido (sem canais) nao e aceito', () => {
  const payload = JSON.stringify({
    version: CACHE_VERSION,
    savedAt: Date.now(),
    origin: 'x',
    catalog: { channels: [], categories: [] },
  })
  const storage = makeStorage({ [CACHE_KEY]: payload })

  assert.equal(readCache(storage), null)
  assert.equal(isCatalogLike({ channels: [], categories: [] }), false)
  assert.equal(isCatalogLike(makeCatalog()), true)
})

test('cache: status distingue fresco, expirado e inutilizavel', () => {
  const storage = makeStorage()
  const now = 1_000_000

  writeCache(makeCatalog(), 'origem', storage, now - 60_000)

  const fresh = getCacheStatus({ storage, ttlMs: DEFAULT_TTL_MS, now })
  assert.equal(fresh.fresh, true)
  assert.equal(fresh.usable, true)
  assert.equal(fresh.ageMs, 60_000)

  const expired = getCacheStatus({ storage, ttlMs: 30_000, now })
  assert.equal(expired.fresh, false)
  assert.equal(expired.usable, true, 'ainda pode ser usado como fallback')

  const tooOld = getCacheStatus({ storage, ttlMs: 30_000, maxAgeMs: 10_000, now })
  assert.equal(tooOld.fresh, false)
  assert.equal(tooOld.usable, false)
})

test('cache: status sem entrada devolve tudo nulo', () => {
  const status = getCacheStatus({ storage: makeStorage() })
  assert.equal(status.entry, null)
  assert.equal(status.ageMs, null)
  assert.equal(status.fresh, false)
  assert.equal(status.usable, false)
})

test('cache: clearCache remove a entrada', () => {
  const storage = makeStorage()
  writeCache(makeCatalog(), 'origem', storage, Date.now())
  assert.ok(readCache(storage))

  clearCache(storage)
  assert.equal(readCache(storage), null)
})

test('cache: TTL por padrao e via VITE_CACHE_TTL_MS', () => {
  assert.equal(resolveTtlMs({}), DEFAULT_TTL_MS, 'sem env usa o padrao')
  assert.equal(resolveTtlMs({ VITE_CACHE_TTL_MS: '60000' }), 60000)
  assert.equal(
    resolveTtlMs({ VITE_CACHE_TTL_MS: 'invalido' }),
    DEFAULT_TTL_MS,
    'valor invalido volta ao padrao',
  )
  assert.equal(
    resolveTtlMs({ VITE_CACHE_TTL_MS: '0' }),
    DEFAULT_TTL_MS,
    'valor <= 0 volta ao padrao',
  )
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
