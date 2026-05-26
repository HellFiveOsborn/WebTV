export interface Script {
  id: string
  name: string
  domain: string
  subdomains: string[]
  code: string
  enabled: boolean
  createdAt: number
  updatedAt: number
  domains?: string[]
  urls?: string[]
  channelIds?: string[]
}

export interface DomainGroup {
  domain: string
  subdomains: string[]
  urls: string[]
}
