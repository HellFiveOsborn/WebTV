/**
 * Netlify Function: API do catalogo de canais do WebTV v2.
 *
 * ## Por que uma Function
 *
 * O frontend v2 e estatico (GitHub Pages) e o site de origem
 * (`embedcanais.online`) nao envia headers CORS. A Function busca o
 * HTML no servidor (sem Same-Origin Policy) e devolve JSON limpo com
 * `Access-Control-Allow-Origin: *`.
 *
 * ## Rotas
 *
 *   GET /channels          -> catalogo completo (JSON)
 *   GET /channels?fresh=1  -> ignora o cache e re-busca o site
 *   GET /health            -> status do servico
 *   OPTIONS *              -> preflight (204 + headers CORS)
 *
 * A Netlify serve a Function em `/.netlify/functions/<nome>`; o
 * `netlify.toml` mapeia `/channels` e `/health` direto para ela.
 *
 * ## Logica compartilhada
 *
 * Toda a rota/cache/CORS vem de `backend/catalogApi.mjs` - o mesmo
 * modulo do servidor Node. Assim os dois runtimes respondem igual.
 *
 * ## Cache
 *
 * O cache vive em memoria da instancia (warm start). Em runtime
 * serverless a instancia pode ser descartada, entao o cache e
 * melhor-esforco: o TTL evita martelar o site de origem, mas nao e
 * garantia de persistencia. O frontend v2 tem cache proprio
 * (IndexedDB/localStorage) e um snapshot de build como ultima via.
 */

import { createCatalogCache, handleRequest } from '../../backend/catalogApi.mjs'

const SOURCE_URL =
  process.env.EMBEDCANAIS_SOURCE_URL || 'https://embedcanais.online/'
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000)

/** Cache por instancia (sobrevive enquanto a instancia ficar warm). */
const cache = createCatalogCache({ ttlMs: CACHE_TTL_MS })

export default async (req, context) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  try {
    const { status, body, headers } = await handleRequest({
      method: req.method,
      url,
      cache,
      sourceUrl: SOURCE_URL,
      ttlMs: CACHE_TTL_MS,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
    })

    if (body === null) {
      // Preflight: 204 sem corpo.
      return new Response(null, { status, headers })
    }

    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  }
}
