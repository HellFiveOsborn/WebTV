/**
 * Testes do classifyPlayError (frontend/src/pages/classifyPlayError.ts).
 *
 * O browser lanca NotAllowedError quando autoplay e bloqueado.
 * Outros erros sao considerados fatais.
 *
 * Run: tsc src/pages/classifyPlayError.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/pages/__compiled__ && node --test tests/classifyPlayError.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { classifyPlayError } = require('../src/pages/__compiled__/classifyPlayError.js')

test('classifica NotAllowedError como autoplay-blocked', () => {
  const e = Object.assign(new Error('play() failed'), { name: 'NotAllowedError' })
  assert.equal(classifyPlayError(e), 'autoplay-blocked')
})

test('classifica erro generico como fatal', () => {
  const e = new Error('network down')
  assert.equal(classifyPlayError(e), 'fatal')
})

test('classifica TypeError como fatal', () => {
  const e = new TypeError('bad arg')
  assert.equal(classifyPlayError(e), 'fatal')
})
