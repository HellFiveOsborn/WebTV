import { Channel, Category } from '../types/channel'
import { ChannelCard } from './ChannelCard'
import { RecentChannel } from '../hooks/useRecentChannels'

interface ChannelGridProps {
  channels: Channel[]
  categories: Category[]
  active: boolean
  focusedIndex: number
  onChannelClick: (channel: Channel) => void
  recentChannelsMap?: Map<string, RecentChannel>
  zone?: string
}

export const ChannelGrid = ({ channels, categories, active, focusedIndex, onChannelClick, recentChannelsMap, zone = 'grid' }: ChannelGridProps) => {
  const isAllGrid = zone === 'allGrid'
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 px-2 sm:px-4 md:px-6">
        {channels.map((channel, index) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            categories={categories}
            isFocused={active && index === focusedIndex}
            onClick={() => onChannelClick(channel)}
            data-zone={zone}
            data-index={index}
            recentInfo={recentChannelsMap?.get(channel.id)}
          />
        ))}
      </div>
      {isAllGrid && <div className="h-4 sm:h-6 md:h-8" />}
    </>
  )
}
