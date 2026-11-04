/**
 * URL da API do catalogo: de ONDE o app busca os canais.
 *
 * A URL tem DUAS origens:
 *
 *   1. O BUILD (`VITE_API_URL`): vem embutida no bundle (definida em
 *      `catalogSource.ts` como `API_URL`). E o padrao de producao.
 *   2. O OVERRIDE do USUARIO: gravado no storage unificado (IndexedDB,
 *      namespace `apiUrl`). Ganha do build.
 *
 * ## Por que existe o override
 *
 * A URL da API fica EMBUTIDA no bundle: trocar a API significa
 * rebuild + deploy. Quando a API caia (ou mudava de host), o usuario
 * ficava preso sem nenhuma saida - era preciso fazer push de cada vez.
 *
 * Com o override, a troca acontece NA TELA: o usuario aponta para
 * outra URL e o app recarrega na hora. Sem CI, sem deploy, sem push.
 *
 * O override e local (fica no aparelho). Ele NAO altera o bundle
 * publicado - serve para o aparelho do usuario continuar funcionando
 * enquanto a API oficial volta.
 *
 * ## Base x endpoint
 *
 * O usuario informa a BASE da API (o host). O app acrescenta o
 * `/channels` sozinho:
 *
 *   https://api.exemplo.com  -> https://api.exemplo.com/channels
 *   https://api.exemplo/v1   -> https://api.exemplo/v1/channels
 *
 * Se a URL ja aponta para um endpoint (o ultimo segmento nao e uma
 * "base" como `v1` ou `api`), ela e usada como esta - o app nao
 * mexe em path que ele nao conhece.
 *
 * O storage guarda a BASE (o que o usuario digitou e ve na tela). O
 * endpoint e derivado dela.
 *
 * O modulo nao importa NADA de proposito: assim compila isolado para os
 * testes em Node (tests/apiUrl.test.mjs).
 */

import { get, remove, set } from './storage.js'

/** Namespace no storage unificado. */
export const NAMESPACE = 'apiUrl' as const

/** Segmento do endpoint de catalogo. */
export const CHANNELS_SEGMENT = 'channels'

/** Caminho do endpoint de catalogo. */
export const CHANNELS_PATH = `/${CHANNELS_SEGMENT}`

/**
 * Segmentos que indicam uma BASE (e nao o endpoint final).
 *
 * `v1`, `v2beta1`, `api`... - nesses casos o `/channels` e acrescentado.
 */
const BASE_LIKE_SEGMENT = /^(?:v\d+(?:[a-z0-9.-]*)?|api)$/i

/**
 * Normaliza a URL informada pelo usuario.
 *
 * - recorta os espacos;
 * - remove a barra final (o `fetch` nao liga com ela, e a comparacao
 *   entre a URL gravada e a URL exibida fica mais simples).
 */
export function normalizeApiUrl(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

/**
 * true se a URL pode ser usada como fonte do catalogo.
 *
 * Aceita:
 *   - URL absoluta http(s): `https://api.exemplo.com`
 *   - caminho relativo (mesma origem): `/api` (proxy do Vite em dev,
 *     ou uma Function no MESMO dominio do app).
 */
export function isValidApiUrl(raw: string): boolean {
  const url = normalizeApiUrl(raw)
  if (!url) return false

  // Caminho relativo: mesma origem, sem restricao de CORS.
  if (url.startsWith('/')) return true

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Acrescenta o segmento `/channels` quando o caminho ainda nao aponta
 * para o endpoint de catalogo.
 *
 * A regra e: o caminho e usado como esta, EXETO quando ele esta vazio
 * (raiz do host) ou termina em um segmento de "base" (`v1`, `api`).
 */
function withChannelsSegment(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return CHANNELS_PATH

  const last = segments[segments.length - 1]
  if (!BASE_LIKE_SEGMENT.test(last)) return pathname.replace(/\/+$/, '')

  return `/${[...segments, CHANNELS_SEGMENT].join('/')}`
}

/**
 * Deriva o endpoint de catalogo a partir da URL base.
 *
 *   https://api.exemplo.com          -> https://api.exemplo.com/channels
 *   https://api.exemplo.com/v1       -> https://api.exemplo.com/v1/channels
 *   https://api.exemplo.com/channels -> https://api.exemplo.com/channels
 *   https://api.exemplo.com/tv       -> https://api.exemplo.com/tv
 *   /api                             -> /api/channels
 */
export function resolveChannelsUrl(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''

  // Raiz da propria origem.
  if (trimmed === '/') return CHANNELS_PATH

  const url = normalizeApiUrl(trimmed)
  if (!url) return ''

  // Caminho relativo (mesma origem).
  if (url.startsWith('/')) return withChannelsSegment(url)

  try {
    const parsed = new URL(url)
    parsed.pathname = withChannelsSegment(parsed.pathname)
    return normalizeApiUrl(parsed.toString())
  } catch {
    return url
  }
}

/**
 * Le a URL base guardada (o override do usuario).
 *
 * Devolve null se nao houver override ou se o valor gravado for
 * invalido (um override corrompido nao pode travar a app).
 */
export async function readApiUrl(): Promise<string | null> {
  const raw = await get<{ url?: unknown } | undefined>(NAMESPACE, undefined)
  if (!raw || typeof raw.url !== 'string') return null

  const url = normalizeApiUrl(raw.url)
  return isValidApiUrl(url) ? url : null
}

/**
 * Le o ENDPOINT a ser consultado (o override, ja com o `/channels`).
 */
export async function readApiEndpoint(): Promise<string | null> {
  const base = await readApiUrl()
  return base ? resolveChannelsUrl(base) : null
}

/**
 * Grava a URL base escolhida pelo usuario.
 *
 * Devolve false se a URL for invalida ou se o storage falhar (quota,
 * modo privado). O app segue funcionando - so sem persistir a escolha.
 */
export async function writeApiUrl(url: string): Promise<boolean> {
  const normalized = normalizeApiUrl(url)
  if (!isValidApiUrl(normalized)) return false
  return set(NAMESPACE, { url: normalized })
}

/** Remove o override (a app volta a usar a URL do build). */
export async function clearApiUrl(): Promise<void> {
  await remove(NAMESPACE)
}

/**
 * Escolhe a URL base que o app usa.
 *
 * O override do usuario vence; sem ele, vale a URL do build.
 */
export function pickApiUrl(override: string | null | undefined, buildUrl: string): string {
  const normalized = normalizeApiUrl(override ?? '')
  if (normalized && isValidApiUrl(normalized)) return normalized
  return normalizeApiUrl(buildUrl)
}
