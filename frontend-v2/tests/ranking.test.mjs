/**
 * Testes do ranking inteligente (frontend-v2/src/lib/ranking.ts).
 *
 * O modulo importa `parseEmbedcanais` (apenas tipos), entao e compilado
 * isolado com o tsc do projeto.
 *
 * Run: node --test frontend-v2/tests/ranking.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const REPO_ROOT = resolve(V2_ROOT, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/ranking')

/** Catalogo sintetico. */
function makeCatalog() {
  return [
    { id: 1, slug: 'bandsp', name: 'Band SP', category: 'Canais Abertos', href: 'h1', image: 'i1', iframe: '' },
    { id: 2, slug: 'globorj', name: 'Globo Rio', category: 'Canais Abertos', href: 'h2', image: 'i2', iframe: '' },
    { id: 3, slug: 'globosp', name: 'Globo São Paulo', category: 'Canais Abertos', href: 'h3', image: 'i3', iframe: '' },
    { id: 4, slug: 'hbo', name: 'HBO', category: 'Filmes e Séries', href: 'h4', image: 'i4', iframe: '' },
    { id: 5, slug: 'hbo2', name: 'HBO 2', category: 'Filmes e Séries', href: 'h5', image: 'i5', iframe: '' },
    { id: 6, slug: 'espn', name: 'ESPN', category: 'Esportes', href: 'h6', image: 'i6', iframe: '' },
    { id: 7, slug: 'cnn', name: 'CNN Brasil', category: 'Notícias', href: 'h7', image: 'i7', iframe: '' },
    { id: 8, slug: 'gloob', name: 'Gloob', category: 'Infantil', href: 'h8', image: 'i8', iframe: '' },
  ]
}

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/ranking.ts'),
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--outDir',
      OUT_DIR,
    ],
    { cwd: REPO_ROOT, stdio: 'pipe' },
  )

  const outFile = resolve(OUT_DIR, 'ranking.js')
  assert.ok(existsSync(outFile), `modulo compilado nao encontrado: ${outFile}`)
  return import(pathToFileURL(outFile).href)
}

const mod = await loadModule()
const { rankChannels, extractBrand, isVariant, countBrands, recencyScore, frequencyScore, userWeight, topReasons } =
  mod

const NOW = 1_700_000_000_000

test('ranking: extractBrand identifica a familia do canal', () => {
  assert.equal(extractBrand('HBO 2'), 'HBO')
  assert.equal(extractBrand('ESPN 03'), 'ESPN')
  assert.equal(extractBrand('HBO +2'), 'HBO')
  assert.equal(extractBrand('Globo Rio'), 'Globo')
  assert.equal(extractBrand('SBT São Paulo'), 'SBT')
  assert.equal(extractBrand('Prime Video'), 'Prime')
  assert.equal(extractBrand(''), '')
})

test('ranking: isVariant detecta canais derivados', () => {
  assert.equal(isVariant('HBO 2'), true)
  assert.equal(isVariant('ESPN 03'), true)
  assert.equal(isVariant('HBO'), false)
  assert.equal(isVariant('HBO Plus'), false)
  assert.equal(isVariant('Globo Rio'), false)
})

test('ranking: countBrands agrupa os canais por marca', () => {
  const counts = countBrands(makeCatalog())
  assert.equal(counts.get('Globo'), 2)
  assert.equal(counts.get('HBO'), 2)
  assert.equal(counts.get('Band'), 1)
})

test('ranking: visitante novo (sem historico) tem peso zero do usuario', () => {
  assert.equal(userWeight({}), 0)

  // 1 abertura = peso 1/3 (o historico ainda e fraco).
  assert.equal(userWeight({ a: { count: 1, lastOpenedAt: NOW, firstOpenedAt: NOW } }), 1 / 3)

  // 3 aberturas = peso maximo (1).
  assert.equal(
    userWeight({ a: { count: 3, lastOpenedAt: NOW, firstOpenedAt: NOW } }),
    1,
  )

  // 3 canais abertos 1x cada tambem soma 3.
  assert.equal(
    userWeight({
      a: { count: 1, lastOpenedAt: NOW, firstOpenedAt: NOW },
      b: { count: 1, lastOpenedAt: NOW, firstOpenedAt: NOW },
      c: { count: 1, lastOpenedAt: NOW, firstOpenedAt: NOW },
    }),
    1,
  )
})

test('ranking: recencyScore decai com o tempo', () => {
  assert.equal(recencyScore(undefined, NOW), 0)
  assert.equal(recencyScore(NOW, NOW), 1)
  // 7 dias = meia-vida => ~0.5
  assert.ok(Math.abs(recencyScore(NOW - 7 * 86_400_000, NOW) - 0.5) < 0.01)
  // Depois da janela (60 dias) zera
  assert.equal(recencyScore(NOW - 61 * 86_400_000, NOW), 0)
})

test('ranking: frequencyScore usa escala absoluta (10 = nota 1)', () => {
  assert.equal(frequencyScore(undefined), 0)
  assert.equal(frequencyScore(0), 0)
  assert.equal(frequencyScore(5), 0.5)
  assert.equal(frequencyScore(10), 1)
  assert.equal(frequencyScore(50), 1, 'satura em 1')
})

test('ranking: canais de TV aberta sobem no topo (visitante novo)', () => {
  const ranked = rankChannels(makeCatalog(), {}, NOW, 10)
  const names = ranked.map(r => r.channel.name)

  assert.equal(ranked[0].channel.category, 'Canais Abertos')
  assert.ok(
    names.includes('Band SP') && names.includes('Globo Rio'),
    `esperava canais abertos no topo, veio: ${names.join(', ')}`,
  )
})

test('ranking: a variante (HBO 2) pontua abaixo do canal principal (HBO)', () => {
  const ranked = rankChannels(makeCatalog(), {}, NOW, 10)
  const hbo = ranked.find(r => r.channel.slug === 'hbo')
  const hbo2 = ranked.find(r => r.channel.slug === 'hbo2')

  assert.ok(hbo.score > hbo2.score, `HBO (${hbo.score}) deveria pontuar acima de HBO 2 (${hbo2.score})`)
})

test('ranking: historico do usuario muda a ordem do topo', () => {
  const catalogo = makeCatalog()
  const semHistorico = rankChannels(catalogo, {}, NOW, 10).map(r => r.channel.slug)

  // O usuario assistiu Gloob varias vezes, ha pouco.
  const usage = {
    gloob: { count: 9, lastOpenedAt: NOW - 3600_000, firstOpenedAt: NOW - 86_400_000 },
  }
  const comHistorico = rankChannels(catalogo, usage, NOW, 10)

  assert.equal(comHistorico[0].channel.slug, 'gloob', 'o canal mais assistido deve ir ao topo')
  assert.notEqual(semHistorico[0], 'gloob')
})

test('ranking: uso antigo pesa menos que uso recente', () => {
  const catalogo = makeCatalog()
  const usageAntigo = { gloob: { count: 5, lastOpenedAt: NOW - 40 * 86_400_000, firstOpenedAt: 0 } }
  const usageRecente = { gloob: { count: 5, lastOpenedAt: NOW - 60_000, firstOpenedAt: 0 } }

  const recente = rankChannels(catalogo, usageRecente, NOW, 10).find(r => r.channel.slug === 'gloob')
  const antigo = rankChannels(catalogo, usageAntigo, NOW, 10).find(r => r.channel.slug === 'gloob')

  assert.ok(recente.score > antigo.score, 'uso recente deve pontuar mais que uso antigo')
})

test('ranking: o limite e respeitado', () => {
  const ranked = rankChannels(makeCatalog(), {}, NOW, 3)
  assert.equal(ranked.length, 3)
})

test('ranking: catalogo vazio devolve lista vazia', () => {
  assert.deepEqual(rankChannels([], {}, NOW, 10), [])
})

test('ranking: a ordem e estavel (mesma entrada -> mesmo resultado)', () => {
  const catalogo = makeCatalog()
  const a = rankChannels(catalogo, {}, NOW, 10).map(r => r.channel.slug)
  const b = rankChannels(catalogo, {}, NOW, 10).map(r => r.channel.slug)
  assert.deepEqual(a, b)
})

test('ranking: topReasons devolve os sinais mais fortes', () => {
  const ranked = rankChannels(makeCatalog(), {}, NOW, 10)
  const reasons = topReasons(ranked[0], 2)

  assert.equal(reasons.length, 2)
  // Ordenados por peso absoluto.
  assert.ok(Math.abs(reasons[0].weight) >= Math.abs(reasons[1].weight))
})
