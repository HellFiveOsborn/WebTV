/**
 * Backend WebTV v2 - proxy do catalogo de canais (servidor Node).
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
 * ## Rotas
 *
 *   GET /channels          -> catalogo completo (JSON)
 *   GET /channels?fresh=1  -> ignora cache e re-busca o site
 *   GET /health            -> status do servico
 *   OPTIONS *              -> preflight (204 + headers CORS)
 *
 * ## A logica de rota esta em `backend/catalogApi.mjs`
 *
 * O mesmo modulo e usado pela Netlify Function (`netlify/functions/`), que e
 * o runtime de producao. Compartir evita que os dois runtimes divirjam.
 *
 * Cache: o catalogo muda pouco; o servico reusa a ultima extracao por
 * CACHE_TTL_MS (padrao 10 min) para nao martelar o site de origem.
 */

import { createServer } from 'node:http'
import { createCatalogCache, handleRequest } from './catalogApi.mjs'

const PORT = Number(process.env.PORT || 8080)
const SOURCE_URL = process.env.EMBEDCANAIS_SOURCE_URL || 'https://embedcanais.online/'
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000)

const cache = createCatalogCache({ ttlMs: CACHE_TTL_MS })

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    const { status, body, headers } = await handleRequest({
      method: req.method || 'GET',
      url,
      cache,
      sourceUrl: SOURCE_URL,
      ttlMs: CACHE_TTL_MS,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    })

    if (body === null) {
      res.writeHead(status, headers)
      res.end()
      return
    }

    const payload = JSON.stringify(body)
    res.writeHead(status, {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
    })
    res.end(payload)
  } catch (err) {
    const payload = JSON.stringify({ error: err.message })
    res.writeHead(500, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    })
    res.end(payload)
  }
})

server.listen(PORT, () => {
  console.log(`[webtv-backend] ouvindo na porta ${PORT}`)
  console.log(`[webtv-backend] origem: ${SOURCE_URL}`)
})
