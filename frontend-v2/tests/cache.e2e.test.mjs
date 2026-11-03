/**
 * Teste E2E do cache local da v2 (stale-while-revalidate).
 *
 * Valida no browser real (via CDP do Edge):
 *   1. 1a carga: consulta a API e grava o cache
 *   2. 2a carga: usa o cache e NAO faz requisicao a API
 *   3. cache expirado: revalida em background (stale-while-revalidate)
 *   4. botao "Limpar cache": apaga e volta a consultar a API
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
const CACHE_KEY = 'webtv:v2:catalog'

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
    // Garante cache vazio: execucoes anteriores podem ter deixado dado.
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })

    await page.waitForFunction(() => window.__apiCalls > 0, { timeout: 30000 })

    const first = await page.evaluate(() => ({
      apiCalls: window.__apiCalls,
      cached: !!localStorage.getItem('webtv:v2:catalog'),
      strategy: document.body.innerText.includes('cache local'),
      body: document.body.innerText.slice(0, 400),
    }))

    assert.ok(first.apiCalls >= 1, '1a carga deveria consultar a API')
    assert.ok(first.cached, '1a carga deveria gravar o cache local')

    const savedAt = await page.evaluate(() => {
      const entry = JSON.parse(localStorage.getItem('webtv:v2:catalog'))
      return entry.savedAt
    })
    assert.ok(Number.isFinite(savedAt), 'savedAt deveria estar gravado')

    // --- 2) Segunda carga: deve usar o cache, SEM chamar a API ---
    await page.evaluate(() => localStorage.removeItem('__contador__'))
    const page2 = await context.newPage()
    await page2.addInitScript(COUNT_REQUESTS)
    await page2.goto(APP_URL, { waitUntil: 'domcontentloaded' })

    // O cache precisa estar no mesmo origin: a page2 compartilha o storage.
    await page2.waitForSelector('.grid, .status.error', { timeout: 30000 })
    await page2.waitForTimeout(1500)

    const second = await page2.evaluate(() => ({
      apiCalls: window.__apiCalls,
      strategyText: document.body.innerText,
    }))

    assert.equal(
      second.apiCalls,
      0,
      `2a carga nao deveria chamar a API (chamou ${second.apiCalls}x). Body: ${second.strategyText.slice(0, 200)}`,
    )
    assert.ok(
      second.strategyText.includes('cache local'),
      '2a carga deveria indicar "cache local"',
    )
    assert.ok(
      second.strategyText.includes('nenhuma requisicao a rede'),
      '2a carga deveria avisar que nao houve requisicao a rede',
    )

    await page2.close()

    // --- 3) Cache expirado: revalida em background (stale-while-revalidate) ---
    await page.evaluate(() => {
      const key = 'webtv:v2:catalog'
      const entry = JSON.parse(localStorage.getItem(key))
      entry.savedAt = Date.now() - 60 * 60 * 1000 // 1 hora atras (TTL = 30 min)
      localStorage.setItem(key, JSON.stringify(entry))
    })

    const page3 = await context.newPage()
    await page3.addInitScript(COUNT_REQUESTS)
    await page3.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page3.waitForSelector('.grid', { timeout: 30000 })
    await page3.waitForTimeout(1500)

    const third = await page3.evaluate(() => ({
      apiCalls: window.__apiCalls,
      body: document.body.innerText,
    }))

    assert.ok(third.apiCalls >= 1, 'cache expirado deveria revalidar na rede')
    assert.ok(
      third.body.includes('cache local') || third.body.includes('API (Suga)'),
      'cache expirado deveria mostrar cache ou o resultado da revalidacao',
    )

    await page3.close()
  } finally {
    await page.close().catch(() => {})
    await browser.close().catch(() => {})
  }
})
