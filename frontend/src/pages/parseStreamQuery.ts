/**
 * Extrai e valida o parametro `stream` da query string do player.
 *
 * Retorna a URL (string) se for http/https bem-formada, ou null caso
 * ausente, vazia ou com protocolo nao permitido.
 *
 * Separado do componente React para que a logica seja testavel sem DOM.
 */
export function parseStreamQuery(search: string): string | null {
  const params = new URLSearchParams(search)
  const raw = params.get('stream')
  if (!raw) return null

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  return parsed.toString()
}
