/**
 * Testes do backend WebTV (backend/server.mjs).
 *
 * Valida o que resolve o problema de CORS: o servico busca o site no servidor
 * e devolve JSON limpo com `Access-Control-Allow-Origin: *`.
 *
 * Run: node --test backend/tests/server.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BACKEND = resolve(HERE, '..', 'server.mjs')

const PORT = 8099
const BASE = `http://127.0.0.1:${PORT}`

/** Sobe o backend numa porta livre e devolve o handle. */
function startBackend(env = {}) {
  const child = spawn(process.execPath, [BACKEND], {
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return child
}

/** Espera o servidor responder. */
async function waitReady(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return true
    } catch {
      /* ainda subindo */
    }
    await new Promise(r => setTimeout(r, 200))
  }
  return false
}

async function stop(child) {
  child.kill()
  await new Promise(r => setTimeout(r, 300))
}

test('backend: /health responde e /channels traz o catalogo com CORS', async t => {
  const child = startBackend()
  t.after(() => stop(child))

  assert.ok(await waitReady(), 'backend deveria subir')

  const health = await fetch(`${BASE}/health`)
  assert.equal(health.status, 200)
  assert.equal(health.headers.get('access-control-allow-origin'), '*')
  const healthBody = await health.json()
  assert.equal(healthBody.ok, true)

  const res = await fetch(`${BASE}/channels`, { headers: { Origin: 'https://exemplo.com' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), '*', 'precisa liberar CORS')

  const body = await res.json()
  assert.ok(body.count > 50, `esperava >50 canais, veio ${body.count}`)
  assert.ok(Array.isArray(body.categories))
  assert.ok(body.categories.length > 0)
  assert.equal(body.source, 'https://embedcanais.online/')

  for (const ch of body.channels) {
    assert.ok(ch.name, `canal sem nome: ${JSON.stringify(ch)}`)
    assert.ok(ch.slug, `canal sem slug: ${JSON.stringify(ch)}`)
    assert.ok(ch.category, `canal sem categoria: ${JSON.stringify(ch)}`)
    assert.ok(ch.href, `canal sem href: ${JSON.stringify(ch)}`)
    assert.ok(ch.image, `canal sem image: ${JSON.stringify(ch)}`)
  }
})

test('backend: preflight OPTIONS responde 204 com CORS', async t => {
  const child = startBackend()
  t.after(() => stop(child))
  assert.ok(await waitReady())

  const res = await fetch(`${BASE}/channels`, { method: 'OPTIONS' })
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
})

test('backend: rota desconhecida devolve 404 em JSON', async t => {
  const child = startBackend()
  t.after(() => stop(child))
  assert.ok(await waitReady())

  const res = await fetch(`${BASE}/nao-existe`)
  assert.equal(res.status, 404)
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  const body = await res.json()
  assert.ok(body.error)
})

test('backend: com upstream invalido devolve 502 (sem cache)', async t => {
  const child = startBackend({ EMBEDCANAIS_SOURCE_URL: 'https://localhost:9/nao-existe' })
  t.after(() => stop(child))
  assert.ok(await waitReady())

  const res = await fetch(`${BASE}/channels`)
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.ok(body.error)
})
