/**
 * Storage local unificado (IndexedDB).
 *
 * OBJETIVO: padronizar o acesso a TODOS os dados locais do WebTV v2,
 * para que qualquer modulo possa salvar, ler, atualizar e apagar dados
 * sem se preocupar com o mecanismo de armazenamento.
 *
 * Antes: cada cache usava o localStorage direto (chaves `webtv:v2:*`).
 * Agora: tudo passa por este modulo, que usa IndexedDB (assincrono,
 * estruturado e com indexes) com fallback para o localStorage.
 *
 * Namespaces (stores) - um por tipo de dado:
 *
 *   `catalog`  - catalogo de canais (cache da API/snapshot)
 *   `usage`    - historico de uso (canais abertos: frequencia/recencia)
 *   `theme`    - preferencia de tema (claro/escuro)
 *   `apiUrl`   - URL da API do catalogo escolhida pelo usuario
 *
 * REGRAS:
 *   - a API e assincrona (Promise), igual em todos os stores;
 *   - falhar no storage NUNCA quebra o app (devolve o default e segue);
 *   - `clear(namespace)` apaga so um store; `clearAll()` apaga tudo;
 *   - migracao: os dados antigos do localStorage sao lidos uma vez e
 *     copiados para o IndexedDB, depois removidos do localStorage.
 */

/** Nome de um namespace (store) do banco local. */
export type Namespace = 'catalog' | 'usage' | 'theme' | 'apiUrl'

/** Todos os namespaces conhecidos. */
export const NAMESPACES: readonly Namespace[] = [
  'catalog',
  'usage',
  'theme',
  'apiUrl',
] as const

/** Versao do banco local. Incrementar dispara a migracao. */
export const DB_VERSION = 1

/** Nome do banco IndexedDB. */
export const DB_NAME = 'webtv-v2'

/**
 * Chaves do localStorage legado (usadas na migracao).
 * O prefixo e o mesmo que a v2 usava antes do IndexedDB.
 */
export const LEGACY_KEYS: Record<Namespace, string> = {
  catalog: 'webtv:v2:catalog',
  usage: 'webtv:v2:usage',
  theme: 'webtv:v2:theme',
  apiUrl: 'webtv:v2:apiUrl',
}

/* ------------------------------------------------------------------ *
 * IndexedDB - API minima (promessas)
 * ------------------------------------------------------------------ */

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/** Abre o banco (cria os stores se ainda nao existirem). */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB indisponivel'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const ns of NAMESPACES) {
        if (!db.objectStoreNames.contains(ns)) {
          db.createObjectStore(ns)
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o banco'))
    request.onblocked = () => reject(new Error('Banco bloqueado por outra aba'))
  })
}

/** Executa uma operacao em um store e resolve com o resultado. */
function withStore<T>(
  namespace: Namespace,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(namespace, mode)
        const store = tx.objectStore(namespace)
        const request = run(store)

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Operacao falhou'))
        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('Transacao falhou'))
        }
      }),
  )
}

/* ------------------------------------------------------------------ *
 * localStorage - fallback
 * ------------------------------------------------------------------ */

/** Storage injetavel (localStorage real ou fake de teste). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** localStorage do browser, ou null se indisponivel (modo privado). */
export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/** Chave interna do fallback (por namespace). */
function fallbackKey(namespace: Namespace): string {
  return `webtv:v2:db:${namespace}`
}

/* ------------------------------------------------------------------ *
 * API publica
 * ------------------------------------------------------------------ */

/**
 * Le um valor de um namespace.
 *
 * Devolve `fallback` se nao houver dado, se o storage falhar ou se o
 * valor gravado for invalido.
 */
export async function get<T>(
  namespace: Namespace,
  fallback: T,
  storage: StorageLike | null = getBrowserStorage(),
): Promise<T> {
  // IndexedDB e o caminho principal.
  if (hasIndexedDb()) {
    try {
      const value = await withStore<T | undefined>(
        namespace,
        'readonly',
        store => store.get('') as IDBRequest<T | undefined>,
      )
      if (value !== undefined) return value as T
      // Sem valor no IndexedDB: tenta a migracao do localStorage legado.
      const migrated = await migrateLegacy(namespace, storage)
      if (migrated !== undefined) return migrated as T
      return fallback
    } catch {
      // Cai para o fallback.
    }
  }

  // Fallback: localStorage.
  if (!storage) return fallback
  try {
    const raw = storage.getItem(fallbackKey(namespace))
    if (raw !== null) return JSON.parse(raw) as T
  } catch {
    // JSON corrompido: cai para a migracao / fallback abaixo.
  }

  // Sem dado no storage novo: tenta a migracao do localStorage legado.
  const migrated = await migrateLegacy(namespace, storage)
  if (migrated !== undefined) return migrated as T

  return fallback
}
/**
 * Grava um valor em um namespace.
 *
 * Devolve false se o storage falhar (quota, modo privado) - o app segue
 * funcionando, so sem persistencia.
 */
export async function set<T>(
  namespace: Namespace,
  value: T,
  storage: StorageLike | null = getBrowserStorage(),
): Promise<boolean> {
  if (hasIndexedDb()) {
    try {
      await withStore(namespace, 'readwrite', store => store.put(value, ''))
      return true
    } catch {
      // Cai para o fallback.
    }
  }

  if (!storage) return false
  try {
    storage.setItem(fallbackKey(namespace), JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/**
 * Apaga o conteudo de um namespace.
 */
export async function remove(
  namespace: Namespace,
  storage: StorageLike | null = getBrowserStorage(),
): Promise<boolean> {
  if (hasIndexedDb()) {
    try {
      await withStore(namespace, 'readwrite', store => store.delete(''))
      // Limpa tambem a chave legado, para nao voltar por migracao.
      try {
        storage?.removeItem(LEGACY_KEYS[namespace])
      } catch {
        /* ignora */
      }
      return true
    } catch {
      /* cai para o fallback */
    }
  }

  if (!storage) return false
  try {
    storage.removeItem(fallbackKey(namespace))
    storage.removeItem(LEGACY_KEYS[namespace])
    return true
  } catch {
    return false
  }
}

/** Apaga TODOS os namespaces. */
export async function clearAll(storage: StorageLike | null = getBrowserStorage()): Promise<boolean> {
  let ok = true
  for (const ns of NAMESPACES) {
    const done = await remove(ns, storage)
    if (!done) ok = false
  }
  return ok
}

/**
 * Le a chave legada do localStorage e a converte para o formato novo.
 *
 * Formatos antigos -> novos:
 *   catalog: { version, savedAt, origin, catalog }  ->  { savedAt, origin, catalog }
 *   usage:   { version, entries }                   ->  { [slug]: { count, ... } }
 *   theme:   "dark" | "light"                        ->  { theme: "dark" | "light" }
 */
function migrateLegacy(
  namespace: Namespace,
  storage: StorageLike | null,
): Promise<unknown | undefined> {
  if (!storage) return Promise.resolve(undefined)

  let raw: string | null
  try {
    raw = storage.getItem(LEGACY_KEYS[namespace])
  } catch {
    return Promise.resolve(undefined)
  }
  if (!raw) return Promise.resolve(undefined)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // O tema legado era gravado como texto puro ("light"), nao como JSON.
    parsed = raw
  }

  const migrated = convertLegacy(namespace, parsed)
  if (migrated === undefined) return Promise.resolve(undefined)

  // Grava no destino e remove a chave antiga.
  void set(namespace, migrated, storage)
  try {
    storage.removeItem(LEGACY_KEYS[namespace])
  } catch {
    /* ignora */
  }
  return Promise.resolve(migrated)
}

/**
 * Converte um valor legado no formato novo.
 * Exportado para poder ser testado sem browser.
 */
export function convertLegacy(namespace: Namespace, value: unknown): unknown | undefined {
  switch (namespace) {
    case 'catalog': {
      const v = value as { version?: number; savedAt?: number; origin?: string; catalog?: unknown }
      if (!v || typeof v.savedAt !== 'number' || !v.catalog) return undefined
      return { savedAt: v.savedAt, origin: v.origin ?? 'desconhecida', catalog: v.catalog }
    }

    case 'usage': {
      const v = value as { version?: number; entries?: Record<string, unknown> }
      const entries = v?.entries
      if (!entries || typeof entries !== 'object') return undefined

      const out: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(entries)) {
        const e = entry as { count?: number; lastOpenedAt?: number; firstOpenedAt?: number }
        if (!e || typeof e.count !== 'number' || e.count <= 0) continue
        out[key] = {
          count: e.count,
          lastOpenedAt: e.lastOpenedAt ?? 0,
          firstOpenedAt: e.firstOpenedAt ?? e.lastOpenedAt ?? 0,
        }
      }
      // Um historico vazio e valido, mas nao deve sobrescrever um
      // historico existente: so migra se houver alguma entrada.
      return Object.keys(out).length > 0 ? out : undefined
    }

    case 'theme': {
      if (value === 'dark' || value === 'light') return { theme: value }
      return undefined
    }

    case 'apiUrl': {
      // legado: a URL era guardada como texto puro.
      if (typeof value === 'string' && value) return { url: value }
      const v = value as { url?: unknown } | null
      if (v && typeof v.url === 'string' && v.url) return { url: v.url }
      return undefined
    }

    default:
      return undefined
  }
}

/* ------------------------------------------------------------------ *
 * Diagnostico
 * ------------------------------------------------------------------ */

export interface StorageInfo {
  /** 'indexeddb' | 'localstorage' | 'nenhum' */
  backend: 'indexeddb' | 'localstorage' | 'nenhum'
  /** Namespaces que possuem dados. */
  namespaces: Namespace[]
  /** true se ainda ha dados legados no localStorage. */
  hasLegacyData: boolean
}

/** Diagnostico do storage (usado na tela de configuracoes). */
export async function info(storage: StorageLike | null = getBrowserStorage()): Promise<StorageInfo> {
  const backend: StorageInfo['backend'] = hasIndexedDb()
    ? 'indexeddb'
    : storage
      ? 'localstorage'
      : 'nenhum'

  const namespaces: Namespace[] = []
  for (const ns of NAMESPACES) {
    const value = await get<unknown>(ns, undefined, storage)
    if (value !== undefined) namespaces.push(ns)
  }

  let hasLegacyData = false
  if (storage) {
    try {
      hasLegacyData = Object.values(LEGACY_KEYS).some(key => storage.getItem(key) !== null)
    } catch {
      hasLegacyData = false
    }
  }

  return { backend, namespaces, hasLegacyData }
}
