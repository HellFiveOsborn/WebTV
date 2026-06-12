/**
 * Classifica erros de HTMLMediaElement.play() / Hls.js.
 *
 * - 'autoplay-blocked': o browser bloqueou play() sem interacao do usuario
 *   (Autoplay Policy). Nao e erro fatal: o usuario pode destravar com OK/Enter.
 * - 'fatal': qualquer outro erro (rede, codec, manifest invalido, etc).
 *
 * Separado para ser testado sem DOM.
 */
export type PlayErrorKind = 'autoplay-blocked' | 'fatal'

export function classifyPlayError(err: unknown): PlayErrorKind {
  if (err && typeof err === 'object' && 'name' in err) {
    if ((err as { name?: string }).name === 'NotAllowedError') {
      return 'autoplay-blocked'
    }
  }
  return 'fatal'
}
