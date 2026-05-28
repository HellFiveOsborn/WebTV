import { useState, useEffect, useCallback, useRef } from 'react'
import { Channel, Category, ChannelsData } from '../types/channel'
import { Script } from '../types/script'
import { defaultChannelsData } from '../data/defaultChannels'
import { ScriptManager } from '../lib/scriptManager'
import { eventBus } from '../lib/eventBus'
import { extractDomainGroups } from '../utils/urlUtils'
import { fetchGistData, saveGistData, hasToken, getToken } from '../lib/gistApi'

const LOCAL_JSON_URL = `${import.meta.env.BASE_URL}data/channels.json`

const recalcScriptChannelIds = (scripts: Script[], channels: Channel[]): Script[] => {
  const allUrls = channels.flatMap(ch => ch.alternativeUrls.map(alt => alt.url))
  const domainGroups = extractDomainGroups(allUrls)

  return scripts.map(script => {
    const currentUrls = domainGroups.find(g => g.domain === script.domain)?.urls || []

    const selectedUrls = currentUrls.filter(url => {
      if (!script.subdomains || script.subdomains.length === 0) return true
      return script.subdomains.some((sub: string) =>
        url.includes(`://${sub}.`) || url.includes(`://${sub}/`)
      )
    })

    const matchingChannelIds = channels
      .filter(ch => ch.alternativeUrls.some(alt => selectedUrls.includes(alt.url)))
      .map(ch => ch.id)

    if (matchingChannelIds.length === 0 && !script.channelIds) return script

    return {
      ...script,
      channelIds: matchingChannelIds.length > 0 ? matchingChannelIds : undefined
    }
  })
}

export type SyncStatus = 'saved' | 'saving' | 'error' | 'idle'

export const useChannelsData = () => {
  const [channels, setChannels] = useState<Channel[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const isInitialLoad = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchGistData()
        setChannels(data.channels)
        setCategories(data.categories)
        setScripts(data.scripts || [])
        setLoading(false)
        return
      } catch {
        console.warn('Gist não disponível, tentando arquivo local')
      }

      try {
        const response = await fetch(LOCAL_JSON_URL)
        if (!response.ok) throw new Error('Falha ao carregar channels.json')
        const data: ChannelsData = await response.json()
        setChannels(data.channels)
        setCategories(data.categories)
        setScripts(data.scripts || [])
      } catch {
        console.warn('Arquivo local não encontrado, usando dados padrão')
        setChannels(defaultChannelsData.channels)
        setCategories(defaultChannelsData.categories)
        setScripts([])
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (loading) return

    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    if (!hasToken()) return

    if (saveTimer.current) clearTimeout(saveTimer.current)

    setSyncStatus('saving')

    saveTimer.current = setTimeout(async () => {
      const data: ChannelsData = { channels, categories, scripts }
      const result = await saveGistData(data, getToken()!)

      if (result.ok) {
        setSyncStatus('saved')
      } else {
        console.warn('Falha ao salvar no Gist:', result.error)
        setSyncStatus('error')
      }
    }, 1000)

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [channels, categories, scripts, loading])

  useEffect(() => {
    if (!loading && channels.length > 0) {
      const manager = new ScriptManager(channels)
      
      scripts.forEach(script => {
        manager.addScript(script, script.domains || [], script.urls || [])
      })
      
if (typeof window !== 'undefined' && window.WebTV) {
          window.WebTV.scriptManager = manager

          eventBus.emit('scripts:loaded', {
            scripts: scripts.map(s => ({
              id: s.id,
              name: s.name,
              code: s.code,
              domains: [...(s.domains || [])],
              urls: [...(s.urls || [])],
              channelIds: s.channelIds ? [...s.channelIds] : undefined
            }))
          })
        }
    }
  }, [channels, scripts, loading])

  const addChannel = useCallback((channel: Omit<Channel, 'id'>) => {
    setChannels(prev => {
      const newChannels = [...prev, { ...channel, id: Date.now().toString() }]
      setScripts(prevScripts => recalcScriptChannelIds(prevScripts, newChannels))
      return newChannels
    })
  }, [])

  const updateChannel = useCallback((id: string, updates: Partial<Channel>) => {
    setChannels(prev => {
      const newChannels = prev.map(ch => ch.id === id ? { ...ch, ...updates } : ch)
      setScripts(prevScripts => recalcScriptChannelIds(prevScripts, newChannels))
      return newChannels
    })
  }, [])

  const deleteChannel = useCallback((id: string) => {
    setChannels(prev => {
      const newChannels = prev.filter(ch => ch.id !== id)
      setScripts(prevScripts => recalcScriptChannelIds(prevScripts, newChannels))
      return newChannels
    })
  }, [])

  const toggleChannelActive = useCallback((id: string) => {
    setChannels(prev => prev.map(ch =>
      ch.id === id ? { ...ch, active: !ch.active } : ch
    ))
  }, [])

  const reorderChannels = useCallback((fromIndex: number, toIndex: number) => {
    setChannels(prev => {
      const newChannels = [...prev]
      const [movedChannel] = newChannels.splice(fromIndex, 1)
      newChannels.splice(toIndex, 0, movedChannel)
      return newChannels
    })
  }, [])

  const reorderCategories = useCallback((fromIndex: number, toIndex: number) => {
    setCategories(prev => {
      const newCategories = [...prev]
      const [movedCategory] = newCategories.splice(fromIndex, 1)
      newCategories.splice(toIndex, 0, movedCategory)
      return newCategories
    })
  }, [])

  const addCategory = useCallback((name: string) => {
    const newCategory: Category = {
      id: Date.now().toString(),
      name,
    }
    setCategories(prev => [...prev, newCategory])
  }, [])

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    setCategories(prev => prev.map(cat => cat.id === id ? { ...cat, ...updates } : cat))
  }, [])

  const deleteCategory = useCallback((id: string) => {
    setCategories(prev => prev.filter(cat => cat.id !== id))
    setChannels(prev => prev.map(ch => ({
      ...ch,
      categoryIds: (ch.categoryIds || []).filter(catId => catId !== id),
    })))
  }, [])

  const exportData = useCallback(() => {
    const data: ChannelsData = { channels, categories, scripts }
    const jsonString = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'channels.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [channels, categories, scripts])

  const copyJSON = useCallback(() => {
    const data: ChannelsData = { channels, categories, scripts }
    const jsonString = JSON.stringify(data, null, 2)
    navigator.clipboard.writeText(jsonString)
  }, [channels, categories, scripts])

  const addScript = useCallback((script: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newScript: Script = {
      ...script,
      id: Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setScripts(prev => [...prev, newScript])
  }, [])

  const updateScript = useCallback((id: string, updates: Partial<Script>) => {
    setScripts(prev => prev.map(s =>
      s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
    ))
  }, [])

  const deleteScript = useCallback((id: string) => {
    setScripts(prev => prev.filter(s => s.id !== id))
  }, [])

  const saveNow = useCallback(async () => {
    if (!hasToken()) return
    setSyncStatus('saving')
    const data: ChannelsData = { channels, categories, scripts }
    const result = await saveGistData(data, getToken()!)
    setSyncStatus(result.ok ? 'saved' : 'error')
  }, [channels, categories, scripts])

  return {
    channels,
    categories,
    scripts,
    loading,
    syncStatus,
    addChannel,
    updateChannel,
    deleteChannel,
    toggleChannelActive,
    reorderChannels,
    reorderCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    addScript,
    updateScript,
    deleteScript,
    exportData,
    copyJSON,
    saveNow,
  }
}
