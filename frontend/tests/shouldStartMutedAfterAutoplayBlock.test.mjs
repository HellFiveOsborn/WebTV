/**
 * Testes do shouldStartMutedAfterAutoplayBlock (frontend/src/pages/shouldStartMutedAfterAutoplayBlock.ts).
 *
 * Logica: dada a classificacao de um erro de play() e o estado atual
 * (ja muted ou nao), decidimos se o player deve iniciar em muted e mostrar
 * overlay de "toque para ativar som".
 *
 * - autoplay-blocked + nao-muted  => SIM (iniciar muted, mostrar overlay)
 * - autoplay-blocked + ja-muted  => NAO (ja esta muted, nao duplicar)
 * - fatal + qualquer             => NAO (mostrar overlay de erro normal)
 *
 * Run: tsc src/pages/shouldStartMutedAfterAutoplayBlock.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/pages/__compiled__ && node --test tests/shouldStartMutedAfterAutoplayBlock.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldStartMutedAfterAutoplayBlock } = require('../src/pages/__compiled__/shouldStartMutedAfterAutoplayBlock.js')

test('autoplay-blocked + nao-muted => true (deve mutar)', () => {
  assert.equal(shouldStartMutedAfterAutoplayBlock('autoplay-blocked', false), true)
})

test('autoplay-blocked + ja-muted => false (ja esta mutado)', () => {
  assert.equal(shouldStartMutedAfterAutoplayBlock('autoplay-blocked', true), false)
})

test('fatal + nao-muted => false (mostrar erro, nao mutar)', () => {
  assert.equal(shouldStartMutedAfterAutoplayBlock('fatal', false), false)
})

test('fatal + ja-muted => false', () => {
  assert.equal(shouldStartMutedAfterAutoplayBlock('fatal', true), false)
})
