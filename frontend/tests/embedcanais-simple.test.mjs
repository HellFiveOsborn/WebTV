/**
 * Integration test for embedcanais-simple-player.js
 *
 * Valida, em um navegador real (Edge via CDP):
 *   1. A descoberta da URL usa window.vipPlayer.options.source
 *   2. O DOM original é substituído por um único <video>
 *   3. O Hls.js toca o stream (currentTime avança)
 *   4. O banner VIP (#vipModal), #embedBtn e HUDs não existem/estão ocultos
 *   5. Depois de LONG_WAIT, o vídeo continua tocando e nenhum banner voltou
 *   6. Nenhuma recarga de página e nenhuma sessão HLS de "vip_reconnect"
 *
 * Run:
 *   $env:CDP_URL = "http://127.0.0.1:9333"
 *   node frontend/tests/embedcanais-simple.test.mjs
 *   $env:LONG_WAIT = "1"; node frontend/tests/embedcanais-simple.test.mjs   # 200s
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const URL = process.env.TEST_URL || 'https://embedcanaisdetv.xyz/e/index.php?canal=premiereclubes';
const SCRIPT_PATH = process.env.SCRIPT_PATH ||
  'E:/Dev Workspace/WebTV/frontend/docs/scripts/embedcanais-simple-player.js';
const LONG_WAIT = process.env.LONG_WAIT === '1';
const PRE_WAIT_MS = 7000;
const POST_WAIT_MS = 12000;
const LONG_WAIT_MS = 200000;

const scriptContent = readFileSync(SCRIPT_PATH, 'utf8');

function log(msg) { process.stdout.write(`[test] ${msg}\n`); }
function fail(msg) { console.error(`\n[FAIL] ${msg}\n`); process.exit(1); }
function pass(msg) { console.log(`\n[PASS] ${msg}\n`); }

const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

const reconnects = [];
const errors = [];
page.on('request', (req) => {
  if (req.url().includes('vip_reconnect')) reconnects.push(req.url());
});
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

log(`Navegando para ${URL}...`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  .catch((e) => log(`goto (non-fatal): ${e.message}`));

log(`Aguardando ${PRE_WAIT_MS}ms para o player original...`);
await page.waitForTimeout(PRE_WAIT_MS);

const before = await page.evaluate(() => ({
  url: location.href,
  hasVipPlayer: typeof window.vipPlayer,
  source: window.vipPlayer?.options?.source || null,
  hasVipModal: !!document.getElementById('vipModal'),
  timeOrigin: performance.timeOrigin
}));
log(`Antes: ${JSON.stringify(before)}`);

if (!before.source) fail('window.vipPlayer.options.source não encontrado antes da injeção');

log(`Injetando script (${scriptContent.length} bytes)...`);
const injected = await page.evaluate((code) => {
  try {
    delete window.__webtv_embedcanais_simple;
    delete window.__webtv_hls;
    // eslint-disable-next-line no-eval
    eval(code);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}, scriptContent);
if (!injected.ok) fail(`Injeção falhou: ${injected.error}`);

log(`Aguardando ${POST_WAIT_MS}ms para o Hls.js...`);
await page.waitForTimeout(POST_WAIT_MS);

async function snapshot(label) {
  const state = await page.evaluate(() => {
    const video = document.querySelector('video');
    const vip = document.getElementById('vipModal');
    const embed = document.getElementById('embedBtn');
    const highZ = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const s = getComputedStyle(el);
      return (s.position === 'fixed' || s.position === 'absolute') &&
        parseInt(s.zIndex, 10) > 9000 &&
        s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    }).map((el) => el.id || el.className || el.tagName).slice(0, 10);
    return {
      url: location.href,
      timeOrigin: performance.timeOrigin,
      videos: document.querySelectorAll('video').length,
      videoId: video?.id || null,
      paused: video?.paused ?? null,
      currentTime: video?.currentTime ?? null,
      readyState: video?.readyState ?? null,
      src: video?.currentSrc ? video.currentSrc.slice(0, 90) : null,
      vipExists: !!vip,
      vipDisplay: vip ? getComputedStyle(vip).display : 'gone',
      embedExists: !!embed,
      highZ,
      status: window.WebTV?.player?.getStatus?.() || null
    };
  });
  log(`${label}: ${JSON.stringify(state, null, 2)}`);
  return state;
}

const after = await snapshot('Depois');

if (after.videos !== 1) fail(`Esperado 1 <video>, encontrado ${after.videos}`);
if (after.videoId !== 'webtv-player-video') fail(`<video> inesperado: ${after.videoId}`);
if (after.vipExists) fail('Banner #vipModal ainda existe no DOM');
if (after.embedExists) fail('Botão #embedBtn ainda existe no DOM');
if (after.timeOrigin !== before.timeOrigin) fail('A página recarregou durante a injeção');
if (!after.status?.found) fail('window.WebTV.player.getStatus() não encontrou o vídeo');
if (!after.status?.url) fail('URL do stream não exposta em getStatus()');
if (after.highZ.length) fail(`Elementos de banner com z-index alto: ${after.highZ.join(', ')}`);

log('Aguardando 6s para confirmar avanço do currentTime...');
const t1 = await page.evaluate(() => document.querySelector('video')?.currentTime ?? null);
await page.waitForTimeout(6000);
const t2 = await page.evaluate(() => document.querySelector('video')?.currentTime ?? null);
if (t1 === null || t2 === null) fail('Não foi possível ler currentTime');
if (!(t2 > t1)) fail(`currentTime não avançou (${t1} -> ${t2})`);
pass(`Player tocando (${t1.toFixed(1)}s -> ${t2.toFixed(1)}s)`);

log('Testando DPAD Enter (play/pause)...');
const pausedBefore = await page.evaluate(() => Boolean(document.querySelector('video')?.paused));
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const pausedAfter = await page.evaluate(() => Boolean(document.querySelector('video')?.paused));
if (pausedBefore === pausedAfter) fail('DPAD Enter não alternou play/pause');
if (pausedAfter) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
}
const resumed = await page.evaluate(() => !document.querySelector('video')?.paused);
if (!resumed) fail('Vídeo não voltou a tocar após DPAD Enter');
pass('DPAD Enter alterna play/pause');

if (LONG_WAIT) {
  log(`Aguardando ${LONG_WAIT_MS / 1000}s para validar o banner VIP de 180s...`);
  await page.waitForTimeout(LONG_WAIT_MS);
  const longState = await snapshot('Longo prazo');
  if (longState.timeOrigin !== before.timeOrigin) fail('A página recarregou durante o teste longo');
  if (longState.videos !== 1) fail(`Vídeo sumiu/duplicou: ${longState.videos}`);
  if (longState.vipExists) fail('Banner #vipModal voltou após o timer');
  if (longState.paused) fail('Vídeo pausou sozinho no teste longo');
  if (!(longState.currentTime > t2)) fail('currentTime parou no teste longo');
  if (longState.highZ.length) fail(`Banner reapareceu: ${longState.highZ.join(', ')}`);
  pass('Nenhum banner reapareceu após o timer; player continua tocando');
}

if (reconnects.length) fail(`Monitor antigo recriou HLS (${reconnects.length} requests vip_reconnect)`);
if (errors.length) log(`Avisos de console/pageerror (não fatais): ${errors.slice(0, 5).join(' | ')}`);

pass('Todos os critérios validados');
await page.close();
await browser.close();
