import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EmbedcanaisChannel } from '../lib/parseEmbedcanais'
import { ChannelCard } from './ChannelCard'
import { useDpad } from './useDpad'
import { useDpadGroup } from './useDpad'
import { DpadMoveResult, DPAD_ITEM_ATTR } from '../lib/dpad.js'

interface RowProps {
  title: string
  channels: EmbedcanaisChannel[]
  /** Rotulo alternativo exibido no fim do titulo. */
  subtitle?: string
  /** Chamado quando o usuario abre um canal (registra o uso). */
  onOpen?: (channel: EmbedcanaisChannel) => void
}

/** Quantidade MINIMA de canais montados ao mesmo tempo (janela virtual). */
const WINDOW_SIZE = 12

/** Itens extras montados de cada lado do viewport (folga contra "buracos"). */
const BUFFER = 4

/** Distancia (px) da borda da janela em que ela e recentralizada. */
const LOAD_MARGIN = 200

/**
 * Fileira horizontal de canais com ROLAGEM INFINITA.
 *
 * A linha e uma JANELA VIRTUAL sobre a lista completa: enquanto o
 * usuario desliza para a direita, a janela desliza e novos canais sao
 * montados a frente, enquanto os que ficaram paratras sao desmontados.
 * O DOM mantem sempre poucos cards (viewport +
 * folga), e nao os 70 da categoria. Ao voltar para a esquerda, a janela
 * desliza para tras e os canais voltam.
 *
 * A implementacao usa SPACERS (elementos vazios com a largura dos
 * itens ausentes) nas duas pontas. Como o espaco total ocupado e sempre
 * o mesmo, a largura da barra de rolagem nao muda e - o mais importante -
 * a posicao visual de cada canal permanece EXATA quando a janela desliza.
 * Por isso NAO se mexe no `scrollLeft` ao deslizar a janela: compensar
 * o scroll aqui causaria "pulos" e deslizes em cascata.
 *
 * Detalhe: cada spacer e um item flex e ganha um `gap` extra ao lado, por
 * isso a largura dele e `n * stride - gap`.
 *
 * **D-pad**: esquerda/direita andam pelos cards da linha. Como a janela
 * e virtual, o card pode nao estar montado: nesse caso a linha
 * recentraliza a janela e devolve `pending` - o motor espera o remount
 * e o foco segue para o item recem-montado.
 */
export function Row({ title, channels, subtitle, onOpen }: RowProps) {
  const trackRef = useRef<HTMLUListElement | null>(null)
  const { setFocus } = useDpad()
  /**
   * Indice global do card que o D-pad pediu, mas que ainda nao estava
   * montado (fora da janela virtual). Consumido no remount.
   */
  const pendingIndexRef = useRef<number | null>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  /** Indice do primeiro canal montado na janela. */
  const [offset, setOffset] = useState(0)
  /** Quantidade de canais montados (cresce em telas largas). */
  const [windowSize, setWindowSize] = useState(WINDOW_SIZE)

  /** Espelhos de offset/windowSize, para ler dentro dos listeners sem recriar. */
  const offsetRef = useRef(offset)
  const windowSizeRef = useRef(windowSize)
  /**
   * Largura de um item + espaco entre itens (usada para os espacadores).
   * Medida ANTES da primeira pintura: se ficasse 0 no primeiro render,
   * os espacadores nao seriam aplicados e a linha nao teria rolagem.
   */
  const [stride, setStride] = useState(0)
  /** Espaco entre itens (px), necessario para o calculo dos espacadores. */
  const gapRef = useRef(0)

  const total = channels.length

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    windowSizeRef.current = windowSize
  }, [windowSize])

  /**
   * Recarrega a janela quando a lista muda (filtro de busca).
   * Sem isso, a linha ficaria mostrando a posicao antiga de outra lista.
   */
  const signature = channels.length > 0 ? `${channels[0].id}:${channels.length}` : 'vazio'
  const lastSignature = useRef(signature)
  useEffect(() => {
    if (lastSignature.current === signature) return
    lastSignature.current = signature
    offsetRef.current = 0
    setOffset(0)
    trackRef.current?.scrollTo({ left: 0 })
  }, [signature])

  /** Mede o "passo" horizontal de um item (largura + espaco entre itens). */
  const measureStride = useCallback(() => {
    const el = trackRef.current
    if (!el) return stride
    const item = el.querySelector<HTMLElement>('.row-item')
    if (!item) return stride
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
    gapRef.current = gap
    const measured = item.offsetWidth + gap
    if (measured > 0 && measured !== stride) setStride(measured)
    return measured
  }, [stride])

  /** Atualiza a visibilidade dos arrows. */
  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    const off = offsetRef.current
    setCanPrev(el.scrollLeft > 4 || off > 0)
    setCanNext(el.scrollLeft < maxScroll - 4 || off + windowSizeRef.current < total)
  }, [total])

  /**
   * Decide se a janela deve ser reposicionada, conforme o scroll.
   *
   * Nao mexe no `scrollLeft`: os espacadores mantem cada item exatamente
   * onde estava. Quando o viewport chega perto de uma borda da janela
   * (ou salta para fora dela, ex.: arrastando a barra), a janela e
   * recentralizada em volta do viewport de uma so vez.
   */
  const adjust = useCallback(() => {
    const el = trackRef.current
    if (!el) return

    const step = measureStride()
    if (step <= 0) {
      updateArrows()
      return
    }

    // Janela dimensionada para cobrir o viewport + folga dos dois lados.
    const size = Math.min(
      total,
      Math.max(WINDOW_SIZE, Math.ceil(el.clientWidth / step) + 2 * BUFFER),
    )
    if (size !== windowSizeRef.current) {
      windowSizeRef.current = size
      setWindowSize(size)
    }

    const gutter = parseFloat(getComputedStyle(el).paddingLeft || '0') || 0
    const off = offsetRef.current
    const maxOffset = Math.max(0, total - size)

    const windowStart = gutter + off * step
    const windowEnd = gutter + (off + size) * step
    const viewLeft = el.scrollLeft
    const viewRight = el.scrollLeft + el.clientWidth

    const nearLeft = off > 0 && viewLeft < windowStart + LOAD_MARGIN
    const nearRight = off < maxOffset && viewRight > windowEnd - LOAD_MARGIN

    if (nearLeft || nearRight) {
      // Recentraliza a janela no meio do viewport.
      const centerIndex = (viewLeft + el.clientWidth / 2 - gutter) / step
      const next = Math.max(0, Math.min(Math.round(centerIndex - size / 2), maxOffset))
      if (next !== off) {
        offsetRef.current = next
        setOffset(next)
      }
    }

    updateArrows()
  }, [measureStride, total, updateArrows])

  // Assina o scroll (handler estavel via ref, nao recria a cada render).
  const adjustRef = useRef(adjust)
  useEffect(() => {
    adjustRef.current = adjust
  }, [adjust])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    const onScroll = () => adjustRef.current()

    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()

    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // Apos a janela mudar, atualiza os arrows.
  useLayoutEffect(() => {
    measureStride()
    updateArrows()
  }, [offset, windowSize, measureStride, updateArrows])

  // Quando o passo e conhecido (ou a lista muda), reajusta o tamanho da janela.
  useEffect(() => {
    if (stride > 0) adjustRef.current()
  }, [stride, total])

  // Mede o passo ANTES da primeira pintura (os espacadores dependem dele).
  // Precisa esperar o DOM ter os itens: no primeiro render a lista pode
  // ainda estar vazia (o catalogo chega assincrono).
  useLayoutEffect(() => {
    if (total === 0) return

    const el = trackRef.current
    if (!el) return

    // O item pode ainda nao estar no DOM nesta passagem: mede no proximo
    // quadro, quando o layout ja esta pronto.
    const measure = () => {
      const item = el.querySelector<HTMLElement>('.row-item')
      if (!item) return
      const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
      gapRef.current = gap
      const measured = item.offsetWidth + gap
      if (measured > 0) setStride(measured)
    }

    measure()
    if (!el.querySelector('.row-item')) {
      const raf = requestAnimationFrame(measure)
      return () => cancelAnimationFrame(raf)
    }
  }, [total])

  const scrollBy = (direction: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const amount = Math.max(240, Math.round(el.clientWidth * 0.8))
    el.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  /**
   * Movimento do D-pad dentro da linha.
   *
   * A linha e a unica "unidade" horizontal: o alvo e o card vizinho na
   * ordem da lista. Como a janela e virtual, o card pode nao estar
   * montado: nesse caso a linha recentraliza a janela e devolve
   * `pending` - o motor espera o remount e o foco segue para o item
   * recem-montado (via `pendingIndexRef`).
   */
  const handleDpadMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right', current: HTMLElement): DpadMoveResult => {
      const el = trackRef.current
      if (!el) return { kind: 'none' }

      // Indice GLOBAL do card em foco (a janela virtual so monta parte).
      const holder = current.closest<HTMLElement>('.row-item')
      const globalIndex = Number(holder?.dataset.dpadIndex)
      if (!Number.isFinite(globalIndex)) return { kind: 'none' }

      const step = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
      if (step === 0) return { kind: 'none' }

      const targetIndex = globalIndex + step
      // Fim da lista: o controle remoto nao da a volta.
      if (targetIndex < 0 || targetIndex >= total) return { kind: 'none' }

      // O card vizinho ja esta montado?
      const mounted = el.querySelector<HTMLElement>(
        `.row-item[data-dpad-index="${targetIndex}"] [${DPAD_ITEM_ATTR}]`,
      )
      if (mounted) return { kind: 'focus', el: mounted }

      // Nao esta montado: recentraliza a janela para inclui-lo.
      const size = windowSizeRef.current
      const maxOffset = Math.max(0, total - size)
      const nextOffset = Math.max(
        0,
        Math.min(targetIndex - Math.floor(size / 2), maxOffset),
      )

      pendingIndexRef.current = targetIndex
      if (nextOffset !== offsetRef.current) {
        offsetRef.current = nextOffset
        setOffset(nextOffset)
        return { kind: 'pending' }
      }

      return { kind: 'none' }
    },
    [total],
  )

  /**
   * Apos o remount da janela virtual, o foco segue para o card que o
   * D-pad pediu (ele nao estava montado no momento do movimento).
   */
  useEffect(() => {
    const target = pendingIndexRef.current
    if (target === null) return
    pendingIndexRef.current = null

    const el = trackRef.current?.querySelector<HTMLElement>(
      `.row-item[data-dpad-index="${target}"] [${DPAD_ITEM_ATTR}]`,
    )
    if (el) setFocus(el)
  }, [offset, windowSize, setFocus])

  // Registra a linha como grupo de navegacao (so horizontal).
  const setTrackRef = useDpadGroup(`row:${title}`, {
    priority: 50,
    axes: 'horizontal',
    move: handleDpadMove,
  })

  // O track e referenciado por codigo (medidas, scroll) e pelo motor do
  // D-pad: o callback ref preenche os dois.
  const attachTrack = useCallback(
    (node: HTMLUListElement | null) => {
      trackRef.current = node
      setTrackRef(node)
    },
    [setTrackRef],
  )

  if (total === 0) return null

  // Janela montada (limitada ao fim da lista).
  const size = Math.min(windowSize, total)
  const start = Math.max(0, Math.min(offset, total - size))
  const end = Math.min(start + size, total)
  const visible = channels.slice(start, end)

  // Espacadores: os itens fora da janela continuam ocupando espaco, entao
  // a largura total - e a barra de rolagem - nunca mudam. Cada spacer
  // ganha um gap extra ao lado (e um item flex), entao desconta-se 1 gap.
  const gap = gapRef.current
  const leftSpacer = stride > 0 && start > 0 ? start * stride - gap : 0
  const rightSpacer = stride > 0 && end < total ? (total - end) * stride - gap : 0

  return (
    <section className="row">
      <h2 className="row-title">
        {title}
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </h2>

      <div className="row-body">
        {canPrev && (
          <button
            type="button"
            className="row-arrow left"
            aria-label={`Ver mais em ${title}`}
            onClick={() => scrollBy(-1)}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <ul className="row-track" ref={attachTrack}>
          {leftSpacer > 0 && (
            <li className="row-spacer" style={{ width: leftSpacer }} aria-hidden="true" />
          )}

          {visible.map((ch, i) => (
            <li
              key={ch.id || ch.slug}
              className="row-item"
              data-dpad-index={start + i}
            >
              <ChannelCard channel={ch} onSelect={onOpen} />
            </li>
          ))}

          {rightSpacer > 0 && (
            <li className="row-spacer" style={{ width: rightSpacer }} aria-hidden="true" />
          )}
        </ul>

        {canNext && (
          <button
            type="button"
            className="row-arrow right"
            aria-label={`Ver mais em ${title}`}
            onClick={() => scrollBy(1)}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </section>
  )
}
