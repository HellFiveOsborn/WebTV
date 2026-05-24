import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { ChannelGrid } from './components/ChannelGrid'
import { ShimmerPlaceholder, ChannelGridSkeleton } from './components/ShimmerPlaceholder'
import { FeedbackMessage } from './components/FeedbackMessage'
import { PlayerModal } from './components/PlayerModal'
import { ConfirmModal } from './components/ConfirmModal'
import { useDpadNavigation, Zone } from './hooks/useDpadNavigation'
import { useRecentChannels } from './hooks/useRecentChannels'
import { useChannelsData } from './hooks/useChannelsData'
import { Channel } from './types/channel'
import { useNavigate, useParams } from 'react-router-dom'
import { eventBus } from './lib/eventBus'

type SortOption = 'alphabetical' | 'category'

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'alphabetical', label: 'Alfabético' },
  { value: 'category', label: 'Categoria' },
]

function App() {
  const { channels: allChannels, categories, loading } = useChannelsData()

  const channels = useMemo(
    () => allChannels.filter((ch: Channel) => ch.active),
    [allChannels]
  )

  useEffect(() => {
    if (!loading) {
      eventBus.emit('app:loaded', {
        channels: channels.length,
        categories: categories.length,
        timestamp: Date.now(),
      })
    }
  }, [loading, channels.length, categories.length])

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('alphabetical')

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    eventBus.emit('search:changed', { query })
  }

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort)
    eventBus.emit('sort:changed', { sortBy: newSort })
  }
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const { recentChannels, addRecentChannel, clearRecentChannels } = useRecentChannels()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { id: channelIdParam } = useParams()

  const handleReload = useCallback(() => {
    eventBus.emit('app:reloaded', { reason: 'manual' })
    clearRecentChannels()
    window.location.reload()
  }, [clearRecentChannels])

  useEffect(() => {
    if (channelIdParam && !loading && !activeChannel) {
      const channel = channels.find(ch => ch.id === channelIdParam)
      if (channel) {
        addRecentChannel(channel)
        const redirectUrl = channel.alternativeUrls.find(u => u.type === 'redirect')
        if (redirectUrl) {
          window.open(redirectUrl.url, '_blank')
        }
        setActiveChannel(channel)
      }
    } else if (!channelIdParam && activeChannel) {
      setActiveChannel(null)
    }
  }, [channelIdParam, channels, loading, activeChannel, addRecentChannel])

  const filteredChannels = useMemo(() => {
    const base = channels.filter(channel =>
      channel.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    switch (sortBy) {
      case 'alphabetical':
        return [...base].sort((a, b) => a.title.localeCompare(b.title))
      case 'category':
        return [...base].sort((a, b) => {
          const aCat = categories.find(c => (a.categoryIds || []).includes(c.id))?.name || ''
          const bCat = categories.find(c => (b.categoryIds || []).includes(c.id))?.name || ''
          return aCat.localeCompare(bCat) || a.title.localeCompare(b.title)
        })
    }
  }, [channels, searchQuery, sortBy, categories])

  const displayedChannels = filteredChannels
  const allChannelsCount = displayedChannels.length
  const visibleRecent = searchQuery.trim() === '' ? recentChannels : []
  const recentCount = visibleRecent.length

  const handleClose = useCallback(() => {
    setActiveChannel(null)
    if (channelIdParam) {
      navigate('/', { replace: true })
    }
  }, [channelIdParam, navigate])

  const handleChannelClick = useCallback((channel: Channel) => {
    addRecentChannel(channel)
    if (!channelIdParam) {
      navigate(`/channel/${channel.id}`)
    }

    const iframeUrls = channel.alternativeUrls.filter(u => u.type === 'iframe')
    const redirectUrl = channel.alternativeUrls.find(u => u.type === 'redirect')

    const hasIframe = iframeUrls.length > 0
    const hasRedirect = !!redirectUrl

    eventBus.emit('channel:clicked', {
      id: channel.id,
      name: channel.title,
      type: hasIframe && hasRedirect ? 'mixed' : hasIframe ? 'iframe' : 'redirect'
    })

    if (hasRedirect && window.WebTV?.scripts) {
      const url = redirectUrl.url
      const scriptsForUrl = window.WebTV.scripts.getScriptsForUrl(url)

      if (scriptsForUrl.length > 0) {
        console.log(`[App] Preloading ${scriptsForUrl.length} scripts for redirect URL:`, url)
        eventBus.emit('scripts:preloaded', {
          url,
          scripts: scriptsForUrl.map(s => ({
            id: s.id,
            name: s.name,
            code: s.code,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
          }))
        })
      }
    }

    if (hasIframe) {
      setActiveChannel(channel)
    } else if (redirectUrl) {
      setTimeout(() => {
        window.open(redirectUrl.url, '_blank')
      }, 100)
    }
  }, [addRecentChannel, channelIdParam, navigate])

  const zones: Zone[] = recentCount > 0
    ? ['toolbar', 'sortTabs', 'recentGrid', 'allGrid']
    : ['toolbar', 'sortTabs', 'allGrid']

  const getZoneConfig = useCallback((zone: Zone) => {
    switch (zone) {
      case 'toolbar':
        return { columns: 2, itemsCount: 2 }
      case 'sortTabs':
        return { columns: sortOptions.length, itemsCount: sortOptions.length }
      case 'recentGrid':
        return { columns: 4, itemsCount: recentCount }
      case 'allGrid':
        return { columns: 4, itemsCount: allChannelsCount }
      default:
        return { columns: 4, itemsCount: 0 }
    }
  }, [recentCount, allChannelsCount])

  const onActivate = useCallback((zone: Zone, index: number) => {
    switch (zone) {
      case 'toolbar':
        if (index === 0 && searchInputRef.current) {
          searchInputRef.current.focus()
        } else if (index === 1) {
          setShowConfirmModal(true)
        }
        break
      case 'sortTabs':
        setSortBy(sortOptions[index].value as SortOption)
        break
      case 'recentGrid': {
        const channel = visibleRecent[index]
        if (channel) handleChannelClick(channel)
        break
      }
      case 'allGrid': {
        const channel = displayedChannels[index]
        if (channel) handleChannelClick(channel)
        break
      }
    }
  }, [displayedChannels, visibleRecent, handleChannelClick])

  const { activeZone, focusedIndex } = useDpadNavigation({
    zones,
    getZoneConfig,
    onActivate,
    isPaused: showConfirmModal
  })

  useEffect(() => {
    if (activeZone === 'toolbar' && focusedIndex === 0 && searchInputRef.current) {
      searchInputRef.current.focus()
    } else if (searchInputRef.current) {
      searchInputRef.current.blur()
    }
  }, [activeZone, focusedIndex])

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
      <div className="max-w-7xl mx-auto p-3 pb-16 sm:p-4 sm:pb-20 md:p-6 md:pb-24">
          <div className="mb-3 sm:mb-4 md:mb-6 space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex-grow">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 sm:pl-6 pointer-events-none">
                    <ShimmerPlaceholder width="20px" height="20px" className="sm:w-6 sm:h-6" rounded="sm" />
                  </div>
                  <div className="w-full py-3 sm:py-4 pl-12 sm:pl-16 pr-4 sm:pr-6">
                    <ShimmerPlaceholder width="100%" height="1.25rem" className="sm:h-[1.375rem]" rounded="md" />
                  </div>
                </div>
              </div>
              <ShimmerPlaceholder width="2.5rem" height="2.5rem" className="sm:w-12 sm:h-12" rounded="full" />
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <ShimmerPlaceholder width="4.5rem" height="1rem" className="sm:w-20 sm:h-5" rounded="sm" />
              <div className="flex gap-2">
                <ShimmerPlaceholder width="5rem" height="2rem" className="sm:w-24 sm:h-10" rounded="lg" />
                <ShimmerPlaceholder width="4rem" height="2rem" className="sm:w-20 sm:h-10" rounded="lg" />
              </div>
            </div>
          </div>
          <ChannelGridSkeleton count={12} />
        </div>
      </div>
    )
  }

  if (activeChannel && activeChannel.alternativeUrls.some(u => u.type === 'iframe')) {
    return (
      <PlayerModal
        channel={activeChannel}
        onClose={handleClose}
      />
    )
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {showConfirmModal && (
        <ConfirmModal
          onConfirm={handleReload}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
      <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6">
        <div className="mb-3 sm:mb-4 md:mb-6 space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex-grow">
              <SearchBar
                ref={searchInputRef}
                value={searchQuery}
                onChange={handleSearchChange}
                isFocused={activeZone === 'toolbar' && focusedIndex === 0}
              />
            </div>
            <button
              onClick={() => setShowConfirmModal(true)}
              onMouseDown={(e) => e.preventDefault()}
              className={`
                shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center
                transition-all duration-150
                ${activeZone === 'toolbar' && focusedIndex === 1 ? 'ring-4 ring-primary border-primary text-primary' : 'text-gray-400'}
              `}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
            <SortTabs
              options={sortOptions}
              selectedValue={sortBy}
              onSelect={(value) => handleSortChange(value as SortOption)}
              active={activeZone === 'sortTabs'}
              focusedIndex={focusedIndex}
            />
        </div>

        {searchQuery && (
          <div className="mb-4">
            <h2 className="text-2xl text-white font-bold">
              Resultados para "{searchQuery}"
            </h2>
          </div>
        )}

        {!searchQuery && visibleRecent.length > 0 && (
          <>
            <div className="mb-4">
              <h2 className="text-2xl text-white font-bold">Recentes</h2>
            </div>
            <ChannelGrid
              channels={visibleRecent}
              categories={categories}
              active={activeZone === 'recentGrid'}
              focusedIndex={focusedIndex}
              onChannelClick={handleChannelClick}
            />
          </>
        )}

        {!searchQuery && (
          <div className={`mb-4 ${visibleRecent.length > 0 ? 'mt-6' : ''}`}>
            <h2 className="text-2xl text-white font-bold">Todos os Canais</h2>
          </div>
        )}

        {displayedChannels.length > 0 ? (
          <ChannelGrid
            channels={displayedChannels}
            categories={categories}
            active={activeZone === 'allGrid'}
            focusedIndex={focusedIndex}
            onChannelClick={handleChannelClick}
          />
        ) : (
          <FeedbackMessage type="info" message={searchQuery ? "Nenhum canal encontrado." : "Sem canais disponíveis."} />
        )}
      </div>
    </div>
  )
}

export default App
