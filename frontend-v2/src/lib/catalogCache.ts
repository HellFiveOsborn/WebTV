/**
 * Cache local do catalogo de canais (localStorage).
 *
 * MOTIVO: sem cache, cada abertura da v2 dispara uma requisicao a API (Suga)
 * e/ou ao site de origem. O catalogo muda com pouca frequencia, entao
 * guardamos o ultimo resultado bem-sucedido no localStorage e revalidamos em
 * segundo plano apenas quando o dado passa do TTL.
 *
 * PADRAO: stale-while-revalidate.
 *   - cache dentro do TTL  -> NENHUMA requisicao de rede
 *   - cache expirado       -> mostra o dado velho e revalida em background
 *   - sem cache            -> quem chama decide (snapshot do build + rede)
 *
 * O modulo nao importa NADA de proposito: assim ele compila isolado para os
 * testes em Node (tests/catalogCache.test.mjs) e nao depende de DOM alem de
 * `localStorage` - que pode nao existir (modo privado / SSR), por isso o
 * storage e injetavel.
 */

/** Chave no localStorage. */
export const CACHE_KEY = 'webtv:v2:catalog'

/** Versao do formato gravado. Incrementar invalida caches antigos. */
export const CACHE_VERSION = 1

/** TTL padrao: 30 minutos sem revalidar. */
export const DEFAULT_TTL_MS = 30 * 60 * 1000

/**
 * Idade maxima em que o dado velho ainda pode ser exibido como fallback
 * (ex.: app aberto offline). Passou disso, o cache e descartado.
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

/** Storage injetavel (localStorage real ou fake de teste). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface CacheOptions {
  /** null desliga o cache (sem storage). */
  storage?: StorageLike | null
  ttlMs?: number
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

/** localStorage do browser, ou null se indisponivel (SSR / modo privado). */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // localStorage pode lancar ao ser acessado (cookies bloqueados).
    return null
  }
}

/** Valida a forma minima de um catalogo guardado no cache. */
export function isCatalogLike(value: unknown): value is CatalogShape {
  if (!value || typeof value !== 'object') return false
  const c = value as Partial<CatalogShape>
  return Array.isArray(c.channels) && c.channels.length > 0 && Array.isArray(c.categories)
}

/**
 * Le o cache. Devolve null se nao houver, se o JSON estiver corrompido ou se
 * o formato nao bater com a versao atual (nesse caso a entrada e removida).
 */
export function readCache<T extends CatalogShape = CatalogShape>(
  storage: StorageLike | null = getBrowserStorage(),
): CatalogCacheEntry<T> | null {
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(CACHE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<CatalogCacheEntry<T>>
    if (!parsed || parsed.version !== CACHE_VERSION) return null
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null
    if (!isCatalogLike(parsed.catalog)) return null

    return {
      version: CACHE_VERSION,
      savedAt: parsed.savedAt,
      origin: typeof parsed.origin === 'string' ? parsed.origin : 'desconhecida',
      catalog: parsed.catalog as T,
    }
  } catch {
    // JSON corrompido: descarta a entrada para nao repetir o erro.
    try {
      storage.removeItem(CACHE_KEY)
    } catch {
      /* ignora */
    }
    return null
  }
}

/**
 * Grava o catalogo no cache. Devolve false se nao houver storage ou se a
 * escrita falhar (quota excedida).
 *
 * @param savedAt quando o dado foi obtido (default: agora). Para dados
 *   antigos (ex.: snapshot gerado no build) informe o timestamp real, senao o
 *   TTL passa a mentir sobre a idade do dado.
 */
export function writeCache<T extends CatalogShape = CatalogShape>(
  catalog: T,
  origin: string,
  storage: StorageLike | null = getBrowserStorage(),
  savedAt: number = Date.now(),
): boolean {
  if (!storage || !isCatalogLike(catalog)) return false

  const entry: CatalogCacheEntry<T> = {
    version: CACHE_VERSION,
    savedAt,
    origin,
    catalog,
  }

  try {
    storage.setItem(CACHE_KEY, JSON.stringify(entry))
    return true
  } catch {
    return false
  }
}

/** Remove o cache (botao "limpar cache" / refresh manual). */
export function clearCache(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(CACHE_KEY)
  } catch {
    /* ignora */
  }
}

/**
 * Estado do cache: idade, se ainda esta fresco (dentro do TTL) e se pode ser
 * usado como fallback (dentro da idade maxima).
 */
export function getCacheStatus<T extends CatalogShape = CatalogShape>(
  options?: CacheOptions,
): CacheStatus<T> {
  const storage = options?.storage ?? getBrowserStorage()
  const ttl = options?.ttlMs ?? getTtlMs()
  const maxAge = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const now = options?.now ?? Date.now()

  const entry = readCache<T>(storage)
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
