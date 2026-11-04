import { useCallback, useEffect, useRef, useState } from 'react'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'
import { useDpad } from './useDpad'

/** Tipo de cada tecla do teclado virtual. */
type KeyKind = 'char' | 'mic' | 'space' | 'backspace' | 'ok' | 'switch' | 'hide' | 'esc'

interface KeyDef {
  kind: KeyKind
  /** Caractere digitado (kind = 'char'). */
  value?: string
  /** Rotulo acessivel. */
  ariaLabel?: string
  /** Texto exibido (usado em 'space' e 'switch'). */
  label?: string
}

interface VirtualKeyboardProps {
  /** Texto atual do campo de busca. */
  value: string
  /** Chamado quando o texto muda (digitacao ou backspace). */
  onChange: (value: string) => void
  /** Chamado no botao de microfone. */
  onMic: () => void
  /** Chamado no botao de confirmar (fecha a busca). */
  onOk: () => void
  /** Chamado no botao de recolher o teclado. */
  onHide: () => void
  /** Chamado no botao Esc (fecha a busca). */
  onClose: () => void
  /** true quando o microfone esta ouvindo (acende o botao). */
  listening?: boolean
  /**
   * true = o teclado virtual e o METODO DE ENTRADA exclusivo (TV/controle
   * remoto). Nesse caso as setas sempre navegam no teclado virtual e o
   * campo de texto nao recebe foco (evita o teclado nativo do sistema).
   */
  exclusive?: boolean
}

/** Constrói as linhas do teclado de letras. */
function letterRows(): KeyDef[][] {
  const chars = (s: string): KeyDef[] => s.split('').map(c => ({ kind: 'char', value: c }))
  return [
    chars('qwertyuiop'),
    chars('asdfghjkl'),
    chars('zxcvbnm'),
    [
      { kind: 'switch', label: '123', ariaLabel: 'Trocar para simbolos' },
      { kind: 'esc', label: 'Esc', ariaLabel: 'Esc - fechar busca' },
      { kind: 'mic', ariaLabel: 'Pesquisar por voz' },
      { kind: 'space', label: 'Espaco', ariaLabel: 'Espaco' },
      { kind: 'backspace', ariaLabel: 'Apagar' },
      { kind: 'ok', label: 'Buscar', ariaLabel: 'Buscar' },
    ],
  ]
}

/** Constrói as linhas do teclado de numeros e simbolos. */
function symbolRows(): KeyDef[][] {
  const chars = (s: string): KeyDef[] => s.split('').map(c => ({ kind: 'char', value: c }))
  return [
    chars('1234567890'),
    chars('-/:;()$&@"'),
    chars('.,?!\'' + '#%+=_'),
    [
      { kind: 'switch', label: 'ABC', ariaLabel: 'Trocar para letras' },
      { kind: 'esc', label: 'Esc', ariaLabel: 'Esc - fechar busca' },
      { kind: 'mic', ariaLabel: 'Pesquisar por voz' },
      { kind: 'space', label: 'Espaco', ariaLabel: 'Espaco' },
      { kind: 'backspace', ariaLabel: 'Apagar' },
      { kind: 'ok', label: 'Buscar', ariaLabel: 'Buscar' },
    ],
  ]
}

/**
 * Teclado virtual (on-screen), no estilo Android TV.
 *
 * Navegavel pelo controle remoto: setas movem a tecla ativa, Enter
 * digita. O teclado fisico continua funcionando - o campo de texto
 * acima do teclado permanece editavel.
 */
export function VirtualKeyboard({
  value,
  onChange,
  onMic,
  onOk,
  onHide,
  onClose,
  listening = false,
  exclusive = false,
}: VirtualKeyboardProps) {
  const [symbols, setSymbols] = useState(false)
  const [row, setRow] = useState(0)
  const [col, setCol] = useState(0)
  const keyRefs = useRef<Array<Array<HTMLButtonElement | null>>>([])
  const { setFocus } = useDpad()

  const rows = symbols ? symbolRows() : letterRows()

  /** Move a selecao para a tecla mais proxima da linha alvo. */
  const moveTo = useCallback(
    (nextRow: number, nextCol: number) => {
      const clampedRow = Math.max(0, Math.min(rows.length - 1, nextRow))
      const clampedCol = Math.max(0, Math.min(rows[clampedRow].length - 1, nextCol))
      setRow(clampedRow)
      setCol(clampedCol)
    },
    [rows],
  )

  /** Executa a tecla ativa. */
  const press = useCallback(
    (key: KeyDef) => {
      switch (key.kind) {
        case 'char':
          if (key.value) onChange(value + key.value)
          break
        case 'space':
          onChange(value + ' ')
          break
        case 'backspace':
          onChange(value.slice(0, -1))
          break
        case 'mic':
          onMic()
          break
        case 'ok':
          onOk()
          break
        case 'switch':
          setSymbols(s => !s)
          setRow(0)
          setCol(0)
          break
        case 'esc':
          onClose()
          break
        case 'hide':
          onHide()
          break
      }
    },
    [value, onChange, onMic, onOk, onHide, onClose],
  )

  // Setas e Enter (controle remoto do Android TV).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typingInField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

      // No modo exclusivo, as setas SEMPRE navegam no teclado virtual.
      // No modo mouse+teclado, as setas pertencem ao campo de texto.
      if (typingInField && !exclusive) {
        if (e.key === 'Enter') {
          e.preventDefault()
          onOk()
        }
        return
      }

      // A busca (a camada) trata o Esc: o teclado virtual soega a tecla.
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        press({ kind: 'esc' })
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          moveTo(row, col - 1)
          break
        case 'ArrowRight':
          e.preventDefault()
          moveTo(row, col + 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          moveTo(row - 1, col)
          break
        case 'ArrowDown':
          e.preventDefault()
          moveTo(row + 1, col)
          break
        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          press(rows[row][col])
          break
        case 'Backspace':
          e.preventDefault()
          press({ kind: 'backspace' })
          break
        case ' ':
          e.preventDefault()
          press({ kind: 'space' })
          break
      }
    }

    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [row, col, rows, moveTo, press, exclusive, onOk])

  // Mantem a tecla ativa visivel.
  useEffect(() => {
    const el = keyRefs.current[row]?.[col]
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [row, col])

  /**
   * No modo exclusivo (TV), a tecla ativa recebe o foco do D-pad: e o
   * que o usuario ve destacado e o que o "OK" (Enter) aciona.
   */
  useEffect(() => {
    if (!exclusive) return
    const el = keyRefs.current[row]?.[col]
    if (!el) return
    setFocus(el)
  }, [row, col, exclusive, setFocus])

  return (
    <div className="vkb" aria-label="Teclado virtual">
      <div className="vkb-head">
        <span className="vkb-title">{symbols ? 'Simbolos' : 'Letras'}</span>
        <button
          type="button"
          className="vkb-hide"
          aria-label="Recolher teclado"
          onClick={onHide}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="vkb-rows">
        {rows.map((rowKeys, r) => (
          <div className="vkb-row" key={r}>
            {rowKeys.map((key, c) => {
              const isActive = r === row && c === col
              const label =
                key.kind === 'char'
                  ? key.value
                  : key.kind === 'switch'
                    ? key.label
                    : key.kind === 'space'
                      ? ''
                      : key.kind === 'ok'
                        ? key.label
                        : ''

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  ref={el => {
                    if (!keyRefs.current[r]) keyRefs.current[r] = []
                    keyRefs.current[r][c] = el
                  }}
                  className={[
                    'vkb-key',
                    `vkb-key--${key.kind}`,
                    isActive ? 'active' : '',
                    key.kind === 'mic' && listening ? 'listening' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={key.ariaLabel ?? key.value}
                  tabIndex={-1}
                  {...{ [DPAD_ITEM_ATTR]: true }}
                  onClick={() => {
                    setRow(r)
                    setCol(c)
                    press(key)
                    // A tecla clicada recebe o foco: assim o Enter
                    // seguinte e enviado para o teclado virtual (e nao
                    // para o campo de texto, que fecharia a busca).
                    keyRefs.current[r]?.[c]?.focus({ preventScroll: true })
                  }}
                >
                  {key.kind === 'mic' ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15m6-3.5a6 6 0 0 1-12 0M12 18v3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : key.kind === 'backspace' ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        d="M9 5h11v14H9L3 12zM17 9l-5 6M12 9l5 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    label
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
