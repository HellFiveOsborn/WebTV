import { EmbedcanaisChannel } from '../lib/parseEmbedcanais'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'

interface ChannelCardProps {
  channel: EmbedcanaisChannel
  /** Numero gigante ao fundo (estilo "Top 10"). */
  rank?: number
  /**
   * Chamado no clique (alem da navegacao nativa do `<a>`).
   *
   * O `href` continua navigating: dentro do app Android, isso faz o
   * WebView abrir o canal (o Kotlin intercepta o popup). O callback
   * existe so para avisar o app Kotlin de qual canal foi escolhido.
   */
  onSelect?: (channel: EmbedcanaisChannel) => void
}

/**
 * Card de canal (thumbnail 16:9 com o logo do canal).
 *
 * O `href` e o endereco "redirect" do catalogo (o player do canal no
 * site de origem):
 *
 *   - **fora do app Android** (navegador): o clique segue o link e abre
 *     o canal em outra aba - o comportamento normal da web;
 *   - **dentro do app**: o WebView abre o canal e o Kotlin injeta os
 *     scripts do player na pagina carregada.
 *
 * O `data-dpad-item` marca o card como alvo do controle remoto.
 */
export function ChannelCard({ channel, rank, onSelect }: ChannelCardProps) {
  return (
    <a
      className="card"
      href={channel.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${channel.name} - ${channel.category}`}
      {...{ [DPAD_ITEM_ATTR]: true }}
      onClick={() => onSelect?.(channel)}
    >
      {rank !== undefined && (
        <span className="card-rank" aria-hidden="true">
          {rank}
        </span>
      )}

      <span className="card-thumb">
        {channel.image ? (
          <img
            src={channel.image}
            alt={`Logo ${channel.name}`}
            loading="lazy"
            onError={e => {
              // Logo quebrado: mostra a inicial do canal no lugar.
              const el = e.currentTarget
              el.style.display = 'none'
              el.parentElement?.classList.add('thumb-fallback')
            }}
          />
        ) : (
          <span className="thumb-fallback" aria-hidden="true">
            {(channel.name || '?').charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="card-name">{channel.name || '(sem nome)'}</span>
      <span className="card-cat">{channel.category}</span>
    </a>
  )
}
