/**
 * Valida o codigo gerado da Deno Function (scripts/suga-function.ts).
 *
 * Nao ha runtime Deno na maquina, entao o codigo e executado no Node com um
 * stub minimo de `Deno.env` / `Deno.serve`. Isso valida:
 *   - sintaxe
 *   - o parser embutido (extrai os canais do HTML real)
 *   - as rotas /health, /channels, 404 e o preflight OPTIONS
 *
 * Run: node scripts/test-suga-function.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const CODE_PATH = resolve(ROOT, 'scripts/suga-function.ts')
const FIXTURE = resolve(ROOT, 'frontend-v2/tests/fixtures/embedcanais-home.html')

const code = readFileSync(CODE_PATH, 'utf8')
const fixture = readFileSync(FIXTURE, 'utf8')

// --- stub de Deno ---
// Deno.serve(handler) entrega (Request) e espera (Response) de volta.
const handlers = []
globalThis.Deno = {
  env: {
    get: (k) =>
      ({
        PORT: '8080',
        EMBEDCANAIS_SOURCE_URL: 'https://embedcanais.online/',
        CACHE_TTL_MS: '600000',
      })[k],
  },
  serve: (opts, handler) => {
    handlers.push(handler)
    return { finished: Promise.resolve() }
  },
}

// executa o codigo da function
new Function(code)()

assert.equal(handlers.length, 1, 'a function deve registrar 1 handler')
const handler = handlers[0]

/** Chama o handler e devolve { status, headers, body }. */
async function call(method, url) {
  const res = await handler(new Request(url, { method }))
  const body = await res.text()
  return {
    status: res.status,
    // Headers da Fetch API sao normalizados em minusculas
    headers: Object.fromEntries(res.headers.entries()),
    body,
  }
}

/** Le um header ignorando caixa (compativel com Response do Deno e do Node). */
function header(res, name) {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(res.headers)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

// --- testes ---
console.log('== /health ==')
const health = await call('GET', 'http://localhost/health')
assert.equal(health.status, 200)
assert.equal(header(health, 'Access-Control-Allow-Origin'), '*')
assert.equal(JSON.parse(health.body).ok, true)
console.log('  ok:', health.body)

console.log('== /channels (usa a rede real) ==')
const channels = await call('GET', 'http://localhost/channels')
assert.equal(channels.status, 200)
assert.equal(header(channels, 'Access-Control-Allow-Origin'), '*')
const payload = JSON.parse(channels.body)
assert.ok(payload.count > 50, `esperava >50 canais, veio ${payload.count}`)
assert.ok(payload.categories.length > 0)
assert.ok(payload.channels.every(c => c.name && c.slug && c.category && c.href && c.image))
console.log(`  ok: ${payload.count} canais / ${payload.categories.length} categorias`)
console.log(`  categorias: ${payload.categories.join(', ')}`)

console.log('== cache (2a chamada deve reusar) ==')
const cached = await call('GET', 'http://localhost/channels')
assert.equal(JSON.parse(cached.body).cached, true)
console.log('  ok: cached=true')

console.log('== preflight OPTIONS ==')
const preflight = await call('OPTIONS', 'http://localhost/channels')
assert.equal(preflight.status, 204)
assert.equal(header(preflight, 'Access-Control-Allow-Origin'), '*')
console.log('  ok: 204')

console.log('== 404 ==')
const notFound = await call('GET', 'http://localhost/nao-existe')
assert.equal(notFound.status, 404)
assert.equal(header(notFound, 'Access-Control-Allow-Origin'), '*')
console.log('  ok: 404')

console.log('== 405 ==')
const badMethod = await call('POST', 'http://localhost/channels')
assert.equal(badMethod.status, 405)
console.log('  ok: 405')

console.log('\nTODOS OS TESTES PASSARAM')

