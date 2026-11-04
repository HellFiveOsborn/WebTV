/**
 * Tela de fallback: a API caiu e nao ha cache para renderizar.
 *
 * ## Quando aparece
 *
 * SO quando NAO ha nada para mostrar: nem o cache local, nem o snapshot
 * do build, nem a rede. Ou seja: o app abriu e nao tem catalogo nenhum.
 *
 * ## O que ela oferece
 *
 * 1. Explica o que aconteceu (com o log das tentativas).
 * 2. Deixa o usuario TROCAR a URL da API na hora - sem rebuild, sem
 *    deploy, sem push. O override fica no storage do aparelho
 *    (`lib/apiUrl.ts`) e o app recarrega com a nova URL.
 *
 * ## Navegacao por D-pad
 *
 * A tela e uma CAMADA do motor: as setas ficam dentro dela (botoes) e
 * nunca vazam para a pagina de tras - que, aliás, esta vazia.
 *
 * O campo de URL e EDITAVEL: as setas cuidam do cursor e nao do foco.
 */

import { useEffect } from 'react'
import { Attempt, STRATEGY_LABEL } from '../lib/catalogSource'
import { ApiUrlField } from './ApiUrlField'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'
import { useDpad } from './useDpad'

interface ApiFallbackScreenProps {
  /** URL da API embutida no build (padrao). */
  buildApiUrl: string
  /** URL efetiva em uso (override do usuario ou a do build). */
  currentApiUrl: string
  /** Tentativas de rede da ultima carga (para o diagnostico). */
  attempts: Attempt[]
  /** true enquanto uma nova consulta esta em andamento. */
  busy?: boolean
  /** Grava a URL escolhida e recarrega o app. */
  onSave: (url: string) => void
  /** Tenta consultar a API atual de novo (sem trocar a URL). */
  onRetry: () => void
  /** Restaura a URL do build (apaga o override). */
  onReset: () => void
}

/**
 * Tela exibida quando nao ha catalogo para renderizar.
 */
export function ApiFallbackScreen({
  buildApiUrl,
  currentApiUrl,
  attempts,
  busy = false,
  onSave,
  onRetry,
  onReset,
}: ApiFallbackScreenProps) {
  const { pushLayer, setFocus } = useDpad()

  /**
   * A tela e uma CAMADA do motor do D-pad: enquanto ela estiver no topo,
   * as setas nao vazam para a pagina de tras.
   *
   * `captureArrows: false`: o teclado virtual (quando aberto) e o
   * dono das setas - ele registra a PROPRIA camada por cima desta.
   */
  useEffect(() => {
    return pushLayer({
      id: 'api-fallback',
      root: document.querySelector('.api-fallback'),
    })
  }, [pushLayer])

  // Ao desmontar, devolve o foco (a tela some).
  useEffect(() => {
    return () => setFocus(null)
  }, [setFocus])

  return (
    <div className="api-fallback">
      <div className="api-fallback-card">
        <div className="api-fallback-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="38" height="38">
            <path
              d="M12 3a9 9 0 1 0 9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M12 7v5l3 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="api-fallback-title">Nao foi possivel carregar os canais</h1>

        <p className="api-fallback-text">
          A API do catalogo esta fora do ar e nao ha cache local com os dados.
          Voce pode apontar para outra API aqui - a mudanca vale imediatamente,
          sem precisar publicar nada.
        </p>

        {/* ---------- URL ---------- */}
        <ApiUrlField
          buildApiUrl={buildApiUrl}
          currentApiUrl={currentApiUrl}
          busy={busy}
          onSave={onSave}
          onReset={onReset}
          showKeyboard
          extraActions={
            <button
              type="button"
              disabled={busy}
              {...{ [DPAD_ITEM_ATTR]: true }}
              onClick={onRetry}
            >
              Tentar de novo
            </button>
          }
        />

        {/* ---------- Diagnostico ---------- */}
        <details className="api-fallback-details">
          <summary>Detalhes da consulta</summary>

          <dl className="api-fallback-meta">
            <dt>URL do build</dt>
            <dd>{buildApiUrl}</dd>
            <dt>URL em uso</dt>
            <dd>{currentApiUrl}</dd>
          </dl>

          {attempts.length > 0 ? (
            <ul className="api-fallback-attempts">
              {attempts.map((a, i) => (
                <li key={i} className={a.ok ? 'ok' : 'fail'}>
                  <b>{STRATEGY_LABEL[a.strategy]}</b>{' '}
                  {a.ok ? 'OK' : 'FALHOU: ' + a.error}
                  <span className="url">{a.url}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="api-fallback-hint">Nenhuma consulta registrada ainda.</p>
          )}
        </details>
      </div>
    </div>
  )
}
