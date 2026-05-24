import { Channel } from '../types/channel'
import { parseUrl } from '../utils/urlUtils'
import { eventBus } from './eventBus'

export interface Script {
  id: string
  name: string
  code: string
  createdAt: number
  updatedAt: number
}

export interface ScriptFilter {
  domain?: string
  url?: string
  name?: string
}

export class ScriptManager {
  private scripts: Map<string, Script> = new Map()
  private scriptDomains: Map<string, Set<string>> = new Map()
  private scriptUrls: Map<string, Set<string>> = new Map()

  constructor(_channels: Channel[]) {}

  addScript(script: Script, domains: string[] = [], urls: string[] = []) {
    this.scripts.set(script.id, script)
    
    const scriptDomainSet = new Set(domains)
    this.scriptDomains.set(script.id, scriptDomainSet)
    
    const scriptUrlSet = new Set(urls)
    this.scriptUrls.set(script.id, scriptUrlSet)
  }

  updateScript(id: string, data: Partial<Script>) {
    const existing = this.scripts.get(id)
    if (existing) {
      this.scripts.set(id, { ...existing, ...data, updatedAt: Date.now() })
    }
  }

  deleteScript(id: string) {
    this.scripts.delete(id)
    this.scriptDomains.delete(id)
    this.scriptUrls.delete(id)
  }

  getScript(id: string): Script | undefined {
    return this.scripts.get(id)
  }

  getAllScripts(): Script[] {
    return Array.from(this.scripts.values())
  }

  getScriptsForUrl(url: string): Script[] {
    const parsed = parseUrl(url)
    const domain = parsed?.domain
    const matchingScripts: Script[] = []

    for (const [scriptId, script] of this.scripts.entries()) {
      const domains = this.scriptDomains.get(scriptId) || new Set()
      const urls = this.scriptUrls.get(scriptId) || new Set()

      const matchesDomain = domain && domains.has(domain)
      const matchesUrl = urls.has(url)

      if (matchesDomain || matchesUrl) {
        matchingScripts.push(script)
      }
    }

    eventBus.emit('script:retrieved', {
      url,
      scripts: matchingScripts.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    })

    return matchingScripts
  }

  getScriptsByFilter(filter: ScriptFilter): Script[] {
    const results: Script[] = []

    for (const [scriptId, script] of this.scripts.entries()) {
      const domains = this.scriptDomains.get(scriptId) || new Set()
      const urls = this.scriptUrls.get(scriptId) || new Set()

      let matches = true

      if (filter.domain && !domains.has(filter.domain)) {
        matches = false
      }

      if (filter.url && !urls.has(filter.url)) {
        matches = false
      }

      if (filter.name && !script.name.toLowerCase().includes(filter.name.toLowerCase())) {
        matches = false
      }

      if (matches) {
        results.push(script)
      }
    }

    return results
  }
}
