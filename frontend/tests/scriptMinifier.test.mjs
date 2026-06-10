/**
 * Testes do validateScript (frontend/src/utils/scriptMinifier.ts).
 *
 * Usa a versão compilada em src/utils/__compiled__/scriptMinifier.js
 * gerada por `tsc src/utils/scriptMinifier.ts --outDir src/utils/__compiled__`.
 *
 * Run: node --test frontend/tests/scriptMinifier.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { validateScript } = require('../src/utils/__compiled__/scriptMinifier.js')

const RD_PATH = 'E:/Dev Workspace/WebTV/frontend/docs/scripts/rdcanais-replace-content.min.js'
const EMBED_PATH = 'E:/Dev Workspace/WebTV/frontend/docs/scripts/embeddecanais-replace-content.min.js'

test('strings não interferem no balanceamento', () => {
  const r = validateScript('var s = "(()))((("; var x = 1;')
  assert.equal(r.valid, true, `erros: ${r.errors.join(', ')}`)
})

test('regex literais não interferem', () => {
  const r = validateScript('var r = /([a-z]{2,4})(["\\\'])/g; var x = 1;')
  assert.equal(r.valid, true, `erros: ${r.errors.join(', ')}`)
})

test('divisão vs regex — contexto importa', () => {
  const r = validateScript('var x = 5 / 2 / 1;')
  assert.equal(r.valid, true)
})

test('template literal com ${} aninhado', () => {
  const r = validateScript('var s = `texto ${a + b} mais`;')
  assert.equal(r.valid, true, `erros: ${r.errors.join(', ')}`)
})

test('comentários de linha ignorados', () => {
  const r = validateScript('// {[( )] }\nvar x = 1;')
  assert.equal(r.valid, true)
})

test('comentários de bloco ignorados', () => {
  const r = validateScript('/* { ( [ } ] ) */ var x = 1;')
  assert.equal(r.valid, true)
})

test('escape em string pula próximo char', () => {
  const r = validateScript('var s = "abc \\" (\\) xyz";')
  assert.equal(r.valid, true, `erros: ${r.errors.join(', ')}`)
})

test('escape em regex pula próximo char', () => {
  const r = validateScript('var r = /\\//g; var x = 1;')
  assert.equal(r.valid, true)
})

test('parêntese NÃO balanceado detectado', () => {
  const r = validateScript('function foo(a, b { return a; }')
  assert.equal(r.valid, false)
  assert.ok(r.errors.some(e => e.toLowerCase().includes('parêntese')))
})

test('regex com colchetes [abc] não conta como bracket', () => {
  const r = validateScript('var r = /[a-z]+/g; var x = 1;')
  assert.equal(r.valid, true)
})

test('eval detectado como warning', () => {
  const r = validateScript('window.eval("alert(1)");')
  assert.ok(r.warnings.some(w => w.includes('eval')))
})

test('new Function detectado como warning', () => {
  const r = validateScript('var f = new Function("return 1");')
  assert.ok(r.warnings.some(w => w.includes('new Function')))
})

test('tamanho > 50KB é erro', () => {
  const code = 'var x = "' + 'a'.repeat(51000) + '";'
  const r = validateScript(code)
  assert.ok(r.errors.some(e => e.includes('50KB')))
})

test('regex complexo do rdcanais minificado deve passar', () => {
  const code = 'var r = /(https?:\\/\\/[^\'\\s"<>]*\\/(?:index|master)\\.m3u8(?:\\?[^\'\\s"<>]*)?)/i;'
  const r = validateScript(code)
  assert.equal(r.valid, true, `erros: ${r.errors.join(', ')}`)
})

test('múltiplos regex com parênteses balanceados', () => {
  const code = `
    var r1 = /(['"]([A-Za-z0-9+\\/=]+)['"])/g;
    var r2 = /\\(\\s*(\\d{6,12})\\s*\\)\\s*;/;
    function foo(a, b) { return a + b; }
  `
  const r = validateScript(code)
  assert.equal(r.valid, true, `erros: ${r.errors.join(', ')}`)
})

// ============================================================================
// VALIDAÇÃO CONTRA SCRIPTS REAIS
// ============================================================================

test('rdcanais-replace-content.min.js deve passar (era o bug)', () => {
  const code = readFileSync(RD_PATH, 'utf8')
  const r = validateScript(code)
  assert.equal(r.valid, true, `esperado válido, erros: ${r.errors.join(' | ')}`)
  assert.equal(r.errors.length, 0)
})

test('embeddecanais-replace-content.min.js continua passando', () => {
  const code = readFileSync(EMBED_PATH, 'utf8')
  const r = validateScript(code)
  assert.equal(r.valid, true, `esperado válido, erros: ${r.errors.join(' | ')}`)
})
