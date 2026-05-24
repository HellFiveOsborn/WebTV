import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Script, DomainGroup } from '../../../types/script'
import { Channel } from '../../../types/channel'
import { extractDomainGroups } from '../../../utils/urlUtils'
import { ScriptEditor } from './ScriptEditor'
import { ScriptsList } from './ScriptsList'

interface ScriptsPageProps {
  scripts: Script[]
  channels: Channel[]
  onAddScript: (script: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) => void
  onUpdateScript: (id: string, updates: Partial<Script>) => void
  onDeleteScript: (id: string) => void
}

export const ScriptsPage = ({
  scripts,
  channels,
  onAddScript,
  onUpdateScript,
  onDeleteScript
}: ScriptsPageProps) => {
  const [editingScript, setEditingScript] = useState<Script | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const allUrls = channels.flatMap(ch =>
    ch.alternativeUrls.map(alt => alt.url)
  )
  const domainGroups: DomainGroup[] = extractDomainGroups(allUrls)

  const handleSave = (data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingScript) {
      onUpdateScript(editingScript.id, data)
      setEditingScript(null)
    } else {
      onAddScript(data)
      setIsCreating(false)
    }
  }

  const handleDelete = (script: Script) => {
    if (confirm(`Excluir script "${script.name}"?`)) {
      onDeleteScript(script.id)
    }
  }

  const handleEdit = (script: Script) => {
    setEditingScript(script)
    setIsCreating(false)
  }

  const showForm = isCreating || editingScript !== null

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Scripts</h1>
        {!showForm && (
          <button
            onClick={() => { setIsCreating(true); setEditingScript(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={18} />
            Novo Script
          </button>
        )}
      </div>

      {showForm ? (
        <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
          <h2 className="text-lg font-medium text-white mb-4">
            {editingScript ? 'Editar Script' : 'Novo Script'}
          </h2>
          <ScriptEditor
            script={editingScript || undefined}
            domainGroups={domainGroups}
            onSave={handleSave}
            onCancel={() => { setEditingScript(null); setIsCreating(false) }}
          />
        </div>
      ) : (
        <ScriptsList
          scripts={scripts}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
