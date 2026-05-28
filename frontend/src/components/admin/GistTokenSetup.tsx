import { useState } from 'react'
import { Key, CheckCircle, XCircle, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import { validateToken, setToken } from '../../lib/gistApi'

interface GistTokenSetupProps {
  onConfigured: () => void
}

export const GistTokenSetup = ({ onConfigured }: GistTokenSetupProps) => {
  const [token, setTokenInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'validating' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleValidate = async () => {
    if (!token.trim()) {
      setStatus('error')
      setError('Digite o token')
      return
    }

    setStatus('validating')
    setError('')

    const result = await validateToken(token.trim())

    if (result.valid) {
      setToken(token.trim())
      onConfigured()
    } else {
      setStatus('error')
      setError(result.error || 'Token inválido')
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-dark-surface border border-dark-border rounded-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <Key className="w-8 h-8 text-blue-500" />
          <h1 className="text-2xl font-bold text-white">Configurar Gist GitHub</h1>
        </div>

        <p className="text-gray-400 mb-6">
          Este dashboard salva os dados de canais em um Gist do GitHub.
          Para continuar, configure um token de acesso pessoal com permissão <code className="bg-dark-border px-1.5 py-0.5 rounded text-blue-400">gist</code>.
        </p>

        <div className="bg-dark-bg border border-dark-border rounded-lg p-4 mb-6">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            Como obter o token
          </h2>
          <ol className="text-gray-400 text-sm space-y-2 ml-1">
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono">1.</span>
              Acesse{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                GitHub Settings → Tokens <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono">2.</span>
              Clique em <strong className="text-white">Generate new token</strong> (classic)
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono">3.</span>
              Dê um nome (ex: "WebTV Dashboard")
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono">4.</span>
              Em <strong className="text-white">Select scopes</strong>, marque apenas{' '}
              <code className="bg-dark-border px-1 py-0.5 rounded text-green-400">gist</code>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-mono">5.</span>
              Clique em <strong className="text-white">Generate token</strong> e copie o valor
            </li>
          </ol>
        </div>

        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">Token de Acesso</label>
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setTokenInput(e.target.value)
              if (status === 'error') setStatus('idle')
            }}
            placeholder="github_pat_..."
            className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-600 transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
          />
        </div>

        {status === 'error' && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          onClick={handleValidate}
          disabled={status === 'validating'}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center justify-center gap-2"
        >
          {status === 'validating' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Validando...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Validar e Salvar
            </>
          )}
        </button>

        <p className="text-gray-600 text-xs mt-4 text-center">
          O token fica salvo apenas no armazenamento local deste navegador.
        </p>
      </div>
    </div>
  )
}