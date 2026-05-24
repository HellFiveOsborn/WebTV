import { useEffect, useRef } from 'react'
import { Channel, Category } from '../types/channel'
import { RecentChannel } from '../hooks/useRecentChannels'
import { formatRelativeTime } from '../utils/formatRelativeTime'

interface ChannelCardProps {
  channel: Channel
  categories: Category[]
  isFocused: boolean
  onClick: (channel: Channel) => void
  'data-zone'?: string
  'data-index'?: number
  recentInfo?: RecentChannel
}

export const ChannelCard = ({ channel, categories, isFocused, onClick, 'data-zone': dataZone, 'data-index': dataIndex, recentInfo }: ChannelCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isFocused && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      const isFullyVisible = rect.top >= 0 && rect.bottom <= viewportHeight

      if (!isFullyVisible) {
        cardRef.current.scrollIntoView({
          behavior: 'auto',
          block: 'nearest'
        })
      }
    }
  }, [isFocused])

  const categoryNames = (channel.categoryIds || [])
    .map(id => categories.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  return (
    <div
      ref={cardRef}
      data-zone={dataZone}
      data-index={dataIndex}
      onClick={() => onClick(channel)}
      className={`
        bg-dark-surface rounded-lg overflow-hidden cursor-pointer
        transition-all duration-200 ease-in-out
        ${isFocused ? 'scale-105 ring-4 ring-primary shadow-focus' : 'hover:scale-105'}
      `}
    >
      <div className="aspect-video bg-dark-border flex items-center justify-center relative">
        <img
          src={channel.logoUrl}
          alt={channel.title}
          loading="lazy"
          className="w-full h-full object-contain"
          onError={(e) => {
            e.currentTarget.src = `https://placehold.co/300x200/1e1e1e/3b82f6?text=${encodeURIComponent(channel.title)}`
          }}
        />
        {recentInfo?.openedAt && (
          <span className="absolute top-2 right-2 flex items-center gap-1 bg-primary/90 text-white text-xs font-medium px-2 py-1 rounded-full shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatRelativeTime(recentInfo.openedAt)}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-xl font-semibold text-white truncate">{channel.title}</h3>
        {categoryNames && (
          <p className="text-sm text-gray-400 mt-1">{categoryNames}</p>
        )}
      </div>
    </div>
  )
}
