/**
 * Sessao de canal: abre e fecha um canal, mantendo o app Kotlin
 * sincronizado.
 *
 * O catalogo da v2 tem, por canal, uma URL "redirect" (`href`) e uma tag
 * `<iframe>` pronta. Isso determina o TIPO do canal, que o Kotlin usa
 * para decidir o que fazer:
 *
 *   - `redirect` -> o WebView navega para a URL externa do canal. E o
 *                   que a v2 faz: o card e um link (`<a href>`), e o
 *                   Kotlin intercepta o popup e navega o WebView
 *                   principal. Como o tipo e `redirect`, o Kotlin arma
 *                   a injecao de scripts (`setPendingScriptInjection`)
 *                   e injeta na pagina que carregar.
 *   - `iframe`   -> o player abriria DENTRO do app (modal). A v2 nao
 *                   usa esse modo, mas o tipo continua valido para
 *                   quem quiser.
 *   - `mixed`    -> os dois.
 *
 * O catalogo do embedcanais tem os dois campos para TODOS os canais, e
 * apontam para a mesma URL (`.../index.php?canal=<slug>`). Como a v2
 * navega o WebView (nao abre player embutido), o tipo e `redirect`.
 */

import { EmbedcanaisChannel } from './parseEmbedcanais.js'

/** Tipo de canal, no vocabulario do app Kotlin. */
export type ChannelType = 'iframe' | 'redirect' | 'mixed'

/**
 * Extrai a URL do `src` de uma tag `<iframe>`.
 *
 * O catalogo traz a tag pronta (ex.:
 * `<iframe src="https://.../index.php?canal=globo" ...>`), entao o
 * `src` e lido do texto - sem `DOMParser` (funciona em Node e no
 * browser).
 */
export function iframeSrc(iframe: string): string {
  if (!iframe) return ''
  const match = iframe.match(/\bsrc\s*=\s*["']([^"']+)["']/i)
  return match ? match[1] : ''
}

/**
 * Descobre o tipo do canal a partir do catalogo.
 *
 * Com `href` -> `redirect` (o WebView navega para a pagina do canal).
 * Sem `href`, mas com iframe -> `iframe`.
 * Sem nenhum dos dois -> `redirect` (o app ainda tenta abrir).
 */
export function channelTypeOf(channel: EmbedcanaisChannel): ChannelType {
  if (channel.href) return 'redirect'
  if (iframeSrc(channel.iframe)) return 'iframe'
  return 'redirect'
}

/**
 * URL do canal - a que o WebView navega e a que os scripts casam.
 *
 * A `href` do catalogo e a pagina do canal (o mesmo endereco que o
 * `<iframe>` do catalogo aponta, com barra final).
 */
export function playerUrlOf(channel: EmbedcanaisChannel): string {
  return channel.href || iframeSrc(channel.iframe) || ''
}

/**
 * Identificador do canal.
 *
 * O Kotlin trata o id como `String` (`json.getString("id")`), e o
 * catalogo usa id numerico. O slug e mais legivel, e o id numerico
 * entra na chave porque o slug `tnt` aparece em duas categorias.
 */
export function channelKeyOf(channel: EmbedcanaisChannel): string {
  return `${channel.id}-${channel.slug}`
}
