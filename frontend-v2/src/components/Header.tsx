import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalDialog } from './ModalDialog'
import { VirtualKeyboard } from './VirtualKeyboard'
import { useDpad, useDpadGroup } from './useDpad'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'

interface HeaderProps {
  /** Categorias do catalogo, na ordem do site. */
  categories: string[]
  /** Rótulo exibido por categoria (ex.: Variedades -> Entretenimento). */
  categoryLabels: Record<string, string>
  /** Categoria selecionada ('' = Inicio). */
  activeCategory: string
  onSelectCategory: (category: string) => void
  /** Termo de busca (vazio = sem filtro). */
  query: string
  onQueryChange: (query: string) => void
  /** Total de canais do catalogo. */
  total: number
  /** Titulo do modal de configuracoes. */
  settingsTitle: string
  /** Conteudo do modal de configuracoes (aberto pelo icone de engrenagem). */
  settings: ReactNode
}

const ALL = ''

/**
 * Barra superior no estilo streaming: logo, navegacao por categoria,
 * busca (icone que abre a tela cheia) e as opcoes da aplicacao.
 */
export function Header({
  categories,
  categoryLabels,
  activeCategory,
  onSelectCategory,
  query,
  onQueryChange,
  total,
  settingsTitle,
  settings,
}: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)

  // Mantem a busca aberta enquanto houver texto.
  useEffect(() => {
    if (query.length > 0) setSearchOpen(true)
  }, [query])

  /**
   * A barra superior e um grupo HORIZONTAL do D-pad: as setas esquerda/
   * direita andam entre "Inicio", as categorias, a busca e as
   * configuracoes.
   *
   * A direcao e respeitada de forma ESTRITA: "direita" vai para o
   * proximo item e "esquerda" para o anterior. Sem isso, chegar ao
   * fim da lista faria o foco voltar - e a navegacao pareceria
   * invertida.
   */
  const handleNavMove = useCallback(
    (
      direction: 'up' | 'down' | 'left' | 'right',
      current: HTMLElement,
    ): { kind: 'focus'; el: HTMLElement } | { kind: 'none' } => {
      const root = barRef.current
      if (!root) return { kind: 'none' }

      // Todos os focaveis da barra, na ordem do DOM (nav + acoes).
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(`[${DPAD_ITEM_ATTR}]`),
      )
      const index = items.indexOf(current)
      if (index === -1) return { kind: 'none' }

      const step = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
      if (step === 0) return { kind: 'none' }

      // No fim (ou no inicio) da lista, o controle remoto PARA: nao da
      // a volta nem troca de direcao.
      const target = items[index + step]
      return target ? { kind: 'focus', el: target } : { kind: 'none' }
    },
    [],
  )

  const setBarRef = useDpadGroup('topbar', {
    priority: 1000,
    axes: 'horizontal',
    move: handleNavMove,
  })

  const attachBar = useCallback(
    (node: HTMLDivElement | null) => {
      barRef.current = node
      setBarRef(node)
    },
    [setBarRef],
  )

  return (
    <header className="topbar">
      <div className="topbar-inner" ref={attachBar}>
        <a className="brand" href="#inicio" aria-label="WebTV - inicio">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-caret" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </a>

        <div className="topbar-nav">
          <button
            type="button"
            className={`nav-link${activeCategory === ALL ? ' active' : ''}`}
            data-dpad-item
            onClick={() => onSelectCategory(ALL)}
          >
            Inicio
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              className={`nav-link${activeCategory === cat ? ' active' : ''}`}
              data-dpad-item
              onClick={() => onSelectCategory(cat)}
            >
              {categoryLabels[cat] || cat}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="icon-button"
            aria-label="Pesquisar"
            aria-haspopup="dialog"
            data-dpad-item
            onClick={() => setSearchOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle
                cx="11"
                cy="11"
                r="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16.5 16.5L21 21"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            className={`icon-button${settingsOpen ? ' active' : ''}`}
            aria-label="Configuracoes"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            data-dpad-item
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5m7.43-2.53a7.6 7.6 0 0 0 0-1.94l2.05-1.58a.5.5 0 0 0 .12-.64l-1.94-3.36a.5.5 0 0 0-.6-.22l-2.42.97a7.3 7.3 0 0 0-1.68-.97l-.36-2.57a.5.5 0 0 0-.5-.42h-3.88a.5.5 0 0 0-.49.42l-.36 2.57a7.6 7.6 0 0 0-1.69.97l-2.42-.97a.5.5 0 0 0-.6.22L2.39 8.79a.5.5 0 0 0 .12.64l2.06 1.58a7.7 7.7 0 0 0 0 1.94l-2.06 1.58a.5.5 0 0 0-.12.64l1.94 3.36a.5.5 0 0 0 .6.22l2.42-.97c.52.4 1.08.73 1.69.97l.36 2.57a.5.5 0 0 0 .49.42h3.88a.5.5 0 0 0 .5-.42l.36-2.57a7.3 7.3 0 0 0 1.68-.97l2.42.97a.5.5 0 0 0 .6-.22l1.94-3.36a.5.5 0 0 0-.12-.64Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
        </div>
      </div>
      <span className="topbar-count">{total} canais</span>

      <SearchOverlay
        open={searchOpen}
        query={query}
        onQueryChange={onQueryChange}
        onClose={() => setSearchOpen(false)}
      />

      <ModalDialog
        open={settingsOpen}
        title={settingsTitle}
        onClose={() => setSettingsOpen(false)}
      >
        {settings}
      </ModalDialog>
    </header>
  )
}

/* ------------------------------------------------------------------ *
 * Busca em tela cheia
 * ------------------------------------------------------------------ */

interface SearchOverlayProps {
  open: boolean
  query: string
  onQueryChange: (query: string) => void
  onClose: () => void
}

/**
 * Tipos minimos da Web Speech API (nao vem no lib.dom do TS).
 * API experimental: presente no Chrome/Edge, ausente no Firefox/Safari.
 */
interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionResult {
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionEventLike {
  results: { [index: number]: SpeechRecognitionResult }
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  onstart: (() => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/**
 * Tela de busca em fullscreen: campo de texto grande, teclado virtual
 * (mobile) e botao de microfone para busca por voz.
 */
function SearchOverlay({ open, query, onQueryChange, onClose }: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(true)
  /**
   * true = aparelho sem teclado fisico (TV / celular): o teclado virtual
   * e o metodo de entrada exclusivo. Detectado por media query de ponteiro
   * grosso (coarse pointer) - TV e celular nao tem mouse.
   */
  const [touchOnly, setTouchOnly] = useState(false)
  const { pushLayer, setFocus } = useDpad()

  /**
   * A busca e uma CAMADA do motor: enquanto estiver aberta, as setas
   * nao vazam para a pagina de tras.
   *
   * `captureArrows: true`: o TECLADO VIRTUAL e o metodo de entrada da
   * TV - ele e o dono das setas dentro da busca. O proprio teclado
   * virtual cuida disso (ele tem o listener das setas), e o motor so
   * evita roubar as teclas.
   *
   * `autoFocus: false`: o foco nao vai para o primeiro item do DOM (o
   * botao de microfone) e sim para a TECLA ATIVA do teclado virtual -
   * que e o que o usuario ve destacado na TV.
   */
  useEffect(() => {
    if (!open) return
    return pushLayer({
      id: 'search',
      root: document.querySelector('.search-overlay'),
      captureArrows: true,
      autoFocus: false,
    })
  }, [open, pushLayer])

  // Ao fechar, limpa o foco do D-pad (a busca tinha o controle).
  useEffect(() => {
    if (open) return
    setFocus(null)
  }, [open, setFocus])

  useEffect(() => {
    if (!open) return
    const mq = window.matchMedia('(pointer: coarse)')
    const apply = () => setTouchOnly(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [open])

  useEffect(() => {
    if (!open) return
    // No modo exclusivo o campo nao recebe foco (evita o teclado do SO).
    if (touchOnly) return
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open, touchOnly])

  useEffect(() => {
    if (!open) {
      setListening(false)
      setVoiceError(null)
      setKeyboardOpen(true)
    }
  }, [open])

  /**
   * Fecha a busca automaticamente quando o campo fica vazio (o usuario
   * limpou a busca): a overlay é modal e cobriria a pagina inteira,
   * impedindo navegar pelas categorias.
   */
  const lastQuery = useRef(query)
  useEffect(() => {
    if (!open) {
      lastQuery.current = query
      return
    }
    if (lastQuery.current !== '' && query === '') onClose()
    lastQuery.current = query
  }, [query, open, onClose])

  if (!open) return null

  /**
   * Busca por voz: usa a Web Speech API quando disponivel.
   * Se nao houver suporte, avisa em vez de falhar em silencio.
   */
  const startVoice = () => {
    setVoiceError(null)

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    const SpeechRecognition = win.SpeechRecognition ?? win.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceError('Busca por voz nao suportada neste navegador.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'pt-BR'
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => setListening(true)
      recognition.onerror = () => {
        setListening(false)
        setVoiceError('Nao foi possivel ouvir. Tente de novo.')
      }
      recognition.onend = () => setListening(false)
      recognition.onresult = event => {
        const text = event.results?.[0]?.[0]?.transcript
        if (text) onQueryChange(text)
      }

      recognition.start()
    } catch {
      setListening(false)
      setVoiceError('Nao foi possivel iniciar o microfone.')
    }
  }

  /*
   * Renderizado via portal no `body`: o `backdrop-filter` da barra
   * superior criaria um containing block e a tela de busca ficaria
   * presa ao cabecalho em vez de cobrir a janela inteira.
   */
  return createPortal(
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pesquisar"
      onMouseDown={e => {
        // Clique no fundo (fora do campo) fecha a busca.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="search-overlay-inner">
        <div className="search-overlay-field">
          <svg
            className="search-overlay-icon"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="search"
            className="search-overlay-input"
            placeholder="Buscar canal"
            value={query}
            aria-label="Buscar canal"
            autoComplete="off"
            readOnly={touchOnly}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onClose()
            }}
          />

          <button
            type="button"
            className={`mic-button${listening ? ' listening' : ''}`}
            aria-label="Pesquisar por voz (campo)"
            title="Pesquisar por voz"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={startVoice}
          >
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
          </button>

          <button
            type="button"
            className="search-overlay-close"
            aria-label="Fechar busca"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {voiceError && <p className="search-overlay-error">{voiceError}</p>}

        <p className="search-overlay-hint">
          Digite o nome do canal. Use o microfone para buscar por voz.
        </p>

        {keyboardOpen ? (
          <VirtualKeyboard
            value={query}
            onChange={onQueryChange}
            onMic={startVoice}
            onOk={onClose}
            onClose={onClose}
            onHide={() => setKeyboardOpen(false)}
            listening={listening}
            exclusive={touchOnly}
          />
        ) : (
          <button
            type="button"
            className="vkb-show"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={() => setKeyboardOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect
                x="2"
                y="6"
                width="20"
                height="12"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Mostrar teclado
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
