import type { PlayErrorKind } from './classifyPlayError.js'

/**
 * Decide se o player deve iniciar em muted e mostrar overlay
 * "toque/clique para ativar som".
 *
 * Regra: somente quando o erro e autoplay-blocked E o video ainda nao
 * esta mutado. Caso contrario, fluxo normal (mostrar erro fatal ou seguir).
 */
export function shouldStartMutedAfterAutoplayBlock(
  kind: PlayErrorKind,
  alreadyMuted: boolean,
): boolean {
  return kind === 'autoplay-blocked' && !alreadyMuted
}
