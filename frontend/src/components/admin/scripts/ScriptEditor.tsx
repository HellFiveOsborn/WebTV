import { useState, useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import 'highlight.js/styles/atom-one-dark.css'
import { Script } from '../../../types/script'
import { DomainGroup } from '../../../types/script'
import { Channel } from '../../../types/channel'
import { DomainSelector } from './DomainSelector'
import { validateScript, minifyScript } from '../../../utils/scriptMinifier'

hljs.registerLanguage('javascript', javascript)

interface ScriptEditorProps {
  script?: Script
  domainGroups: DomainGroup[]
  channels: Channel[]
  onSave: (data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

export const ScriptEditor = ({ script, domainGroups, channels, onSave, onCancel }: ScriptEditorProps) => {
  const [name, setName] = useState(script?.name || '')
  const [domain, setDomain] = useState(script?.domain || '')
  const [subdomains, setSubdomains] = useState<string[]>(script?.subdomains || [])
  const [code, setCode] = useState(script?.code || '')
  const [enabled, setEnabled] = useState(script?.enabled ?? true)
  const [showPreview, setShowPreview] = useState(false)
  const [highlightedCode, setHighlightedCode] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [minifiedPreview, setMinifiedPreview] = useState('')
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (showPreview && code) {
      try {
        const result = hljs.highlight(code, { language: 'javascript' })
        setHighlightedCode(result.value)
      } catch {
        setHighlightedCode(code)
      }
    }
  }, [code, showPreview])

  useEffect(() => {
    if (code) {
      const validation = validateScript(code)
      setErrors(validation.errors)
      setWarnings(validation.warnings)
      setMinifiedPreview(minifyScript(code))
    }
  }, [code])

  const currentUrls = domainGroups.find(g => g.domain === domain)?.urls || []

  const selectedUrls = currentUrls.filter(url => {
    if (subdomains.length === 0) return true
    return subdomains.some((sub: string) => url.includes(`://${sub}.`) || url.includes(`://${sub}/`))
  })

  const matchingChannelIds = channels
    .filter(ch => ch.alternativeUrls.some(alt => selectedUrls.includes(alt.url)))
    .map(ch => ch.id)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const validation = validateScript(code)
    if (!validation.valid) {
      setErrors(validation.errors)
      return
    }

    const minified = minifyScript(code)

    onSave({
      name,
      domain,
      subdomains,
      code: minified,
      enabled,
      domains: [domain],
      urls: selectedUrls,
      channelIds: matchingChannelIds.length > 0 ? matchingChannelIds : undefined
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-gray-400 text-sm mb-2">Nome do Script</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white"
          required
        />
      </div>

      <DomainSelector
        domainGroups={domainGroups}
        selectedDomain={domain}
        selectedSubdomains={subdomains}
        onDomainChange={setDomain}
        onSubdomainsChange={setSubdomains}
      />

      {matchingChannelIds.length > 0 && (
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
          <label className="block text-green-400 text-xs mb-1 font-medium uppercase tracking-wider">
            Vinculado a {matchingChannelIds.length} canais
          </label>
          <div className="flex flex-wrap gap-1">
            {matchingChannelIds.map(id => {
              const ch = channels.find(c => c.id === id)
              return (
                <span key={id} className="px-2 py-0.5 bg-green-800/40 text-green-300 text-xs rounded">
                  {ch?.title || id}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {domain && matchingChannelIds.length === 0 && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
          <span className="text-yellow-400 text-xs">Nenhum canal com este dominio. O script sera injetado globalmente.</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm">Habilitado</label>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`w-12 h-6 rounded-full transition-all ${
            enabled ? 'bg-blue-600' : 'bg-dark-border'
          }`}
        >
          <div className={`w-5 h-5 rounded-full bg-white transition-all ${
            enabled ? 'translate-x-6' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-gray-400 text-sm">Código JavaScript</label>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-blue-400 text-sm hover:underline"
          >
            {showPreview ? 'Ocultar Preview' : 'Mostrar Preview'}
          </button>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full h-64 bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-white font-mono text-sm resize-y"
          placeholder="const video = document.querySelector('video');&#10;if (video) video.play();"
          required
        />
      </div>

      {errors.length > 0 && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-3">
          {errors.map((err, i) => (
            <div key={i} className="text-red-400 text-sm">{err}</div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-3">
          {warnings.map((warn, i) => (
            <div key={i} className="text-yellow-400 text-sm">{warn}</div>
          ))}
        </div>
      )}

      {showPreview && code && (
        <div>
          <label className="block text-gray-400 text-sm mb-2">Preview (Syntax Highlighted)</label>
          <pre className="bg-dark-bg border border-dark-border rounded-lg p-4 overflow-auto max-h-64">
            <code
              ref={codeRef}
              className="hljs language-javascript text-sm"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>
      )}

      {code && (
        <div>
          <label className="block text-gray-400 text-sm mb-2">
            Preview Minificado ({minifiedPreview.length} chars)
          </label>
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4 overflow-auto max-h-32">
            <code className="text-gray-400 text-xs font-mono break-all">
              {minifiedPreview}
            </code>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={errors.length > 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 bg-dark-border text-gray-400 rounded-lg hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
