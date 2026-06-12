/**
 * Testes do dirtyState (frontend/src/hooks/useChannelsData.ts).
 *
 * Detecta se o estado atual diverge do baseline (último estado sincronizado
 * com o Gist) para exibir o contador de alterações pendentes.
 *
 * Run: tsc src/lib/dirtyState.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/dirtyState.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isDirty, countPendingChanges } = require('../src/lib/__compiled__/dirtyState.js')

const base = () => ({
  channels: [{ id: '1', title: 'Globo', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] }],
  categories: [{ id: 'c1', name: 'Abertos' }],
  scripts: [{ id: 's1', name: 'rdc', domain: 'rdc', subdomains: [], code: 'x', enabled: true, createdAt: 0, updatedAt: 0 }],
})

test('isDirty retorna false quando baseline é null', () => {
  assert.equal(isDirty(null, base()), false)
})

test('isDirty retorna false quando current é igual ao baseline', () => {
  const b = base()
  assert.equal(isDirty(b, JSON.parse(JSON.stringify(b))), false)
})

test('isDirty retorna true quando channel é adicionado', () => {
  const b = base()
  const next = JSON.parse(JSON.stringify(b))
  next.channels.push({ id: '2', title: 'SBT', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] })
  assert.equal(isDirty(b, next), true)
})

test('isDirty retorna true quando channel é removido', () => {
  const b = base()
  const next = JSON.parse(JSON.stringify(b))
  next.channels.pop()
  assert.equal(isDirty(b, next), true)
})

test('isDirty retorna true quando channel é editado', () => {
  const b = base()
  const next = JSON.parse(JSON.stringify(b))
  next.channels[0].title = 'Globo SP'
  assert.equal(isDirty(b, next), true)
})

test('isDirty retorna true quando categoria muda', () => {
  const b = base()
  const next = JSON.parse(JSON.stringify(b))
  next.categories[0].name = 'TV Aberta'
  assert.equal(isDirty(b, next), true)
})

test('isDirty retorna true quando script muda', () => {
  const b = base()
  const next = JSON.parse(JSON.stringify(b))
  next.scripts[0].code = 'y'
  assert.equal(isDirty(b, next), true)
})

test('countPendingChanges retorna 0 quando limpo', () => {
  const b = base()
  assert.equal(countPendingChanges(b, JSON.parse(JSON.stringify(b))), 0)
})

test('countPendingChanges retorna 1 quando 1 canal adicionado', () => {
  const b = base()
  const next = JSON.parse(JSON.stringify(b))
  next.channels.push({ id: '2', title: 'SBT', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] })
  assert.equal(countPendingChanges(b, next), 1)
})

test('countPendingChanges soma múltiplas alterações', () => {
 const b = base()
 const next = JSON.parse(JSON.stringify(b))
 next.channels.push({ id: '2', title: 'SBT', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] })
 next.categories[0].name = 'TV Aberta'
 next.scripts[0].code = 'y'
 assert.equal(countPendingChanges(b, next), 3)
})

test('countPendingChanges detecta mudança só em scripts', () => {
 const b = base()
 const next = JSON.parse(JSON.stringify(b))
 next.scripts = []
 assert.equal(countPendingChanges(b, next), 1)
})

test('countPendingChanges detecta mudança só em categories', () => {
 const b = base()
 const next = JSON.parse(JSON.stringify(b))
 next.categories = []
 assert.equal(countPendingChanges(b, next), 1)
})