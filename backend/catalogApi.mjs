/**
 * Nucleo da API do catalogo (rota + cache + CORS).
 *
 * Compartilhado entre:
 *   - `backend/server.mjs`     -> servidor Node (container na Suga, local);
 *   - `netlify/functions/`      -> Netlify Function (producao).
 *
 * ## Por que um modulo compartilhado
 *
 * As duas implementações precisam devolver **exatamente** o mesmo JSON
 * (o frontend v2 consome uma unica forma). Se a rota fosse reescrita em
 * cada runtime, qualquer divergencia viraria bug de producao. Aqui a
 * logica de rota, cache e CORS esta uma vez so.
 *
 * ## Contrato
 *
 *   GET /channels          -> catalogo completo (JSON)
 *   GET /channels?fresh=1  -> ignora o cache e re-busca o site
 *   GET /health            -> status do servico
 *   OPTIONS *              -> preflight (204 + headers CORS)
 *
 * O fetch do site de origem acontece no servidor (sem Same-Origin
 * Policy), e a resposta sai com `Access-Control-Allow-Origin: *`.
 */

import { parseEmbedcanaisHtml } from '../shared/parseEmbedcanais.mjs'

/** Headers de CORS aplicados a toda resposta. */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

/** User-Agent usado no fetch do site de origem. */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Estado do cache do catalogo (por instancia).
 *
 * Em serverless cada invocacao pode rodar em uma instancia fria, entao
 * o cache e melhor-esforco: o TTL evita martelar o site de origem, mas
 * nao e garantia de persistencia.
 */
export function createCatalogCache({ ttlMs = 10 * 60 * 1000 } = {}) {
  let catalog = null
  let cachedAt = 0

  return {
    /** O catalogo em cache, ou null. */
    peek() {
      return catalog
    },

    /** Timestamp (ms) da ultima extracao bem-sucedida. */
    timestamp() {
      return cachedAt
    },

    /** true se o cache ainda esta dentro do TTL. */
    isFresh() {
      return Boolean(catalog) && Date.now() - cachedAt < ttlMs
    },

    /** Guarda o catalogo. */
    store(value) {
      catalog = value
      cachedAt = Date.now()
    },
  }
}

/**
 * Busca o HTML do site de origem.
 *
 * @param {object} options
 * @param {string} options.sourceUrl
 * @param {number} options.timeoutMs
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function fetchUpstreamHtml({
  sourceUrl,
  timeoutMs = 15000,
  fetchImpl = fetch,
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(sourceUrl, {
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
 * Retorna o catalogo, usando o cache quando valido.
 *
 * @param {object} options
 * @param {ReturnType<typeof createCatalogCache>} options.cache
 * @param {string} options.sourceUrl
 * @param {boolean} [options.force] ignora o cache
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function getCatalog({
  cache,
  sourceUrl,
  force = false,
  timeoutMs = 15000,
  fetchImpl = fetch,
}) {
  if (!force && cache.isFresh()) {
    return { catalog: cache.peek(), cached: true }
  }

  const html = await fetchUpstreamHtml({ sourceUrl, timeoutMs, fetchImpl })
  const parsed = parseEmbedcanaisHtml(html)
  if (!parsed) throw new Error('HTML do site sem a listagem de canais')

  cache.store(parsed)
  return { catalog: parsed, cached: false }
}

/**
 * Monta o corpo JSON de `/channels`.
 *
 * @param {object} options
 * @param {ReturnType<typeof createCatalogCache>} options.cache
 * @param {string} options.sourceUrl
 * @param {boolean} [options.force]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{status: number, body: object}>}
 */
export async function channelsResponse({
  cache,
  sourceUrl,
  force = false,
  timeoutMs = 15000,
  fetchImpl = fetch,
}) {
  try {
    const { catalog, cached } = await getCatalog({
      cache,
      sourceUrl,
      force,
      timeoutMs,
      fetchImpl,
    })

    return {
      status: 200,
      body: {
        generatedAt: new Date().toISOString(),
        source: sourceUrl,
        cached,
        count: catalog.channels.length,
        categories: catalog.categories,
        categoryOrder: catalog.categoryOrder,
        categoryLabels: catalog.categoryLabels,
        channels: catalog.channels,
      },
    }
  } catch (err) {
    // Se falhou mas existe cache antigo, devolve o cache com aviso.
    const stale = cache.peek()
    if (stale) {
      return {
        status: 200,
        body: {
          generatedAt: new Date(cache.timestamp()).toISOString(),
          source: sourceUrl,
          cached: true,
          stale: true,
          warning: `falha ao atualizar: ${err.message}`,
          count: stale.channels.length,
          categories: stale.categories,
          categoryOrder: stale.categoryOrder,
          categoryLabels: stale.categoryLabels,
          channels: stale.channels,
        },
      }
    }
    return { status: 502, body: { error: err.message } }
  }
}

/**
 * Monta o corpo JSON de `/health`.
 *
 * @param {object} options
 * @param {ReturnType<typeof createCatalogCache>} options.cache
 * @param {string} options.sourceUrl
 */
export function healthResponse({ cache, sourceUrl }) {
  const catalog = cache.peek()
  return {
    status: 200,
    body: {
      ok: true,
      source: sourceUrl,
      cached: Boolean(catalog),
      channels: catalog ? catalog.channels.length : 0,
      cacheAgeMs: catalog ? Date.now() - cache.timestamp() : null,
    },
  }
}

/**
 * Resolve uma requisicao HTTP em `{status, body}`.
 *
 * Compartilhado entre o servidor Node e a Netlify Function - assim os
 * dois runtimes respondem identicamente.
 *
 * @param {object} options
 * @param {string} options.method
 * @param {string} options.url
 * @param {ReturnType<typeof createCatalogCache>} options.cache
 * @param {string} options.sourceUrl
 * @param {number} [options.ttlMs]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{status: number, body: object | null, headers: object}>}
 */
export async function handleRequest({
  method,
  url,
  cache,
  sourceUrl,
  ttlMs = 10 * 60 * 1000,
  timeoutMs = 15000,
  fetchImpl = fetch,
}) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (method === 'OPTIONS') {
    return { status: 204, body: null, headers: { ...CORS_HEADERS } }
  }

  if (method !== 'GET') {
    return {
      status: 405,
      body: { error: 'metodo nao permitido' },
      headers: { ...CORS_HEADERS },
    }
  }

  // `/channels` (a API publica) e `/v1/channels` (alias).
  if (pathname === '/channels' || pathname === '/v1/channels') {
    const force = url.searchParams.get('fresh') === '1'
    const { status, body } = await channelsResponse({
      cache,
      sourceUrl,
      force,
      timeoutMs,
      fetchImpl,
    })
    return { status, body, headers: { ...CORS_HEADERS } }
  }

  if (pathname === '/health') {
    const { status, body } = healthResponse({ cache, sourceUrl })
    return { status, body, headers: { ...CORS_HEADERS } }
  }

  return {
    status: 404,
    body: { error: 'rota nao encontrada' },
    headers: { ...CORS_HEADERS },
  }
}
