/**
 * Decide se o useEffect de mudanca de rota (App.tsx) deve abrir popup
 * redirect e setar channelTransition, OU se deve apenas setar activeChannel
 * para que o PlayerModal cuide do iframe.
 *
 * Regra: so abre popup redirect se NAO ha iframe no canal.
 *   - so iframe  => false (PlayerModal cuida)
 *   - mixed       => false (PlayerModal cuida do iframe)
 *   - so redirect=> true
 *   - sem urls    => false
 *
 * Separado para ser testado sem DOM.
 */
export interface RedirectOnRouteContext {
  hasIframe: boolean
  hasRedirect: boolean
}

export function shouldOpenRedirectOnRoute(ctx: RedirectOnRouteContext): boolean {
  if (!ctx.hasRedirect) return false
  if (ctx.hasIframe) return false
  return true
}
