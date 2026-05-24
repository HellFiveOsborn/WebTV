import { Script } from './script'

export type ChannelType = 'iframe' | 'redirect'

export interface AlternativeUrl {
  url: string
  type: ChannelType
}

export interface Category {
  id: string
  name: string
}

export interface Channel {
  id: string
  title: string
  logoUrl: string
  categoryIds: string[]
  active: boolean
  alternativeUrls: AlternativeUrl[]
}

export interface ChannelsData {
  categories: Category[]
  channels: Channel[]
  scripts?: Script[]
}
