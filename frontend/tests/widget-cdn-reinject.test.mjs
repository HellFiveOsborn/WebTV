/**
 * Teste end-to-end: widget reinjetado via CDN apos replaceDOM.
 *
 * Fluxo:
 *   1. Carrega embedcanaisdetv.xyz
 *   2. Injeta appBridge + webtv-widget (simula Android WebView)
 *   3. Injeta embeddecanais-replace-content.min.js
 *   4. replaceDOM() destrói o widget
 *   5. reinjectWidget() detecta ausencia e re-fetch bundle via CDN
 *   6. Verifica: widget volta a existir
 */

import pkg from 'file:///C:/Users/canal/AppData/Local/Temp/opencode/probe/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { readFileSync } from 'node:fs';

const TARGET_URL = 'https://embedcanaisdetv.xyz/e/index.php?canal=globorj';
const APPBRIDGE_PATH = 'E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/appBridge.js';
const WIDGET_PATH = 'E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/webtv-widget.js';
const SCRIPT_PATH = 'E:/Dev Workspace/WebTV/frontend/docs/scripts/embeddecanais-replace-content.min.js';

function log(msg) { process.stdout.write(`[test] ${msg}\n`); }
function fail(msg) { console.error(`\n[FAIL] ${msg}\n`); process.exit(1); }
function pass(msg) { console.log(`\n[PASS] ${msg}\n`); }

const APPBRIDGE = readFileSync(APPBRIDGE_PATH, 'utf8');
const WIDGET_BUNDLE = readFileSync(WIDGET_PATH, 'utf8');
const REPLACE_SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

page.on('console', m => { if (m.type() === 'error') log(`[pageerror] ${m.text()}`); });
page.on('pageerror', e => log(`[pageerror] ${e.message}`));

const widgetCheck = () => page.evaluate(() => {
  const c = document.getElementById('webtv-widget-container');
  const toggle = c?.shadowRoot?.querySelector('button[aria-label*="painel" i]');
  return {
    hasContainer: !!c,
    hasShadowRoot: !!(c && c.shadowRoot),
    hasToggle: !!toggle,
    webtvKeys: window.WebTV ? Object.keys(window.WebTV) : [],
    webtvWidgetData: !!window.__webtvWidgetData,
    bodyChildren: document.body ? document.body.children.length : 0
  };
});

log(`Loading ${TARGET_URL}…`);
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);

const widgetDataObj = {
  activeChannelId: '1779525189328',
  activeChannelName: 'Record SP',
  channels: [{
    id: '1779525189328', title: 'Record SP',
    logoUrl: 'https://placehold.co/150x100/1e1e1e/00a884?text=R1',
    active: true,
    alternativeUrls: [
      { url: TARGET_URL, type: 'iframe' }
    ]
  }]
};

// 1) appBridge
log(`[1/4] Injecting appBridge + widgetData…`);
await page.evaluate((d) => { window.__webtvWidgetData = d; window.__webtvBaseUrl = 'https://embedcanaisdetv.xyz'; }, widgetDataObj);
await page.evaluate(APPBRIDGE);
await page.waitForTimeout(300);

// 2) widget bundle
log(`[2/4] Injecting webtv-widget (${WIDGET_BUNDLE.length} bytes)…`);
await page.evaluate(WIDGET_BUNDLE);
await page.waitForTimeout(2500);

const before = await widgetCheck();
log(`BEFORE replace: container=${before.hasContainer} toggle=${before.hasToggle} bodyChildren=${before.bodyChildren} webtv=${JSON.stringify(before.webtvKeys)}`);

if (!before.hasContainer || !before.hasToggle) {
  fail('Widget nao montou antes do replace');
}

// 3) replace-content (minificado)
log(`[3/4] Injecting embeddecanais-replace-content.min.js (${REPLACE_SCRIPT.length} bytes)…`);
await page.evaluate(REPLACE_SCRIPT);
await page.waitForTimeout(3000);

const afterReplace = await widgetCheck();
log(`IMMEDIATE after replace: container=${afterReplace.hasContainer} toggle=${afterReplace.hasToggle} bodyChildren=${afterReplace.bodyChildren}`);

// 4) Aguardar reinjectWidget() fazer fetch do CDN
log(`[4/4] Waiting for reinjectWidget() to fetch CDN bundle…`);
await page.waitForTimeout(8000);

const afterReinject = await widgetCheck();
log(`AFTER reinject wait: container=${afterReinject.hasContainer} toggle=${afterReinject.hasToggle} bodyChildren=${afterReinject.bodyChildren} webtv=${JSON.stringify(afterReinject.webtvKeys)}`);

if (afterReinject.hasContainer && afterReinject.hasToggle) {
  pass('Widget REINJECTED successfully via CDN after replaceDOM');
} else {
  fail(`Widget NAO reinjetado: container=${afterReinject.hasContainer} toggle=${afterReinject.hasToggle}`);
}

await browser.close();