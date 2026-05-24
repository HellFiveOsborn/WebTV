import { DomainGroup } from '../types/script'

export interface ParsedUrl {
  hostname: string
  subdomain: string
  domain: string
}

export function parseUrl(url: string): ParsedUrl | null {
  try {
    const parsed = new URL(url)
    let hostname = parsed.hostname

    const portMatch = hostname.match(/^(.+?):\d+$/)
    if (portMatch) hostname = portMatch[1]

    const parts = hostname.split('.')

    if (parts.length < 2) return null

    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return { hostname, subdomain: '', domain: hostname }
    }

    if (parts.length === 2) {
      return { hostname, subdomain: '', domain: hostname }
    }

    const domain = parts.slice(-2).join('.')
    const subdomain = parts.slice(0, -2).join('.')

    return { hostname, subdomain, domain }
  } catch {
    return null
  }
}

export function extractDomainGroups(urls: string[]): DomainGroup[] {
  const domainMap = new Map<string, { subdomains: Set<string>; urls: Set<string> }>()

  for (const url of urls) {
    const parsed = parseUrl(url)
    if (!parsed) continue

    if (!domainMap.has(parsed.domain)) {
      domainMap.set(parsed.domain, { subdomains: new Set(), urls: new Set() })
    }

    const group = domainMap.get(parsed.domain)!

    if (parsed.subdomain) {
      group.subdomains.add(parsed.subdomain)
    }
    group.urls.add(url)
  }

  const result: DomainGroup[] = []
  for (const [domain, data] of domainMap.entries()) {
    result.push({
      domain,
      subdomains: Array.from(data.subdomains).sort(),
      urls: Array.from(data.urls).sort()
    })
  }

  return result.sort((a, b) => a.domain.localeCompare(b.domain))
}

export function getUrlsForDomainAndSubdomains(
  domainGroups: DomainGroup[],
  domain: string,
  subdomains: string[]
): string[] {
  const group = domainGroups.find(g => g.domain === domain)
  if (!group) return []

  if (subdomains.length === 0) return [...group.urls]

  return group.urls.filter(url => {
    const parsed = parseUrl(url)
    if (!parsed) return false
    return subdomains.includes(parsed.subdomain)
  })
}
