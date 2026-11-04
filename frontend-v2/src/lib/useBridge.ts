/**
 * Integracao da v2 com o app Kotlin (Events API).
 *
 * ## Fluxo de um canal
 *
 * 1. O usuario clica num card. O card e um `<a href>` - no app Android
 *    isso abre o canal (o Kotlin intercepta o popup e navega o WebView).
 * 2. A v2 emite `channel:clicked` com `{id, name, type}` NO NIVEL RAIZ
 *    do payload - e o que o `WebTVBridge.onChannelClicked` le
 *    (`json.getString("id")`).
 * 3. O Kotlin marca o canal como ativo e, como o tipo e `redirect`,
 *    arma a injecao de scripts (`setPendingScriptInjection`).
 * 4. A v2 emite `scripts:loaded` com o **script do banner VIP** indexado
 *    pelo canal que acabou de ser aberto. O Kotlin guarda esse indice.
 * 5. A pagina do canal carrega. No `onPageFinished` o Kotlin chama
 *    `injectChannelScripts(url)`, que injeta no **documento principal**
 *    o script indexado para o canal ativo (ou para o dominio da URL).
 * 6. O script roda na pagina do canal e remove o `#vipModal`.
 *
 * ## Por que o script vai no `scripts:loaded` (e nao no `scripts:preloaded`)
 *
 * O Kotlin tem dois caminhos de injecao:
 *
 * | Caminho | Evento | Onde injeta |
 * |---|---|---|
 * | `injectChannelScripts(url)` | `scripts:loaded` | documento principal |
 * | `injectPreloadedScripts()` | `scripts:preloaded` | `window.frames[0]` |
 *
 * O segundo chama o injetor com a URL **vazia**, e o injetor procura
 * `iframeUrl.includes('')` - sempre verdadeiro - caindo no primeiro
 * frame da pagina. No player isso e um iframe de anuncio
 * (cross-origin), nao o documento principal onde o `#vipModal` vive.
 *
 * Entao o script do banner vai pelo primeiro caminho.
 *
 * ## Por que reindexar a cada abertura
 *
 * `channelScripts` e um LRU de **50 entradas** no Kotlin. Indexar os
 * 156 canais de uma vez descartaria 106. Por isso o `scripts:loaded` e
 * reemitido a cada abertura de canal, indexado apenas para o canal
 * atual (alem do index por dominio, que cobre o host do player).
 *
 * ## Por que NAO emitimos `player:opened`
 *
 * `player:opened` faz o Kotlin injetar os scripts IMEDIATAMENTE
 * (`injectScriptsForChannel`). No fluxo `redirect` a pagina do canal
 * ainda nao carregou - a injecao cairia na pagina da v2, e o script
 * do player (`EmbedDeCanais Player Simples`) SUBSTITUI o documento
 * inteiro. A UI da v2 seria destruida.
 *
 * Como a v2 nao tem player embutido, `player:opened` nao e emitido: a
 * injecao acontece no `onPageFinished` do Kotlin, na pagina do canal.
 *
 * ## Por que os listeners recebem o PAYLOAD
 *
 * O guard do Kotlin faz `const channelId = event.id` e o `WebTVBridge`
 * le `json.getString("id")` no nivel raiz. Se o listener recebesse
 * `{type, payload, timestamp}`, o `id` estaria um nivel abaixo e o
 * Kotlin lancaria `JSONException`. Ver `lib/events.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { EmbedcanaisChannel } from './parseEmbedcanais.js'
import { emitWhenBridgeReady, eventBus } from './events.js'
import { ChannelType, channelKeyOf, channelTypeOf, playerUrlOf } from './channelSession.js'
import {
  InjectionScript,
  fetchScripts,
  scriptsForUrl,
  toBridgeScripts,
} from './scripts.js'
import { vipBannerScript, VIP_BANNER_SCRIPT_DOMAINS } from './injectionScripts.js'
import {
  simplePlayerScript,
  SIMPLE_PLAYER_SCRIPT_DOMAINS,
} from './simplePlayerScript.js'

/** Canal aberto no momento (null = nenhum). */
export interface ActiveChannel {
  channel: EmbedcanaisChannel
  /** Id usado nos eventos (unico por canal). */
  key: string
  type: ChannelType
  /** URL do canal. */
  url: string
}

/**
 * Estado da sessao de canal + integracao com o Kotlin.
 */
export function useBridgeIntegration({
  channels,
  categories,
  onOpen,
}: {
  /** Numero de canais (payload do `app:loaded`). */
  channels: number
  /** Numero de categorias (payload do `app:loaded`). */
  categories: number
  /** Callback do app (registra o uso, por exemplo). */
  onOpen?: (channel: EmbedcanaisChannel) => void
}) {
  const [active, setActive] = useState<ActiveChannel | null>(null)
  /** Scripts de injecao disponiveis (baixados do gist). */
  const scriptsRef = useRef<InjectionScript[]>([])
  /** Evitar `app:loaded` duplicado (o StrictMode monta duas vezes). */
  const appLoadedSentRef = useRef(false)
  /** Evitar `scripts:loaded` duplicado. */
  const scriptsSentRef = useRef(false)
  /**
   * Ultimo canal aberto.
   *
   * O gist pode resolver DEPOIS do clique no canal. Nesse caso o
   * `scripts:loaded` inicial precisa reindexar o canal aberto no fim do
   * payload; senao os 70 `channelIds` do gist enchem o LRU de 50 e
   * expulsam a chave do canal.
   */
  const openedChannelRef = useRef<{
    key: string
    name?: string
    image?: string
  } | null>(null)

  /* ------------------------------------------------------------------ *
   * 1) app:loaded
   *
   * Espera o app Kotlin assinar os eventos: o catalogo vem do cache
   * local e resolve antes do `onPageFinished` do Kotlin - sem a espera,
   * o `app:loaded` se perderia.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (channels === 0 || appLoadedSentRef.current) return
    appLoadedSentRef.current = true

    emitWhenBridgeReady('app:loaded', {
      channels,
      categories,
      timestamp: Date.now(),
    })
  }, [channels, categories])

  /* ------------------------------------------------------------------ *
   * 2) scripts:loaded - entrega os scripts ao Kotlin.
   *
   * O Kotlin indexa por canal/URL/dominio e injeta na pagina do canal.
   *
   * Vai no inicio (sem canal) e **de novo a cada abertura**: o
   * `channelScripts` do Kotlin e um LRU de 50, entao o indice precisa
   * ter o canal atual na mao. Ver `emitScriptsLoaded`.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (channels === 0 || scriptsSentRef.current) return
    scriptsSentRef.current = true
    let cancelled = false

    void fetchScripts().then(scripts => {
      if (cancelled) return
      scriptsRef.current = scripts

      // Se o usuario ja abriu um canal enquanto o gist baixava, reindexa
      // esse canal DEPOIS do gist. Sem isso, os 70 channelIds do gist
      // expulsam a chave do canal do LRU de 50.
      const opened = openedChannelRef.current
      if (opened) {
        emitScriptsLoaded(opened.key, { name: opened.name, image: opened.image })
      } else {
        emitScriptsLoaded()
      }
    })

    return () => {
      cancelled = true
    }
    // `emitScriptsLoaded` e estavel (so usa refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  /**
   * Entrega o indice de scripts ao Kotlin.
   *
   * ## Ordem importa
   *
   * O Kotlin le `scripts:loaded` e **acrescenta** cada script aos
   * maps (sem deduplicar). Se os scripts do gist forem enviados
   * depois, o `channelScripts` (LRU de 50) pode expulsar o script do
   * banner - e o banner nao seria injetado.
   *
   * Por isso o `scripts:loaded` com o script do banner vai **no
   * inicio** (antes do `channel:clicked`), e o do gist vai junto.
   *
   * ## O que indexa o banner
   *
   * O banner e indexado **so pelo canal** (`channelIds`), sem
   * dominios: assim ele ocupa uma unica entrada do LRU e nao compete
   * com os 70 `channelIds` do gist.
   *
   * ## O player simples
   *
   * O mesmo caminho do banner: indexado pelo **canal da v2**
   * (`${id}-${slug}`). O script do Gist que faria esse papel esta
   * indexado pelos ids da v1 (`1779525189328`) e pelas URLs do Gist -
   * nenhum casa com a v2, entao ele nunca era injetado. Ver
   * `lib/simplePlayerScript.ts`.
   *
   * ## O LRU de 50 do Kotlin
   *
   * O `channelScripts` do Kotlin e um LRU de 50 entradas, e `storeChannelScript`
   * **ACRESCENTA** a uma lista (sem deduplicar). Os 70 `channelIds` do gist
   * ocupam as 50 vagas e expulsam o canal da v2 - a nao ser que o canal
   * seja indexado **depois** deles.
   *
   * Por isso a ordem no payload e: **gist primeiro, scripts da v2 depois**.
   * Assim a entrada do canal da v2 e a ultima a ser inserida (a mais
   * recente), e sobrevive ao LRU.
   */
  const emitScriptsLoaded = useCallback((
    channelId?: string,
    channel?: { name?: string; image?: string },
  ) => {
    // 1) Os scripts do gist primeiro: eles enchem o LRU com as 50 vagas.
    const payload = toBridgeScripts(scriptsRef.current)

    // 2) Os scripts da v2 depois, indexados pelo canal aberto: ficam
    //    como as entradas mais recentes do LRU e nao sao expulsos.
    //
    //    Os DOIS precisam ir depois do gist: o `channelScripts` do
    //    Kotlin guarda uma LISTA por canal, entao o que importa e que
    //    a CHAVE do canal entre depois (e nao a posicao do script no
    //    payload). Se o canal fosse indexado antes, o gist (70
    //    channelIds) expulsaria a chave do LRU de 50 - e nem o banner
    //    nem o player simples seriam injetados.
    payload.push(
      vipBannerScript({
        channelIds: channelId ? [channelId] : undefined,
        domains: [...VIP_BANNER_SCRIPT_DOMAINS],
      }),
      simplePlayerScript({
        channelIds: channelId ? [channelId] : undefined,
        domains: [...SIMPLE_PLAYER_SCRIPT_DOMAINS],
        // Nome/logo do catalogo da v2: a pagina do player so tem o slug.
        channel,
      }),
    )

    eventBus.emit('scripts:loaded', { scripts: payload })
  }, [])

  /* ------------------------------------------------------------------ *
   * 3) Fecha o canal.
   *
   * Chamado pela UI (`closeChannel`) ou por `window.WebTV.channel.close()`
   * (que e o que o Kotlin e o site carregado no WebView chamam).
   * ------------------------------------------------------------------ */
  const closeChannel = useCallback(() => {
    setActive(current => {
      if (!current) return null

      eventBus.emit('channel:closing', {})
      eventBus.emit('player:closed', {
        channelId: current.key,
        channelName: current.channel.name,
      })
      eventBus.emit('channel:close', {
        channelId: current.key,
        channelName: current.channel.name,
        timestamp: Date.now(),
      })

      const api = window.WebTV?.channel
      if (api) {
        api.activeId = null
        api.activeName = null
      }

      return null
    })
  }, [])

  /* ------------------------------------------------------------------ *
   * 4) window.WebTV.channel.close()
   *
   * O Kotlin injeta esta chamada quando o usuario volta do canal
   * (`onBackPressed`): o Kotlin chama `window.WebTV.channel.close()`
   * OU `WebTVBridge.onPlayerClosed` - os dois caminhos precisam que a
   * v2 libere o estado do canal.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    window.WebTV = window.WebTV ?? ({} as Window['WebTV'])
    const api = window.WebTV!
    api.channel = {
      activeId: null,
      activeName: null,
      close: closeChannel,
    }

    return () => {
      const channelApi = window.WebTV?.channel
      if (channelApi) channelApi.close = () => {}
    }
  }, [closeChannel])

  /* ------------------------------------------------------------------ *
   * 5) O Kotlin avisou que o player fechou.
   *
   * O evento chega injetado na pagina (`window.WebTV.events.emit`),
   * com o payload no nivel raiz.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const onClosed = (payload: { channelId?: string }) => {
      setActive(current => {
        if (!current) return null
        // O Kotlin pode fechar um canal que nao e o ativo: so limpa se
        // for o mesmo (ou se nao veio id nenhum).
        const channelId = payload?.channelId
        if (channelId && channelId !== current.key) return current

        const api = window.WebTV?.channel
        if (api) {
          api.activeId = null
          api.activeName = null
        }
        return null
      })
    }

    const offPlayer = eventBus.on('player:closed', onClosed)
    const offChannel = eventBus.on('channel:close', onClosed)
    return () => {
      offPlayer()
      offChannel()
    }
  }, [])

  /* ------------------------------------------------------------------ *
   * 6) Abre um canal.
   * ------------------------------------------------------------------ */
  const openChannel = useCallback(
    (channel: EmbedcanaisChannel) => {
      const type = channelTypeOf(channel)
      const url = playerUrlOf(channel)
      const key = channelKeyOf(channel)

      // Guarda o canal para o caso de o gist resolver depois deste clique.
      openedChannelRef.current = {
        key,
        name: channel.name,
        image: channel.image,
      }

      // 1) `scripts:loaded` - indexa o script do banner para o canal
      //    que esta sendo aberto.
      //
      //    Precisa vir ANTES do `channel:clicked`: o Kotlin so
      //    injeta scripts quando tem um `activeChannelId`, e o indice
      //    precisa estar pronto antes da pagina do canal carregar.
      //
      //    O `channelScripts` do Kotlin e um LRU de 50: reindexar a
      //    cada abertura mantem o canal atual na mao. Nome e logo vao
      //    embutidos no script do player (faixa de informacoes).
      emitScriptsLoaded(key, { name: channel.name, image: channel.image })

      // 2) `channel:clicked` - o Kotlin registra o canal ativo e, para
      //    redirect/mixed, arma a injecao de scripts.
      //
      //    O payload tem `id`/`name`/`type` NO NIVEL RAIZ: e o que o
      //    `WebTVBridge.onChannelClicked` le (`json.getString("id")`).
      eventBus.emit('channel:clicked', {
        id: key,
        name: channel.name,
        type,
      })

      onOpen?.(channel)

      // Publica o canal ativo para `window.WebTV.channel.close()`.
      const api = window.WebTV?.channel
      if (api) {
        api.activeId = key
        api.activeName = channel.name
      }

      // Avisa quais scripts valem para a URL do canal. O Kotlin guarda
      // esse payload e injeta junto com os scripts indexados, quando a
      // pagina do canal termina de carregar.
      preloadScripts(url)

      setActive({ channel, key, type, url })
    },
    // `preloadScripts` e `emitScriptsLoaded` sao estaveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpen],
  )

  /**
   * Avisa o Kotlin quais scripts valem para a URL do canal.
   *
   * O Kotlin guarda esse payload (`cachePreloadedScriptsForUrl`) e
   * injeta junto com os scripts indexados, quando a pagina do canal
   * termina de carregar.
   *
   * ## Atencao: este caminho nao serve para o banner
   *
   * O `injectPreloadedScripts` chama o injetor com a URL **vazia**, e
   * o injetor procura `iframeUrl.includes('')` - sempre verdadeiro -
   * caindo no primeiro frame da pagina. No player isso e um iframe de
   * anuncio (cross-origin), nao o documento principal onde o
   * `#vipModal` vive.
   *
   * O banner e injection garantido pelo `scripts:loaded` (canal).
   * Aqui mandamos os scripts do gist, que casam por URL/dominio.
   */
  const preloadScripts = useCallback((url: string) => {
    const matching = scriptsForUrl(scriptsRef.current, url)
    if (matching.length === 0) return

    eventBus.emit('scripts:preloaded', {
      url,
      scripts: toBridgeScripts(matching),
    })
  }, [])

  /* ------------------------------------------------------------------ *
   * 7) `navigated:home`
   *
   * O Kotlin reseta o estado de injecao quando a pagina volta para a
   * home. A v2 sinaliza isso ao trocar de categoria ou ao voltar para
   * o inicio.
   * ------------------------------------------------------------------ */
  const notifyNavigatedHome = useCallback(() => {
    eventBus.emit('navigated:home', { timestamp: Date.now() })
  }, [])

  return { active, openChannel, closeChannel, notifyNavigatedHome }
}
