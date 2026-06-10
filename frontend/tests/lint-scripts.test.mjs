/**
 * Testes do linter de scripts.
 *
 * Run: node --test frontend/tests/lint-scripts.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countDelimiters, validateCode } from './lint-scripts.mjs'

test('strings não interferem no balanceamento', () => {
  const code = 'var s = "(()))((("; var x = 1;'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0, `esperado 0, obtido ${r.paren}`)
})

test('regex literais não interferem', () => {
  const code = 'var r = /([a-z]{2,4})(["\\\'])/g; var x = 1;'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0, `paren esperado 0, obtido ${r.paren}`)
  assert.equal(r.bracket, 0, `bracket esperado 0, obtido ${r.bracket}`)
  assert.equal(r.brace, 0, `brace esperado 0, obtido ${r.brace}`)
})

test('divisão vs regex — contexto importa', () => {
  const code = 'var x = 5 / 2 / 1;'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0)
})

test('template literal com ${} aninhado conta chaves', () => {
  const code = 'var s = `texto ${a + b} mais`;'
  const r = countDelimiters(code)
  assert.equal(r.brace, 0, `esperado 0, obtido ${r.brace}`)
  assert.equal(r.bracket, 0)
})

test('comentários de linha ignorados', () => {
  const code = '// {[( )] }\nvar x = 1;'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0)
  assert.equal(r.brace, 0)
  assert.equal(r.bracket, 0)
})

test('comentários de bloco ignorados', () => {
  const code = '/* { ( [ } ] ) */ var x = 1;'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0)
  assert.equal(r.brace, 0)
  assert.equal(r.bracket, 0)
})

test('escape em string pula próximo char', () => {
  const code = 'var s = "abc \\" (\\) xyz";'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0, `esperado 0, obtido ${r.paren}`)
})

test('escape em regex pula próximo char', () => {
  const code = 'var r = /\\//g; var x = 1;'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0)
})

test('parênteses reais ainda são contados', () => {
  const code = 'function foo(a, b) { return (a + b); }'
  const r = countDelimiters(code)
  assert.equal(r.paren, 0)
  assert.equal(r.brace, 0)
})

test('parêntese NÃO balanceado detectado', () => {
  const code = 'function foo(a, b { return a; }'
  const r = countDelimiters(code)
  assert.notEqual(r.paren, 0, 'deveria detectar parêntese aberto sem fechamento')
})

test('regex com colchetes [abc] não conta como bracket', () => {
  const code = 'var r = /[a-z]+/g; var x = 1;'
  const r = countDelimiters(code)
  assert.equal(r.bracket, 0)
})

test('validateCode — script válido', () => {
  const code = 'function foo() { var r = /([a-z]+)/g; return "x"; }'
  const r = validateCode(code)
  assert.equal(r.valid, true, `esperado válido, erros: ${r.errors.join(', ')}`)
})

test('validateCode — detecta parêntese desbalanceado em código real', () => {
  const code = 'function foo() { var x = (1 + 2; }'
  const r = validateCode(code)
  assert.equal(r.valid, false)
})

test('validateCode — detecta eval como warning', () => {
  const code = 'window.eval("alert(1)");'
  const r = validateCode(code)
  assert.ok(r.warnings.length > 0, 'deveria gerar warning para eval')
  assert.ok(r.warnings.some(w => w.includes('eval')))
})

test('validateCode — detecta new Function como warning', () => {
  const code = 'var f = new Function("return 1");'
  const r = validateCode(code)
  assert.ok(r.warnings.some(w => w.includes('new Function')))
})

test('validateCode — tamanho > 50KB é erro', () => {
  const code = 'var x = "' + 'a'.repeat(51000) + '";'
  const r = validateCode(code)
  assert.ok(r.errors.some(e => e.includes('50KB')))
})

test('validateCode — regex complexo do rdcanais minificado deve passar', () => {
  // Pedaço real do rdcanais-replace-content.min.js
  const code = 'var r = /(https?:\\/\\/[^\'\\s"<>]*\\/(?:index|master)\\.m3u8(?:\\?[^\'\\s"<>]*)?)/i;'
  const r = validateCode(code)
  assert.equal(r.valid, true, `esperado válido, erros: ${r.errors.join(', ')}`)
})

test('validateCode — múltiplos regex com parênteses balanceados', () => {
  const code = `
    var r1 = /(['"]([A-Za-z0-9+\\/=]+)['"])/g;
    var r2 = /\\(\\s*(\\d{6,12})\\s*\\)\\s*;/;
    function foo(a, b) { return a + b; }
  `
  const r = validateCode(code)
  assert.equal(r.valid, true, `esperado válido, erros: ${r.errors.join(', ')}`)
})