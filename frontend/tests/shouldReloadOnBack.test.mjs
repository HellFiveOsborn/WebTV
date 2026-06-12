/**
 * Testes do shouldReloadOnBack (kotlin-app equivalente:
 * frontend/src/lib/shouldReloadOnBack.ts). Logica pura espelhada
 * para facilitar testes sem Android emulator.
 *
 * Decide se MainActivity.onBackPressed deve fazer loadUrl(START_URL)
 * (reload da WebView) ou apenas injetar onPlayerClosed no WebView
 * para que o React processe o fechamento limpo.
 *
 * - activeChannel + URL da grade => FALSE (so injeta onPlayerClosed)
 *   (PlayerModal reage ao eventBus, faz navigate('/'), sem reload)
 * - activeChannel + URL externa => TRUE (reload para voltar a grade)
 *   (canal redirect: webview esta na URL do canal, reload e necessario)
 * - sem canal + URL da grade => FALSE (mostra dialog de fechar app)
 * - sem canal + URL externa => TRUE (volta para grade)
 *
 * Run: tsc src/lib/shouldReloadOnBack.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/shouldReloadOnBack.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldReloadOnBack } = require('../src/lib/__compiled__/shouldReloadOnBack.js')

test('canal ativo + URL da grade => false (React fecha limpo, sem reload)', () => {
  assert.equal(shouldReloadOnBack({
    hasActiveChannel: true,
    currentPageStartsWithStartUrl: true,
  }), false)
})

test('canal ativo + URL externa => true (reload necessario)', () => {
  assert.equal(shouldReloadOnBack({
    hasActiveChannel: true,
    currentPageStartsWithStartUrl: false,
  }), true)
})

test('sem canal + URL da grade => false (mostra dialog de fechar)', () => {
  assert.equal(shouldReloadOnBack({
    hasActiveChannel: false,
    currentPageStartsWithStartUrl: true,
  }), false)
})

test('sem canal + URL externa => true (volta para grade via reload)', () => {
  assert.equal(shouldReloadOnBack({
    hasActiveChannel: false,
    currentPageStartsWithStartUrl: false,
  }), true)
})
