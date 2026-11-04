import { Attempt, STRATEGY_LABEL } from '../lib/catalogSource'
import { formatAge } from '../lib/catalogCache'
import { Theme } from '../lib/theme'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'

interface SettingsPanelProps {
  /** Idade do cache local em ms (null se nao houver). */
  cacheAgeMs: number | null
  /** true se o cache ainda esta dentro do TTL. */
  cacheFresh: boolean
  /** Rotulo da via que forneceu os dados (ex.: "cache local"). */
  strategyLabel: string
  /** Tema atual. */
  theme: Theme
  /** Alterna o tema (claro <-> escuro). */
  onToggleTheme: () => void
  /** Tentativas de rede da ultima carga. */
  attempts: Attempt[]
  /** true quando o painel mostra o log de tentativas. */
  showAttempts: boolean
  onToggleAttempts: () => void
  onRefresh: () => void
  onClearCache: () => void
}

/**
 * Conteudo do modal de configuracoes.
 *
 * Concentra o tema da interface e as acoes de cache, que antes ficavam
 * no rodape da pagina.
 */
export function SettingsPanel({
  cacheAgeMs,
  cacheFresh,
  strategyLabel,
  theme,
  onToggleTheme,
  attempts,
  showAttempts,
  onToggleAttempts,
  onRefresh,
  onClearCache,
}: SettingsPanelProps) {
  const isDark = theme === 'dark'

  return (
    <div className="settings-body">
      {/* ---------- Aparencia ---------- */}
      <section className="settings-section">
        <h3 className="settings-section-title">Aparencia</h3>

        <div className="settings-row">
          <span className="settings-label">
            Tema {isDark ? 'escuro' : 'claro'}
            <span className="settings-hint">
              {isDark
                ? 'Visual padrao, otimizado para TV'
                : 'Fundo claro para ambientes iluminados'}
            </span>
          </span>

          <button
            type="button"
            className="settings-toggle"
            role="switch"
            aria-checked={isDark}
            aria-pressed={isDark}
            aria-label="Tema escuro"
            title={isDark ? 'Tema escuro (ativo)' : 'Tema claro'}
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onToggleTheme}
          />
        </div>
      </section>

      {/* ---------- Catalogo ---------- */}
      <section className="settings-section">
        <h3 className="settings-section-title">Catalogo</h3>

        <div className="settings-row">
          <span className="settings-label">Cache local</span>
          <span className={`settings-value${cacheFresh ? ' ok' : ''}`}>
            {cacheAgeMs !== null ? formatAge(cacheAgeMs) : 'vazio'}
          </span>
        </div>

        <div className="settings-row">
          <span className="settings-label">Origem dos dados</span>
          <span className="settings-value">{strategyLabel}</span>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="primary"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onRefresh}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Atualizar
          </button>

          <button
            type="button"
            className="danger"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onClearCache}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Limpar cache
          </button>
        </div>
      </section>

      {/* ---------- Diagnostico ---------- */}
      {attempts.length > 0 && (
        <section className="settings-section">
          <h3 className="settings-section-title">Diagnostico</h3>

          <button
            type="button"
            className="settings-log-toggle"
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onToggleAttempts}
          >
            {showAttempts ? 'Ocultar' : 'Ver'} detalhes da consulta
          </button>

          {showAttempts && (
            <ul className="settings-attempts">
              {attempts.map((a, i) => (
                <li key={i} className={a.ok ? 'ok' : 'fail'}>
                  <b>{STRATEGY_LABEL[a.strategy]}</b>{' '}
                  {a.ok ? 'OK' : 'FALHOU: ' + a.error}
                  <span className="url">{a.url}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
