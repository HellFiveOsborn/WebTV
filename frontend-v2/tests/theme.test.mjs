/**
 * Testes do tema (frontend-v2/src/lib/theme.ts).
 *
 * O tema usa o storage unificado (IndexedDB). Em Node nao ha IndexedDB,
 * entao o teste desliga o IndexedDB e injeta um localStorage fake.
 *
 * Run: node --test frontend-v2/tests/theme.test.mjs
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
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/theme')

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

/** Compila os modulos TS (theme + storage) e importa os JS gerados. */
async function loadModules() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/theme.ts'),
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

  const themeFile = resolve(OUT_DIR, 'theme.js')
  const storageFile = resolve(OUT_DIR, 'storage.js')
  assert.ok(existsSync(themeFile), `modulo compilado nao encontrado: ${themeFile}`)
  assert.ok(existsSync(storageFile), `modulo compilado nao encontrado: ${storageFile}`)

  return {
    theme: await import(pathToFileURL(themeFile).href),
    storage: await import(pathToFileURL(storageFile).href),
  }
}

const { theme: mod } = await loadModules()
const { DEFAULT_THEME, readTheme, writeTheme, toggleTheme, oppositeTheme, isTheme, clearTheme } = mod

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

test('theme: dark e o padrao quando nao ha preferencia salva', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(DEFAULT_THEME, 'dark')
    assert.equal(await readTheme(), 'dark')
  })
})

test('theme: grava e le de volta', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(await writeTheme('light'), true)
    assert.equal(await readTheme(), 'light')
  })
})

test('theme: valor invalido volta ao padrao', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await writeTheme('light')
    // Grava um valor invalido direto no storage.
    storage.setItem('webtv:v2:db:theme', JSON.stringify({ theme: 'azul' }))
    assert.equal(await readTheme(), 'dark')
  })
})

test('theme: storage que lanca no setItem nao quebra o app', async () => {
  const storage = makeStorage()
  storage.failOnSet = true

  await withStorage(storage, async () => {
    assert.equal(await writeTheme('light'), false)
    assert.equal(await readTheme(), 'dark')
  })
})

test('theme: toggle alterna entre dark e light', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    assert.equal(await toggleTheme(), 'light')
    assert.equal(await readTheme(), 'light')
    assert.equal(await toggleTheme(), 'dark')
    assert.equal(await readTheme(), 'dark')
  })
})

test('theme: clearTheme volta ao padrao', async () => {
  const storage = makeStorage()
  await withStorage(storage, async () => {
    await writeTheme('light')
    await clearTheme()
    assert.equal(await readTheme(), 'dark')
  })
})

test('theme: oppositeTheme devolve o tema contrario', () => {
  assert.equal(oppositeTheme('dark'), 'light')
  assert.equal(oppositeTheme('light'), 'dark')
})

test('theme: isTheme valida os dois temas', () => {
  assert.equal(isTheme('dark'), true)
  assert.equal(isTheme('light'), true)
  assert.equal(isTheme('Dark'), false)
  assert.equal(isTheme(null), false)
})
