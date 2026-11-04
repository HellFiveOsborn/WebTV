/**
 * Catalogo de scripts de injecao do player.
 *
 * O app Kotlin injeta scripts na pagina do canal para controlar o
 * player (autoplay, remover banners VIP, expor `window.WebTV.player`).
 * A v1 mantem esses scripts num Gist (admin edita) e os entrega ao
 * Kotlin por meio do evento `scripts:loaded`.
 *
 * A v2 e 100% client-side: nao ha servidor de scripts. Os scripts sao
 * baixados do mesmo Gist usado pela v1 (mesma fonte, sem divergencia)
 * e ficam disponiveis para o Kotlin.
 *
 * O catalogo e filtrado por DOMINIO: o Kotlin pede os scripts que
 * batem com a URL do canal e injeta apenas esses.
 */

/** Um script de injecao. */
export interface InjectionScript {
  id: string
  name: string
  code: string
  /** Dominios onde o script se aplica (ex.: `embedcanaisdetv.xyz`). */
  domains: string[]
  /** URLs especificas onde o script se aplica. */
  urls: string[]
  /** Ids de canais (do modelo da v1) onde o script se aplica. */
  channelIds?: string[]
}

/**
 * Gist com os scripts e canais da v1 (mesma fonte de dados).
 *
 * O raw do gist envia `Access-Control-Allow-Origin: *`, entao a v2
 * consegue ler direto do browser.
 */
export const SCRIPTS_GIST_RAW_URL =
  'https://gist.githubusercontent.com/HellFiveOsborn/0520b83cd34f4fa8a20831a42116837a/raw/channels.json'

/** Formato do arquivo do gist (o `scripts` e opcional). */
interface GistPayload {
  scripts?: Array<Partial<InjectionScript>>
}

/** Extrai o dominio de uma URL (sem `www.`). */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Scripts que se aplicam a uma URL.
 *
 * A regra e a mesma da v1 (`ScriptManager.getScriptsForUrl`): o script
 * entra se o DOMINIO da URL esta na lista de dominios do script OU se a
 * URL exata esta na lista de URLs.
 */
export function scriptsForUrl(
  scripts: InjectionScript[],
  url: string,
): InjectionScript[] {
  if (!url) return []
  const domain = domainOf(url)
  return scripts.filter(script => {
    const domains = (script.domains ?? []).map(d => d.toLowerCase())
    const urls = script.urls ?? []
    return (domain !== '' && domains.includes(domain)) || urls.includes(url)
  })
}

/**
 * Normaliza os scripts do gist: garante `id`, `name`, `code`, `domains`
 * e `urls` (sempre listas, mesmo vazias).
 */
export function normalizeScripts(raw: unknown): InjectionScript[] {
  if (!Array.isArray(raw)) return []

  const out: InjectionScript[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Partial<InjectionScript>
    if (typeof entry.code !== 'string' || entry.code.length === 0) continue

    out.push({
      id: entry.id ?? `script-${out.length}`,
      name: entry.name ?? 'unnamed',
      code: entry.code,
      domains: Array.isArray(entry.domains) ? entry.domains : [],
      urls: Array.isArray(entry.urls) ? entry.urls : [],
      channelIds: Array.isArray(entry.channelIds) ? entry.channelIds : undefined,
    })
  }
  return out
}

/**
 * Busca os scripts no gist.
 *
 * Falha silenciosa: o app continua funcionando sem scripts (o canal
 * abre normalmente, so sem as enhancements do player).
 */
export async function fetchScripts(
  url: string = SCRIPTS_GIST_RAW_URL,
): Promise<InjectionScript[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = (await res.json()) as GistPayload
    return normalizeScripts(data.scripts)
  } catch (error) {
    console.warn('[WebTV] Nao foi possivel carregar os scripts:', error)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Serializa os scripts no formato que o Kotlin espera no evento
 * `scripts:loaded` (e que ele usa para indexar por canal/URL/dominio).
 */
export function toBridgeScripts(scripts: InjectionScript[]): unknown[] {
  return scripts.map(script => ({
    id: script.id,
    name: script.name,
    code: script.code,
    domains: script.domains,
    urls: script.urls,
    channelIds: script.channelIds,
  }))
}
