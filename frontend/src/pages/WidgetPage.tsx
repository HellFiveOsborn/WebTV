import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Channel, ChannelsData } from '../types/channel'

type WidgetZone = 'widgetToggle' | 'widgetHeader' | 'widgetAltUrls'

function emitWidgetEvent(type: string, payload: Record<string, unknown>) {
  const events = (window.parent as any).WebTV?.events
  if (events && typeof events.emit === 'function') {
    events.emit(type, payload)
    console.log('[WebTV Widget] Emitted via parent.WebTV.events:', type, payload)
    return
  }

  window.parent.postMessage({
    source: 'webtv',
    type,
    payload
  }, '*')
  console.log('[WebTV Widget] Emitted via postMessage:', type, payload)
}

function emitResize(width: number, height: number) {
  window.parent.postMessage({
    source: 'webtv',
    name: 'widget:resize',
    payload: { width, height }
  }, '*')
}

export const WidgetPage = () => {
  const { channelId } = useParams<{ channelId: string }>()
  const [channel, setChannel] = useState<(Channel & { categoryName?: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [activeZone, setActiveZone] = useState<WidgetZone>('widgetToggle')
  const cardRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const altBtnRefs = useRef<Record<number, HTMLButtonElement>>({})

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.background = 'transparent'
  }, [])

  useEffect(() => {
    if (!channelId) return

    fetch(import.meta.env.BASE_URL + 'data/channels.json')
      .then(r => r.json())
      .then((data: ChannelsData) => {
        const ch = data.channels.find(c => c.id === channelId)
        if (ch) {
          const category = data.categories.find(cat => ch.categoryIds.includes(cat.id))
          setChannel({ ...ch, categoryName: category?.name })
        }
      })
      .catch(err => console.error('[WebTV Widget] Failed to fetch channels:', err))
      .finally(() => setLoading(false))
  }, [channelId])

  useLayoutEffect(() => {
    if (expanded && cardRef.current) {
      const h = cardRef.current.getBoundingClientRect().height
      emitResize(280, Math.ceil(h))
    } else if (!expanded) {
      emitResize(56, 56)
    }
  }, [expanded, channel])

  const handleAlternativeClick = useCallback((url: string, type: string) => {
    emitWidgetEvent('channel:alternative:selected', {
      channelId: channel?.id ?? '',
      channelTitle: channel?.title ?? '',
      url,
      type
    })
  }, [channel])

  const alternativeUrls = channel?.alternativeUrls || []
  const altTotal = alternativeUrls.length

  useLayoutEffect(() => {
    if (loading || !channel) return
    if (!expanded) return

    if (activeZone === 'widgetHeader' && closeBtnRef.current) {
      closeBtnRef.current.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    } else if (activeZone === 'widgetAltUrls' && altBtnRefs.current[focusedIndex]) {
      altBtnRefs.current[focusedIndex].scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [activeZone, focusedIndex, expanded, loading, channel])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || !channel) return

      const key = e.key

      if (!expanded) {
        if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Enter' || key === ' ') {
          e.preventDefault()
          setExpanded(true)
          setActiveZone('widgetHeader')
          setFocusedIndex(0)
          emitWidgetEvent('widget:expanded', {
            channelId: channel?.id ?? '',
            channelTitle: channel?.title ?? ''
          })
        }
        return
      }

      if (activeZone === 'widgetHeader') {
        if (key === 'ArrowDown') {
          e.preventDefault()
          if (altTotal > 0) {
            setActiveZone('widgetAltUrls')
            setFocusedIndex(0)
          }
        } else if (key === 'ArrowUp') {
          e.preventDefault()
        } else if (key === 'Enter' || key === ' ') {
          e.preventDefault()
          setExpanded(false)
          setActiveZone('widgetToggle')
          setFocusedIndex(0)
          emitWidgetEvent('widget:collapsed', {
            channelId: channel?.id ?? '',
            channelTitle: channel?.title ?? ''
          })
        } else if (key === 'Escape' || key === 'ArrowLeft') {
          e.preventDefault()
          setExpanded(false)
          setActiveZone('widgetToggle')
          setFocusedIndex(0)
        }
        return
      }

      if (activeZone === 'widgetAltUrls') {
        if (key === 'ArrowDown') {
          e.preventDefault()
          setFocusedIndex(prev => Math.min(prev + 1, altTotal - 1))
        } else if (key === 'ArrowUp') {
          e.preventDefault()
          if (focusedIndex === 0) {
            setActiveZone('widgetHeader')
            setFocusedIndex(0)
          } else {
            setFocusedIndex(prev => Math.max(prev - 1, 0))
          }
        } else if (key === 'Enter' || key === ' ') {
          e.preventDefault()
          const alt = alternativeUrls[focusedIndex]
          if (alt) {
            handleAlternativeClick(alt.url, alt.type)
          }
        } else if (key === 'Escape' || key === 'ArrowLeft') {
          e.preventDefault()
          setExpanded(false)
          setActiveZone('widgetToggle')
          setFocusedIndex(0)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expanded, activeZone, focusedIndex, altTotal, alternativeUrls, handleAlternativeClick, loading, channel])

  if (loading) {
    return (
      <div data-zone="widgetToggle" data-index={0} className="w-14 h-14 bg-dark-surface/60 backdrop-blur-sm rounded-2xl animate-pulse" />
    )
  }

  if (!channel) return null

  if (!expanded) {
    return (
      <button
        data-zone="widgetToggle"
        data-index={0}
        onClick={() => {
          setExpanded(true)
          setActiveZone('widgetHeader')
          setFocusedIndex(0)
          emitWidgetEvent('widget:expanded', {
            channelId: channel.id,
            channelTitle: channel.title
          })
        }}
        className="w-14 h-14 bg-dark-surface/95 backdrop-blur-sm text-text-primary rounded-2xl flex items-center justify-center transition-all duration-200 border-0 cursor-pointer hover:bg-dark-surface ring-4 ring-primary shadow-focus scale-105 active:scale-100"
        title={channel.title}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
    )
  }

  return (
    <div ref={cardRef} className="bg-dark-surface text-text-primary rounded-2xl shadow-focus overflow-hidden" style={{ width: 280 }}>
      <div className="px-4 py-3 flex items-center gap-3 border-b border-dark-border">
        <img
          src={channel.logoUrl}
          alt={channel.title}
          className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-dark-border"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{channel.title}</p>
          {channel.categoryName && (
            <p className="text-text-secondary text-xs truncate">{channel.categoryName}</p>
          )}
        </div>
        <button
          ref={closeBtnRef}
          data-zone="widgetHeader"
          data-index={0}
          onClick={() => {
            setExpanded(false)
            setActiveZone('widgetToggle')
            setFocusedIndex(0)
            emitWidgetEvent('widget:collapsed', {
              channelId: channel.id,
              channelTitle: channel.title
            })
          }}
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 border-0 cursor-pointer flex-shrink-0
            ${activeZone === 'widgetHeader' ? 'bg-primary text-white shadow-focus' : 'bg-dark-border text-text-secondary hover:bg-states-hover'}
          `}
          title="Fechar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {altTotal > 0 && (
        <div className="px-3 py-2">
          <p className="text-text-secondary text-xs font-semibold px-1 mb-1.5">URLs Alternativas</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {alternativeUrls.map((alt, i) => {
              const isFocused = activeZone === 'widgetAltUrls' && focusedIndex === i
              return (
                <button
                  key={i}
                  ref={(el) => { if (el) altBtnRefs.current[i] = el }}
                  data-zone="widgetAltUrls"
                  data-index={i}
                  onClick={() => handleAlternativeClick(alt.url, alt.type)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg transition-all duration-200 border-0 cursor-pointer flex items-center gap-2 group
                    ${isFocused ? 'bg-primary text-white shadow-focus' : 'bg-dark-border/50 hover:bg-states-hover text-text-primary'}
                  `}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors
                    ${isFocused ? 'bg-white' : alt.type === 'iframe' ? 'bg-primary' : 'bg-feedback-success'}
                  `} />
                  <span className={`text-xs truncate flex-1 transition-colors
                    ${isFocused ? 'text-white' : 'text-text-secondary group-hover:text-text-primary'}
                  `}>
                    {alt.url.replace(/^https?:\/\//, '')}
                  </span>
                  <span className={`text-[10px] uppercase flex-shrink-0 transition-colors
                    ${isFocused ? 'text-white/70' : 'text-text-secondary/50'}
                  `}>
                    {alt.type}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {altTotal === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-text-secondary text-xs">Nenhuma URL alternativa disponível</p>
        </div>
      )}
    </div>
  )
}