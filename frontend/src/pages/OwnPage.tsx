import { useState, useEffect, useCallback } from 'react'
import { useChannelsData } from '../hooks/useChannelsData'
import { hasToken } from '../lib/gistApi'
import { hasDraft, loadDraft } from '../lib/draftStorage'
import { OwnSidebar } from '../components/admin/OwnSidebar'
import { ChannelList } from '../components/admin/ChannelList'
import { CategoryList } from '../components/admin/CategoryList'
import { ScriptsPage } from '../components/admin/scripts/ScriptsPage'
import { GistTokenSetup } from '../components/admin/GistTokenSetup'

type Section = 'channels' | 'categories' | 'scripts'

export const OwnPage = () => {
  const [section, setSection] = useState<Section>('channels')
  const [configured, setConfigured] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)

  const {
    channels,
    categories,
    loading,
    syncStatus,
    pendingCount,
    baseline,
    addChannel,
    updateChannel,
    deleteChannel,
    toggleChannelActive,
    reorderChannels,
    reorderCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    addScript,
    updateScript,
    deleteScript,
    scripts,
    exportData,
    copyJSON,
    saveNow,
    discardChanges,
    restoreDraft,
    clearLocalDraft,
  } = useChannelsData()

  useEffect(() => {
    if (loading) return
    if (!hasDraft()) return
    if (!baseline) return
    const draft = loadDraft()
    if (!draft) return
    const isDifferent =
      JSON.stringify(draft.channels) !== JSON.stringify(channels) ||
      JSON.stringify(draft.categories) !== JSON.stringify(categories) ||
      JSON.stringify(draft.scripts ?? []) !== JSON.stringify(scripts ?? [])
    if (isDifferent) setShowRestoreModal(true)
  }, [loading, baseline])

  const handleRestore = useCallback(() => {
    restoreDraft()
    setShowRestoreModal(false)
  }, [restoreDraft])

  const handleDiscardDraft = useCallback(() => {
    clearLocalDraft()
    setShowRestoreModal(false)
  }, [clearLocalDraft])

  useEffect(() => {
    if (loading) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingCount > 0) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingCount, loading])

  if (!hasToken() && !configured) {
    return <GistTokenSetup onConfigured={() => setConfigured(true)} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-2xl text-gray-400">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg flex">
      <OwnSidebar
        activeSection={section}
        onSelectSection={setSection}
        onExport={exportData}
        onCopyJSON={copyJSON}
        syncStatus={syncStatus}
        pendingCount={pendingCount}
        onSaveNow={saveNow}
        onDiscardChanges={discardChanges}
      />

      <main className="flex-1 p-8">
        {section === 'channels' && (
          <ChannelList
            channels={channels}
            categories={categories}
            onToggle={toggleChannelActive}
            onUpdate={updateChannel}
            onDelete={deleteChannel}
            onAdd={addChannel}
            onReorder={reorderChannels}
          />
        )}

        {section === 'categories' && (
          <CategoryList
            categories={categories}
            channels={channels}
            onAdd={addCategory}
            onUpdate={updateCategory}
            onDelete={deleteCategory}
            onReorder={reorderCategories}
          />
        )}

        {section === 'scripts' && (
          <ScriptsPage
            scripts={scripts}
            channels={channels}
            onAddScript={addScript}
            onUpdateScript={updateScript}
            onDeleteScript={deleteScript}
          />
        )}
      </main>

      {showRestoreModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-dark-surface border border-dark-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-2">Rascunho local encontrado</h3>
            <p className="text-gray-400 mb-6">
              Existem alterações não sincronizadas com o Gist salvas neste navegador.
              Deseja restaurá-las ou descartar e usar a versão do Gist?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDiscardDraft}
                className="px-4 py-2 bg-dark-bg border border-dark-border text-white rounded hover:bg-dark-border"
              >
                Usar Gist
              </button>
              <button
                onClick={handleRestore}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Restaurar rascunho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
