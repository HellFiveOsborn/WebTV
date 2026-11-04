/**
 * Barramento de eventos do WebTV (Events API).
 *
 * Contrato com o app Kotlin (Android TV):
 *
 *   **JS -> Kotlin**: o Kotlin injeta `window.WebTVBridge` (via
 *   `addJavascriptInterface`) e se inscreve em `window.WebTV.events`.
 *   Cada evento emitido aqui chega no Kotlin como
 *   `WebTVBridge.onXxx(JSON.stringify(payload))`.
 *
 *   **Kotlin -> JS**: o Kotlin avalia `window.WebTV.events.emit(tipo, payload)`
 *   na pagina. Isso e lido aqui.
 *
 * ## Duas ordens de carregamento (e as duas funcionam)
 *
 * O Kotlin injeta a `appBridge.js` no `onPageFinished` - que acontece
 * DEPOIS do modulo da v2 rodar (o `<script type="module">` do bundle
 * executa antes do `load`). Entao, na pratica, a v2 chega primeiro:
 *
 *   **Ordem A (a real): a v2 primeiro.**
 *   A v2 instala o bus e liga `__webtvAppBridgeInjected`. A
 *   `appBridge.js` do Kotlin ve o flag e sai cedo (`if
 *   (window.__webtvAppBridgeInjected) return;`) - o bus da v2 fica.
 *   O guard do Kotlin assina no bus da v2 e recebe o payload direto.
 *
 *   **Ordem B (defensiva): o Kotlin primeiro.**
 *   O bus da `appBridge.js` ja existe. A v2 PRESERVA esse bus (nao pode
 *   sobrescrever: o Kotlin ja registrou os listeners nele) e envolve o
 *   `emit` dele, para que os eventos injetados pelo Kotlin tambem
 *   cheguem na v2.
 *
 * Nos dois casos o Kotlin recebe o PAYLOAD no nivel raiz - ver a nota
 * abaixo.
 *
 * ## O listener recebe o PAYLOAD (nao o evento inteiro)
 *
 * O guard do Kotlin faz:
 *
 * ```js
 * window.WebTV.events.on('channel:clicked', (event) => {
 *     const channelId = event.id;                 // <- payload-level
 *     WebTVBridge.onChannelClicked(JSON.stringify(event));
 * });
 * ```
 *
 * E o `WebTVBridge` le `json.getString("id")` no NIVEL RAIZ do JSON.
 * Se o listener recebesse `{type, payload, timestamp}`, o `id` estaria
 * dentro de `payload` e o Kotlin lancaria `JSONException` (e o
 * `channelId` do cache de deduplicacao seria `undefined`).
 *
 * O mesmo vale para o caminho inverso: a `appBridge.js` encaminha o
 * `webtv:event` para `emit(tipo, e.detail.payload)` - ou seja, o
 * Kotlin sempre ve o payload cru.
 *
 * O modulo nao importa NADA de proposito: assim compila isolado para os
 * testes em Node (tests/events.test.mjs).
 */

/** Payload de cada evento. */
export interface EventPayloads {
  'app:loaded': { channels: number; categories: number; timestamp: number }
  'app:reloaded': { reason: 'manual' }
  'channel:clicked': {
    id: string
    name: string
    type: 'iframe' | 'redirect' | 'mixed'
    channels?: unknown[]
  }
  'channel:closing': {
    channelId?: string
    channelName?: string
    timestamp?: number
  }
  'channel:close': { channelId: string; channelName: string; timestamp: number }
  'player:opened': { channelId: string; channelName: string; url: string }
  'player:closed': { channelId: string; channelName: string }
  'player:backupSelected': { channelId: string; index: number; url: string }
  'search:changed': { query: string }
  'category:changed': { categoryId: string | null; categoryName: string }
  'focus:changed': {
    elementId: string | null
    elementType: string
    coordinates: { x: number; y: number; width: number; height: number }
  }
  'scroll:moved': { x: number; y: number; element: 'window' | string }
  'navigated:home': { timestamp: number }
  'script:retrieved': { url: number | string; count: number; scripts: unknown[] }
  'scripts:preloaded': { url: string; scripts: unknown[] }
  'scripts:loaded': { scripts: unknown[] }
}

export type EventType = keyof EventPayloads

/** Um evento emitido (com o payload ja separado). */
export interface WebTVEvent<T = unknown> {
  type: string
  payload: T
  timestamp: number
}

/** O listener recebe o PAYLOAD (ver a nota do topo do arquivo). */
type Listener<T = unknown> = (payload: T) => void

/** Historico maximo de eventos guardados. */
const MAX_HISTORY = 100

/** Metodos do bridge Kotlin expostos em `window.WebTVBridge`. */
interface KotlinBridge {
  onAppLoaded?(payload: string): void
  onAppReloaded?(payload: string): void
  onChannelClicked?(payload: string): void
  onPlayerOpened?(payload: string): void
  onPlayerClosed?(payload: string): void
  onPlayerError?(payload: string): void
  onChannelClosed?(payload: string): void
  onScriptsPreloaded?(payload: string): void
  onScriptsLoaded?(payload: string): void
  onScriptRetrieved?(payload: string): void
  onSearchChanged?(payload: string): void
  onCategoryChanged?(payload: string): void
  onFocusChanged?(payload: string): void
  onNavigatedHome?(payload: string): void
  onListenersReady?(): void
}

declare global {
  interface Window {
    WebTV?: {
      events: EventBus
      channel?: {
        activeId: string | null
        activeName: string | null
        close: () => void
      }
    }
    WebTVBridge?: KotlinBridge
    /** O Kotlin liga este flag depois de assinar os eventos. */
    __webtvListenersActive?: boolean
    /** A `appBridge.js` do Kotlin sai cedo se este flag estiver ligado. */
    __webtvAppBridgeInjected?: boolean
  }
}

/**
 * Casos em que o nome do metodo do Kotlin NAO segue a regra automatica.
 *
 * O Kotlin expoe `onChannelClosed` (com "d"), mas o evento se chama
 * `channel:close` (sem "d"). A regra abaixo geraria `onChannelClose` -
 * que nao existe no bridge.
 */
const BRIDGE_METHOD_OVERRIDES: Record<string, string> = {
  'channel:close': 'onChannelClosed',
  'player:error': 'onPlayerError',
}

/**
 * Converte o nome do evento no metodo correspondente do bridge Kotlin.
 *
 * Ex.: `channel:clicked` -> `onChannelClicked`.
 */
export function bridgeMethodFor(type: string): string {
  const override = BRIDGE_METHOD_OVERRIDES[type]
  if (override) return override

  const camel = type
    .split(':')
    .map(part =>
      part
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(''),
    )
    .join('')
  return `on${camel}`
}

/**
 * Barramento de eventos.
 *
 * `emit` notifica os listeners locais (com o PAYLOAD) e dispara o
 * `webtv:event` (CustomEvent) - que e o canal que o Kotlin escuta.
 *
 * O `emit` NAO chama o `WebTVBridge` diretamente: quem encaminha para o
 * Kotlin e o guard que o proprio Kotlin instala
 * (`injectEventListenerGuard`). Se o `emit` chamasse o bridge, os
 * eventos injetados pelo Kotlin voltariam como `player:closed` ->
 * `onPlayerClosed` -> re-emissao -> laco.
 */
export class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>()
  private history: WebTVEvent[] = []
  /**
   * Profundidade de aninhamento do `emit`.
   *
   * Serve para nao entregar o mesmo evento duas vezes quando o bus da
   * `appBridge.js` (do Kotlin) esta no meio do caminho: o `emit` da v2
   * dispara o `webtv:event`, a `appBridge.js` encaminha para o `emit`
   * dela, e o wrapper devolveria o evento para a v2 de novo.
   */
  private depth = 0

  /**
   * Emite um evento.
   *
   * O `payload` vai inteiro para o Kotlin: o `WebTVBridge` le os campos
   * que precisa (`id`, `name`, `type`, `channelId`, ...).
   */
  emit<T extends EventType>(type: T, payload: EventPayloads[T]): void {
    this.depth++
    try {
      this.record(type, payload)
      this.deliver(type, payload)
      this.dispatch(type, payload)
    } finally {
      this.depth--
    }
  }

  /**
   * Registra o evento no historico.
   *
   * O historico e o espelho de TODOS os eventos que passaram pelo bus -
   * inclusive os injetados pelo Kotlin (que chegam pelo wrapper do
   * `emit` da `appBridge.js`).
   */
  record(type: string, payload: unknown): void {
    this.history.push({ type, payload, timestamp: Date.now() })
    if (this.history.length > MAX_HISTORY) this.history.shift()
  }

  /**
   * true enquanto um `emit` deste bus esta em andamento.
   *
   * O wrapper do `emit` da `appBridge.js` (do Kotlin) usa isto para nao
   * entregar o mesmo evento duas vezes: quando a v2 emite, o
   * `webtv:event` dispara, a `appBridge.js` encaminha para o `emit`
   * dela, e o wrapper voltaria a entregar aqui.
   */
  get isEmitting(): boolean {
    return this.depth > 0
  }

  /**
   * Entrega o payload aos listeners locais.
   *
   * Publico porque o wrapper do `emit` da `appBridge.js` precisa
   * entregar aqui os eventos que o Kotlin injeta na pagina.
   */
  deliver(type: string, payload: unknown): void {
    const listeners = this.listeners.get(type)
    if (!listeners) return

    listeners.forEach(listener => {
      try {
        listener(payload)
      } catch (error) {
        console.error(`[WebTV Event] Erro no listener de ${type}:`, error)
      }
    })
  }

  /**
   * Registra um listener. Devolve a funcao de cancelamento.
   *
   * O callback recebe o PAYLOAD do evento.
   */
  on<T extends EventType>(type: T, listener: Listener<EventPayloads[T]>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
    return () => this.off(type, listener)
  }

  /** Remove um listener. */
  off<T extends EventType>(type: T, listener: Listener<EventPayloads[T]>): void {
    const listeners = this.listeners.get(type)
    if (listeners) listeners.delete(listener)
  }

  /** true se ha listeners para o tipo. */
  hasListeners(type: string): boolean {
    const listeners = this.listeners.get(type)
    return Boolean(listeners && listeners.size > 0)
  }

  /** Historico dos eventos (ultimos 100). */
  getHistory(filter?: EventType | EventType[]): WebTVEvent[] {
    if (!filter) return [...this.history]
    const types = Array.isArray(filter) ? filter : [filter]
    return this.history.filter(e => types.includes(e.type as EventType))
  }

  /** Limpa o historico. */
  clearHistory(): void {
    this.history = []
  }

  /**
   * Entrega o evento a pagina: `CustomEvent('webtv:event')` e
   * `postMessage`.
   *
   * E por aqui que os eventos INJETADOS pelo Kotlin chegam de volta:
   * a `appBridge.js` escuta o `webtv:event` e encaminha
   * `e.detail.payload` para o `emit` dela (e assim para o guard do
   * Kotlin, que le o payload no nivel raiz).
   */
  private dispatch(type: string, payload: unknown): void {
    if (typeof window === 'undefined') return

    const event = { type, payload, timestamp: Date.now() }

    try {
      window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }))
    } catch (error) {
      console.error('[WebTV Event] Falha ao despachar webtv:event:', error)
    }
    try {
      window.postMessage({ source: 'webtv', event }, '*')
    } catch {
      /* postMessage e best-effort */
    }
  }
}

/** Instancia unica do barramento. */
export const eventBus = new EventBus()

/**
 * Publica o barramento em `window.WebTV.events` e marca o app bridge.
 *
 * O Kotlin depende de `window.WebTV.events` existir para assinar os
 * eventos - e do flag `__webtvAppBridgeInjected` para comecar a assinar.
 *
 * Se o Kotlin ja tiver injetado o proprio bus (appBridge.js), este
 * metodo PRESERVA o existente (nao pode sobrescrever: o Kotlin ja
 * registrou os listeners nele) e envolve o `emit` dele, para que os
 * eventos injetados pelo Kotlin tambem cheguem na v2.
 */
export function installEventBus(): void {
  if (typeof window === 'undefined') return

  const existing = window.WebTV?.events as unknown as EventBus | undefined

  const api: NonNullable<Window['WebTV']> = window.WebTV ?? { events: eventBus }

  if (existing && typeof (existing as EventBus).on === 'function') {
    // --- Ordem B: o bus do Kotlin (appBridge.js) ja esta instalado ---
    api.events = existing

    // Envolve o `emit` dele: os eventos que o Kotlin injeta na pagina
    // (`window.WebTV.events.emit('player:closed', payload)`) passam a
    // chegar tambem no bus da v2.
    const bus = existing as unknown as {
      emit: (type: string, payload: unknown) => void
    }
    const originalEmit = bus.emit.bind(bus)

    bus.emit = (type: string, payload: unknown) => {
      originalEmit(type, payload)
      // Se o evento veio do proprio bus da v2 (o `webtv:event` disparou
      // e a `appBridge.js` encaminhou para ca), ele ja foi entregue -
      // nao entrega de novo.
      if (!eventBus.isEmitting) {
        eventBus.record(type, payload)
        eventBus.deliver(type, payload)
      }
    }
  } else {
    // --- Ordem A (a real): a v2 instala o bus ---
    api.events = eventBus
  }

  window.WebTV = api

  // O guard do Kotlin so assina os eventos com este flag ligado - e a
  // `appBridge.js` do Kotlin sai cedo com ele (nao sobrescreve o bus).
  window.__webtvAppBridgeInjected = true
}

/**
 * Chama um metodo do bridge Kotlin diretamente.
 *
 * Use apenas quando o evento PRECISA chegar ao Kotlin com certeza
 * (por exemplo, quando o guard dele ainda nao assinou o evento).
 *
 * CUIDADO com laco: nao chame `notifyBridge('player:closed')` a partir
 * de um listener de `player:closed` - o Kotlin re-emite o evento.
 */
export function notifyBridge(type: string, payload: unknown): boolean {
  const bridge = window.WebTVBridge
  if (!bridge) return false

  const method = bridgeMethodFor(type)
  const fn = (bridge as unknown as Record<string, unknown>)[method]
  if (typeof fn !== 'function') return false

  const call = fn as (payload: string) => void
  try {
    call.call(bridge, JSON.stringify(payload))
    return true
  } catch (error) {
    console.error(`[WebTV Event] Falha ao chamar ${method}:`, error)
    return false
  }
}

/**
 * true quando o app Kotlin ja assinou os eventos.
 *
 * O Kotlin liga `window.__webtvListenersActive` no script que ele
 * injeta (`injectEventListenerGuard`), DEPOIS de assinar todos os
 * eventos. Ate la, qualquer evento emitido pela v2 se perde.
 */
export function isBridgeReady(): boolean {
  if (typeof window === 'undefined') return false
  return window.__webtvListenersActive === true
}

/** Quanto tempo esperar pelo app Kotlin ficar pronto. */
const BRIDGE_READY_TIMEOUT_MS = 15000

/** Intervalo da checagem de prontidao. */
const BRIDGE_READY_POLL_MS = 150

/**
 * Emite um evento assim que o app Kotlin estiver pronto.
 *
 * ## Por que isso e necessario
 *
 * O Kotlin assina os eventos no `onPageFinished` e so entao liga o
 * flag `__webtvListenersActive`. A v2 pode emitir `app:loaded` (ou
 * `scripts:loaded`) ANTES disso - o catalogo vem do cache local e
 * resolve em milissegundos. Nesse caso o Kotlin perderia o evento.
 *
 * A solucao espelha o proprio `tryInstall` do Kotlin: a v2 espera o
 * flag e so entao emite.
 *
 * Se o Kotlin nao estiver presente (a v2 no navegador), o evento e
 * emitido assim mesmo - o site web funciona sem o app.
 */
export function emitWhenBridgeReady<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
): void {
  if (typeof window === 'undefined') {
    eventBus.emit(type, payload)
    return
  }

  // Ja esta pronto (ou nao ha app Kotlin): emite na hora.
  if (isBridgeReady() || !window.WebTVBridge) {
    eventBus.emit(type, payload)
    return
  }

  const startedAt = Date.now()
  const timer = setInterval(() => {
    const ready = isBridgeReady()
    const timeout = Date.now() - startedAt > BRIDGE_READY_TIMEOUT_MS

    if (!ready && !timeout) return

    clearInterval(timer)
    // Timeout: emite mesmo assim (o historico da v2 fica completo, e o
    // Kotlin, se aparecer depois, recebe os proximos eventos).
    eventBus.emit(type, payload)
  }, BRIDGE_READY_POLL_MS)
}
