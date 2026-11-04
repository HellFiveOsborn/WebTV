/**
 * Navegacao por D-pad (controle remoto do Android TV).
 *
 * O motor tem tres pecas:
 *
 *   1. **Camada** (`DpadLayer`): a camada modal (configuracoes, busca).
 *      Enquanto uma camada esta no topo, o D-pad navega SO dentro dela.
 *   2. **Grupo** (`DpadGroup`): um conjunto de itens da mesma tela
 *      (a barra superior, o bloco Top 10, uma linha de canais, o grid).
 *      Cada grupo sabe se as setas ficam dentro dele (`axes`).
 *   3. **Motor**: decide para onde vai o foco a cada seta.
 *
 * As regras de navegacao:
 *
 *   - **Esquerda/Direita** andam dentro do grupo atual (uma linha e
 *     horizontal). No grid, quando nao ha nada a direita, avanca para o
 *     proximo item do grid (como um controle remoto de verdade).
 *   - **Cima/Baixo** mudam de grupo: o grupo vizinho na ordem do DOM
 *     (a linha de baixo, o grid) e escolhido, preservando a coluna
 *     (posicao horizontal) do foco.
 *   - **Alinhamento manda**: o alvo na direcao pedida que esta mais
 *     alinhado com o foco ganha (heuristica espacial em `lib/dpad.ts`).
 *
 * **Enter/OK** ativa o item em foco (o clique nativo). **Esc/Back**
 * sobe um nivel: fecha o modal, sai da busca.
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DpadDirection,
  DpadMoveResult,
  DPAD_CAPTURE_ATTR,
  DPAD_ITEM_ATTR,
  directionFromKey,
  findDpadTarget,
  MOVE_NONE,
  rectOf,
  revealElement,
  toDpadItems,
} from '../lib/dpad.js'

/** Teclas de seta do D-pad. */
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** Identificador de um grupo (camada) de itens focaveis. */
export type DpadGroupId = string

/** Direcoes que ficam dentro do grupo. */
export type DpadAxes = 'horizontal' | 'both'

/**
 * Um grupo de itens focaveis (uma camada da interface).
 */
export interface DpadGroup {
  id: DpadGroupId
  /** Elemento raiz do grupo (contem os itens com `data-dpad-item`). */
  root: HTMLElement | null
  /**
   * Prioridade: usada quando o foco ainda nao existe (o primeiro grupo
   * a receber foco e o de maior prioridade - a barra superior).
   */
  priority: number
  /**
   * Direcoes que navegam DENTRO do grupo.
   * - `horizontal`: so esquerda/direita ficam dentro (linhas de canais);
   * - `both`: as quatro direcoes ficam dentro (grid, modais).
   */
  axes: DpadAxes
  /**
   * Movimento customizado do grupo.
   *
   * As linhas de canais usam isso porque a rolagem e infinita: o alvo
   * pode estar fora da janela virtual montada, e nesse caso o grupo
   * remonta os itens e devolve `pending` (o motor espera o remount).
   */
  move?: (direction: DpadDirection, current: HTMLElement) => DpadMoveResult
}

/**
 * Uma camada modal: enquanto ela estiver no topo, o D-pad nao sai dela.
 */
export interface DpadLayer {
  id: string
  /** Elemento raiz da camada. */
  root: HTMLElement | null
  /**
   * true = as setas NAO movem o foco (a camada trata as setas por
   * conta propria - e o caso do teclado virtual da busca).
   */
  captureArrows?: boolean
  /**
   * false = o motor NAO move o foco para dentro da camada ao abrir.
   *
   * Usado pela busca em modo TV: ali o metodo de entrada e o teclado
   * virtual, entao o foco vai para a tecla ativa dele (e nao para o
   * botao de microfone, que seria o primeiro item do DOM).
   */
  autoFocus?: boolean
}

/** Estado e acoes expostos pelo contexto de D-pad. */
export interface DpadContextValue {
  /** Elemento com o foco atual (null = nenhum). */
  focused: HTMLElement | null
  /** Registra um grupo de itens focaveis. */
  registerGroup: (group: DpadGroup) => () => void
  /** Abre uma camada modal (retorna o cleanup). */
  pushLayer: (layer: DpadLayer) => () => void
  /** Define o foco programaticamente. */
  setFocus: (el: HTMLElement | null) => void
  /** Registra um tratador de "Back" (Esc), em pilha. */
  pushBack: (handler: () => void) => () => void
}

const DpadContext = createContext<DpadContextValue | null>(null)

/**
 * O contexto fica exportado para o `useDpad.ts` (os hooks publicos).
 *
 * @see ./useDpad.ts
 */
export { DpadContext }

/**
 * Provider do D-pad: instala o listener global de teclado e mantem o
 * estado do foco.
 */
export function DpadProvider({
  children,
  /** Altura da barra fixa no topo (para a rolagem respeitar o header). */
  stickyTop = 0,
}: {
  children: React.ReactNode
  stickyTop?: number
}) {
  const [focused, setFocused] = useState<HTMLElement | null>(null)

  /** Grupos registrados. */
  const groupsRef = useRef<Map<DpadGroupId, DpadGroup>>(new Map())
  /** Camadas modais (pilha: a ultima do topo). */
  const layersRef = useRef<DpadLayer[]>([])
  /** Tratadores de "Back", em pilha (o ultimo registrado e o primeiro). */
  const backHandlersRef = useRef<Array<() => void>>([])
  /** Elemento com o foco (espelho, para ler dentro dos listeners). */
  const focusedRef = useRef<HTMLElement | null>(null)

  focusedRef.current = focused

  const registerGroup = useCallback((group: DpadGroup) => {
    groupsRef.current.set(group.id, group)
    return () => {
      groupsRef.current.delete(group.id)
    }
  }, [])

  /**
   * Define o foco: marca o elemento com a classe de foco e chama o
   * `.focus()` nativo (para leitores de tela e para o teclado do SO).
   */
  const setFocus = useCallback((el: HTMLElement | null) => {
    const previous = focusedRef.current
    if (previous && previous !== el) {
      previous.classList.remove('dpad-focused')
    }
    focusedRef.current = el
    if (el) {
      el.classList.add('dpad-focused')
      // `preventScroll`: a rolagem e controlada pelo motor (revealElement).
      el.focus({ preventScroll: true })
    }
    setFocused(el)
  }, [])

  const pushLayer = useCallback(
    (layer: DpadLayer) => {
      layersRef.current.push(layer)

      // Ao abrir uma camada, o foco ENTRA nela: caso contrario o
      // controle remoto continuaria na pagina de tras.
      if (layer.autoFocus !== false) {
        const first =
          layer.root?.querySelector<HTMLElement>(`[${DPAD_ITEM_ATTR}]`) ?? null
        if (first) {
          setFocus(first)
          revealElement(first, { stickyTop })
        }
      }

      return () => {
        const i = layersRef.current.findIndex(l => l.id === layer.id)
        if (i >= 0) layersRef.current.splice(i, 1)
      }
    },
    [setFocus, stickyTop],
  )

  const pushBack = useCallback((handler: () => void) => {
    backHandlersRef.current.push(handler)
    return () => {
      const i = backHandlersRef.current.indexOf(handler)
      if (i >= 0) backHandlersRef.current.splice(i, 1)
    }
  }, [])

  /**
   * Encontra o grupo que contem o elemento com o foco.
   */
  const groupOf = useCallback((el: HTMLElement | null): DpadGroup | null => {
    if (!el) return null
    for (const group of groupsRef.current.values()) {
      if (group.root?.contains(el)) return group
    }
    return null
  }, [])

  /**
   * Move o foco na direcao pedida.
   */
  const move = useCallback(
    (direction: DpadDirection) => {
      const layer = layersRef.current[layersRef.current.length - 1]
      const current = focusedRef.current

      // --- CAMADA ATIVA (modal, busca) --------------------------------
      // Dentro de uma camada, o D-pad navega apenas nos itens dela:
      // as setas nunca vazam para a pagina de tras.
      if (layer?.root) {
        const items = Array.from(
          layer.root.querySelectorAll<HTMLElement>(`[${DPAD_ITEM_ATTR}]`),
        )
        if (items.length === 0) return

        // O foco ainda esta na pagina de tras: entra na camada.
        if (!current || !layer.root.contains(current)) {
          setFocus(items[0])
          revealElement(items[0], { stickyTop, direction })
          return
        }

        const index = items.indexOf(current)
        if (index === -1) {
          setFocus(items[0])
          revealElement(items[0], { stickyTop, direction })
          return
        }

        const target = findDpadTarget(
          rectOf(current),
          toDpadItems(items),
          direction,
          {},
          current,
        )
        if (!target) return

        setFocus(target.target)
        revealElement(target.target, { stickyTop, direction })
        return
      }

      // --- SEM CAMADA: navega pelos grupos da pagina --------------------
      const allGroups = Array.from(groupsRef.current.values())
      if (allGroups.length === 0) return

      // --- Caso 1: sem foco -> entra no primeiro item do grupo de maior
      // prioridade (a barra superior, normalmente).
      if (!current) {
        const group = allGroups
          .filter(g => g.root && itemsOf(g).length > 0)
          .sort((a, b) => b.priority - a.priority)[0]
        const first = group ? itemsOf(group)[0] : null
        if (!first) return
        setFocus(first)
        revealElement(first, { stickyTop, direction })
        return
      }

      const currentGroup = groupOf(current)

      // --- Caso 2: dentro do grupo atual -------------------------------
      if (currentGroup) {
        const horizontal = direction === 'left' || direction === 'right'
        const staysInside =
          currentGroup.axes === 'both' ||
          (horizontal && currentGroup.axes === 'horizontal')

        if (staysInside) {
          const result = currentGroup.move
            ? currentGroup.move(direction, current)
            : moveWithinGroup(currentGroup, current, direction)

          if (result.kind === 'focus') {
            setFocus(result.el)
            revealElement(result.el, { stickyTop, direction })
            return
          }
          if (result.kind === 'pending') return
        }

        // --- Caso 3: troca de grupo (cima/baixo) -----------------------
        if (!horizontal) {
          const neighbour = moveToNeighbour(
            allGroups,
            currentGroup,
            direction,
            current,
          )
          if (neighbour) {
            setFocus(neighbour)
            revealElement(neighbour, { stickyTop, direction })
            return
          }
        }
      }
    },
    [groupOf, setFocus, stickyTop],
  )

  // --- Listener global de teclado ---------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignora atalhos com modificador (Ctrl+R, Alt+..., etc.).
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const target = e.target as HTMLElement | null

      // --- Escape / Back ----------------------------------------------
      // Vem antes de tudo: fechar um modal ou a busca e a acao mais
      // importante do "Back" no controle remoto.
      if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack') {
        const handler = backHandlersRef.current[backHandlersRef.current.length - 1]
        if (handler) {
          e.preventDefault()
          handler()
        }
        return
      }

      const isArrow = ARROW_KEYS.has(e.key)

      // --- Campo de texto editavel: as setas cuidam do cursor ---------
      if (isEditable(target)) return

      // --- Componente que sequestrou as setas (teclado virtual) -------
      // O componente tem o proprio listener: o motor nao mexe no foco.
      if (target?.closest(`[${DPAD_CAPTURE_ATTR}]`)) return

      const layer = layersRef.current[layersRef.current.length - 1]

      // --- Camada que captura as setas --------------------------------
      // A camada tem o controle das setas (e do Enter): o motor nao mexe
      // no foco. E o caso da busca, cujo metodo de entrada da TV e o
      // teclado virtual.
      if (layer?.captureArrows) {
        if (isArrow || e.key === 'Enter') e.preventDefault()
        return
      }

      // --- Setas -------------------------------------------------------
      if (isArrow) {
        e.preventDefault()
        move(directionFromKey(e.key)!)
        return
      }

      // --- Enter / OK --------------------------------------------------
      if (e.key === 'Enter' || e.key === ' ') {
        const current = focusedRef.current
        if (!current) return
        const tag = current.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        // O teclado virtual trata o Enter dele mesmo (digita a tecla
        // ativa): o motor nao deve clicar no item focado.
        if (current.closest(`[${DPAD_CAPTURE_ATTR}]`)) return
        e.preventDefault()
        current.click()
      }
    }

    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [move])

  // --- Clique do mouse tambem move o foco ---------------------------
  // Sem isso, o foco do D-pad ficaria num elemento enquanto o usuario
  // navega com o mouse: o controle remoto "pularia" para outro lugar.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const item = target?.closest<HTMLElement>(`[${DPAD_ITEM_ATTR}]`)
      if (!item) return
      setFocus(item)
    }

    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [setFocus])

  // --- Mantem o foco sincronizado com o DOM ---------------------------
  // Se o elemento focado for removido (o item saiu da janela virtual da
  // rolagem infinita, por exemplo), o foco e limpo.
  useEffect(() => {
    if (!focused) return
    const el = focused
    const observer = new MutationObserver(() => {
      // So limpa se o elemento observado ainda e o foco atual: durante
      // o remount da janela virtual o foco ja foi para outro elemento.
      if (focusedRef.current === el && !el.isConnected) setFocus(null)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [focused, setFocus])

  const value = useMemo<DpadContextValue>(
    () => ({ focused, registerGroup, pushLayer, setFocus, pushBack }),
    [focused, registerGroup, pushLayer, setFocus, pushBack],
  )

  return <DpadContext.Provider value={value}>{children}</DpadContext.Provider>
}

/* ------------------------------------------------------------------ *
 * Utilidades internas
 * ------------------------------------------------------------------ */

/** Itens focaveis de um grupo, na ordem do DOM. */
function itemsOf(group: DpadGroup): HTMLElement[] {
  if (!group.root) return []
  return Array.from(group.root.querySelectorAll<HTMLElement>(`[${DPAD_ITEM_ATTR}]`))
}

/**
 * Movimento padrao dentro de um grupo: busca espacial entre os itens.
 *
 * A direcao e ESTRITA: se nao ha nada na direcao pedida, o foco PARA.
 * Nunca volta para o item anterior - isso faria a navegacao parecer
 * invertida quando o usuario chega ao fim de uma lista.
 *
 * No grid (`axes: 'both'`), quando nao ha nada na direcao pedida,
 * avanca linearmente - e assim que um controle remoto de TV funciona.
 */
function moveWithinGroup(
  group: DpadGroup,
  current: HTMLElement,
  direction: DpadDirection,
): DpadMoveResult {
  const items = itemsOf(group)
  if (items.length === 0) return MOVE_NONE

  const target = findDpadTarget(rectOf(current), toDpadItems(items), direction)
  if (target) return { kind: 'focus', el: target.target }

  if (group.axes === 'both' && (direction === 'left' || direction === 'right')) {
    const index = items.indexOf(current)
    const step = direction === 'right' ? 1 : -1
    const next = items[index + step]
    if (next) return { kind: 'focus', el: next }
  }

  return MOVE_NONE
}

/**
 * Troca de grupo: pega o vizinho na ordem do DOM (a linha de baixo, o
 * grid) e escolhe o item mais proximo na horizontal - assim o foco
 * "desce" mantendo a coluna.
 */
function moveToNeighbour(
  scope: readonly DpadGroup[],
  currentGroup: DpadGroup,
  direction: DpadDirection,
  current: HTMLElement,
): HTMLElement | null {
  const ordered = sortByDom(scope)
  const index = ordered.findIndex(g => g.id === currentGroup.id)
  if (index === -1) return null

  const candidates =
    direction === 'down'
      ? ordered.slice(index + 1)
      : ordered.slice(0, index).reverse()

  const currentRect = rectOf(current)
  const currentCenterX = currentRect.left + currentRect.width / 2

  for (const group of candidates) {
    const items = itemsOf(group)
    if (items.length === 0) continue

    let best = items[0]
    let bestDistance = Number.POSITIVE_INFINITY

    for (const item of items) {
      const r = rectOf(item)
      const distance = Math.abs(r.left + r.width / 2 - currentCenterX)
      if (distance < bestDistance) {
        bestDistance = distance
        best = item
      }
    }
    return best
  }

  return null
}

/** Ordena os grupos pela posicao no DOM. */
function sortByDom(groups: readonly DpadGroup[]): DpadGroup[] {
  return [...groups].sort((a, b) => {
    const ra = a.root
    const rb = b.root
    if (!ra || !rb || ra === rb) return 0
    const position = ra.compareDocumentPosition(rb)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
}

/** true = o elemento aceita digitar texto (as setas sao do cursor). */
function isEditable(el: HTMLElement | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  const input = el as HTMLInputElement
  // Campo somente-leitura (o campo da busca na TV) nao e editavel.
  if (input.readOnly) return false
  const type = (input.type || 'text').toLowerCase()
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type)
}
