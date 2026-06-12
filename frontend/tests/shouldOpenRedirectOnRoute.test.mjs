/**
 * Testes do shouldOpenRedirectOnRoute (frontend/src/lib/shouldOpenRedirectOnRoute.ts).
 *
 * Decide se o useEffect de mudanca de rota em App.tsx deve abrir popup
 * redirect e setar channelTransition, OU se deve apenas setar activeChannel
 * para que o PlayerModal cuide do iframe.
 *
 * Regra: so abre popup redirect se NAO ha iframe no canal.
 *   - so iframe  => false (PlayerModal cuida)
 *   - mixed       => false (PlayerModal cuida do iframe; redirects sao backup)
 *   - so redirect=> true
 *   - sem urls    => false
 *
 * Run: tsc src/lib/shouldOpenRedirectOnRoute.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/shouldOpenRedirectOnRoute.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldOpenRedirectOnRoute } = require('../src/lib/__compiled__/shouldOpenRedirectOnRoute.js')

test('so iframe => false (PlayerModal cuida)', () => {
  assert.equal(shouldOpenRedirectOnRoute({
    hasIframe: true,
    hasRedirect: false,
  }), false)
})

test('mixed (iframe + redirect) => false (PlayerModal cuida do iframe)', () => {
  assert.equal(shouldOpenRedirectOnRoute({
    hasIframe: true,
    hasRedirect: true,
  }), false)
})

test('so redirect => true (abre popup)', () => {
  assert.equal(shouldOpenRedirectOnRoute({
    hasIframe: false,
    hasRedirect: true,
  }), true)
})

test('sem urls => false', () => {
  assert.equal(shouldOpenRedirectOnRoute({
    hasIframe: false,
    hasRedirect: false,
  }), false)
})
