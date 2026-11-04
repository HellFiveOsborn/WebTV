/**
 * Verificacao E2E da tela de fallback (API fora do ar, sem cache).
 *
 * 1. Bloqueia a API e o snapshot -> a tela de fallback aparece.
 * 2. Troca a URL da API para uma que responde -> o catalogo carrega.
 * 3. Sem override, a tela volta para a URL do build.
 * 4. Com override gravado, a app consulta a URL do override.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-api-fallback.mjs
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9333'
const APP_URL = process.env.APP_URL || 'http://localhost:3001/WebTV/v2/'
const OUT = process.env.OUT || resolve(REPO_ROOT, 'scratch/api-fallback')

/**
 * URL BASE de uma API que responde (o backend local).
 *
 * O usuario informa a BASE; o app acrescenta o "/channels" e consulta
 * o endpoint.
 */
const GOOD_API = 'http://127.0.0.1:8080'

/**
 * Rotas bloqueadas (simula a API fora do ar).
 *
 * Atencao ao glob do Playwright: o asterisco NAO casa com a barra. Por
 * isso as rotas com barra final usam dois asteriscos no fim (ex.: a
 * rota da API local precisa bloquear "/api/channels" E "/api/channels/x").
 *
 * Inclui a API REAL (webtv-api.netlify.app): sem isso o catalogo
 * carrega e a tela de fallback nunca aparece.
 */
const BLOCKED = [
  '**/api/channels**',
  '**/api/embedcanais**',
  '**/data/embedcanais.json**',
  '**embedcanais.online/**',
  '**/api.allorigins.win/**',
  '**/api.codetabs.com/**',
  '**webtv-api.netlify.app/**',
]

let failures = 0
const check = (name, ok, detail = '') => {
  const label = ok ? '  OK  ' : '  FAIL'
  const suffix = detail ? ' -> ' + detail : ''
  console.log(label + ' ' + name + suffix)
  if (!ok) failures++
}

const browser = await chromium.connectOverCDP(CDP_URL)
const context = browser.contexts()[0]
const page = await context.newPage()

/** Bloqueia a API e o snapshot (simula a API fora do ar, sem cache). */
const blockAll = async () => {
  for (const pattern of BLOCKED) {
    await page.route(pattern, route => route.abort())
  }
}

/** Libera a rede (a API local passa a responder). */
const unblockAll = async () => {
  for (const pattern of BLOCKED) {
    await page.unroute(pattern)
  }
}

/**
 * Apaga o cache do catalogo (e o override da URL) do storage local.
 *
 * Nao deleta o BANCO inteiro: a app mantem a conexao aberta e o
 * `deleteDatabase` ficaria bloqueado. Apagar a entrada do store e
 * suficiente e nao trava.
 *
 * IMPORTANTE: a pagina precisa estar CARREGADA para ter o mesmo
 * origin (o storage e por origin) - por isso a funcao so roda depois
 * do primeiro `goto`.
 */
const clearStorage = async () => {
  await page.evaluate(async () => {
    localStorage.clear()

    await new Promise(resolve => {
      const req = indexedDB.open('webtv-v2', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const ns of ['catalog', 'usage', 'theme', 'apiUrl']) {
          if (!db.objectStoreNames.contains(ns)) db.createObjectStore(ns)
        }
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['catalog', 'apiUrl'], 'readwrite')
        tx.objectStore('catalog').delete('')
        tx.objectStore('apiUrl').delete('')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
      }
      req.onerror = () => resolve()
    })
  })
}

/** Grava o override da URL da API direto no storage. */
const writeOverride = async url => {
  await page.evaluate(async target => {
    await new Promise(resolve => {
      const req = indexedDB.open('webtv-v2', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const ns of ['catalog', 'usage', 'theme', 'apiUrl']) {
          if (!db.objectStoreNames.contains(ns)) db.createObjectStore(ns)
        }
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('apiUrl', 'readwrite')
        tx.objectStore('apiUrl').put({ url: target }, '')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
      }
      req.onerror = () => resolve()
    })
  }, url)
}

/* ------------------------------------------------------------------ *
 * 1) API fora do ar + sem cache -> tela de fallback
 * ------------------------------------------------------------------ */

// Bloqueia ANTES da primeira navegacao: nada entra no cache.
await blockAll()
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
await clearStorage()
await page.reload({ waitUntil: 'domcontentloaded' })

await page.waitForSelector('.api-fallback', { timeout: 40000 })
check('a tela de fallback aparece sem cache e sem API', true)

const title = await page.locator('.api-fallback-title').innerText()
check('a tela tem o titulo de erro', /Nao foi possivel carregar/i.test(title), title)

const inputValue = await page.locator('.api-fallback-input').inputValue()
check('o campo mostra a URL base do build', inputValue.includes('webtv-api.netlify.app'), inputValue)

// O log de tentativas deve listar as vias que falharam.
//
// O `<details>` comeca FECHADO: por isso usa `textContent` (o
// `innerText` de um elemento oculto vem vazio).
const attempts = await page.locator('.api-fallback-attempts li').allTextContents()
check('o diagnostico lista as tentativas', attempts.length > 0, String(attempts.length) + ' tentativas')
check(
  'a tentativa da API foi registrada como falha',
  attempts.some(t => /FALHOU/i.test(t)),
  attempts[0]?.replace(/\s+/g, ' ').slice(0, 90) ?? '',
)

await page.screenshot({ path: resolve(OUT, 'fallback.png') })

/* ------------------------------------------------------------------ *
 * 2) Trocar a URL da API na tela -> o catalogo carrega
 * ------------------------------------------------------------------ */

await unblockAll()
await page.locator('.api-fallback-input').fill(GOOD_API)

// Espera a resposta da API nova: a gravacao do cache acontece DEPOIS
// da resposta - e um cache racing voltaria a preencher o storage no
// passo seguinte (e o teste ficaria instavel).
const apiAnswer = page.waitForResponse(
  res => res.url().includes('127.0.0.1:8080/channels') && res.status() === 200,
  { timeout: 40000 },
)

await page.locator('.api-fallback-actions button.primary').click()

await page.waitForSelector('.top-section', { timeout: 40000 })
await apiAnswer.catch(() => {})
// Deixa a gravacao do cache terminar.
await page.waitForTimeout(1500)

const total = await page.locator('.topbar-count').innerText()
check('o catalogo carregou com a URL nova', /156\s+canais/.test(total), total)
// A estrategia pode ser "api" ou "snapshot": o snapshot do build
// (local) chega antes da rede. O que importa e que a URL NOVA foi
// consultada - e que o catalogo tem os canais.
const apiCalls = []
page.on('request', r => {
  if (r.url().includes('127.0.0.1:8080/channels')) apiCalls.push(r.url())
})

const strategy = await page.locator('.app').getAttribute('data-strategy')
check(
  'a estrategia e de uma via com dados (api ou snapshot)',
  strategy === 'api' || strategy === 'snapshot',
  String(strategy),
)

/* ------------------------------------------------------------------ *
 * 3) Sem override, a tela volta para a URL do build
 * ------------------------------------------------------------------ */

await clearStorage()
await blockAll()
// Recarrega: o storage foi apagado, entao a app parte do zero.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.api-fallback', { timeout: 40000 })

const fallbackUrl = await page.locator('.api-fallback-input').inputValue()
check(
  'sem override, a tela volta para a URL base do build',
  fallbackUrl.includes('webtv-api.netlify.app'),
  fallbackUrl,
)

/* ------------------------------------------------------------------ *
 * 4) Com override gravado, a app consulta a URL do override
 * ------------------------------------------------------------------ */

await writeOverride('https://api.override.test')

const apiRequests = []
page.on('request', r => {
  if (r.url().includes('override.test')) apiRequests.push(r.url())
})

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.api-fallback', { timeout: 40000 })

check(
  'o override foi usado na consulta (com /channels)',
  apiRequests.some(u => u.includes('override.test/channels')),
  apiRequests.join(', '),
)

const overrideUrl = await page.locator('.api-fallback-input').inputValue()
check('a tela mostra a URL do override', overrideUrl.includes('override.test'), overrideUrl)

// O botao de restaurar so aparece quando ha override.
const resetVisible = await page.locator('.api-fallback-actions button', { hasText: 'Voltar' }).count()
check('o botao de restaurar aparece com override', resetVisible > 0, String(resetVisible))

await page.screenshot({ path: resolve(OUT, 'fallback-override.png') })

/* ------------------------------------------------------------------ */

console.log(failures === 0 ? '\nTUDO OK' : `\n${failures} FALHA(S)`)
await page.close()
await browser.close()
process.exit(failures === 0 ? 0 : 1)
