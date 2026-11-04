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
 * 4. A v2 emite `scripts:preloaded` com os scripts que valem para a URL
 *    do canal. O Kotlin guarda esse payload.
 * 5. A pagina do canal carrega. O Kotlin injeta os scripts (pelo
 *    indice por dominio/URL, construido do `scripts:loaded`, e pelo
 *    payload preloaded) - no lugar certo: a pagina do canal.
 *
 * ## Por que NAO emitimos `player:opened`
 *
 * `player:opened` faz o Kotlin injetar os scripts IMEDIATAMENTE
 * (`injectScriptsForChannel`). No fluxo `redirect` a pagina do canal
 * ainda nao carregou - a injetacao cairia na pagina da v2, e o script
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
   * 2) scripts:loaded - entrega os scripts ao Kotlin (ele indexa por
   *    canal/URL/dominio e injeta na pagina do canal).
   *
   * Vai uma vez, no inicio - o Kotlin mantem o indice ate a pagina
   * voltar para a home.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (channels === 0 || scriptsSentRef.current) return
    scriptsSentRef.current = true
    let cancelled = false

    void fetchScripts().then(scripts => {
      if (cancelled || scripts.length === 0) return
      scriptsRef.current = scripts

      emitWhenBridgeReady('scripts:loaded', { scripts: toBridgeScripts(scripts) })
    })

    return () => {
      cancelled = true
    }
  }, [channels])

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

      // `channel:clicked` - o Kotlin registra o canal ativo e, para
      // redirect/mixed, arma a injecao de scripts.
      //
      // O payload tem `id`/`name`/`type` NO NIVEL RAIZ: e o que o
      // `WebTVBridge.onChannelClicked` le (`json.getString("id")`).
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
      // esse payload e injeta quando a pagina do canal carrega.
      preloadScripts(url)

      setActive({ channel, key, type, url })
    },
    // `preloadScripts` e estavel (sem dependencias).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpen],
  )

  /**
   * Avisa o Kotlin quais scripts valem para a URL do canal.
   *
   * O Kotlin guarda esse payload (`cachePreloadedScriptsForUrl`) e
   * injeta junto com os scripts indexados, quando a pagina do canal
   * termina de carregar.
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
