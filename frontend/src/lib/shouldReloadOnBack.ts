/**
 * Decide se MainActivity.onBackPressed deve fazer loadUrl(START_URL)
 * (reload da WebView) ou apenas injetar onPlayerClosed no WebView
 * para que o React processe o fechamento limpo.
 *
 * - activeChannel + URL da grade => FALSE (so injeta onPlayerClosed)
 *   (PlayerModal reage ao eventBus, faz navigate('/'), sem reload)
 * - activeChannel + URL externa => TRUE (reload para voltar a grade)
 *   (canal redirect: webview esta na URL do canal, reload e necessario)
 * - sem canal + URL da grade => FALSE (mostra dialog de fechar)
 * - sem canal + URL externa => TRUE (volta para grade)
 *
 * Espelha a logica em kotlin-app MainActivity.onBackPressed.
 */
export interface ReloadOnBackContext {
  hasActiveChannel: boolean
  currentPageStartsWithStartUrl: boolean
}

export function shouldReloadOnBack(ctx: ReloadOnBackContext): boolean {
  if (ctx.hasActiveChannel) {
    return !ctx.currentPageStartsWithStartUrl
  }
  return !ctx.currentPageStartsWithStartUrl
}
