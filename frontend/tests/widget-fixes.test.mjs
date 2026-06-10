import pkg from 'file:///C:/Users/canal/AppData/Local/Temp/opencode/probe/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { readFileSync } from 'node:fs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log(`[console.${m.type()}]`, m.text()); });

const APPBRIDGE = readFileSync('E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/appBridge.js', 'utf8');
const WIDGET_BUNDLE = readFileSync('E:/Dev Workspace/WebTV/kotlin-app/app/src/main/assets/scripts/webtv-widget.js', 'utf8');

const ACTIVE_URL = 'http://localhost:3000/WebTV/';

await page.goto(ACTIVE_URL);
await page.waitForTimeout(1500);

await page.evaluate((data) => {
  window.__webtvWidgetData = data;
  window.__webtvBaseUrl = 'http://localhost:3000';
}, {
  activeChannelId: '1779525189328',
  activeChannelName: 'Record SP',
  channels: [
    { id: '1779525189328', title: 'Record SP', logoUrl: 'https://placehold.co/150x100/1e1e1e/00a884?text=R1', active: true,
      alternativeUrls: [
        { url: 'https://embedcanaisdetv.xyz/e/index.php?canal=globorj', type: 'iframe' },
        { url: ACTIVE_URL, type: 'iframe' },
        { url: 'https://backup2.example.com/record', type: 'iframe' }
      ]
    },
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `ch${i+1}`, title: `Canal ${i+1}`,
      logoUrl: `https://placehold.co/150x100/1e1e1e/3b82f6?text=C${i+1}`,
      active: true,
      alternativeUrls: [{ url: `https://example.com/c${i+1}`, type: 'iframe' }]
    }))
  ]
});

await page.evaluate(APPBRIDGE);
await page.waitForTimeout(300);
await page.evaluate(WIDGET_BUNDLE);
await page.waitForTimeout(2000);

async function dumpPanel(label) {
  const state = await page.evaluate(() => {
    const container = document.getElementById('webtv-widget-container');
    const root = container?.shadowRoot?.getElementById('webtv-widget-root');
    const dialog = container?.shadowRoot?.querySelector('[role="dialog"]');
    const listbox = container?.shadowRoot?.querySelector('[role="listbox"]');
    const urlButtons = dialog ? Array.from(dialog.querySelectorAll('button[tabindex="0"]')).map(b => ({
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      isActive: b.className.includes('border-primary'),
      isFocused: b.className.includes('bg-primary/40'),
      hasAtivo: b.innerText.toLowerCase().includes('ativo'),
      hasBadgePrimary: !!b.querySelector('span.bg-primary')
    })) : [];
    const channelButtons = listbox ? Array.from(listbox.querySelectorAll('button[tabindex="0"]')).map(b => b.innerText.replace(/\s+/g, ' ').trim()) : [];
    return {
      mode: listbox ? 'sidebar' : (dialog ? 'panel' : 'collapsed'),
      urlButtons,
      channelButtons,
      channelCount: channelButtons.length,
      urlCount: urlButtons.length,
      hasScrollContainer: !!listbox?.querySelector('.overflow-y-auto')
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(`mode: ${state.mode}`);
  console.log(`urlButtons (${state.urlCount}):`);
  state.urlButtons.forEach((b, i) => console.log(`  [${i}] active=${b.isActive} focused=${b.isFocused} badge=${b.hasBadgePrimary} "${b.text}"`));
  console.log(`channelButtons (${state.channelCount}):`);
  state.channelButtons.slice(0, 10).forEach((t, i) => console.log(`  [${i}] ${t.substring(0, 50)}`));
  if (state.channelCount > 10) console.log(`  ... +${state.channelCount - 10} mais`);
  console.log(`hasScrollContainer: ${state.hasScrollContainer}`);
  return state;
}

await page.evaluate(() => document.getElementById('webtv-widget-container')?.shadowRoot?.querySelector('button[aria-label*="painel" i]')?.click());
await page.waitForTimeout(300);
const panel = await dumpPanel('AFTER EXPAND (panel)');

await page.evaluate(() => document.getElementById('webtv-widget-container')?.shadowRoot?.querySelector('button[aria-label*="canais" i]')?.click());
await page.waitForTimeout(300);
const sidebar = await dumpPanel('AFTER SIDEBAR');

let failed = false;

// Panel: 3 URLs alternativas + 1 Fechar
const urlOnly = panel.urlButtons.filter(b => !b.text.includes('Fechar'));
if (urlOnly.length !== 3) { console.log(`\n✗ FAIL: panel mostra ${urlOnly.length} URLs alternativas, esperado 3`); failed = true; }

// Sidebar: 1 header (sidebar-btn) + 30 canais (Record SP excluído)
if (sidebar.channelCount !== 31) { console.log(`\n✗ FAIL Bug1: sidebar mostra ${sidebar.channelCount} botões, esperado 31`); failed = true; }
if (sidebar.channelCount === 21) { console.log('\n✗ FAIL Bug1 PERSISTE: slice(0,20) ainda aplicado'); failed = true; }
if (!sidebar.hasScrollContainer) { console.log('\n✗ FAIL Bug1: container sem overflow-y-auto'); failed = true; }

const activeBtn = panel.urlButtons.find(b => b.isActive);
if (!activeBtn) { console.log('\n✗ FAIL Bug2: nenhuma URL marcada como ativa'); failed = true; }
else {
  console.log(`\n✓ Bug2 OK: URL ativa = "${activeBtn.text.substring(0, 60)}"`);
  if (!activeBtn.text.includes(ACTIVE_URL.substring(0, 20))) {
    console.log(`✗ FAIL Bug2 ERRADO: destacada "${activeBtn.text}" mas deveria ser a URL atual ${ACTIVE_URL}`);
    failed = true;
  }
}

if (failed) {
  console.log('\n=== TEST FAILED ===');
  process.exit(1);
} else {
  console.log('\n=== ALL FIXES VERIFIED ===');
}

await browser.close();