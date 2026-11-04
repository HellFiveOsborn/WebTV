/**
 * Hooks publicos do motor de D-pad.
 *
 * Ficam num arquivo separado do `DpadContext.tsx` porque o ESLint
 * (`react-refresh/only-export-components`) exige que um arquivo de
 * componente exporte apenas componentes: exportar hooks junto faria o
 * Fast Refresh invalidar o modulo a cada alteracao.
 */

import { useCallback, useContext, useRef } from 'react'
import { DpadContext, DpadContextValue } from './DpadContext'
import { DpadAxes, DpadGroup, DpadGroupId } from './DpadContext'

/**
 * Acesso ao contexto de D-pad.
 *
 * @throws se usado fora de `<DpadProvider>`.
 */
export function useDpad(): DpadContextValue {
  const ctx = useContext(DpadContext)
  if (!ctx) throw new Error('useDpad precisa estar dentro de <DpadProvider>')
  return ctx
}

/**
 * Registra um grupo de itens focaveis.
 *
 * Devolve um **callback ref** para ser ligado ao elemento raiz do grupo.
 * Usar callback ref (e nao um `RefObject`) resolve um problema real: o
 * catalogo chega de forma assincrona, entao o elemento raiz so existe
 * depois do primeiro render. Com um `RefObject`, o grupo ficaria
 * registrado com `root: null` para sempre.
 *
 * ```tsx
 * const setRoot = useDpadGroup('row:esportes', {
 *   priority: 50,
 *   axes: 'horizontal',
 *   move: handleDpadMove,
 * })
 * return <ul ref={setRoot}>...</ul>
 * ```
 */
export function useDpadGroup(
  id: DpadGroupId,
  options: { priority: number; axes?: DpadAxes; move?: DpadGroup['move'] },
): (node: HTMLElement | null) => void {
  const { registerGroup } = useDpad()
  const { priority, axes = 'horizontal', move } = options

  /** Guarda o grupo atual para desregistrar quando o elemento mudar. */
  const cleanupRef = useRef<(() => void) | null>(null)
  /** Guarda as opcoes mais recentes (o callback ref nao pode depender delas). */
  const optionsRef = useRef({ priority, axes, move })
  optionsRef.current = { priority, axes, move }

  return useCallback(
    (node: HTMLElement | null) => {
      // Remove o registro anterior (o elemento mudou ou desmontou).
      cleanupRef.current?.()
      cleanupRef.current = null
      if (!node) return

      const opts = optionsRef.current
      const group: DpadGroup = {
        id,
        root: node,
        priority: opts.priority,
        axes: opts.axes,
        move: opts.move,
      }
      cleanupRef.current = registerGroup(group)
    },
    [id, registerGroup],
  )
}
