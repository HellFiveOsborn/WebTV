import { useCallback, useRef } from 'react'
import { EmbedcanaisChannel } from '../lib/parseEmbedcanais'
import { RankedChannel, topReasons } from '../lib/ranking'
import { ChannelCard } from './ChannelCard'
import { useDpadGroup } from './useDpad'
import { DpadMoveResult, DPAD_ITEM_ATTR } from '../lib/dpad.js'
interface TopRowProps {
  title: string
  subtitle?: string
  /** Os 10 canais em destaque (ja ranqueados). O primeiro vira o card grande. */
  channels: RankedChannel[]
  /** Chamado quando o usuario abre um canal (registra o uso). */
  onOpen?: (channel: EmbedcanaisChannel) => void
}

/**
 * Bloco "Top 10" da home: titulo, card grande do #1 com o numero gigante
 * ao fundo e os demais cards menores a direita (como na referencia).
 *
 * **D-pad**: o card #1 e a lista 2..10 formam um unico grupo
 * horizontal - as setas andam do #1 para o #2, do #2 para o #3, e assim
 * por diante.
 */
export function TopRow({ title, subtitle, channels, onOpen }: TopRowProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  /**
   * Movimento horizontal do D-pad no bloco Top 10.
   *
   * O card #1 fica a ESQUERDA (com o numero gigante ao fundo) e os
   * demais a direita (2, 3, 4...): a ordem visual e a ordem do DOM.
   * Entao "direita" avanca no ranking, como no resto da interface.
   *
   * A direcao e ESTRITA: no fim da lista, o foco PARA (nao da a volta
   * nem troca de direcao - isso faria a navegacao parecer invertida).
   *
   * A lista de ranks 2..10 rola na horizontal, entao o alvo pode estar
   * fora da area visivel: o `revealElement` (chamado pelo motor) traz
   * o card para a tela.
   */
  const handleDpadMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right', current: HTMLElement): DpadMoveResult => {
      const root = bodyRef.current
      if (!root) return { kind: 'none' }

      const items = Array.from(
        root.querySelectorAll<HTMLElement>(`[${DPAD_ITEM_ATTR}]`),
      )
      const index = items.indexOf(current)
      if (index === -1) return { kind: 'none' }

      const step = direction === 'right' ? 1 : direction === 'left' ? -1 : 0
      if (step === 0) return { kind: 'none' }

      const target = items[index + step]
      return target ? { kind: 'focus', el: target } : { kind: 'none' }
    },
    [],
  )

  const setBodyRef = useDpadGroup(`top:${title}`, {
    priority: 100,
    axes: 'horizontal',
    move: handleDpadMove,
  })

  const attachBody = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current = node
      setBodyRef(node)
    },
    [setBodyRef],
  )

  if (channels.length === 0) return null

  const [featured, ...rest] = channels
  const reasons = topReasons(featured, 2)

  return (
    <section className="top-section">
      <h2 className="row-title">
        {title}
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </h2>

      <div className="top-body" ref={attachBody}>
        <span className="top-rank" aria-hidden="true">
          1
        </span>

        <div className="top-feature">
          <a
            className="top-thumb"
            href={featured.channel.href}
            target="_blank"
            rel="noopener noreferrer"
            title={`${featured.channel.name} - ${featured.channel.category}`}
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={() => onOpen?.(featured.channel)}
          >
            {featured.channel.image ? (
              <img
                src={featured.channel.image}
                alt={`Logo ${featured.channel.name}`}
                onError={e => {
                  const el = e.currentTarget
                  el.style.display = 'none'
                  el.parentElement?.classList.add('thumb-fallback')
                }}
              />
            ) : (
              <span className="thumb-fallback" aria-hidden="true">
                {(featured.channel.name || '?').charAt(0).toUpperCase()}
              </span>
            )}
          </a>

          <div className="top-info">
            <h3 className="top-title">{featured.channel.name || '(sem nome)'}</h3>

            <p className="top-meta">
              <span className="top-badge">{featured.channel.category}</span>
              {reasons.map(r => (
                <span className="top-reason" key={r.key}>
                  {r.label}
                </span>
              ))}
            </p>
          </div>
        </div>

        {rest.length > 0 && (
          <ul className="top-list">
            {rest.map((ranked, i) => (
              <li key={ranked.channel.id || ranked.channel.slug} className="top-list-item">
                <span className="top-list-rank" aria-hidden="true">
                  {i + 2}
                </span>
                <ChannelCard channel={ranked.channel} onSelect={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
