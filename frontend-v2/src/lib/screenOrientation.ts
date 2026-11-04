/**
 * Modo paisagem forcado para o app Android em celulares na vertical.
 *
 * ## Por que CSS e nao `screen.orientation.lock()`
 *
 * A WebView do Android NAO implementa a Screen Orientation API (o Chromium
 * removeu `screen.orientation.lock` do WebView; ela exigiria cooperacao do
 * app hospedeiro, ou seja, mexer no Kotlin). O unico caminho 100% frontend
 * e girar o layout: o `#app-frame` recebe a largura/altura trocadas e
 * `rotate(90deg)`, virando o container de rolagem.
 *
 * ## Quando
 *
 * Apenas no app (`WebTVBridge` ou UA `WebTV/x (Android)`) e apenas com a
 * janela em retrato. Em paisagem nada muda: a rotacao nativa do Android
 * ja entrega o viewport deitado.
 */

export interface OrientationEnv {
  userAgent: string
  width: number
  height: number
  hasBridge: boolean
}

/** O app Android e identificado pelo bridge ou pelo UA customizado. */
export function isWebTvApp(env: OrientationEnv): boolean {
  return env.hasBridge || /WebTV\/\d/i.test(env.userAgent)
}

/** App Android com a janela em retrato (celular/tablet na vertical). */
export function shouldForceLandscape(env: OrientationEnv): boolean {
  return (
    isWebTvApp(env) && /Android/i.test(env.userAgent) && env.height > env.width
  )
}

export function getAppFrame(): HTMLElement | null {
  return document.getElementById('app-frame')
}

export function isForcedLandscape(): boolean {
  return document.documentElement.classList.contains('webtv-force-landscape')
}

/** Rola o conteudo do app (a janela ou o frame girado) para o topo. */
export function scrollAppToTop(behavior: ScrollBehavior = 'smooth'): void {
  if (isForcedLandscape()) {
    getAppFrame()?.scrollTo({ top: 0, behavior })
  } else {
    window.scrollTo({ top: 0, behavior })
  }
}

function readEnv(): OrientationEnv {
  return {
    userAgent: navigator.userAgent,
    width: window.innerWidth,
    height: window.innerHeight,
    hasBridge: 'WebTVBridge' in window,
  }
}

function apply(): void {
  const html = document.documentElement
  const frame = getAppFrame()
  if (!frame) return

  if (!shouldForceLandscape(readEnv())) {
    html.classList.remove('webtv-force-landscape')
    html.style.removeProperty('--webtv-landscape-width')
    html.style.removeProperty('--webtv-landscape-height')
    return
  }

  /*
   * Dimensoes do CONTEUDO girado: a largura vira a altura da janela e
   * vice-versa. Sao pixels (e nao 100vh/100vw) porque o viewport da
   * WebView pode mudar ao recolher barras/abrir teclados.
   */
  html.style.setProperty('--webtv-landscape-width', `${window.innerHeight}px`)
  html.style.setProperty('--webtv-landscape-height', `${window.innerWidth}px`)
  html.classList.add('webtv-force-landscape')
}

/** Evita instalar os listeners duas vezes (StrictMode/HMR). */
let installed = false

/**
 * Instala o modo paisagem. Idempotente: chamadas extras nao duplicam
 * listeners.
 */
export function installScreenOrientation(): void {
  if (installed) return
  installed = true

  apply()

  const update = () => apply()
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)

  /*
   * O Android WebView as vezes atualiza `innerWidth/innerHeight` alguns
   * frames depois do resize. Reaplicar no proximo frame cobre o atraso.
   */
  window.requestAnimationFrame(update)
}
