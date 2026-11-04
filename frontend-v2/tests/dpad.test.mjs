/**
 * Testes do motor de D-pad (frontend-v2/src/lib/dpad.ts).
 *
 * O modulo e PURO (nao importa nada): os testes rodam direto em Node,
 * sem browser.
 *
 * Cobre a heuristica espacial (a mesma dos sistemas de TV):
 *   - a direcao e respeitada (o alvo precisa estar do lado pedido);
 *   - o alinhamento perpendicular e prioridade (o "pulo" de linha);
 *   - o alvo mais proximo ganha;
 *   - os limites (`maxCross`, `directionTolerance`);
 *   - o utilitario de lista (`nextInList`).
 *
 * Run: node --test frontend-v2/tests/dpad.test.mjs
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
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/dpad')

/** Compila o modulo TS e importa o JS gerado. */
async function loadModule() {
  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const tsc = resolve(V2_ROOT, 'node_modules/typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [
      tsc,
      resolve(V2_ROOT, 'src/lib/dpad.ts'),
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

  const file = resolve(OUT_DIR, 'dpad.js')
  assert.ok(existsSync(file), 'o modulo compilado deveria existir')
  return import(pathToFileURL(file).href)
}

const mod = await loadModule()
const { findDpadTarget, projectRect, nextInList, directionBetween, DPAD_DEFAULTS } = mod

/* ------------------------------------------------------------------ *
 * Helpers de geometria
 * ------------------------------------------------------------------ */

/** Retangulo a partir de left/top (tamanho padrao 100x100). */
const rect = (left, top, width = 100, height = 100) => ({ left, top, width, height })

/** Item do motor a partir de um retangulo. */
const item = (id, left, top, width = 100, height = 100) => ({
  target: id,
  rect: rect(left, top, width, height),
})

/* ------------------------------------------------------------------ *
 * Projecao
 * ------------------------------------------------------------------ */

test('projectRect: mede a distancia na direcao e o desalinhamento', () => {
  const from = rect(0, 0)
  const right = rect(200, 10)

  const p = projectRect(from, right, 'right')
  assert.equal(p.primary, 100, 'distancia a direita = 200 - 100')
  // Centro do alvo: (200+50, 10+50) = (250, 60). Centro da origem: (50, 50).
  assert.equal(p.cross, 10, 'desalinhamento vertical = |60 - 50|')

  const left = projectRect(from, rect(-200, 0), 'left')
  assert.equal(left.primary, 100, 'distancia a esquerda = 0 - (-200 + 100)')
  assert.equal(left.cross, 0)

  const down = projectRect(from, rect(0, 300), 'down')
  assert.equal(down.primary, 200, 'distancia abaixo = 300 - 100')
  assert.equal(down.cross, 0)
})

/* ------------------------------------------------------------------ *
 * Heuristica espacial
 * ------------------------------------------------------------------ */

test('findDpadTarget: respeita a direcao pedida', () => {
  const from = rect(0, 0, 100, 100)
  const items = [
    item('direita', 300, 0),
    item('esquerda', -300, 0),
    item('baixo', 0, 300),
    item('acima', 0, -300),
  ]

  assert.equal(findDpadTarget(from, items, 'right').target, 'direita')
  assert.equal(findDpadTarget(from, items, 'left').target, 'esquerda')
  assert.equal(findDpadTarget(from, items, 'down').target, 'baixo')
  assert.equal(findDpadTarget(from, items, 'up').target, 'acima')
})

test('findDpadTarget: devolve null quando nao ha nada na direcao', () => {
  const from = rect(0, 0)
  assert.equal(findDpadTarget(from, [item('baixo', 0, 300)], 'right'), null)
  assert.equal(findDpadTarget(from, [], 'right'), null)
})

test('findDpadTarget: o alinhamento perpendicular tem prioridade', () => {
  // Dois candidatos a direita: um alinhado (mesma linha) e um
  // desalinhado (60px abaixo). O alinhado deve vencer, mesmo estando
  // um pouco mais longe.
  const from = rect(0, 0, 100, 100)
  const items = [
    item('desalinhado', 260, 110),
    item('alinhado', 300, 0),
  ]

  const target = findDpadTarget(from, items, 'right')
  assert.equal(target.target, 'alinhado', 'o alvo alinhado deve vencer')
})

test('findDpadTarget: sem alinhamento, vence o mais proximo', () => {
  const from = rect(0, 0, 100, 100)
  const items = [
    item('longe', 500, 120),
    item('perto', 260, 110),
  ]

  const target = findDpadTarget(from, items, 'right')
  assert.equal(target.target, 'perto')
})

test('findDpadTarget: maxCross limita o quanto o foco pode pular de linha', () => {
  const from = rect(0, 0, 100, 100)
  const items = [
    item('mesma-linha', 300, 0),
    item('outra-linha', 260, 400),
  ]

  // Sem limite: o alvo alinhado (mesma linha) vence - e o
  // comportamento de um controle remoto: o foco "pula" para a linha
  // vizinha em vez de viajar na diagonal.
  assert.equal(findDpadTarget(from, items, 'right').target, 'mesma-linha')

  // Com limite de desalinhamento (200px), a outra linha fica fora.
  const limited = findDpadTarget(from, items, 'right', { maxCross: 200 })
  assert.equal(
    limited.target,
    'mesma-linha',
    'com maxCross, o alvo muito desalinhado e descartado',
  )

  // Sem o desconto de alinhamento e sem limite, o mais proximo vence.
  const semAlinhamento = findDpadTarget(from, items, 'right', {
    alignedFactor: 1,
    alignTolerance: 0,
    maxCross: 200,
  })
  assert.equal(
    semAlinhamento.target,
    'mesma-linha',
    'com maxCross a linha distante continua fora',
  )
})

test('findDpadTarget: directionTolerance descarta itens que ainda estao atras', () => {
  const from = rect(0, 0, 100, 100)

  // Encosta na borda: primary = 0 - encosta, mas ainda esta a direita.
  assert.equal(
    findDpadTarget(from, [item('borda', 100, 0)], 'right').target,
    'borda',
    'um item encostado a direita e um candidato valido',
  )

  // 1px atras: primary = -1. A tolerancia padrao (2px) ainda aceita.
  const overlapping = [item('atras', 99, 0)]
  assert.equal(
    findDpadTarget(from, overlapping, 'right').target,
    'atras',
    'com tolerancia de 2px, um item 1px atras ainda entra',
  )

  // Sem tolerancia: qualquer item atras e descartado.
  assert.equal(
    findDpadTarget(from, overlapping, 'right', { directionTolerance: 0 }),
    null,
    'sem tolerancia, o item atras e descartado',
  )
})

test('findDpadTarget: ignora o proprio elemento e os desabilitados', () => {
  const from = rect(0, 0, 100, 100)
  const items = [
    item('atual', 0, 0),
    { target: 'desabilitado', rect: rect(200, 0), enabled: false },
    item('ok', 400, 0),
  ]

  const target = findDpadTarget(from, items, 'right', {}, 'atual')
  assert.equal(target.target, 'ok', 'o item desabilitado deve ser pulado')
})

test('findDpadTarget: um item desabilitado nunca e escolhido', () => {
  const from = rect(0, 0, 100, 100)
  const items = [
    { target: 'off', rect: rect(200, 0), enabled: false },
    { target: 'on', rect: rect(400, 0), enabled: true },
  ]

  assert.equal(findDpadTarget(from, items, 'right').target, 'on')
})

test('findDpadTarget: os valores padrao sao os esperados', () => {
  assert.equal(DPAD_DEFAULTS.crossWeight, 1.8)
  assert.equal(DPAD_DEFAULTS.alignedFactor, 0.5)
  assert.equal(DPAD_DEFAULTS.alignTolerance, 12)
  assert.equal(DPAD_DEFAULTS.maxCross, 0)
  assert.equal(DPAD_DEFAULTS.directionTolerance, 2)
})

/* ------------------------------------------------------------------ *
 * Utilitarios
 * ------------------------------------------------------------------ */

test('nextInList: avanca e recua, sem dar a volta', () => {
  const list = ['a', 'b', 'c']

  assert.equal(nextInList(list, 'a', 1), 'b')
  assert.equal(nextInList(list, 'b', -1), 'a')
  assert.equal(nextInList(list, 'c', 1), null, 'no fim, para (sem loop)')
  assert.equal(nextInList(list, 'a', -1), null, 'no inicio, para (sem loop)')
  assert.equal(nextInList(list, 'x', 1), null, 'item desconhecido')
})

test('directionBetween: a direcao dominante entre dois retangulos', () => {
  assert.equal(directionBetween(rect(0, 0), rect(300, 10)), 'right')
  assert.equal(directionBetween(rect(0, 0), rect(-300, 10)), 'left')
  assert.equal(directionBetween(rect(0, 0), rect(10, 300)), 'down')
  assert.equal(directionBetween(rect(0, 0), rect(10, -300)), 'up')
  assert.equal(directionBetween(rect(0, 0), rect(0, 0)), null)
})
