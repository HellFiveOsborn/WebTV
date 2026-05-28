import { useState, useRef, useEffect } from 'react'
import { Code2, CheckCircle, Loader2, AlertCircle, CloudOff } from 'lucide-react'
import { SyncStatus } from '../../hooks/useChannelsData'

type AdminSection = 'channels' | 'categories' | 'scripts'

interface OwnSidebarProps {
  activeSection: AdminSection
  onSelectSection: (section: AdminSection) => void
  onExport: () => void
  onCopyJSON: () => void
  syncStatus?: SyncStatus
  onSaveNow?: () => void
}

export const OwnSidebar = ({ activeSection, onSelectSection, onExport, onCopyJSON, syncStatus, onSaveNow }: OwnSidebarProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  const handleCopyAndClose = () => {
    onCopyJSON()
    setDropdownOpen(false)
  }

  return (
    <div className="w-64 bg-dark-surface border-r border-dark-border p-4 flex flex-col">
      <h2 className="text-2xl font-bold text-white mb-8">Dashboard</h2>

      <nav className="flex-1 space-y-2">
        <button
          onClick={() => onSelectSection('channels')}
          className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
            activeSection === 'channels'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-dark-border hover:text-white'
          }`}
        >
          Canais
        </button>

        <button
          onClick={() => onSelectSection('categories')}
          className={`w-full px-4 py-3 rounded-lg text-left transition-all flex items-center gap-3 ${
            activeSection === 'categories'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-dark-border hover:text-white'
          }`}
        >
          Categorias
        </button>

        <button
          onClick={() => onSelectSection('scripts')}
          className={`w-full px-4 py-3 rounded-lg text-left transition-all flex items-center gap-3 ${
            activeSection === 'scripts'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-dark-border hover:text-white'
          }`}
        >
          <Code2 size={18} />
          Scripts
        </button>
      </nav>

      {syncStatus && (
        <div className="mb-4 p-3 bg-dark-bg border border-dark-border rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Gist Sync</span>
            {syncStatus === 'saving' && (
              <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            )}
            {syncStatus === 'saved' && (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )}
            {syncStatus === 'error' && (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )}
            {syncStatus === 'idle' && (
              <CloudOff className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <div className="text-sm">
            {syncStatus === 'saving' && <span className="text-yellow-400">Salvando...</span>}
            {syncStatus === 'saved' && <span className="text-green-400">Sincronizado</span>}
            {syncStatus === 'error' && (
              <div>
                <span className="text-red-400">Erro</span>
                {onSaveNow && (
                  <button
                    onClick={onSaveNow}
                    className="ml-2 text-blue-400 hover:text-blue-300 underline text-xs"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
            {syncStatus === 'idle' && <span className="text-gray-500">Não configurado</span>}
          </div>
        </div>
      )}

      <div className="relative" ref={dropdownRef}>
        <div className="flex">
          <button
            onClick={onExport}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-l-lg transition-all"
          >
            Exportar JSON
          </button>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="px-3 py-3 bg-green-700 hover:bg-green-800 text-white rounded-r-lg transition-all border-l border-green-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {dropdownOpen && (
          <div className="absolute bottom-full mb-2 w-full bg-dark-surface border border-dark-border rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={handleCopyAndClose}
              className="w-full px-4 py-3 text-left text-white hover:bg-dark-border transition-all whitespace-nowrap"
            >
              Copiar JSON
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
