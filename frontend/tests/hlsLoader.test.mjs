/**
 * Testes do hlsLoader (frontend/src/lib/hlsLoader.ts).
 *
 * Verifica que o loader:
 *   - injetando <script src="https://cdn.jsdelivr.net/.../hls.min.js"> uma única vez
 *   - retorna a MESMA promise em chamadas concorrentes (singleton)
 *   - resolve com window.Hls apos onload
 *   - rejeita se o script falhar ao carregar
 *
 * Estrategia: usamos jsdom para simular o DOM e stub de document.createElement
 * para nao baixar nada de verdade.
 *
 * Run: tsc src/lib/hlsLoader.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/hlsLoader.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadHls, __resetHlsLoaderForTests } = require('../src/lib/__compiled__/hlsLoader.js')

function makeFakeDocument() {
  const scripts = []
  const handlers = {}
  return {
    scripts,
    head: { appendChild: (el) => scripts.push(el) },
    createElement: (tag) => {
      if (tag !== 'script') throw new Error('esperava <script>')
      const el = {
        tag,
        set src(v) { el._src = v },
        get src() { return el._src },
        async: false,
        onload: null,
        onerror: null,
      }
      return el
    },
    fireLoad: () => {
      globalThis.window = globalThis.window || {}
      globalThis.window.Hls = { isSupported: () => true, Events: {} }
      for (const s of scripts) {
        if (typeof s.onload === 'function') s.onload()
      }
    },
    fireLoadNoHls: () => {
      globalThis.window = globalThis.window || {}
      delete globalThis.window.Hls
      for (const s of scripts) {
        if (typeof s.onload === 'function') s.onload()
      }
    },
    fireError: () => {
      for (const s of scripts) {
        if (typeof s.onerror === 'function') s.onerror(new Error('net fail'))
      }
    },
  }
}

function installFakeDoc(fake) {
  globalThis.document = fake
  globalThis.window = globalThis.window || {}
  delete globalThis.window.Hls
}

test('loadHls injeta <script> apontando para CDN do jsdelivr', async () => {
  __resetHlsLoaderForTests()
  const fake = makeFakeDocument()
  installFakeDoc(fake)

  const p = loadHls()
  assert.equal(fake.scripts.length, 1, 'deve criar exatamente 1 <script>')
  const src = fake.scripts[0].src
  assert.match(src, /^https:\/\/cdn\.jsdelivr\.net\/npm\/hls\.js@[\d.]+\/dist\/hls\.min\.js$/)
  fake.fireLoad()
  await p
})

test('loadHls retorna a MESMA promise em chamadas concorrentes (singleton)', async () => {
  __resetHlsLoaderForTests()
  const fake = makeFakeDocument()
  installFakeDoc(fake)

  const p1 = loadHls()
  const p2 = loadHls()
  assert.strictEqual(p1, p2, 'promises devem ser identicas')
  assert.equal(fake.scripts.length, 1, 'apenas 1 <script> mesmo com 2 chamadas')
  fake.fireLoad()
  await p1
})

test('loadHls resolve imediatamente se window.Hls ja existe (cache)', async () => {
  __resetHlsLoaderForTests()
  const fake = makeFakeDocument()
  installFakeDoc(fake)
  globalThis.window.Hls = { isSupported: () => true }

  const p = loadHls()
  await p
  assert.equal(fake.scripts.length, 0, 'nao deve injetar script se Hls ja existe')
})

test('loadHls rejeita quando o <script> falha ao carregar', async () => {
  __resetHlsLoaderForTests()
  const fake = makeFakeDocument()
  installFakeDoc(fake)

  const p = loadHls()
  fake.fireError()
  await assert.rejects(p, /Failed to load hls\.js/)
})

test('loadHls rejeita se onload dispara mas window.Hls nao foi definido', async () => {
  __resetHlsLoaderForTests()
  const fake = makeFakeDocument()
  installFakeDoc(fake)

  const p = loadHls()
  fake.fireLoadNoHls()
  await assert.rejects(p, /Hls undefined/)
})
