/**
 * Integration test for embeddecanais-replace-content.js
 *
 * Bug under test: After the script replaces documentElement.innerHTML to mount
 * a Hls.js-based player, the original Clappr player remains alive in the JS
 * heap — its MediaSource pipeline keeps fetching .ts segments, producing
 * audio that plays simultaneously with the injected player ("two streams").
 *
 * Test contract:
 *   1. Load the embed URL
 *   2. Wait for Clappr to bootstrap
 *   3. Inject embeddecanais-replace-content.js
 *   4. Wait for our Hls.js to bootstrap
 *   5. Drain for 6s (gives Clappr loader a chance to keep firing if alive)
 *   6. Assert: at most 1 m3u8 fetch in the drain window (Clappr's playlist
 *      poller must be dead; allow 0–1 because our Hls.js may fetch once)
 *   7. Assert: at most 8 .ts segment fetches in drain (was >10 before fix)
 *
 * Run with: node tests/embeddecanais.test.mjs
 * Requires: Brave/Chrome running with --remote-debugging-port=9222
 */

import pkg from 'file:///C:/Users/canal/AppData/Local/Temp/opencode/probe/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { readFileSync } from 'node:fs';

const TARGET_URL = 'https://embedcanaisdetv.xyz/e/index.php?canal=globorj';
const SCRIPT_PATH = 'E:/Dev Workspace/WebTV/frontend/docs/scripts/embeddecanais-replace-content.js';

const PRE_INJECTION_WAIT_MS = 5000;
const POST_INJECTION_WAIT_MS = 6000;
const DRAIN_MS = 6000;

function log(msg) {
  process.stdout.write(`[test] ${msg}\n`);
}

function fail(msg) {
  console.error(`\n[FAIL] ${msg}\n`);
  process.exit(1);
}

function pass(msg) {
  console.log(`\n[PASS] ${msg}\n`);
}

const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages()[0];
if (!page) page = await ctx.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') log(`[pageerror] ${msg.text()}`);
});
page.on('pageerror', (err) => log(`[pageerror] ${err.message}`));

await page.addInitScript(() => {
  window.__msLog = [];
  const OrigMS = window.MediaSource;
  if (OrigMS) {
    window.MediaSource = new Proxy(OrigMS, {
      construct(target, args) {
        const ms = new target(...args);
        window.__msLog.push({ type: 'create', t: Date.now() });
        return ms;
      },
      get(target, prop) { return target[prop]; }
    });
  }
});

const navStart = Date.now();
const allFetches = [];
page.on('request', (req) => {
  const u = req.url();
  if (/\.m3u8|\.ts(\?|$)/i.test(u)) {
    allFetches.push({ t: Date.now() - navStart, u });
  }
});

log(`Loading ${TARGET_URL}…`);
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  .catch((e) => log(`goto error (non-fatal): ${e.message}`));

log(`Waiting ${PRE_INJECTION_WAIT_MS}ms for Clappr to bootstrap…`);
await page.waitForTimeout(PRE_INJECTION_WAIT_MS);

const beforeMS = await page.evaluate(() => window.__msLog.length);
log(`MediaSources before injection: ${beforeMS}`);
if (beforeMS < 1) {
  fail('Clappr did not bootstrap — MediaSource was never created. Test environment issue.');
}

const injection = readFileSync(SCRIPT_PATH, 'utf8');
log(`Injecting ${SCRIPT_PATH} (${injection.length} bytes)…`);
await page.evaluate(injection);

log(`Waiting ${POST_INJECTION_WAIT_MS}ms for Hls.js to bootstrap and replaceDOM…`);
await page.waitForTimeout(POST_INJECTION_WAIT_MS);

const midState = await page.evaluate(() => ({
  totalMS: window.__msLog.length,
  ourVideo: !!document.querySelector('#webtv-player-video')
}));
log(`Mid state: ${JSON.stringify(midState)}`);

log(`Draining ${DRAIN_MS}ms — Clappr loader must NOT fire m3u8/ts during this window…`);
await page.waitForTimeout(DRAIN_MS);

const drainStartT = PRE_INJECTION_WAIT_MS + POST_INJECTION_WAIT_MS;
const fetchesInDrain = allFetches.filter((f) => f.t >= drainStartT);
const m3u8InDrain = fetchesInDrain.filter((f) => /\.m3u8/i.test(f.u));
const tsInDrain = fetchesInDrain.filter((f) => /\.ts(\?|$)/i.test(f.u) && !/\.m3u8/.test(f.u));

log(`Network during drain window (t≥${drainStartT}ms):`);
log(`  m3u8 fetches: ${m3u8InDrain.length}  [${m3u8InDrain.map(f => f.t).join(', ')}]`);
log(`  .ts fetches:  ${tsInDrain.length}  [${tsInDrain.map(f => f.t).join(', ')}]`);

const finalState = await page.evaluate(() => ({
  totalMS: window.__msLog.length,
  videos: document.querySelectorAll('video').length,
  ourVideo: !!document.querySelector('#webtv-player-video'),
  hlsInstanceExists: !!window.__webtv_hls,
  hlsUrl: window.__webtv_hls ? window.__webtv_hls.url : null,
  hlsManifestParsed: !!(window.__webtv_hls && window.__webtv_hls.levels && window.__webtv_hls.levels.length > 0),
  hlsLevels: window.__webtv_hls && window.__webtv_hls.levels ? window.__webtv_hls.levels.length : 0
}));
log(`Final state: ${JSON.stringify(finalState, null, 2)}`);

// 0. Hls.js must have loaded the MANIFEST root (index.m3u8), not a media playlist (mono.ts.m3u8).
//    The discovery hook previously grabbed the first .m3u8 it saw, which is often
//    a segment playlist (mono.ts.m3u8) — that prevents the manifest from parsing.
if (finalState.hlsUrl && /mono\.ts\.m3u8(\?|$)/i.test(finalState.hlsUrl)) {
  fail(`Hls.js loaded a media playlist instead of the root manifest: ${finalState.hlsUrl}. ` +
       `Discovery hook captured a segment playlist, not index.m3u8.`);
}
if (!finalState.hlsManifestParsed) {
  fail(`Hls.js manifest was never parsed — levels are empty. URL: ${finalState.hlsUrl}`);
}

// ASSERTIONS — the contract the fix must satisfy

// 1. The injected player must be present (sanity)
if (!finalState.ourVideo) {
  fail(`Our #webtv-player-video is missing — replacement script failed to mount.`);
}
if (finalState.videos !== 1) {
  fail(`Expected exactly 1 <video> in DOM, got ${finalState.videos}.`);
}

// 2. Clappr's playlist poller must NOT fire during drain window.
//    At most 1 m3u8 fetch is acceptable (Hls.js bootstrap), but more than 1
//    means Clappr is still alive.
if (m3u8InDrain.length > 1) {
  fail(`Clappr's playlist poller is still alive: ${m3u8InDrain.length} m3u8 fetches during drain window. ` +
       `Expected ≤1 (Hls.js bootstrap). Timestamps: ${m3u8InDrain.map(f => f.t).join(', ')}`);
}

// 3. Few .ts segment fetches during drain — only our Hls.js should be active.
//    A clean Hls.js bootstrap may produce 0 fetches during drain if its
//    segment buffer is full. More than 8 indicates Clappr also draining.
if (tsInDrain.length > 8) {
  fail(`Too many .ts fetches during drain window: ${tsInDrain.length} (expected ≤8). ` +
       `Indicates Clappr's segment loader is still active after replaceDOM. ` +
       `Timestamps: ${tsInDrain.map(f => f.t).join(', ')}`);
}

pass(`Two-stream bug appears to be FIXED. ` +
     `M3U8 fetches during drain: ${m3u8InDrain.length}, .ts fetches: ${tsInDrain.length}, ` +
     `MediaSources total: ${finalState.totalMS}.`);

await browser.close();