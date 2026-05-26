import { useState, useMemo, useCallback, useEffect } from 'react'
import { SearchBar } from './components/SearchBar'
import { SortTabs } from './components/SortTabs'
import { ChannelGrid } from './components/ChannelGrid'
import { ShimmerPlaceholder, ChannelGridSkeleton } from './components/ShimmerPlaceholder'
import { FeedbackMessage } from './components/FeedbackMessage'
import { PlayerModal } from './components/PlayerModal'
import { ConfirmModal } from './components/ConfirmModal'
import { FocusProvider, useFocusable } from './hooks/FocusContext'
import { useRecentChannels, RecentChannel } from './hooks/useRecentChannels'
import { useChannelsData } from './hooks/useChannelsData'
import { Channel } from './types/channel'
import { ChannelTransition } from './components/ChannelTransition'
import { useNavigate, useParams } from 'react-router-dom'
import { eventBus } from './lib/eventBus'

type SortOption = 'alphabetical' | 'category'

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'alphabetical', label: 'Alfabético' },
  { value: 'category', label: 'Categoria' },
]

const ReloadButton = ({ onClick }: { onClick: () => void }) => {
  const { ref, isFocused } = useFocusable('toolbar', 1)
  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      tabIndex={-1}
      className={`shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center transition-all duration-150 text-gray-400 hover:text-primary hover:border-primary ${isFocused ? 'ring-4 ring-primary text-primary border-primary' : ''}`}
    >
      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  )
}

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
  const [channelTransition, setChannelTransition] = useState<Channel | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const { recentChannels, addRecentChannel, clearRecentChannels } = useRecentChannels()

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
        const iframeUrls = channel.alternativeUrls.filter(u => u.type === 'iframe')

        eventBus.emit('channel:clicked', {
          id: channel.id,
          name: channel.title,
          type: iframeUrls.length > 0 && redirectUrl ? 'mixed' : redirectUrl ? 'redirect' : 'iframe'
        })

        if (redirectUrl) {
          setChannelTransition(channel)
          window.open(redirectUrl.url, '_blank')
        }
        setActiveChannel(channel)
      }
    } else if (!channelIdParam && activeChannel) {
      setActiveChannel(null)
    }
  }, [channelIdParam, channels, loading, activeChannel, addRecentChannel])

  const getCategoryIndex = (categoryId: string) => {
    const idx = categories.findIndex(c => c.id === categoryId)
    return idx === -1 ? Infinity : idx
  }

  const getPrimaryCategoryIndex = (channel: Channel) => {
    const ids = channel.categoryIds || []
    if (ids.length === 0) return Infinity
    return Math.min(...ids.map(getCategoryIndex))
  }

  const filteredChannels = useMemo(() => {
    const base = channels.filter(channel =>
      channel.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    switch (sortBy) {
      case 'alphabetical':
        return [...base].sort((a, b) => a.title.localeCompare(b.title))
      case 'category':
        return [...base].sort((a, b) => {
          const aIdx = getPrimaryCategoryIndex(a)
          const bIdx = getPrimaryCategoryIndex(b)
          return aIdx - bIdx || a.title.localeCompare(b.title)
        })
      default:
        return base
    }
  }, [channels, searchQuery, sortBy, categories])

  interface Section {
    key: string
    label: string
    channels: Channel[]
    renderHeader: boolean
  }

  const { gridSections, gridSectionStarts, gridTotalItems } = useMemo(() => {
    const sections: Section[] = []

    if (!searchQuery && sortBy === 'alphabetical' && recentChannels.length > 0) {
      const recentSorted = recentChannels
        .map(rc => [...channels].find(ch => ch.id === rc.id))
        .filter((ch): ch is Channel => !!ch)
        .sort((a, b) => {
          const aTime = recentChannels.find(rc => rc.id === a.id)?.openedAt ?? 0
          const bTime = recentChannels.find(rc => rc.id === b.id)?.openedAt ?? 0
          return bTime - aTime
        })
        .slice(0, 4)
      sections.push({ key: 'recent', label: 'Recentes', channels: recentSorted, renderHeader: recentSorted.length > 0 })
    }

    if (!searchQuery) {
      if (sortBy === 'category') {
        const groups = new Map<string, Channel[]>()
        filteredChannels.forEach(channel => {
          const catNames = (channel.categoryIds || [])
            .map(id => categories.find(c => c.id === id)?.name)
            .filter((n): n is string => !!n)
          if (catNames.length > 0) {
            for (const name of catNames) {
              const group = groups.get(name)
              if (group) group.push(channel)
              else groups.set(name, [channel])
            }
          } else {
            const group = groups.get('Outros')
            if (group) group.push(channel)
            else groups.set('Outros', [channel])
          }
        })
        Array.from(groups.entries())
          .sort(([, a], [, b]) => {
            const ai = getPrimaryCategoryIndex(a[0])
            const bi = getPrimaryCategoryIndex(b[0])
            return ai - bi || a[0].title.localeCompare(b[0].title)
          })
          .forEach(([name, chs]) => {
            sections.push({ key: name, label: name, channels: chs, renderHeader: true })
          })
      } else {
        sections.push({ key: 'all', label: 'Todos os Canais', channels: filteredChannels, renderHeader: true })
      }
    } else {
      sections.push({ key: 'search', label: `Resultados para "${searchQuery}"`, channels: filteredChannels, renderHeader: false })
    }

    const starts: number[] = []
    let offset = 0
    for (const s of sections) {
      starts.push(offset)
      offset += s.channels.length
    }
    return { gridSections: sections, gridSectionStarts: starts, gridTotalItems: offset }
  }, [searchQuery, sortBy, recentChannels, filteredChannels, categories])

  const recentChannelsMap = useMemo(() => {
    const map = new Map<string, RecentChannel>()
    for (const rc of recentChannels) {
      map.set(rc.id, rc)
    }
    return map
  }, [recentChannels])

  const handleClose = useCallback(() => {
    setActiveChannel(null)
    setChannelTransition(null)
    if (channelIdParam) {
      navigate('/')
    }
  }, [channelIdParam, navigate])

  const handleChannelClick = useCallback((channel: Channel) => {
    addRecentChannel(channel)

    const redirectUrl = channel.alternativeUrls.find(u => u.type === 'redirect')
    const hasIframe = channel.alternativeUrls.some(u => u.type === 'iframe')
    const hasRedirect = !!redirectUrl

    if (hasRedirect && !hasIframe) {
      setChannelTransition(channel)
    }

    if (!channelIdParam || channelIdParam !== channel.id) {
      navigate(`/channel/${channel.id}`)
      return
    }

    if (!activeChannel) {
      setActiveChannel(channel)
    }

    eventBus.emit('channel:clicked', {
      id: channel.id,
      name: channel.title,
      type: hasIframe && hasRedirect ? 'mixed' : hasIframe ? 'iframe' : 'redirect'
    })

    if (hasIframe) {
      setActiveChannel(channel)
      const iframeUrl = channel.alternativeUrls.find(u => u.type === 'iframe')
      if (iframeUrl) {
        eventBus.emit('player:opened', {
          channelId: channel.id,
          channelName: channel.title,
          url: iframeUrl.url
        })
      }
    } else if (redirectUrl) {
      setTimeout(() => {
        window.open(redirectUrl.url, '_blank')
      }, 100)
    }
  }, [addRecentChannel, channelIdParam, navigate])

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
          <ChannelGridSkeleton />
        </div>
      </div>
    )
  }

  if (channelTransition) {
    return <ChannelTransition channel={channelTransition} />
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
    <FocusProvider isPaused={showConfirmModal}>
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
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
              </div>
              <ReloadButton onClick={() => setShowConfirmModal(true)} />
            </div>
            <SortTabs
              options={sortOptions}
              selectedValue={sortBy}
              onSelect={(value) => handleSortChange(value as SortOption)}
            />
          </div>

          {searchQuery && (
            <div className="mb-4">
              <h2 className="text-2xl text-white font-bold">
                Resultados para "{searchQuery}"
              </h2>
            </div>
          )}

          {gridSections.map((section, secIdx) => (
            <div key={section.key} className="mb-6">
              {section.renderHeader && (
                <div className="mb-3">
                  <h2 className="text-2xl text-white font-bold">{section.label}</h2>
                </div>
              )}
              <ChannelGrid
                channels={section.channels}
                categories={categories}
                onChannelClick={handleChannelClick}
                recentChannelsMap={recentChannelsMap}
                startIndex={gridSectionStarts[secIdx]}
                zone="channelsGrid"
              />
            </div>
          ))}

          {gridTotalItems === 0 && (
            <FeedbackMessage type="info" message={searchQuery ? "Nenhum canal encontrado." : "Sem canais disponíveis."} />
          )}
        </div>
      </div>
    </FocusProvider>
  )
}

export default App
