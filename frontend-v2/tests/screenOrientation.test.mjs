/**
 * Testes da deteccao de orientacao (frontend-v2/src/lib/screenOrientation.ts).
 *
 * A WebView do Android nao implementa `screen.orientation.lock()`, entao o
 * app gira o layout via CSS quando a janela esta em retrato. A decisao e
 * PURA (recebe UA/dimensoes/bridge) e testada aqui; o efeito no DOM
 * (`installScreenOrientation`) e coberto pelo teste de browser.
 *
 * Run: node --test frontend-v2/tests/screenOrientation.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const V2_ROOT = resolve(HERE, '..')
const OUT_DIR = resolve(V2_ROOT, 'src/lib/__compiled__/screenOrientation')

async function loadModule() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })

  execFileSync(
    process.execPath,
    [
      resolve(V2_ROOT, 'node_modules/typescript/bin/tsc'),
      resolve(V2_ROOT, 'src/lib/screenOrientation.ts'),
      '--outDir',
      OUT_DIR,
      '--module',
      'esnext',
      '--target',
      'es2020',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
      '--strict',
      '--lib',
      'es2020,dom',
    ],
    { stdio: 'pipe', cwd: V2_ROOT },
  )

  return import(pathToFileURL(resolve(OUT_DIR, 'screenOrientation.js')).href)
}

const mod = await loadModule()
const { isWebTvApp, shouldForceLandscape } = mod

/** Ambiente base: app WebTV em um celular Android em retrato. */
const appPortrait = {
  userAgent: 'WebTV/1.0 (Android)',
  width: 412,
  height: 915,
  hasBridge: true,
}

test('isWebTvApp: reconhece o bridge e o UA customizado', () => {
  assert.equal(
    isWebTvApp({ userAgent: 'Mozilla/5.0', width: 0, height: 0, hasBridge: true }),
    true,
    'o bridge do Kotlin identifica o app',
  )
  assert.equal(
    isWebTvApp({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; wv) WebTV/1.0 (Android)',
      width: 0,
      height: 0,
      hasBridge: false,
    }),
    true,
    'o UA WebTV/x identifica o app',
  )
  assert.equal(
    isWebTvApp({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      width: 0,
      height: 0,
      hasBridge: false,
    }),
    false,
    'navegador comum nao e o app',
  )
})

test('shouldForceLandscape: app Android em retrato gira', () => {
  assert.equal(shouldForceLandscape(appPortrait), true)
})

test('shouldForceLandscape: iPhone nao gira', () => {
  assert.equal(
    shouldForceLandscape({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      width: 390,
      height: 844,
      hasBridge: false,
    }),
    false,
  )
})

test('shouldForceLandscape: Android no navegador (sem app) nao gira', () => {
  assert.equal(
    shouldForceLandscape({
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      width: 412,
      height: 915,
      hasBridge: false,
    }),
    false,
    'apenas o app gira: no navegador a rotacao nativa decide',
  )
})

test('shouldForceLandscape: app em paisagem nao gira', () => {
  assert.equal(
    shouldForceLandscape({ ...appPortrait, width: 915, height: 412 }),
    false,
  )
})

test('shouldForceLandscape: app Android com UA padrao da WebView gira', () => {
  assert.equal(
    shouldForceLandscape({
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36',
      width: 412,
      height: 915,
      hasBridge: true,
    }),
    true,
  )
})

test('shouldForceLandscape: desktop com janela retrato nao gira', () => {
  assert.equal(
    shouldForceLandscape({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
      width: 500,
      height: 900,
      hasBridge: false,
    }),
    false,
  )
})
