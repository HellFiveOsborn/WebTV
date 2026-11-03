/**
 * Backend WebTV v2 - proxy do catalogo de canais.
 *
 * PROBLEMA QUE RESOLVE:
 * https://embedcanais.online/ nao envia headers CORS, entao um `fetch` direto
 * do browser para o site e bloqueado pela Same-Origin Policy. Como o frontend
 * v2 e 100% estatico (GitHub Pages, sem Node no runtime), nao existe proxy
 * proprio em producao.
 *
 * Este servico roda como container (Node) na Suga. Ele busca o HTML do site
 * no servidor (sem restricao de CORS) e devolve o catalogo ja parseado em
 * JSON, com `Access-Control-Allow-Origin: *`.
 *
 * Rotas:
 *   GET /channels          -> catalogo completo (JSON)
 *   GET /channels?fresh=1  -> ignora cache e re-busca o site
 *   GET /health            -> status do servico
 *
 * Cache: o catalogo muda pouco; o servico reusa a ultima extracao por
 * CACHE_TTL_MS (padrao 10 min) para nao martelar o site de origem.
 */

import { createServer } from 'node:http'
import { parseEmbedcanaisHtml } from '../shared/parseEmbedcanais.mjs'

const PORT = Number(process.env.PORT || 8080)
const SOURCE_URL = process.env.EMBEDCANAIS_SOURCE_URL || 'https://embedcanais.online/'
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000)

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Ultimo catalogo extraido com sucesso. */
let cache = null
/** Timestamp (ms) da ultima extracao. */
let cacheAt = 0

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

/** Busca o HTML do site de origem. */
async function fetchUpstreamHtml() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const res = await fetch(SOURCE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`upstream respondeu HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Retorna o catalogo, usando cache quando valido.
 * @param {boolean} force ignora o cache
 */
async function getCatalog(force = false) {
  const fresh = cache && Date.now() - cacheAt < CACHE_TTL_MS
  if (fresh && !force) {
    return { catalog: cache, cached: true }
  }

  const html = await fetchUpstreamHtml()
  const parsed = parseEmbedcanaisHtml(html)
  if (!parsed) throw new Error('HTML do site sem a listagem de canais')

  cache = parsed
  cacheAt = Date.now()
  return { catalog: parsed, cached: false }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'metodo nao permitido' })
    return
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      source: SOURCE_URL,
      cached: !!cache,
      channels: cache ? cache.channels.length : 0,
      cacheAgeMs: cache ? Date.now() - cacheAt : null,
    })
    return
  }

  if (url.pathname === '/channels') {
    const force = url.searchParams.get('fresh') === '1'
    try {
      const { catalog, cached } = await getCatalog(force)
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        cached,
        count: catalog.channels.length,
        categories: catalog.categories,
        categoryOrder: catalog.categoryOrder,
        categoryLabels: catalog.categoryLabels,
        channels: catalog.channels,
      })
    } catch (err) {
      // Se falhou mas existe cache antigo, devolve o cache com aviso.
      if (cache) {
        sendJson(res, 200, {
          generatedAt: new Date(cacheAt).toISOString(),
          source: SOURCE_URL,
          cached: true,
          stale: true,
          warning: `falha ao atualizar: ${err.message}`,
          count: cache.channels.length,
          categories: cache.categories,
          categoryOrder: cache.categoryOrder,
          categoryLabels: cache.categoryLabels,
          channels: cache.channels,
        })
        return
      }
      sendJson(res, 502, { error: err.message })
    }
    return
  }

  sendJson(res, 404, { error: 'rota nao encontrada' })
})

server.listen(PORT, () => {
  console.log(`[webtv-backend] ouvindo na porta ${PORT}`)
  console.log(`[webtv-backend] origem: ${SOURCE_URL}`)
})
