import { ReactNode, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDpad } from './useDpad'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'

interface ModalDialogProps {
  /** true = modal aberto. */
  open: boolean
  /** Rotulo do cabecalho (tambem usado no aria-label). */
  title: string
  /** Conteudo do modal. */
  children: ReactNode
  /** Chamado ao fechar (botao X, Esc ou clique no fundo). */
  onClose: () => void
}

/** Elementos navegaveis por controle remoto (setas do Android TV). */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog no estilo Android TV:
 *   - fundo desfocado e escurecido (o conteudo de tras perde o destaque)
 *   - painel centralizado na tela
 *   - foco preso dentro do dialog
 *   - navegacao por SETAS (controle remoto do Android TV), alem de Tab
 *   - fecha por Esc, botao X ou clique no fundo
 *
 * Renderizado via portal no `body`: o `backdrop-filter` da barra superior
 * criaria um containing block e o modal sairia da viewport.
 *
 * **D-pad**: o modal e uma CAMADA do motor. As setas navegam dentro dele
 * (sem nunca vazar para a pagina de tras) e o `Esc` fecha.
 */
export function ModalDialog({ open, title, children, onClose }: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const { pushLayer, pushBack, setFocus } = useDpad()

  /** Elementos focaveis do painel, na ordem do DOM. */
  const getFocusables = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return [] as HTMLElement[]
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      el => !el.hasAttribute('disabled') && el.offsetParent !== null,
    )
  }, [])

  // Tab: prende o foco dentro do dialog (as setas sao do motor D-pad).
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusables = getFocusables()
      if (focusables.length === 0) return

      const active = document.activeElement as HTMLElement | null
      const index = active ? focusables.indexOf(active) : -1
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && (index === 0 || index === -1)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && index === focusables.length - 1) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, getFocusables])

  // Foca o primeiro elemento do painel ao abrir e devolve o foco a quem abriu.
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    const focusables = getFocusables()
    ;(focusables[0] ?? panelRef.current)?.focus()

    // Trava a rolagem do fundo enquanto o modal esta aberto.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus()
    }
  }, [open, getFocusables])

  // Registra a camada modal no motor do D-pad: enquanto ela estiver no
  // topo, as setas nao vazam para a pagina de tras.
  useEffect(() => {
    if (!open) return
    return pushLayer({ id: `modal:${title}`, root: panelRef.current })
  }, [open, title, pushLayer])
  // Esc (Back) fecha o modal: o tratador fica no topo da pilha enquanto
  // o modal estiver aberto.
  useEffect(() => {
    if (!open) return
    return pushBack(onClose)
  }, [open, onClose, pushBack])

  // Ao fechar, devolve o foco do D-pad para quem abriu o modal.
  useEffect(() => {
    if (open) return
    setFocus(null)
  }, [open, setFocus])

  if (!open) return null

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        // Só fecha se o clique comecou no fundo (e nao dentro do painel).
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="modal-close"
            aria-label="Fechar"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
