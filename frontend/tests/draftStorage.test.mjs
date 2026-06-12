/**
 * Testes do draftStorage (frontend/src/lib/draftStorage.ts).
 *
 * Persiste rascunho do admin panel em localStorage para evitar perda
 * de alterações não sincronizadas com o Gist.
 *
 * Run: tsc src/lib/draftStorage.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/draftStorage.test.mjs
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { saveDraft, loadDraft, clearDraft } = require('../src/lib/__compiled__/draftStorage.js')

const DRAFT_KEY = 'webtv_channels_draft'

const makeData = (overrides = {}) => ({
  channels: [{ id: '1', title: 'Globo', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] }],
  categories: [{ id: 'c1', name: 'Abertos' }],
  scripts: [],
  ...overrides,
})

beforeEach(() => {
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null },
    setItem(k, v) { this._store[k] = String(v) },
    removeItem(k) { delete this._store[k] },
    clear() { this._store = {} },
    key() { return null },
    get length() { return Object.keys(this._store).length },
  }
})

const flush = () => new Promise(r => setTimeout(r,400))

test('saveDraft grava JSON serializado em localStorage', async () => {
 const data = makeData()
 saveDraft(data)
 await flush()
 const raw = globalThis.localStorage.getItem(DRAFT_KEY)
 assert.ok(raw, 'rascunho não foi gravado')
 const parsed = JSON.parse(raw)
 assert.equal(parsed.channels[0].title, 'Globo')
 assert.equal(parsed.categories[0].name, 'Abertos')
})

test('saveDraft inclui timestamp savedAt', async () => {
 const before = Date.now()
 saveDraft(makeData())
 await flush()
 const after = Date.now()
 const raw = globalThis.localStorage.getItem(DRAFT_KEY)
 const parsed = JSON.parse(raw)
 assert.ok(parsed.savedAt >= before && parsed.savedAt <= after, `savedAt fora do intervalo: ${parsed.savedAt}`)
})

test('loadDraft retorna objeto ChannelsData quando existe rascunho', async () => {
 saveDraft(makeData())
 await flush()
 const loaded = loadDraft()
 assert.ok(loaded, 'loadDraft retornou null')
 assert.equal(loaded.channels[0].id, '1')
 assert.equal(loaded.categories[0].id, 'c1')
})

test('loadDraft retorna null quando não há rascunho', () => {
  assert.equal(loadDraft(), null)
})

test('loadDraft retorna null quando JSON está corrompido', () => {
  globalThis.localStorage.setItem(DRAFT_KEY, '{ inválido')
  assert.equal(loadDraft(), null)
})

test('clearDraft remove o rascunho do localStorage', async () => {
 saveDraft(makeData())
 await flush()
 assert.ok(loadDraft(), 'setup falhou')
 clearDraft()
 assert.equal(loadDraft(), null)
})

test('saveDebounce agrupa múltiplas chamadas em uma escrita', async () => {
  saveDraft(makeData({ channels: [{ id: '1', title: 'v1', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] }] }))
  saveDraft(makeData({ channels: [{ id: '1', title: 'v2', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] }] }))
  saveDraft(makeData({ channels: [{ id: '1', title: 'v3', logoUrl: '', categoryIds: [], active: true, alternativeUrls: [] }] }))
  await new Promise(r => setTimeout(r, 400))
  const loaded = loadDraft()
  assert.equal(loaded.channels[0].title, 'v3', 'última escrita deve prevalecer')
})