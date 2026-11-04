/**
 * Motor de navegacao espacial (D-pad) do controle remoto do Android TV.
 *
 * Modulo PURO: nao importa nada e nao depende de React. A heuristica e a
 * mesma dos sistemas de TV (Netflix, Google TV): o alvo na direcao pedida
 * e o que combina MENOS distancia na direcao com MENOS desalinhamento
 * perpendicular. Alinhamento perfeito ganha desconto, para o foco "pular"
 * para a linha/coluna mais proxima em vez de ficar pulando entre linhas.
 *
 * As funcoes que tocam o DOM (`collectItems`, `revealElement`) tambem
 * ficam aqui para centralizar a logica de foco, mas sao inertes em Node
 * (so os testes de browser as usam).
 */

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

/** Direcoes do D-pad. */
export type DpadDirection = 'up' | 'down' | 'left' | 'right'

/** Todas as direcoes (util para depurar e testar). */
export const DPAD_DIRECTIONS: readonly DpadDirection[] = [
  'up',
  'down',
  'left',
  'right',
] as const

/** Retangulo na viewport (mesmo formato do DOMRect, sem os metodos). */
export interface DpadRect {
  left: number
  top: number
  width: number
  height: number
}

/** Item focavel conhecido pelo motor. */
export interface DpadItem<T = unknown> {
  /** Alvo opaco (no app: o elemento DOM). */
  target: T
  /** Retangulo na viewport no momento da busca. */
  rect: DpadRect
  /** false = item ignorado na busca (desabilitado, invisivel). */
  enabled?: boolean
}

/** Ajustes da heuristica de busca espacial. */
export interface DpadSearchOptions {
  /**
   * Peso do desalinhamento perpendicular na pontuacao.
   * Maior = o alvo precisa estar mais alinhado para vencer.
   */
  crossWeight?: number
  /**
   * Fator aplicado quando o alvo esta alinhado (dentro de
   * `alignTolerance`). Menor = o alinhamento pesa mais.
   */
  alignedFactor?: number
  /** Tolerancia (px) para considerar o alvo "alinhado". */
  alignTolerance?: number
  /**
   * Desalinhamento maximo aceito (px). 0 = sem limite.
   * Limita o quanto o foco pode "pular" de linha/coluna.
   */
  maxCross?: number
  /**
   * Tolerancia (px) para considerar o alvo "na direcao".
   * Evita que um item que termina exatamente na borda entre como
   * candidato.
   */
  directionTolerance?: number
}

/** Valores padrao da heuristica (calibrados para cards de ~200x112). */
export const DPAD_DEFAULTS: Required<DpadSearchOptions> = {
  crossWeight: 1.8,
  alignedFactor: 0.5,
  alignTolerance: 12,
  maxCross: 0,
  directionTolerance: 2,
}

/* ------------------------------------------------------------------ *
 * Utilidades de geometria
 * ------------------------------------------------------------------ */

/** Centro de um retangulo. */
export function rectCenter(rect: DpadRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * Projeta um retangulo na direcao pedida.
 *
 * `primary` e a distancia AO LONGO da direcao (negativo = o alvo esta
 * atras). `cross` e o quanto o alvo esta fora da linha/coluna do foco.
 */
export function projectRect(
  from: DpadRect,
  to: DpadRect,
  direction: DpadDirection,
): { primary: number; cross: number } {
  const f = rectCenter(from)
  const t = rectCenter(to)

  switch (direction) {
    case 'left':
      return { primary: from.left - (to.left + to.width), cross: Math.abs(t.y - f.y) }
    case 'right':
      return { primary: to.left - (from.left + from.width), cross: Math.abs(t.y - f.y) }
    case 'up':
      return { primary: from.top - (to.top + to.height), cross: Math.abs(t.x - f.x) }
    case 'down':
      return { primary: to.top - (from.top + from.height), cross: Math.abs(t.x - f.x) }
  }
}

/**
 * Procura o melhor alvo na direcao pedida.
 *
 * @param from    retangulo do elemento com o foco
 * @param items   candidatos (apenas os da camada/grupo em questao)
 * @param exclude alvo a ignorar (o proprio elemento com o foco)
 */
export function findDpadTarget<T>(
  from: DpadRect,
  items: readonly DpadItem<T>[],
  direction: DpadDirection,
  options: DpadSearchOptions = {},
  exclude?: T,
): DpadItem<T> | null {
  const opt = { ...DPAD_DEFAULTS, ...options }

  let best: DpadItem<T> | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const item of items) {
    if (item.enabled === false) continue
    if (exclude !== undefined && item.target === exclude) continue

    const { primary, cross } = projectRect(from, item.rect, direction)

    // O alvo precisa estar NA direcao (com uma folga minima).
    if (primary <= -opt.directionTolerance) continue

    // Limite de desalinhamento (quando definido).
    if (opt.maxCross > 0 && cross > opt.maxCross) continue

    let score = primary + cross * opt.crossWeight

    // Alinhamento perfeito: o foco "pula" para a linha/coluna vizinha.
    if (cross <= opt.alignTolerance) score *= opt.alignedFactor

    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }

  return best
}

/**
 * Proximo item de uma lista na ordem (movimento linear).
 * Devolve null quando ja esta no fim (o controle remoto NAO da a volta).
 */
export function nextInList<T>(items: readonly T[], current: T, step: 1 | -1): T | null {
  const index = items.indexOf(current)
  if (index === -1) return null
  return items[index + step] ?? null
}

/**
 * Direcao dominante entre dois retangulos (usada para depurar e para
 * validar a direcao escolhida pelo usuario).
 */
export function directionBetween(from: DpadRect, to: DpadRect): DpadDirection | null {
  const dx = to.left - from.left
  const dy = to.top - from.top
  if (dx === 0 && dy === 0) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}

/* ------------------------------------------------------------------ *
 * Ponte com o DOM
 * ------------------------------------------------------------------ */

/** Atributo que marca um elemento como focavel pelo D-pad. */
export const DPAD_ITEM_ATTR = 'data-dpad-item'

/**
 * Resultado de um movimento pedido a um grupo de itens.
 *
 * - `focus`  = o grupo entregou o novo elemento focado;
 * - `pending` = o grupo cuidou do movimento (remonta itens), o foco
 *               vai mudar em breve - o motor nao deve procurar outro alvo;
 * - `none`   = o grupo acabou na direcao pedida (o motor pode tentar
 *               outro grupo).
 */
export type DpadMoveResult =
  | { kind: 'focus'; el: HTMLElement }
  | { kind: 'pending' }
  | { kind: 'none' }

/** Resultado "nenhum alvo encontrado". */
export const MOVE_NONE: DpadMoveResult = { kind: 'none' }

/**
 * Atributo que marca um elemento que CONSOME as setas (campo de texto).
 * Nesse caso o D-pad nao mexe no foco: as setas cuidam do cursor.
 */
export const DPAD_CAPTURE_ATTR = 'data-dpad-capture-arrows'

/** Converte um elemento em retangulo da viewport. */
export function rectOf(el: Element): DpadRect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * true = o elemento pode receber foco (visivel e habilitado).
 *
 * Elementos dentro de um container rolado continuam "visiveis" mesmo
 * fora da viewport - eles sao montados de proposito e o D-pad pode
 * rolar ate eles.
 */
export function isFocusableElement(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  if (el.getClientRects().length === 0) return false
  return true
}

/**
 * Lista os itens focaveis dentro de uma raiz, na ordem do DOM.
 *
 * @param root elemento que delimita a busca (a camada ativa)
 */
export function collectItems(root: ParentNode): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[${DPAD_ITEM_ATTR}]`))
  return nodes.filter(isFocusableElement)
}

/** Converte elementos em itens do motor. */
export function toDpadItems(elements: readonly HTMLElement[]): DpadItem<HTMLElement>[] {
  return elements.map(el => ({ target: el, rect: rectOf(el) }))
}

/** Opcoes do `revealElement`. */
export interface RevealOptions {
  /** Altura fixa no topo (topbar) que o alvo nao pode ficar embaixo. */
  stickyTop?: number
  /** Comportamento da rolagem da pagina. */
  behavior?: ScrollBehavior
  /** Folga lateral dentro do container (evita ficar sob as setas). */
  padding?: number
  /**
   * Direcao do movimento. Define quais containers sao rolados:
   * horizontal (carrosseis) ou vertical (listas de canais, corpo do modal).
   */
  direction?: DpadDirection
}

/**
 * Traz o elemento para a area visivel.
 *
 * Percorre os ancestrais do elemento e rola aquele que precisa:
 *   - horizontal: os carrosseis (linhas de canais, lista do Top 10);
 *   - vertical: os containers verticais (corpo do modal, listas).
 *
 * O ajuste e feito no PONTO DE SNAP do container: alinhar no snap (e nao
 * numa rolagem minima) evita que o navegador re-snap depois e puxe o
 * item, tirando-o de foco.
 */
export function revealElement(el: HTMLElement, options: RevealOptions = {}): void {
  if (typeof document === 'undefined') return

  const padding = options.padding ?? 16
  const behavior = options.behavior ?? 'smooth'
  const direction = options.direction ?? 'right'
  const horizontal = direction === 'left' || direction === 'right'

  // --- 1) containers ancestrais (carrosseis / listas) -----------------
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    if (horizontal) {
      if (node.scrollWidth > node.clientWidth + 1) {
        scrollContainerTo(el, node, padding)
      }
    } else {
      if (node.scrollHeight > node.clientHeight + 1) {
        scrollContainerTo(el, node, padding)
      }
    }
    node = node.parentElement
  }

  // --- 2) rolagem da pagina ------------------------------------------
  const stickyTop = options.stickyTop ?? 0
  const eRect = el.getBoundingClientRect()
  const viewportBottom = window.innerHeight

  if (eRect.top < stickyTop) {
    window.scrollBy({ top: eRect.top - stickyTop - 12, behavior })
  } else if (eRect.bottom > viewportBottom) {
    window.scrollBy({ top: eRect.bottom - viewportBottom + 12, behavior })
  }
}

/**
 * Rola um container para alinhar o elemento no ponto de snap.
 *
 * O ponto de snap e o `scroll-padding` do container (o mesmo que o
 * `scroll-snap-align` dos itens usa). Se nao houver, usa o padding
 * interno do container e, por ultimo, o padding informado.
 */
function scrollContainerTo(el: HTMLElement, container: HTMLElement, padding: number): void {
  const style = getComputedStyle(container)
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()

  const horizontal = container.scrollWidth > container.clientWidth + 1

  if (horizontal) {
    // Distancia do elemento dentro do conteudo rolavel.
    const contentLeft = eRect.left - cRect.left + container.scrollLeft
    const contentRight = contentLeft + eRect.width

    const snapStart =
      parseFloat(style.scrollPaddingLeft || '') || parseFloat(style.paddingLeft || '') || padding
    const snapEnd =
      parseFloat(style.scrollPaddingRight || '') || parseFloat(style.paddingRight || '') || padding

    const viewLeft = container.scrollLeft
    const viewRight = viewLeft + container.clientWidth

    let desired = container.scrollLeft

    if (contentLeft < viewLeft + snapStart) {
      // Item a esquerda da area visivel: alinha no inicio.
      desired = contentLeft - snapStart
    } else if (contentRight > viewRight - snapEnd) {
      // Item a direita: alinha no inicio tambem (o item vira o primeiro
      // visivel, que e o comportamento dos apps de TV).
      desired = contentLeft - snapStart
    }

    applyScroll(container, desired)
    return
  }

  // --- vertical -------------------------------------------------------
  const contentTop = eRect.top - cRect.top + container.scrollTop
  const contentBottom = contentTop + eRect.height

  const snapStart =
    parseFloat(style.scrollPaddingTop || '') || parseFloat(style.paddingTop || '') || padding
  const snapEnd =
    parseFloat(style.scrollPaddingBottom || '') || parseFloat(style.paddingBottom || '') || padding

  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight

  let desired = container.scrollTop

  if (contentTop < viewTop + snapStart) {
    desired = contentTop - snapStart
  } else if (contentBottom > viewBottom - snapEnd) {
    desired = contentTop - snapStart
  }

  applyScroll(container, desired)
}

/**
 * Aplica a posicao de scroll no container.
 *
 * O `scroll-snap` e desligado durante o ajuste: o `scrollLeft`/`scrollTop`
 * pode cair entre dois pontos de snap e o navegador re-snaparia, puxando
 * o item para fora do foco.
 */
function applyScroll(container: HTMLElement, desired: number): void {
  const isHorizontal = container.scrollWidth > container.clientWidth + 1
  const current = isHorizontal ? container.scrollLeft : container.scrollTop
  const max = isHorizontal
    ? container.scrollWidth - container.clientWidth
    : container.scrollHeight - container.clientHeight

  const clamped = Math.max(0, Math.min(desired, max))
  if (Math.abs(clamped - current) < 1) return

  const previousSnap = container.style.scrollSnapType
  container.style.scrollSnapType = 'none'
  if (isHorizontal) {
    container.scrollLeft = clamped
  } else {
    container.scrollTop = clamped
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      container.style.scrollSnapType = previousSnap
    })
  } else {
    container.style.scrollSnapType = previousSnap
  }
}

/** Traduz a tecla do teclado para a direcao do D-pad. */
export function directionFromKey(key: string): DpadDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    default:
      return null
  }
}
