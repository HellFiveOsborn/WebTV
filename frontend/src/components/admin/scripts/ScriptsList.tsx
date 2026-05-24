import { Script } from '../../../types/script'
import { Trash2, Edit2 } from 'lucide-react'

interface ScriptsListProps {
  scripts: Script[]
  onEdit: (script: Script) => void
  onDelete: (script: Script) => void
}

export const ScriptsList = ({ scripts, onEdit, onDelete }: ScriptsListProps) => {
  if (scripts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg">Nenhum script cadastrado</div>
        <div className="text-gray-600 text-sm mt-2">
          Clique em "Novo Script" para começar
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {scripts.map(script => (
        <div
          key={script.id}
          className="bg-dark-surface border border-dark-border rounded-lg p-4 hover:border-blue-500 transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-white font-medium">{script.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  script.enabled ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-500'
                }`}>
                  {script.enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="text-gray-500 text-sm mt-1">
                {script.domain}
                {script.subdomains.length > 0 && ` (${script.subdomains.join(', ')})`}
              </div>
              <div className="text-gray-600 text-xs mt-2 font-mono truncate max-w-xl">
                {script.code.substring(0, 100)}{script.code.length > 100 ? '...' : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(script)}
                className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => onDelete(script)}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
