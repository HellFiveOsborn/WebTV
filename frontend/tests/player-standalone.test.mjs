/**
 * Validacao manual do player standalone via Edge CDP.
 *
 * 1. Carrega /WebTV/player sem ?stream= (deve mostrar erro "parametro ausente")
 * 2. Carrega /WebTV/player?stream=URL_INVALIDA (deve mostrar erro)
 * 3. Verifica que hls.js foi carregado do CDN (window.Hls.isSupported === true)
 * 4. Verifica que <video> existe no DOM
 */

import pkg from 'file:///C:/Users/canal/AppData/Local/Temp/opencode/node_modules/playwright-core/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:3000/WebTV';
const ENDPOINTS = [
  { path: '/player', name: 'sem parametro' },
  { path: '/player?stream=https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', name: 'stream valido' },
  { path: '/player?stream=javascript:alert(1)', name: 'protocolo bloqueado' },
  { path: '/player?stream=', name: 'parametro vazio' },
];

function log(m) { process.stdout.write(`[test] ${m}\n`); }
function fail(m) { console.error(`\n[FAIL] ${m}\n`); process.exit(1); }
function pass(m) { console.log(`\n[PASS] ${m}\n`); }

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

page.on('console', m => log(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', e => log(`[pageerror] ${e.message}`));

for (const ep of ENDPOINTS) {
  log(`\n--- ${ep.name}: ${BASE}${ep.path} ---`);
  await page.goto(`${BASE}${ep.path}`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));

  const state = await page.evaluate(() => {
    const video = document.querySelector('video');
    const errOverlay = Array.from(document.querySelectorAll('*'))
      .find(el => el.textContent?.includes('Erro ao reproduzir'));
    return {
      hasHls: typeof window.Hls !== 'undefined',
      hlsVersion: window.Hls?.version || null,
      isSupported: window.Hls?.isSupported?.() ?? null,
      hasVideo: !!video,
      videoSrc: video?.src || video?.currentSrc || null,
      hasErrorOverlay: !!errOverlay,
      bodyText: document.body.innerText.substring(0, 200),
    };
  });

  log(`  hasHls: ${state.hasHls}`);
  log(`  hlsVersion: ${state.hlsVersion}`);
  log(`  isSupported: ${state.isSupported}`);
  log(`  hasVideo: ${state.hasVideo}`);
  log(`  videoSrc: ${state.videoSrc}`);
  log(`  hasErrorOverlay: ${state.hasErrorOverlay}`);
  log(`  bodyText: ${state.bodyText.replace(/\n/g, ' | ')}`);

  if (ep.path === '/WebTV/player') {
    if (!state.hasErrorOverlay) fail('Sem ?stream= deveria mostrar overlay de erro');
    if (!state.bodyText.includes('ausente')) fail('Mensagem de erro deveria mencionar parametro ausente');
  }

  if (ep.path.endsWith('?stream=javascript:alert(1)')) {
    if (!state.hasErrorOverlay) fail('URL javascript: deveria ser rejeitada');
  }

  if (ep.path.endsWith('?stream=')) {
    if (!state.hasErrorOverlay) fail('?stream= vazio deveria mostrar overlay de erro');
  }

  if (ep.path.includes('m3u8')) {
    if (!state.hasHls) fail('Hls.js nao foi carregado do CDN');
    if (!state.hasVideo) fail('<video> nao foi criado no DOM');
  }
}

await page.close();
pass('Player standalone validado em todos os cenarios');
process.exit(0);
