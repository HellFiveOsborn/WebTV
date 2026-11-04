/**
 * Fontes de dados do catalogo de canais (embedcanais.online)
 *
 * O site NAO envia headers CORS, entao um `fetch` direto do browser para
 * https://embedcanais.online/ e bloqueado pela Same-Origin Policy.
 *
 * A v2 roda 100% client-side (GitHub Pages = estatico, sem Node no runtime),
 * entao o catalogo vem por tres vias, em ordem de confianca:
 *
 *  1. CACHE   - localStorage. Resultado da ultima consulta valida. Dentro do
 *               TTL nao ha NENHUMA requisicao de rede (ver catalogCache.ts).
 *  2. API     - backend no Netlify (Function `channels`). Busca o site no
 *               servidor (sem restricao de CORS) e devolve JSON limpo com
 *               `Access-Control-Allow-Origin: *`. E a via principal em
 *               producao e resolve o problema de CORS de vez.
 *  3. LIVE    - fetch direto ao site. Funciona em dev local (proxy do Vite
 *               = mesma origem) ou se o site liberar CORS no futuro.
 *  4. SNAPSHOT- JSON gerado no BUILD (GitHub Actions roda Node e baixa o site).
 *               Arquivo estatico, sempre disponivel, fallback ultimo.
 *
 * O app requisita ao entrar: o cache e o snapshot do build sao lidos primeiro
 * (instantaneo, sem rede) e so depois a rede e consultada. A UI sempre
 * informa qual via forneceu os dados, para deixar a origem transparente.
 */

import {
  EMBEDCANAIS_SOURCE_URL,
  EmbedcanaisCatalog,
  parseEmbedcanaisHtml,
} from './parseEmbedcanais.js'
import {
  CacheStatus,
  clearCache,
  getCacheStatus,
  readCache,
  writeCache,
} from './catalogCache.js'
import { readApiUrl, pickApiUrl, resolveChannelsUrl } from './apiUrl.js'
export type LoadStrategy = 'cache' | 'api' | 'live' | 'cors' | 'snapshot'

export interface CatalogResult {
  catalog: EmbedcanaisCatalog
  strategy: LoadStrategy
  /** URL efetiva usada (snapshot = caminho local, cache = origem guardada) */
  source: string
  fetchedAt: number
}

export interface Attempt {
  strategy: LoadStrategy
  url: string
  ok: boolean
  error?: string
}

export const STRATEGY_LABEL: Record<LoadStrategy, string> = {
  cache: 'cache local',
  api: 'API (backend)',
  live: 'live (direto)',
  cors: 'proxy CORS',
  snapshot: 'snapshot (build)',
}

/** Caminho do snapshot gerado no build (public/data/embedcanais.json). */
export const SNAPSHOT_URL = `${import.meta.env.BASE_URL}data/embedcanais.json`

/**
 * URL BASE da API do catalogo (Netlify Function) - PADRAO do build.
 *
 * Este e o valor PADRAO: a API real do projeto, embutida no bundle.
 * A var de repositorio `VITE_API_URL` pode sobrescreve-lo no build.
 *
 * Em dev o Vite tambem expoe o proxy `/api/channels` (backend local,
 * porta 8080): basta definir `VITE_API_URL=/api` no `.env` local para
 * usar o backend em vez da API publicada.
 *
 * Este valor e a BASE: o app acrescenta o `/channels` para montar o
 * endpoint (ver `lib/apiUrl.ts`).
 *
 * O usuario pode TROCAR essa URL na tela de fallback (sem rebuild):
 * o override fica no storage (`lib/apiUrl.ts`) e vence este valor.
 */
export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) || 'https://webtv-api.netlify.app'

/**
 * URL BASE que o app usa AGORA (override do usuario ou a do build).
 */
export async function getEffectiveApiUrl(): Promise<string> {
  const override = await readApiUrl()
  return pickApiUrl(override, API_URL)
}

/**
 * ENDPOINT que sera consultado (a base + `/channels`).
 */
export async function getEffectiveApiEndpoint(): Promise<string> {
  return resolveChannelsUrl(await getEffectiveApiUrl())
}

/**
 * Em dev, o Vite tem um proxy para o site (mesma origem => sem CORS).
 * Em producao (GitHub Pages) nao existe proxy, entao usa a URL direta.
 */
export const LIVE_URL = import.meta.env.DEV ? '/api/embedcanais/' : EMBEDCANAIS_SOURCE_URL

/**
 * Proxies publicos de CORS usados como ultimo recurso.
 * Exigem a URL-alvo percent-encoded. Sao instaveis (522/520) e falham
 * justamente quando o header `Origin` e enviado - ou seja, no caso do browser.
 */
export const CORS_PROXIES: Array<{ name: string; build: (target: string) => string }> = [
  {
    name: 'allorigins',
    build: target => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  },
  {
    name: 'codetabs',
    build: target => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  },
]

const FETCH_TIMEOUT_MS = 15000

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Busca o catalogo na API do backend (JSON ja parseado).
 */
async function tryApi(url: string): Promise<
  { ok: true; catalog: EmbedcanaisCatalog } | { ok: false; error: string }
> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = (await res.json()) as EmbedcanaisCatalog
    if (!data || !Array.isArray(data.channels) || data.channels.length === 0) {
      throw new Error('resposta sem canais')
    }
    return { ok: true, catalog: data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Busca e parseia o HTML do site.
 */
async function tryUrl(
  url: string,
): Promise<{ ok: true; catalog: EmbedcanaisCatalog } | { ok: false; error: string }> {
  try {
    const text = await fetchText(url)
    const catalog = parseEmbedcanaisHtml(text)
    if (!catalog) return { ok: false, error: 'HTML sem a listagem de canais' }
    return { ok: true, catalog }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Carrega o snapshot gerado no build. Instantaneo e sempre disponivel
 * (desde que o build tenha rodado com sucesso).
 */
export async function loadSnapshot(): Promise<
  { ok: true; result: CatalogResult } | { ok: false; error: string }
> {
  try {
    const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = (await res.json()) as EmbedcanaisCatalog
    if (!data || !Array.isArray(data.channels) || data.channels.length === 0) {
      return { ok: false, error: 'Snapshot sem canais' }
    }
    return {
      ok: true,
      result: {
        catalog: data,
        strategy: 'snapshot',
        source: SNAPSHOT_URL,
        fetchedAt: Date.now(),
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/* ------------------------------------------------------------------ *
 * Cache local (storage unificado)
 * ------------------------------------------------------------------ */

/** Status do cache local (idade, freshness). */
export async function getLocalCacheStatus(): Promise<CacheStatus<EmbedcanaisCatalog>> {
  return getCacheStatus<EmbedcanaisCatalog>()
}

/**
 * Le o catalogo guardado no cache local.
 * Devolve null se nao houver cache utilizavel.
 */
export async function loadCachedCatalog(): Promise<CatalogResult | null> {
  const status = await getCacheStatus<EmbedcanaisCatalog>()
  if (!status.entry || !status.usable) return null

  return {
    catalog: status.entry.catalog,
    strategy: 'cache',
    source: status.entry.origin,
    fetchedAt: status.entry.savedAt,
  }
}

/**
 * Grava o catalogo no cache local.
 *
 * @param savedAt quando o dado foi obtido (default: agora). Para o snapshot
 *   do build, informe o `generatedAt` real - senao o TTL passaria a mentir
 *   sobre a idade do dado.
 *
 * Nao sobrescreve uma entrada mais nova: o snapshot do build (antigo) nunca
 * deve derrubar um resultado de API recem-baixado.
 */
export async function saveCatalogCache(
  catalog: EmbedcanaisCatalog,
  origin: string,
  savedAt?: number,
): Promise<boolean> {
  const current = await readCache<EmbedcanaisCatalog>()
  const stamp = savedAt ?? Date.now()
  if (current && current.savedAt > stamp) return false

  return writeCache<EmbedcanaisCatalog>(catalog, origin, stamp)
}

/** Limpa o cache local (usado pelo botao "limpar cache"). */
export async function clearLocalCache(): Promise<void> {
  await clearCache()
}

/* ------------------------------------------------------------------ *
 * Carga do catalogo
 * ------------------------------------------------------------------ */

export interface LoadCatalogOptions {
  apiUrl?: string
  signal?: AbortSignal
  /** Grava o resultado no cache local (default: true). */
  cache?: boolean
  /** Ignora o cache local e sempre consulta a rede (default: false). */
  forceRefresh?: boolean
  /**
   * Permite que o snapshot do build seja o resultado final quando todas as
   * vias de rede falham (default: true).
   *
   * Na REVALIDACAO isso deve ser false: o snapshot e um artefato antigo e
   * nao pode substituir um cache mais novo que ja esta em tela.
   */
  allowSnapshot?: boolean
}

/**
 * Tenta a API do backend e, em seguida, o site direto.
 *
 * Quando uma via funciona, o resultado e gravado no cache local (com o
 * timestamp do momento), para que a proxima abertura nao precise de rede.
 */
export async function loadCatalog(options?: LoadCatalogOptions): Promise<{
  ok: boolean
  result?: CatalogResult
  attempts: Attempt[]
}> {
  const attempts: Attempt[] = []
  // Sem `apiUrl` explicito, usa a URL base efetiva (override do usuario
  // ou a do build) e deriva o endpoint (+ /channels). A leitura do
  // storage e async - por isso a funcao ja e async.
  const baseUrl = options?.apiUrl ?? (await getEffectiveApiUrl())
  const apiUrl = resolveChannelsUrl(baseUrl)
  const useCache = options?.cache !== false

  const finish = async (
    catalog: EmbedcanaisCatalog,
    strategy: LoadStrategy,
    source: string,
  ) => {
    if (useCache) await saveCatalogCache(catalog, source)
    return {
      ok: true,
      result: { catalog, strategy, source, fetchedAt: Date.now() },
      attempts,
    }
  }

  // 1) API do backend (resolve CORS).
  if (apiUrl) {
    const outcome = await tryApi(apiUrl)
    attempts.push({ strategy: 'api', url: apiUrl, ok: outcome.ok, error: outcome.ok ? undefined : outcome.error })
    if (outcome.ok) return finish(outcome.catalog, 'api', apiUrl)
  }

  // 2) Site direto (dev local via proxy do Vite; producao se houver CORS).
  {
    const outcome = await tryUrl(LIVE_URL)
    attempts.push({ strategy: 'live', url: LIVE_URL, ok: outcome.ok, error: outcome.ok ? undefined : outcome.error })
    if (outcome.ok) return finish(outcome.catalog, 'live', LIVE_URL)
  }

  // 3) Proxies publicos de CORS.
  for (const proxy of CORS_PROXIES) {
    const url = proxy.build(EMBEDCANAIS_SOURCE_URL)
    const outcome = await tryUrl(url)
    attempts.push({ strategy: 'cors', url, ok: outcome.ok, error: outcome.ok ? undefined : outcome.error })
    if (outcome.ok) return finish(outcome.catalog, 'cors', url)
  }

  // 4) Snapshot do build (ultimo recurso, sempre local).
  if (options?.allowSnapshot !== false) {
    const outcome = await loadSnapshot()
    attempts.push({
      strategy: 'snapshot',
      url: SNAPSHOT_URL,
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.error,
    })
    if (outcome.ok && outcome.result) {
      // O snapshot e um artefato de build: a "idade" do dado e o
      // `generatedAt` dele, nao o momento em que o arquivo foi lido.
      const generatedAt = Date.parse(
        (outcome.result.catalog as unknown as { generatedAt?: string }).generatedAt ?? '',
      )
      if (useCache) {
        await saveCatalogCache(
          outcome.result.catalog,
          SNAPSHOT_URL,
          Number.isFinite(generatedAt) ? generatedAt : undefined,
        )
      }
      return { ok: true, result: outcome.result, attempts }
    }
  }

  return { ok: false, attempts }
}
