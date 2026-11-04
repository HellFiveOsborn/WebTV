/**
 * Orquestracao da carga do catalogo com cache local.
 *
 * SEPARADO de `catalogSource.ts` de proposito: este modulo decide QUANDO
 * tocar a rede, enquanto `catalogSource.ts` decide COMO buscar.
 *
 * Fluxo (stale-while-revalidate):
 *
 *   cache fresco (dentro do TTL)  -> devolve o cache e NAO faz requisicao
 *   cache velho (fora do TTL)      -> devolve o cache e revalida em background
 *   sem cache                     -> snapshot do build, depois a rede
 *
 * Requisicoes de rede sao sempre em ultimo lugar: o usuario ve dados
 * (cache ou snapshot) instantaneamente, e a rede so melhora o resultado.
 */

import {
  Attempt,
  CatalogResult,
  LoadStrategy,
  loadCatalog,
  loadCachedCatalog,
  loadSnapshot,
  saveCatalogCache,
  SNAPSHOT_URL,
} from './catalogSource.js'
import { clearCache, getCacheStatus } from './catalogCache.js'
import { EmbedcanaisCatalog } from './parseEmbedcanais.js'

export interface InitialLoad {
  /** Dados prontos para render (cache, snapshot ou rede). Null se tudo falhou. */
  result: CatalogResult | null
  /** Estrategia do dado exibido. */
  strategy: LoadStrategy
  /** Log das tentativas de rede (vazio se nao houve). */
  attempts: Attempt[]
  /** true se ainda falta consultar a rede para revalidar. */
  needsRevalidation: boolean
  /** Idade do cache usado (ms). Null se nao veio do cache. */
  cacheAgeMs: number | null
  /** true se o cache local foi invalido por `forceRefresh`. */
  cacheCleared: boolean
}

/**
 * Primeira carga: usa o que ja esta em disco, sem tocar a rede.
 *
 * @param forceRefresh ignora (e apaga) o cache local e vai direto a rede
 */
export async function loadInitialCatalog(options?: {
  forceRefresh?: boolean
}): Promise<InitialLoad> {
  let cacheCleared = false

  if (options?.forceRefresh) {
    await clearCache()
    cacheCleared = true
  }

  // 1) Cache local (instantaneo, sem rede).
  const status = await getCacheStatus<EmbedcanaisCatalog>()
  if (!options?.forceRefresh && status.entry && status.usable) {
    const cached = await loadCachedCatalog()
    if (cached) {
      return {
        result: cached,
        strategy: 'cache',
        attempts: [],
        // Dentro do TTL: nao ha o que revalidar. Fora: revalida em background.
        needsRevalidation: !status.fresh,
        cacheAgeMs: status.ageMs,
        cacheCleared,
      }
    }
  }

  // 2) Snapshot do build (arquivo estatico local, rapido).
  const snapshot = await loadSnapshot()
  if (snapshot.ok) {
    // O snapshot e um artefato de build: a "idade" do dado e o
    // `generatedAt` dele, nao o momento em que o arquivo foi lido.
    await cacheSnapshot(snapshot.result.catalog, SNAPSHOT_URL)
    return {
      result: snapshot.result,
      strategy: 'snapshot',
      attempts: [],
      needsRevalidation: true,
      cacheAgeMs: null,
      cacheCleared,
    }
  }

  // 3) Sem cache e sem snapshot: a rede e a unica opcao.
  return {
    result: null,
    strategy: 'snapshot',
    attempts: [],
    needsRevalidation: true,
    cacheAgeMs: null,
    cacheCleared,
  }
}

/**
 * Revalidacao: consulta a rede e, se der certo, atualiza o cache local.
 *
 * O snapshot do build NAO e aceito aqui: e um artefato antigo e nao pode
 * substituir o cache (mais novo) que ja esta em tela.
 *
 * Retorna null se nenhuma via de rede funcionou (o caller mantem o dado
 * antigo em tela).
 */
export async function revalidateCatalog(options?: {
  apiUrl?: string
}): Promise<{ result: CatalogResult | null; attempts: Attempt[] }> {
  const res = await loadCatalog({ apiUrl: options?.apiUrl, allowSnapshot: false })
  if (!res.ok || !res.result) return { result: null, attempts: res.attempts }
  return { result: res.result, attempts: res.attempts }
}

/**
 * Grava um catalogo no cache local usando o `generatedAt` do proprio arquivo
 * (o snapshot do build e antigo por definicao - nao usar "agora").
 */
export async function cacheSnapshot(
  catalog: EmbedcanaisCatalog,
  source: string,
): Promise<boolean> {
  const generatedAt = Date.parse((catalog as unknown as { generatedAt?: string }).generatedAt ?? '')
  return saveCatalogCache(catalog, source, Number.isFinite(generatedAt) ? generatedAt : undefined)
}
