/**
 * Cache do catalogo de canais.
 *
 * Guarda o ultimo catalogo obtido (da API, do site ou do snapshot do
 * build) no storage unificado (IndexedDB, namespace `catalog`).
 *
 * PADRAO: stale-while-revalidate.
 *   - cache dentro do TTL  -> NENHUMA requisicao de rede
 *   - cache expirado       -> mostra o dado velho e revalida em background
 *   - sem cache            -> quem chama decide (snapshot do build + rede)
 *
 * O modulo nao importa NADA de proposito: assim ele compila isolado para
 * os testes em Node (tests/catalogCache.test.mjs).
 */

import { get, remove, set } from './storage.js'

/** Namespace no storage unificado. */
export const NAMESPACE = 'catalog' as const

/** Versao do formato gravado. Incrementar invalida caches antigos. */
export const CACHE_VERSION = 1

/** TTL padrao: 30 minutos sem revalidar. */
export const DEFAULT_TTL_MS = 30 * 60 * 1000

/**
 * Idade maxima em que o dado velho ainda pode ser exibido como fallback
 * (ex.: app aberto offline). Passado disso, o cache e descartado.
 */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Forma minima do catalogo. O tipo concreto (EmbedcanaisCatalog) satisfaz
 * esta interface, entao o cache nao precisa conhecer o parser.
 */
export interface CatalogShape {
  channels: readonly unknown[]
  categories: readonly string[]
}

export interface CatalogCacheEntry<T extends CatalogShape = CatalogShape> {
  version: number
  /** Timestamp (ms) de quando o dado foi gravado. */
  savedAt: number
  /** Origem do dado (URL da API, site, etc.) - apenas diagnostico. */
  origin: string
  catalog: T
}

export interface CacheStatus<T extends CatalogShape = CatalogShape> {
  /** Entrada valida no cache (null se nao houver). */
  entry: CatalogCacheEntry<T> | null
  /** Idade da entrada em ms (null se nao houver). */
  ageMs: number | null
  /** Dentro do TTL: pode ser exibido sem tocar a rede. */
  fresh: boolean
  /** Dentro da idade maxima: pode ser exibido como fallback. */
  usable: boolean
}

export interface CacheOptions {
  /** TTL em ms (default: DEFAULT_TTL_MS ou VITE_CACHE_TTL_MS). */
  ttlMs?: number
  /** Idade maxima em ms (default: DEFAULT_MAX_AGE_MS). */
  maxAgeMs?: number
  /** "agora" injetavel para testes deterministicos. */
  now?: number
}

/**
 * Le uma variavel de ambiente do Vite sem depender dos tipos do `vite/client`
 * (o arquivo e compilado tambem para Node, nos testes).
 */
function readEnv(key: string): string | undefined {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
  const value = meta.env?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Resolve o TTL a partir de um objeto de env.
 *
 * Separado de `getTtlMs` para ser testavel: em Node, `import.meta.env` do
 * modulo de teste nao e o mesmo objeto do modulo compilado.
 *
 * @param env objeto de env; se omitido, le de `import.meta.env`
 */
export function resolveTtlMs(env?: Record<string, string | undefined>): number {
  const raw = env ? env.VITE_CACHE_TTL_MS : readEnv('VITE_CACHE_TTL_MS')
  if (!raw) return DEFAULT_TTL_MS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS
}

/** TTL configuravel via `VITE_CACHE_TTL_MS` (ms). Padrao: 30 min. */
export function getTtlMs(): number {
  return resolveTtlMs()
}

/** Valida a forma minima de um catalogo guardado no cache. */
export function isCatalogLike(value: unknown): value is CatalogShape {
  if (!value || typeof value !== 'object') return false
  const c = value as Partial<CatalogShape>
  return Array.isArray(c.channels) && c.channels.length > 0 && Array.isArray(c.categories)
}

/**
 * Le o cache do catalogo.
 *
 * Devolve null se nao houver, se o dado estiver corrompido ou se o
 * formato nao bater com a versao atual.
 */
export async function readCache<T extends CatalogShape = CatalogShape>(): Promise<
  CatalogCacheEntry<T> | null
> {
  const raw = await get<Partial<CatalogCacheEntry<T>> | undefined>(NAMESPACE, undefined)

  if (!raw) return null
  if (raw.version !== CACHE_VERSION) return null
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null
  if (!isCatalogLike(raw.catalog)) return null

  return {
    version: CACHE_VERSION,
    savedAt: raw.savedAt,
    origin: typeof raw.origin === 'string' ? raw.origin : 'desconhecida',
    catalog: raw.catalog as T,
  }
}

/**
 * Grava o catalogo no cache.
 *
 * @param savedAt quando o dado foi obtido (default: agora). Para dados
 *   antigos (ex.: snapshot gerado no build) informe o timestamp real, senao
 *   o TTL passa a mentir sobre a idade do dado.
 */
export async function writeCache<T extends CatalogShape = CatalogShape>(
  catalog: T,
  origin: string,
  savedAt: number = Date.now(),
): Promise<boolean> {
  if (!isCatalogLike(catalog)) return false

  const entry: CatalogCacheEntry<T> = {
    version: CACHE_VERSION,
    savedAt,
    origin,
    catalog,
  }

  return set(NAMESPACE, entry)
}

/** Remove o cache do catalogo. */
export async function clearCache(): Promise<void> {
  await remove(NAMESPACE)
}

/**
 * Estado do cache: idade, se ainda esta fresco (dentro do TTL) e se pode ser
 * usado como fallback (dentro da idade maxima).
 */
export async function getCacheStatus<T extends CatalogShape = CatalogShape>(
  options?: CacheOptions,
): Promise<CacheStatus<T>> {
  const ttl = options?.ttlMs ?? getTtlMs()
  const maxAge = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = options?.now ?? Date.now()

  const entry = await readCache<T>()
  if (!entry) return { entry: null, ageMs: null, fresh: false, usable: false }

  const ageMs = Math.max(0, now - entry.savedAt)
  return {
    entry,
    ageMs,
    fresh: ageMs < ttl,
    usable: ageMs < maxAge,
  }
}

/** Formata a idade do cache de forma curta ("45s", "12 min", "3 h", "2 d"). */
export function formatAge(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) return '-'
  const seconds = Math.round(ageMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}
