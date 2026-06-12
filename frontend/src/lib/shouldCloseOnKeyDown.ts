/**
 * Decide se uma tecla deve fechar o player modal (BACK / VOLTAR / ESC).
 *
 * - Escape (browser)          => true
 * - Backspace (D-pad antigo)  => true
 * - GoBack (Android TV remote)=> true
 * - BrowserBack (Chromium)    => true
 */
const CLOSE_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack'])

export function shouldCloseOnKeyDown(key: string | undefined): boolean {
  if (!key) return false
  return CLOSE_KEYS.has(key)
}
