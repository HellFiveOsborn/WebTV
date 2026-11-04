/**
 * Testes do historico de uso (frontend-v2/src/lib/usage.ts).
 *
 * O uso usa o storage unificado (IndexedDB). Em Node nao ha IndexedDB,
 * entao o teste desliga o IndexedDB e injeta um localStorage fake.
 *
 * Run: node --test frontend-v2/tests/usage.test.mjs
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
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/usage')

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

/** Compila os modulos TS (usage + storage) e importa os JS gerados. */
async function loadModules() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/usage.ts'),
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

  const usageFile = resolve(OUT_DIR, 'usage.js')
  const storageFile = resolve(OUT_DIR, 'storage.js')
  assert.ok(existsSync(usageFile), `modulo compilado nao encontrado: ${usageFile}`)
  assert.ok(existsSync(storageFile), `modulo compilado nao encontrado: ${storageFile}`)

  return {
    usage: await import(pathToFileURL(usageFile).href),
    storage: await import(pathToFileURL(storageFile).href),
  }
}

const { usage: mod } = await loadModules()
const { readUsage, writeUsage, recordOpen, getUsage, clearUsage, isEmptyUsage } = mod

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

test('usage: sem historico devolve mapa vazio', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.deepEqual(await readUsage(), {})
    assert.equal(await isEmptyUsage(), true)
  })
})

test('usage: recordOpen conta e atualiza a recencia', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    const first = await recordOpen('globorj', 1000)
    assert.equal(first.count, 1)
    assert.equal(first.lastOpenedAt, 1000)
    assert.equal(first.firstOpenedAt, 1000)

    const second = await recordOpen('globorj', 2000)
    assert.equal(second.count, 2)
    assert.equal(second.lastOpenedAt, 2000)
    assert.equal(second.firstOpenedAt, 1000, 'a primeira abertura nao muda')
  })
})

test('usage: o historico persiste entre leituras', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await recordOpen('a', 1000)
    await recordOpen('b', 1500)

    const usage = await readUsage()
    assert.equal(Object.keys(usage).length, 2)
    assert.equal(usage.a.count, 1)
    assert.equal(usage.b.lastOpenedAt, 1500)
  })
})

test('usage: entrada invalida e descartada na leitura', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await writeUsage({
      ok: { count: 2, lastOpenedAt: 10, firstOpenedAt: 5 },
      semContador: { count: 0, lastOpenedAt: 10, firstOpenedAt: 10 },
    })

    const usage = await readUsage()
    assert.deepEqual(Object.keys(usage), ['ok'])
    assert.equal(usage.ok.count, 2)
  })
})

test('usage: storage que lanca no setItem nao quebra o app', async () => {
  const storage = makeStorage()
  storage.failOnSet = true

  await withStorage(storage, async () => {
    // recordOpen devolve o uso calculado, mas nao consegue gravar.
    const result = await recordOpen('x', 1000)
    assert.equal(result.count, 1)
    assert.equal(storage.map.size, 0)
  })
})

test('usage: clearUsage remove o historico', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await recordOpen('a', 1000)
    assert.equal(await isEmptyUsage(), false)

    await clearUsage()
    assert.equal(await isEmptyUsage(), true)
    assert.deepEqual(await readUsage(), {})
  })
})

test('usage: getUsage devolve o uso de um canal', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await recordOpen('hbo', 1234)

    assert.equal((await getUsage('hbo')).count, 1)
    assert.equal(await getUsage('inexistente'), null)
  })
})
