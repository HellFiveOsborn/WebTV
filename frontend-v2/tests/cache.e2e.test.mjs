/**
 * Teste E2E do cache local da v2 (stale-while-revalidate).
 *
 * Valida no browser real (via CDP do Edge):
 *   1. 1a carga: consulta a API e grava o cache
 *   2. 2a carga: usa o cache e NAO faz requisicao a API
 *   3. cache expirado: revalida em background (stale-while-revalidate)
 *
 * O cache usa o storage unificado (IndexedDB), entao a limpeza precisa
 * apagar o banco - nao apenas o localStorage.
 *
 * O teste usa a API local (backend Node na 8080) via proxy do Vite.
 *
 * Run:
 *   $env:CDP_URL = "http://127.0.0.1:9333"
 *   node frontend-v2/tests/cache.e2e.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')

/**
 * playwright-core vive no node_modules do frontend v1 (mesmo padrao dos
 * testes E2E de la). Nao e dependencia da v2 - por isso o caminho e
 * calculado em vez de resolvido pelo require normal.
 */
const PLAYWRIGHT_CORE = resolve(REPO_ROOT, 'frontend/node_modules/playwright-core')
const { chromium } = await import(pathToFileURL(resolve(PLAYWRIGHT_CORE, 'index.mjs')).href)

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333'
const APP_URL = process.env.APP_URL || 'http://localhost:3001/WebTV/v2/'

/** Contador de requisicoes a API, injetado via init script. */
const COUNT_REQUESTS = `
(() => {
  window.__apiCalls = 0;
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/channels')) window.__apiCalls++;
    return origFetch.apply(this, arguments);
  };
})();
`

/**
 * Apaga TODO o storage local (IndexedDB + localStorage).
 * Executado dentro da pagina, no contexto do app.
 */
const CLEAR_STORAGE = `
(async () => {
  localStorage.clear();
  if (window.indexedDB) {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('webtv-v2');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
})();
`

test('cache E2E: cache local evita requisicoes repetidas a API', async t => {
  let browser
  try {
    browser = await chromium.connectOverCDP(CDP_URL)
  } catch (err) {
    t.skip(`Edge/CDP indisponivel: ${err.message}`)
    return
  }

  const context = browser.contexts()[0]
  const page = await context.newPage()

  try {
    await page.addInitScript(COUNT_REQUESTS)

    // --- 1) Primeira carga: deve consultar a API e gravar o cache ---
    // Garante storage vazio: execucoes anteriores podem ter deixado dado.
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(CLEAR_STORAGE)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await page.waitForFunction(() => window.__apiCalls > 0, { timeout: 30000 })

    const first = await page.evaluate(() => ({
      apiCalls: window.__apiCalls,
      strategy: document.querySelector('.app')?.dataset.strategy,
    }))

    assert.ok(first.apiCalls >= 1, '1a carga deveria consultar a API')

    // O cache esta no IndexedDB: confirma que a entrada foi gravada.
    const cached = await page.evaluate(
      () =>
        new Promise(resolve => {
          const req = indexedDB.open('webtv-v2')
          req.onsuccess = () => {
            const db = req.result
            if (!db.objectStoreNames.contains('catalog')) {
              resolve(false)
              db.close()
              return
            }
            const tx = db.transaction('catalog', 'readonly')
            const get = tx.objectStore('catalog').get('')
            get.onsuccess = () => {
              resolve(!!get.result)
              db.close()
            }
            get.onerror = () => {
              resolve(false)
              db.close()
            }
          }
          req.onerror = () => resolve(false)
        }),
    )
    assert.ok(cached, '1a carga deveria gravar o cache local')

    // --- 2) Segunda carga: deve usar o cache, SEM chamar a API ---
    const page2 = await context.newPage()
    await page2.addInitScript(COUNT_REQUESTS)
    await page2.goto(APP_URL, { waitUntil: 'domcontentloaded' })

    // O cache precisa estar no mesmo origin: a page2 compartilha o storage.
    await page2.waitForSelector('.top-body', { timeout: 30000 })
    await page2.waitForTimeout(1500)

    const second = await page2.evaluate(() => ({
      apiCalls: window.__apiCalls,
      strategy: document.querySelector('.app')?.dataset.strategy,
      body: document.body.innerText.slice(0, 200),
    }))

    assert.equal(
      second.apiCalls,
      0,
      `2a carga nao deveria chamar a API (chamou ${second.apiCalls}x). Body: ${second.body}`,
    )
    assert.equal(second.strategy, 'cache', '2a carga deveria usar a estrategia "cache"')

    await page2.close()

    // --- 3) Cache expirado: revalida em background (stale-while-revalidate) ---
    await page.evaluate(
      () =>
        new Promise(resolve => {
          const req = indexedDB.open('webtv-v2')
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('catalog', 'readwrite')
            const store = tx.objectStore('catalog')
            const get = store.get('')
            get.onsuccess = () => {
              const entry = get.result
              if (entry) {
                // 1 hora atras (TTL = 30 min)
                entry.savedAt = Date.now() - 60 * 60 * 1000
                store.put(entry, '')
              }
              tx.oncomplete = () => {
                db.close()
                resolve()
              }
              tx.onerror = () => {
                db.close()
                resolve()
              }
            }
            get.onerror = () => {
              db.close()
              resolve()
            }
          }
          req.onerror = () => resolve()
        }),
    )

    const page3 = await context.newPage()
    await page3.addInitScript(COUNT_REQUESTS)
    await page3.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page3.waitForSelector('.top-body', { timeout: 30000 })
    await page3.waitForTimeout(1500)

    const third = await page3.evaluate(() => ({
      apiCalls: window.__apiCalls,
      strategy: document.querySelector('.app')?.dataset.strategy,
    }))

    assert.ok(third.apiCalls >= 1, 'cache expirado deveria revalidar na rede')
    assert.ok(
      third.strategy === 'cache' || third.strategy === 'api',
      `cache expirado deveria mostrar cache ou o resultado da revalidacao (veio ${third.strategy})`,
    )

    await page3.close()
  } finally {
    await page.close().catch(() => {})
    await browser.close().catch(() => {})
  }
})
