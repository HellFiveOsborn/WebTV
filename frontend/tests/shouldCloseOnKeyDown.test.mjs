/**
 * Testes do shouldCloseOnKeyDown (frontend/src/lib/shouldCloseOnKeyDown.ts).
 *
 * Decided se a tecla deve fechar o player modal (BACK / VOLTAR / ESC).
 *
 * - Escape (browser)          => true
 * - Backspace (D-pad antigo)  => true
 * - GoBack (Android TV remote)=> true
 * - BrowserBack (Chromium)    => true
 * - outras                    => false
 *
 * Run: tsc src/lib/shouldCloseOnKeyDown.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/shouldCloseOnKeyDown.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldCloseOnKeyDown } = require('../src/lib/__compiled__/shouldCloseOnKeyDown.js')

test('Escape => true', () => {
  assert.equal(shouldCloseOnKeyDown('Escape'), true)
})

test('Backspace => true', () => {
  assert.equal(shouldCloseOnKeyDown('Backspace'), true)
})

test('GoBack => true (Android TV remote)', () => {
  assert.equal(shouldCloseOnKeyDown('GoBack'), true)
})

test('BrowserBack => true (Chromium)', () => {
  assert.equal(shouldCloseOnKeyDown('BrowserBack'), true)
})

test('Enter => false', () => {
  assert.equal(shouldCloseOnKeyDown('Enter'), false)
})

test('ArrowLeft => false', () => {
  assert.equal(shouldCloseOnKeyDown('ArrowLeft'), false)
})

test('MediaPlayPause => false', () => {
  assert.equal(shouldCloseOnKeyDown('MediaPlayPause'), false)
})

test('undefined => false', () => {
  assert.equal(shouldCloseOnKeyDown(undefined), false)
})
