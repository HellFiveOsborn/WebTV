/**
 * Fechamento de canal: o contrato dos eventos e as teclas de "Back".
 *
 * ## Por que um modulo separado
 *
 * O `useBridge.ts` depende do React - e por isso nao pode ser importado
 * num teste de Node. A regra de fechamento (quais eventos saem, em que
 * ordem e quantas vezes) fica aqui, num modulo puro, testavel.
 *
 * ## O contrato de fechamento
 *
 * O Kotlin le `channelId`/`channelName` no **nivel raiz** do payload
 * (`json.getString("channelId")`), entao o payload nao pode ter um nivel
 * a mais. Os tres eventos saem na ordem:
 *
 *   1. `channel:closing` - o app comeca a fechar. A `appBridge.js` do
 *      Kotlin usa este evento para a transicao de fade (a tela escurece
 *      antes de voltar para a grade).
 *   2. `player:closed` - o canal fechou. E o **unico** destes tres que
 *      o guard do Kotlin assina (`window.WebTV.events.on('player:closed',
 *      ...)`) - e o que faz o app voltar para a grade.
 *   3. `channel:close` - o fechamento foi confirmado. O guard do Kotlin
 *      nao assina este evento: ele e injetado pelo Kotlin na grade
 *      (`injectChannelCloseEvent`), depois que a grade recarrega.
 *
 * ## Por que o fechamento nao pode ser emitido duas vezes
 *
 * O `player:closed` faz o Kotlin navegar para a grade. Emitir o mesmo
 * evento duas vezes faz o app fechar, recarregar a grade e fechar de
 * novo. E o pior: o `setActive` do React (com updater) pode ser
 * executado mais de uma vez (StrictMode, render concorrente) - entao
 * emitir o evento de dentro do updater duplicaria o fechamento.
 *
 * Por isso o `useBridge.ts` le o canal ativo de um **ref** (espelho do
 * estado) e emite os eventos **fora** do updater.
 */

/** Payload dos eventos de fechamento (raiz: `channelId`/`channelName`). */
export interface ChannelClosePayload {
  /** Id do canal (a chave `${id}-${slug}` da v2). */
  channelId: string
  /** Nome do canal (vem do catalogo). */
  channelName: string
  /** Momento do fechamento. */
  timestamp: number
}

/**
 * Teclas que o controle remoto usa para "voltar".
 *
 * - `Escape` - ESC (e o "Back" do teclado).
 * - `Backspace` - D-pad antigo (paridade com a v1).
 * - `BrowserBack` - Chromium (e o `KEYCODE_BACK` do Android).
 * - `GoBack` - Android TV.
 *
 * A v1 tinha a mesma lista em `frontend/src/lib/shouldCloseOnKeyDown.ts`.
 */
export const BACK_KEYS: readonly string[] = [
  'Escape',
  'Backspace',
  'BrowserBack',
  'GoBack',
]

/** true quando a tecla e um "Back" (qualquer uma das `BACK_KEYS`). */
export function isBackKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && BACK_KEYS.includes(key)
}

/** Os eventos de fechamento, na ordem do contrato. */
export const CLOSE_EVENTS = [
  'channel:closing',
  'player:closed',
  'channel:close',
] as const

/** Tipo de um evento de fechamento. */
export type CloseEventType = (typeof CLOSE_EVENTS)[number]

/**
 * Monta o payload de fechamento.
 *
 * `channelId` e `channelName` vao no **nivel raiz**: e o que o
 * `WebTVBridge` do Kotlin le (`json.getString("channelId")`).
 */
export function buildClosePayload(
  channelId: string,
  channelName: string,
  now: number = Date.now(),
): ChannelClosePayload {
  return { channelId, channelName, timestamp: now }
}

/**
 * Emite os eventos de fechamento **uma vez**.
 *
 * @param emit Recebe o tipo do evento e o payload (raiz).
 * @param options.channelId Id do canal que esta sendo fechado.
 * @param options.channelName Nome do canal.
 * @param options.alreadyClosed true quando o fechamento ja foi emitido -
 *   nesse caso nada e emitido (fecha so uma vez).
 * @param options.now Momento do fechamento (parametro de teste).
 * @returns `true` quando emitiu; `false` quando ja estava fechado.
 */
export function emitCloseEvents(
  emit: (type: CloseEventType, payload: ChannelClosePayload) => void,
  options: {
    channelId: string
    channelName: string
    alreadyClosed?: boolean
    now?: number
  },
): boolean {
  if (options.alreadyClosed) return false

  const payload = buildClosePayload(
    options.channelId,
    options.channelName,
    options.now,
  )

  for (const type of CLOSE_EVENTS) emit(type, payload)
  return true
}
