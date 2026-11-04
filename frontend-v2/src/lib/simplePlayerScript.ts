/**
 * Script de injecao: player simples do EmbedDeCanais.
 *
 * ## O que ele faz
 *
 * Troca o player pesado do playerembcanais.com (Clappr + Hls.js + P2P) por
 * um `<video>` unico controlado por Hls.js, mantendo o contrato
 * `window.WebTV.player.*` (o app Kotlin depende dele).
 *
 * Nasceu do script da v1 (`frontend/docs/scripts/embedcanais-simple-player.js`)
 * e foi evoluido na v2: sem o selo "LIVE", sem os controles nativos do
 * `<video>` e com a faixa de informacoes do canal (nome, logo e hora)
 * aberta pelo OK do controle remoto. O arquivo esta **copiado** para o
 * bundle da v2 - nao e importado da v1, porque a v2 e publicada em
 * `/WebTV/v2/` e nao pode depender de um arquivo de fora do seu diretorio
 * de build.
 *
 * ## Por que a v2 precisa do seu proprio
 *
 * A v1 entrega esse script pelo **Gist** (`lib/scripts.ts`), indexado pelos
 * ids de canal da v1 (`1779525189328`, ...) e pelas URLs do Gist. A v2 usa
 * chaves de canal no formato `${id}-${slug}` (`1-amazonprimevideo`) e o
 * catalogo do embedcanais.online. Nenhum dos dois casamentos acontece:
 *
 * - o `channelIds` do Gist nao tem a chave da v2;
 * - as `urls` do Gist sao do catalogo antigo (4 URLs), nao dos 156 canais;
 * - o `domains` casa o dominio **exato**, e o player roda em subdominio
 *   rotativo (`2910.playerembcanais.com`) - `playerembcanais.com` nunca
 *   casa.
 *
 * Resultado: a v2 baixava o script do Gist e nunca o injetava. Aqui ele e
 * indexado pelo **canal da v2**, que e o caminho rotation-proof do Kotlin
 * (ver `lib/injectionScripts.ts`).
 *
 * ## O que ele descobre
 *
 * A URL do manifesto sai do proprio player, sem interceptar XHR:
 *
 *   1. `window.vipPlayer.options.source`
 *   2. `window.vipPlayer.core.getCurrentPlayback()._hls.url`
 *   3. `window.vipCdnHost` + o slug da URL
 *   4. `performance.getEntriesByType('resource')` (`/index.m3u8`)
 *   5. `?src=` da URL
 *   6. `<video>.currentSrc` / `.src`
 *   7. scripts inline com um `.m3u8`
 *
 * ## Por que nao depende do host
 *
 * O player roda em subdominio numerico rotativo (`2910.` -> `4477.`...).
 * O script nao hardcodeia host nenhum: ele age pelo `window.vipPlayer`,
 * pelo slug da URL e pelo DOM. Por isso o mesmo codigo funciona em
 * qualquer instancia.
 *
 * ## Restricoes do validador de scripts
 *
 * O admin (`/WebTV/own:scripts`) rejeita scripts com `eval()`,
 * `new Function()` ou chaves desbalanceadas. O arquivo original da v1 ja
 * cumpre isso (validado em `frontend/tests/embedcanais-simple.test.mjs`).
 *
 * O codigo e embutido no bundle via `?raw` - sem `eval`, sem
 * `new Function`, sem import dinamico.
 */

import SIMPLE_PLAYER_SOURCE from './embedcanais-simple-player.js?raw'

/** Id do script (usado pelo Kotlin na deduplicacao). */
export const SIMPLE_PLAYER_SCRIPT_ID = 'webtv-embedcanais-simple-player'

/** Nome legivel (aparece no log de injecao do app). */
export const SIMPLE_PLAYER_SCRIPT_NAME = 'WebTV - Player Simples (EmbedDeCanais)'

/**
 * Dominios estaveis onde o script se aplica.
 *
 * O Kotlin casa o dominio **exato** (`domainScripts[host]`), entao:
 *
 * - `embedcanaisdetv.xyz` - host do catalogo (estavel). E por ele que a
 *   v2 resolve o redirect e monta a URL do canal.
 * - `playerembcanais.com` - dominio **pai** do player. Vale como rede de
 *   seguranca caso o player seja servido no dominio raiz.
 *
 * O subdominio numerico (`2910.`, `4477.`...) **nao entra aqui**: ele
 * rotaciona e quebraria o casamento. Quem garante a injecao no host
 * rotativo e o indice por canal.
 */
export const SIMPLE_PLAYER_SCRIPT_DOMAINS = [
  'embedcanaisdetv.xyz',
  'playerembcanais.com',
]

/**
 * Dados do canal usados pela faixa de informacoes.
 *
 * A pagina do player so expoe o slug no `<title>`; nome e logo vem do
 * catalogo da v2 e viajam embutidos no codigo entregue ao Kotlin.
 */
export interface SimplePlayerChannelInfo {
  /**
   * Id/chave do canal (`${id}-${slug}`).
   *
   * E o mesmo id que o Kotlin guarda em `activeChannelId` - e o que o
   * `WebTVBridge.onPlayerClosed` exige no payload
   * (`json.getString("channelId")`). Sem ele, o "Back" na pagina do
   * canal nao conseguiria fechar o canal.
   */
  id?: string
  name?: string
  image?: string
}

/**
 * Codigo base do script de injecao.
 *
 * Vem do arquivo `.js` via `?raw` - o Vite embute o conteudo como string
 * no bundle (sem `eval`/`new Function`).
 */
export const SIMPLE_PLAYER_SCRIPT_CODE = SIMPLE_PLAYER_SOURCE

/**
 * Serializa os dados do canal sem deixar caracteres que quebrem parsers
 * antigos de WebView (`<`, `>`, U+2028, U+2029).
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Monta o codigo entregue ao Kotlin.
 *
 * O corpo do script e generico. Os dados do canal viajam num prefixo que
 * define `window.__webtv_channel_info` antes do IIFE montar a faixa.
 * Sem canal, o codigo e exatamente o arquivo base (o payload inicial do
 * `scripts:loaded`).
 */
function buildScriptCode(channel?: SimplePlayerChannelInfo): string {
  if (!channel) return SIMPLE_PLAYER_SCRIPT_CODE

  const id = String(channel.id ?? '').trim()
  const name = String(channel.name ?? '').trim()
  const image = String(channel.image ?? '').trim()
  if (!id && !name && !image) return SIMPLE_PLAYER_SCRIPT_CODE

  return (
    'window.__webtv_channel_info = ' +
    jsonForScript({ id, name, image }) +
    ';\n' +
    SIMPLE_PLAYER_SCRIPT_CODE
  )
}

/**
 * O script de player simples, pronto para o formato do bridge.
 *
 * ## Por que `channelIds` e `domains` sao separados
 *
 * O Kotlin indexa cada script em ate tres mapas:
 *
 * - `channelScripts[channelId]` - o que **garante** a injecao no host
 *   rotativo (nao depende de host nenhum);
 * - `domainScripts[host]` - casa o dominio **exato**;
 * - `urlScripts[url]` - casa a URL exata.
 *
 * Sao maps LRU de 50 entradas. Encher um deles com o mesmo script
 * varias vezes so desperdica espaco (e `storeDomainScript` **acrescenta**
 * a uma lista, sem deduplicar) - por isso o parametro `domains` pode
 * ser omitido, para indexar o script so pelo canal.
 *
 * @param options.channelIds Canais onde o script se aplica. E o campo
 *   que garante a injecao: o Kotlin injeta no documento principal,
 *   independente do host rotativo.
 * @param options.domains Dominios estaveis. Indexa o script por
 *   dominio (rede de seguranca).
 * @param options.channel Nome e logo do canal aberto. Vao embutidos no
 *   codigo para a faixa de informacoes.
 */
export function simplePlayerScript(options: {
  channelIds?: string[]
  domains?: string[]
  channel?: SimplePlayerChannelInfo
} = {}): {
  id: string
  name: string
  code: string
  domains?: string[]
  urls?: string[]
  channelIds?: string[]
} {
  const domains = options.domains ?? []
  const channelIds = options.channelIds ?? []

  return {
    id: SIMPLE_PLAYER_SCRIPT_ID,
    name: SIMPLE_PLAYER_SCRIPT_NAME,
    code: buildScriptCode(options.channel),
    // O Kotlin le com `optJSONArray`: ausente = nao indexa nessa dimensao.
    domains: domains.length > 0 ? [...domains] : undefined,
    urls: [],
    channelIds: channelIds.length > 0 ? [...channelIds] : undefined,
  }
}
