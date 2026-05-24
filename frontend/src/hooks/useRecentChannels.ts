import { useState, useEffect } from 'react'
import { Channel } from '../types/channel'
import { getItem, setItem } from '../lib/storage'

export interface RecentChannel extends Channel {
  openedAt: number
}

const RECENT_CHANNELS_KEY = 'webtv_recent_channels'
const MAX_RECENT_CHANNELS = 6

export const useRecentChannels = () => {
  const [recentChannels, setRecentChannels] = useState<RecentChannel[]>([])

  useEffect(() => {
    const stored = getItem<RecentChannel[]>(RECENT_CHANNELS_KEY)
    if (stored) {
      setRecentChannels(stored)
    }
  }, [])

  const addRecentChannel = (channel: Channel) => {
    setRecentChannels(prev => {
      const filtered = prev.filter(c => c.id !== channel.id)
      const updated = [{ ...channel, openedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT_CHANNELS)
      setItem(RECENT_CHANNELS_KEY, updated)
      return updated
    })
  }

  const clearRecentChannels = () => {
    setRecentChannels([])
    setItem(RECENT_CHANNELS_KEY, [])
  }

  return {
    recentChannels,
    addRecentChannel,
    clearRecentChannels,
  }
}
