/**
 * Bug reproduction: webtv-widget desaparece quando script replace-content executa.
 *
 * Simula o fluxo do Android WebView (kotlin-app):
 *   1. Carrega embedcanaisdetv.xyz (canal externo, top-level, sem iframe)
 *   2. Injeta appBridge.js
 *   3. Define window.__webtvWidgetData (que MainActivity.kt:702 injeta)
 *   4. Injeta webtv-widget.js (bundle React que renderiza ChannelWidget em shadow DOM)
 *   5. Injeta embeddecanais-replace-content.js (que faz documentElement.innerHTML = ...)
 *   6. Verifica se o widget ainda está no DOM
 *
 * Run: node frontend/tests/widget-disappears.test.mjs
 * Requires: Edge running with --remote-debugging-port=9333
 */

import pkg from 'file:///C:/Users/canal/AppData/Local/Temp/opencode/probe/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { readFileSync } from 'node:fs';

const TARGET_URL = 'https://embedcanaisdetv.xyz/e/index.php?canal=globorj';
const APPBRIDGE_PATH = 'E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/appBridge.js';
const WIDGET_PATH = 'E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/webtv-widget.js';
const SCRIPT_PATH = 'E:/Dev Workspace/WebTV/frontend/docs/scripts/embeddecanais-replace-content.js';

const WAIT_BEFORE_INJECT_MS = 5000;
const WAIT_AFTER_INJECT_MS = 6000;

function log(msg) { process.stdout.write(`[test] ${msg}\n`); }
function fail(msg) { console.error(`\n[FAIL] ${msg}\n`); process.exit(1); }
function pass(msg) { console.log(`\n[PASS] ${msg}\n`); }

const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes('embedcanaisdetv') || p.url() === 'about:blank') || ctx.pages()[0];
if (!page) page = await ctx.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') log(`[pageerror] ${msg.text()}`);
});
page.on('pageerror', (err) => log(`[pageerror] ${err.message}`));

const widgetCount = () => page.evaluate(() => {
  // O widget vive em #webtv-widget-container com shadow root
  const container = document.getElementById('webtv-widget-container');
  const inner = container?.shadowRoot?.querySelector('button[aria-label*="painel" i], button[aria-label*="panel" i]');
  const innerFallback = container?.shadowRoot?.querySelector('button');
  return {
    hasContainer: !!container,
    hasShadowRoot: !!(container && container.shadowRoot),
    hasToggleInsideShadow: !!inner,
    hasAnyButtonInShadow: !!innerFallback,
    totalButtons: document.querySelectorAll('button').length,
    bodyChildren: document.body ? document.body.children.length : 0,
    hasWebTVPlayer: !!window.WebTVPlayer,
    hasWebTVHls: !!window.__webtv_hls,
    hasOurVideo: !!document.querySelector('#webtv-player-video'),
    videoCount: document.querySelectorAll('video').length,
    webtvKeys: window.WebTV ? Object.keys(window.WebTV) : []
  };
});

const appBridge = readFileSync(APPBRIDGE_PATH, 'utf8');
const widget = readFileSync(WIDGET_PATH, 'utf8');
const replaceScript = readFileSync(SCRIPT_PATH, 'utf8');

log(`Loading ${TARGET_URL}…`);
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  .catch((e) => log(`goto error (non-fatal): ${e.message}`));

log(`Waiting ${WAIT_BEFORE_INJECT_MS}ms for Clappr to bootstrap…`);
await page.waitForTimeout(WAIT_BEFORE_INJECT_MS);

// [1/3] appBridge
log(`[1/3] Injecting appBridge (${appBridge.length} bytes)…`);
await page.evaluate(appBridge);
await page.waitForTimeout(500);

// [2/3] widget data + bundle
const widgetData = {
  activeChannelId: '1779525189328',
  activeChannelName: 'Record SP',
  channels: [{
    id: '1779525189328',
    title: 'Record SP',
    logoUrl: 'https://placehold.co/150x100/1e1e1e/3b82f6?text=Record',
    active: true,
    alternativeUrls: [
      { url: 'https://embedcanaisdetv.xyz/e/index.php?canal=globorj', type: 'iframe' }
    ]
  }]
}
log(`[2/3] Setting __webtvWidgetData + injecting webtv-widget (${widget.length} bytes)…`);
await page.evaluate((data) => {
  window.__webtvWidgetData = data
  window.__webtvBaseUrl = 'https://embedcanaisdetv.xyz'
}, widgetData);
await page.evaluate(widget);
await page.waitForTimeout(2500);

const beforeReplace = await widgetCount();
log(`DOM BEFORE replace-content:`);
log(`  hasContainer: ${beforeReplace.hasContainer}`);
log(`  hasShadowRoot: ${beforeReplace.hasShadowRoot}`);
log(`  hasToggleInsideShadow: ${beforeReplace.hasToggleInsideShadow}`);
log(`  hasAnyButtonInShadow: ${beforeReplace.hasAnyButtonInShadow}`);
log(`  bodyChildren: ${beforeReplace.bodyChildren}`);
log(`  webtvKeys: ${JSON.stringify(beforeReplace.webtvKeys)}`);

if (!beforeReplace.hasContainer) {
  fail('appBridge ou widget não montaram o #webtv-widget-container');
}
if (!beforeReplace.hasAnyButtonInShadow) {
  fail('Widget toggle button não está no shadow DOM — React não montou');
}

// [3/3] replace-content (o suspeito)
log(`[3/3] Injecting embeddecanais-replace-content (${replaceScript.length} bytes)…`);
await page.evaluate(replaceScript);
await page.waitForTimeout(WAIT_AFTER_INJECT_MS);

const afterReplace = await widgetCount();
log(`DOM AFTER replace-content:`);
log(`  hasContainer: ${afterReplace.hasContainer}`);
log(`  hasShadowRoot: ${afterReplace.hasShadowRoot}`);
log(`  hasToggleInsideShadow: ${afterReplace.hasToggleInsideShadow}`);
log(`  hasAnyButtonInShadow: ${afterReplace.hasAnyButtonInShadow}`);
log(`  hasOurVideo: ${afterReplace.hasOurVideo}`);
log(`  videoCount: ${afterReplace.videoCount}`);
log(`  bodyChildren: ${afterReplace.bodyChildren}`);
log(`  webtvKeys: ${JSON.stringify(afterReplace.webtvKeys)}`);

log('');
log('=== BUG DIAGNOSIS ===');
log(`  widget existed BEFORE: ${beforeReplace.hasAnyButtonInShadow}`);
log(`  widget exists AFTER:  ${afterReplace.hasAnyButtonInShadow}`);
log(`  webtv-keys after:      ${JSON.stringify(afterReplace.webtvKeys)}`);
log(`  webtv-hls after:       ${afterReplace.hasWebTVHls}`);
log(`  our video after:       ${afterReplace.hasOurVideo}`);

if (beforeReplace.hasAnyButtonInShadow && !afterReplace.hasAnyButtonInShadow) {
  fail('REPRODUCED: widget was mounted, then disappeared after replace-content');
}

if (beforeReplace.hasAnyButtonInShadow && !afterReplace.hasContainer) {
  fail('CONFIRMED: #webtv-widget-container was removed by documentElement.innerHTML = "..."');
}

if (beforeReplace.hasAnyButtonInShadow && afterReplace.hasAnyButtonInShadow) {
  pass('Widget survived replace-content injection (container + toggle still in DOM).');
}

await browser.close();
process.exit(0);
}
