export interface WebTVEvent<T = any> {
  type: string
  timestamp: number
  payload: T
}

export interface AppLoadedPayload {
  channels: number
  categories: number
  timestamp: number
}

export interface AppReloadedPayload {
  reason: 'manual'
}

export interface ChannelClickedPayload {
  id: string
  name: string
  type: 'iframe' | 'redirect' | 'mixed'
  channels?: import('../types/channel').Channel[]
}

export interface PlayerOpenedPayload {
  channelId: string
  channelName: string
  url: string
}

export interface PlayerClosedPayload {
  channelId: string
  channelName: string
}

export interface PlayerBackupSelectedPayload {
  channelId: string
  index: number
  url: string
}

export interface SearchChangedPayload {
  query: string
}

export interface SortChangedPayload {
  sortBy: 'alphabetical' | 'recent' | 'category'
}

export interface CategoryChangedPayload {
  categoryId: string | null
  categoryName: string
}

export interface FocusChangedPayload {
  elementId: string | null
  elementType: string
  coordinates: { x: number; y: number; width: number; height: number }
}

export interface ScrollMovedPayload {
  x: number
  y: number
  element: 'window' | string
}

export interface ScriptRetrievedPayload {
  url: string
  scripts: Array<{
    id: string
    name: string
    code: string
    createdAt: number
    updatedAt: number
  }>
}

export interface ScriptsPreloadedPayload {
  url: string
  scripts: Array<{
    id: string
    name: string
    code: string
    createdAt: number
    updatedAt: number
  }>
}

export interface ScriptsLoadedPayload {
  scripts: Array<{
    id: string
    name: string
    code: string
    domains: string[]
    urls: string[]
    channelIds?: string[]
  }>
}

export interface ChannelClosingPayload {}

export interface ChannelClosedPayload {
  channelId: string
  channelName: string
  timestamp: number
}

export interface NavigatedHomePayload {
  timestamp: number
}

export interface EventHandlers {
  'app:loaded': AppLoadedPayload
  'app:reloaded': AppReloadedPayload
  'channel:clicked': ChannelClickedPayload
  'channel:closing': ChannelClosingPayload
  'channel:close': ChannelClosedPayload
  'player:opened': PlayerOpenedPayload
  'player:closed': PlayerClosedPayload
  'player:backupSelected': PlayerBackupSelectedPayload
  'search:changed': SearchChangedPayload
  'sort:changed': SortChangedPayload
  'category:changed': CategoryChangedPayload
  'focus:changed': FocusChangedPayload
  'scroll:moved': ScrollMovedPayload
  'script:retrieved': ScriptRetrievedPayload
  'scripts:loaded': ScriptsLoadedPayload
  'navigated:home': NavigatedHomePayload
}

export type EventType = keyof EventHandlers
