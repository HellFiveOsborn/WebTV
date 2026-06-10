/**
 * Integration test for rdcanais-replace-content.js
 *
 * Dois critérios validados:
 *   1. DISCOVERY: extrai URL do .m3u8 a partir do iframe (testável em browser
 *      sem CORS porque a leitura do iframe HTML não exige tokens)
 *   2. PLAYBACK: Hls.js reproduz o stream com sucesso (só testável em browser
 *      se o CDN liberar ACAO — ex: dai.google.com funciona; agropesca.live
 *      não, mas funciona em Android WebView)
 *
 * Run with: node tests/rdcanais.test.mjs
 * Requires: Edge running with --remote-debugging-port=9333
 */

import pkg from 'file:///C:/Users/canal/AppData/Local/Temp/opencode/probe/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { readFileSync } from 'node:fs';

const CHANNELS = [
  // globosp: discovery OK em browser (NEQ decode + agropesca.live)
  { slug: 'globosp', url: 'https://rdcanais.com/globosp', expectPlayback: false },
  // sbt: padrão multi/<page>.html?m3u8=<CloudFront-url>
  //   discovery OK em Android (CORS não se aplica), browser só com proxy
  // { slug: 'sbt', url: 'https://rdcanais.com/sbt', expectPlayback: false },
  // record: usa Turnstile + POST — playback requer cf_token
  // { slug: 'record', url: 'https://rdcanais.com/record', expectPlayback: false },
];

const SCRIPT_PATH = 'E:/Dev Workspace/WebTV/frontend/docs/scripts/rdcanais-replace-content.js';
const APPBRIDGE_PATH = 'E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/appBridge.js';
const PRE_INJECTION_WAIT_MS = 5000;
const POST_INJECTION_WAIT_MS = 12000;

function log(msg) { process.stdout.write(`[test] ${msg}\n`); }
function fail(msg) { console.error(`\n[FAIL] ${msg}\n`); process.exit(1); }
function pass(msg) { console.log(`\n[PASS] ${msg}\n`); }

const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
let page = ctx.pages()[0];
if (!page) page = await ctx.newPage();

page.on('console', (msg) => { if (msg.type() === 'error') log(`[pageerror] ${msg.text()}`); });
page.on('pageerror', (err) => log(`[pageerror] ${err.message}`));

async function testChannel(channel) {
  log(`\n===== ${channel.slug} (${channel.url}) [expectPlayback=${channel.expectPlayback}] =====`);

  await page.goto(channel.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    .catch((e) => log(`goto error (non-fatal): ${e.message}`));

  log(`Waiting ${PRE_INJECTION_WAIT_MS}ms for iframe…`);
  await page.waitForTimeout(PRE_INJECTION_WAIT_MS);

  const before = await page.evaluate(() => ({
    iframes: document.querySelectorAll('iframe').length,
    iframeSrc: document.querySelector('iframe') ? document.querySelector('iframe').src : null
  }));
  log(`Before: ${JSON.stringify(before)}`);
  if (!before.iframeSrc) fail(`[${channel.slug}] No iframe on page`);

  const appBridgeCode = readFileSync(APPBRIDGE_PATH, 'utf8');
  const scriptCode = readFileSync(SCRIPT_PATH, 'utf8');

  log(`Injecting appBridge + rdcanais-replace-content.js…`);
  // Usa Function() para evitar problemas de escape de template literals
  await page.evaluate((args) => {
    const { appBridge, script } = args;
    new Function(appBridge)();
    new Function(script)();
  }, { appBridge: appBridgeCode, script: scriptCode });

  log(`Waiting ${POST_INJECTION_WAIT_MS}ms for discovery + playback…`);
  await page.waitForTimeout(POST_INJECTION_WAIT_MS);

  const state = await page.evaluate(() => {
    const v = document.getElementById('webtv-player-video');
    const hls = window.__webtv_hls;
    return {
      videoFound: !!v,
      paused: v ? v.paused : null,
      currentTime: v ? v.currentTime : null,
      duration: v ? v.duration : null,
      videoWidth: v ? v.videoWidth : null,
      videoHeight: v ? v.videoHeight : null,
      readyState: v ? v.readyState : null,
      error: v && v.error ? { code: v.error.code, message: v.error.message } : null,
      discoveredUrl: window.__webtv_discovered_url,
      discoverSource: window.__webtv_discover_source,
      hlsExists: !!hls,
      hlsUrl: hls ? hls.url : null,
      hlsLevels: hls && hls.levels ? hls.levels.length : 0,
      useStreamProxy: window.__webtv_use_stream_proxy,
      iframeSrc: window.__webtv_iframe_src
    };
  });
  log(`State: ${JSON.stringify(state, null, 2)}`);

  // Assertion 1: discovery must succeed
  if (!state.videoFound) fail(`[${channel.slug}] Video element missing`);
  if (!state.discoveredUrl) fail(`[${channel.slug}] Discovery failed — no URL found`);
  if (!/\.m3u8(\?|$)/i.test(state.discoveredUrl)) fail(`[${channel.slug}] Discovered URL is not .m3u8: ${state.discoveredUrl}`);
  log(`  ✓ Discovery: ${state.discoveredUrl} (${state.discoverSource})`);

  // Assertion 2: playback (only when expected)
  if (channel.expectPlayback) {
    if (state.hlsLevels === 0) fail(`[${channel.slug}] Hls.js levels empty — manifest not parsed`);
    if (state.paused !== false) fail(`[${channel.slug}] Video paused (should be playing)`);
    if (state.currentTime <= 0) fail(`[${channel.slug}] currentTime=0 — no playback`);
    if (state.videoWidth === 0) fail(`[${channel.slug}] videoWidth=0 — no frames decoded`);
    log(`  ✓ Playback: ${state.videoWidth}x${state.videoHeight}, t=${state.currentTime.toFixed(2)}s`);
  } else {
    // We just verify Hls.js is wired up correctly
    if (!state.hlsExists) fail(`[${channel.slug}] Hls.js instance missing`);
    log(`  ✓ Hls.js wired up (levels=${state.hlsLevels} — CORS-blocked in browser, expected)`);
  }

  pass(`[${channel.slug}] Discovery OK: ${state.discoveredUrl} (${state.discoverSource})${channel.expectPlayback ? `, playing ${state.currentTime.toFixed(1)}s` : ''}`);
}

for (const ch of CHANNELS) {
  await testChannel(ch);
}

await browser.close();