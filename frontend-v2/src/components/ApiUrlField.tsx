/**
 * Campo de edicao da URL da API do catalogo.
 *
 * Aparece em dois lugares:
 *   - a tela de fallback (quando nao ha nada para renderizar);
 *   - o painel de configuracoes (para trocar a API a qualquer momento).
 *
 * O override fica no storage do aparelho (`lib/apiUrl.ts`). Ele NAO
 * altera o bundle publicado: serve para o aparelho do usuario continuar
 * funcionando enquanto a API oficial volta - sem rebuild, sem push.
 *
 * A URL e usada exatamente como digitada - o app nao completa nem
 * ajusta o caminho.
 *
 * ## Teclado virtual (controle remoto)
 *
 * Na TV nao ha teclado fisico: o metodo de entrada e o teclado virtual.
 * O campo e EDITAVEL com o teclado do SO (mouse/teclado) e, no modo
 * exclusivo (TV), o `VirtualKeyboard` digita no campo.
 *
 * O teclado virtual e a propria camada do D-pad: ele sequestra as
 * setas (`captureArrows`) e o foco fica na tecla ativa.
 */

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { isValidApiUrl, normalizeApiUrl } from '../lib/apiUrl'
import { DPAD_ITEM_ATTR } from '../lib/dpad.js'
import { VirtualKeyboard } from './VirtualKeyboard'

interface ApiUrlFieldProps {
  /** URL embutida no build (o padrao). */
  buildApiUrl: string
  /** URL em uso agora (override ou a do build). */
  currentApiUrl: string
  /** true enquanto uma consulta esta em andamento (desabilita as acoes). */
  busy?: boolean
  /** Grava a URL escolhida. */
  onSave: (url: string) => void
  /** Volta para a URL do build (apaga o override). */
  onReset: () => void
  /** Rotulo do campo. */
  label?: string
  /** Oculta o botao de restaurar (usado quando ja e a URL original). */
  showReset?: boolean  /**
   * Botoes extras, mostrados NA MESMA linha dos botoes do campo.
   *
   * E o que permite, na tela de fallback, ter "Usar esta URL",
   * "Tentar de novo" e "Voltar para a URL original" lado a lado.
   */
  extraActions?: ReactNode
  /** true para mostrar o teclado virtual (padrao: o modo exclusivo). */
  showKeyboard?: boolean
}

/**
 * Campo de texto com a URL da API + acoes de salvar e restaurar.
 *
 * O campo de texto NAO e um item do D-pad: as setas devem cuidar do
 * cursor do texto, e nao do foco. O motor do D-pad ja ignora os
 * elementos editaveis (`isEditable`).
 */
export function ApiUrlField({
  buildApiUrl,
  currentApiUrl,
  busy = false,
  onSave,
  onReset,
  label = 'URL da API do catalogo',
  showReset,
  extraActions,
  showKeyboard = false,
}: ApiUrlFieldProps) {
  const fieldId = useId()
  const [url, setUrl] = useState(currentApiUrl)
  const [error, setError] = useState<string | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mantem o campo em dia quando a URL efetiva muda por fora
  // (ex.: o override foi lido do storage depois da montagem).
  useEffect(() => {
    setUrl(currentApiUrl)
  }, [currentApiUrl])

  const normalized = normalizeApiUrl(url)
  const valid = isValidApiUrl(normalized)
  const hasOverride = normalizeApiUrl(currentApiUrl) !== normalizeApiUrl(buildApiUrl)
  const showResetButton = showReset ?? hasOverride

  const handleSave = useCallback(() => {
    if (!valid) {
      setError('URL invalida. Use http(s):// ou um caminho comecando com /.')
      return
    }
    setError(null)
    onSave(normalized)
  }, [valid, normalized, onSave])

  return (
    <div className="api-url-field">
      <label className="api-fallback-label" htmlFor={fieldId}>
        {label}
      </label>

      <div className="api-fallback-field-row">
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          className="api-fallback-input"
          value={url}
          placeholder="https://api.exemplo.com"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-invalid={url.trim() !== '' && !valid}
          onChange={e => {
            setUrl(e.target.value)
            setError(null)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSave()
            }
          }}
        />

        {showKeyboard && (
          <button
            type="button"
            className="api-fallback-keyboard-btn"
            aria-label={keyboardOpen ? 'Fechar teclado virtual' : 'Abrir teclado virtual'}
            title={keyboardOpen ? 'Fechar teclado virtual' : 'Abrir teclado virtual'}
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={() => setKeyboardOpen(v => !v)}
          >
            {keyboardOpen ? (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M6 9l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
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
            )}
          </button>
        )}
      </div>

      {error && <p className="api-fallback-error">{error}</p>}

      {!valid && url.trim() !== '' && !error && (
        <p className="api-fallback-error">
          Use uma URL completa (http:// ou https://) ou um caminho relativo.
        </p>
      )}

      {showKeyboard && keyboardOpen && (
        <VirtualKeyboard
          value={url}
          onChange={setUrl}
          onOk={handleSave}
          onClose={() => setKeyboardOpen(false)}
          onHide={() => setKeyboardOpen(false)}
          showMic={false}
          okLabel="Aplicar"
          exclusive
        />
      )}

      <div className="api-fallback-actions">
        <button
          type="button"
          className="primary"
          disabled={!valid || busy}
          {...{ [DPAD_ITEM_ATTR]: true }}
          onClick={handleSave}
        >
          {busy ? 'Aplicando...' : 'Usar esta URL'}
        </button>

        {showResetButton && (
          <button
            type="button"
            disabled={busy}
            {...{ [DPAD_ITEM_ATTR]: true }}
            onClick={onReset}
          >
            Voltar para a URL original
          </button>
        )}

        {extraActions}
      </div>
    </div>
  )
}
