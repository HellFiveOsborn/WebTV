/**
 * Container dos overlays (busca, modais) que vivem fora do `.app`.
 *
 * Fica DENTRO do `#app-frame` (ver `screenOrientation.ts`): `position:
 * fixed` dentro de um ancestral com `transform` usa esse ancestral como
 * containing block - e o que mantem a busca/modal alinhados a tela
 * quando o app Android gira o catalogo para paisagem.
 */
let cached: HTMLElement | null = null

export function getOverlayRoot(): HTMLElement {
  if (cached?.isConnected) return cached

  cached = document.getElementById('overlay-root')
  if (!cached) {
    // Fallback para testes/HMR: cria o container no frame (ou no body).
    cached = document.createElement('div')
    cached.id = 'overlay-root'
    const frame = document.getElementById('app-frame') ?? document.body
    frame.appendChild(cached)
  }

  return cached
}
