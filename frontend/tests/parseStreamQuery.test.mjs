/**
 * Testes do parseStreamQuery (frontend/src/pages/parseStreamQuery.ts).
 *
 * Logica pura: extrai o parametro `stream` da query string e classifica
 * a URL como valida (http/https) ou ausente/invalida.
 *
 * Run: tsc src/pages/parseStreamQuery.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/pages/__compiled__ && node --test tests/parseStreamQuery.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseStreamQuery } = require('../src/pages/__compiled__/parseStreamQuery.js')

test('retorna null quando search esta vazia', () => {
  assert.equal(parseStreamQuery(''), null)
})

test('retorna null quando parametro stream nao existe', () => {
  assert.equal(parseStreamQuery('?outro=1'), null)
})

test('retorna null quando stream esta vazio', () => {
  assert.equal(parseStreamQuery('?stream='), null)
})

test('retorna URL https valida', () => {
  const url = 'https://exemplo.com/path/index.m3u8'
  assert.equal(parseStreamQuery(`?stream=${encodeURIComponent(url)}`), url)
})

test('retorna URL http valida', () => {
  const url = 'http://exemplo.com/stream.m3u8'
  assert.equal(parseStreamQuery(`?stream=${encodeURIComponent(url)}`), url)
})

test('rejeita protocolo nao-http (file://)', () => {
  const url = 'file:///etc/passwd'
  const result = parseStreamQuery(`?stream=${encodeURIComponent(url)}`)
  assert.equal(result, null)
})

test('rejeita protocolo javascript:', () => {
  const url = 'javascript:alert(1)'
  const result = parseStreamQuery(`?stream=${encodeURIComponent(url)}`)
  assert.equal(result, null)
})

test('rejeita valor que nao e URL', () => {
  assert.equal(parseStreamQuery('?stream=notaurl'), null)
})

test('aceita URL com query string propria', () => {
  const url = 'https://cdn.exemplo.com/live.m3u8?token=abc&exp=123'
  assert.equal(parseStreamQuery(`?stream=${encodeURIComponent(url)}`), url)
})

test('decodifica valores percent-encoded e retorna URL normalizada', () => {
  const url = 'https://exemplo.com/canal com espaco.m3u8'
  const result = parseStreamQuery(`?stream=${encodeURIComponent(url)}`)
  assert.equal(result, 'https://exemplo.com/canal%20com%20espaco.m3u8')
})
