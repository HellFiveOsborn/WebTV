import { useState } from 'react'
import { useChannelsData } from '../hooks/useChannelsData'
import { hasToken } from '../lib/gistApi'
import { OwnSidebar } from '../components/admin/OwnSidebar'
import { ChannelList } from '../components/admin/ChannelList'
import { CategoryList } from '../components/admin/CategoryList'
import { ScriptsPage } from '../components/admin/scripts/ScriptsPage'
import { GistTokenSetup } from '../components/admin/GistTokenSetup'

type Section = 'channels' | 'categories' | 'scripts'

export const OwnPage = () => {
  const [section, setSection] = useState<Section>('channels')
  const [configured, setConfigured] = useState(false)

  const {
    channels,
    categories,
    loading,
    syncStatus,
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
  } = useChannelsData()

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
        onSaveNow={saveNow}
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
    </div>
  )
}
