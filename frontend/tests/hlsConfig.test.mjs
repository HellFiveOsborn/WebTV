/**
 * Testes do hlsConfig (frontend/src/lib/hlsConfig.ts).
 *
 * Verifica que a config exportada contem os tunings para Android TV 1.5GB RAM
 * documentados em frontend/AGENTS.md (sessao "Scripts de Injecao").
 *
 * Run: tsc src/lib/hlsConfig.ts --target es2022 --module nodenext --moduleResolution nodenext --outDir src/lib/__compiled__ && node --test tests/hlsConfig.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { HLS_CONFIG_ANDROID_TV } = require('../src/lib/__compiled__/hlsConfig.js')

test('enableWorker true (off-load parser/demuxer)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.enableWorker, true)
})

test('lowLatencyMode false (LL-HLS usa mais memoria)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.lowLatencyMode, false)
})

test('backBufferLength 30 (limpa segmentos antigos rapido)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.backBufferLength, 30)
})

test('maxBufferLength 20 (reduzido vs default 30)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.maxBufferLength, 20)
})

test('maxMaxBufferLength 60 (hard cap)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.maxMaxBufferLength, 60)
})

test('maxBufferSize 30MB (hard limit)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.maxBufferSize, 30 * 1000 * 1000)
})

test('capLevelToPlayerSize true (evita upscaling)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.capLevelToPlayerSize, true)
})

test('startLevel -1 (ABR automatico)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.startLevel, -1)
})

test('retries em 3 (frag/level/manifest)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.fragLoadingMaxRetry, 3)
  assert.equal(HLS_CONFIG_ANDROID_TV.levelLoadingMaxRetry, 3)
  assert.equal(HLS_CONFIG_ANDROID_TV.manifestLoadingMaxRetry, 3)
})

test('abrEwmaDefaultEstimate 5Mbps', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.abrEwmaDefaultEstimate, 5000000)
})

test('abrBandwidthFactor 0.7 (conservador)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.abrBandwidthFactor, 0.7)
})

test('enableSoftwareAES false (nao desperdiça CPU em AES via software)', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.enableSoftwareAES, false)
})

test('liveSyncDurationCount e liveMaxLatencyDurationCount configurados', () => {
  assert.equal(HLS_CONFIG_ANDROID_TV.liveSyncDurationCount, 3)
  assert.equal(HLS_CONFIG_ANDROID_TV.liveMaxLatencyDurationCount, 6)
})
