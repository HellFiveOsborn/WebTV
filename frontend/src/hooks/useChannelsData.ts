import { useState, useEffect, useCallback } from 'react'
import { Channel, Category, ChannelsData } from '../types/channel'
import { Script } from '../types/script'
import { defaultChannelsData } from '../data/defaultChannels'
import { ScriptManager } from '../lib/scriptManager'

const JSON_URL = `${import.meta.env.BASE_URL}data/channels.json`

export const useChannelsData = () => {
  const [channels, setChannels] = useState<Channel[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(JSON_URL)
        if (!response.ok) {
          throw new Error('Falha ao carregar channels.json')
        }
        const data: ChannelsData = await response.json()
        setChannels(data.channels)
        setCategories(data.categories)
        setScripts(data.scripts || [])
      } catch (err) {
        console.warn('channels.json não encontrado, usando dados padrão')
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
    if (!loading && channels.length > 0) {
      const manager = new ScriptManager(channels)
      
      scripts.forEach(script => {
        manager.addScript(script, script.domains || [], script.urls || [])
      })
      
      if (typeof window !== 'undefined' && window.WebTV) {
        window.WebTV.scripts = manager
      }
    }
  }, [channels, scripts, loading])

  const addChannel = useCallback((channel: Omit<Channel, 'id'>) => {
    const newChannel: Channel = {
      ...channel,
      id: Date.now().toString(),
    }
    setChannels(prev => [...prev, newChannel])
  }, [])

  const updateChannel = useCallback((id: string, updates: Partial<Channel>) => {
    setChannels(prev => prev.map(ch => ch.id === id ? { ...ch, ...updates } : ch))
  }, [])

  const deleteChannel = useCallback((id: string) => {
    setChannels(prev => prev.filter(ch => ch.id !== id))
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

  return {
    channels,
    categories,
    scripts,
    loading,
    addChannel,
    updateChannel,
    deleteChannel,
    toggleChannelActive,
    reorderChannels,
    addCategory,
    updateCategory,
    deleteCategory,
    addScript,
    updateScript,
    deleteScript,
    exportData,
    copyJSON,
  }
}
