import { useState, useEffect, useCallback, useRef } from 'react'
import { eventBus } from '../lib/eventBus'

export type Zone = 'toolbar' | 'sortTabs' | 'recentGrid' | 'allGrid' | 'grid'

interface UseDpadNavigationProps {
  zones: Zone[]
  getZoneConfig: (zone: Zone) => { columns: number; itemsCount: number }
  onActivate: (zone: Zone, index: number) => void
  onZoneChange?: (zone: Zone, index: number) => void
  isPaused?: boolean
}

export function useDpadNavigation({
  zones,
  getZoneConfig,
  onActivate,
  onZoneChange,
  isPaused = false
}: UseDpadNavigationProps) {
  const [activeZoneIndex, setActiveZoneIndex] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const memoryRef = useRef<Record<string, number>>({})

  useEffect(() => {
    memoryRef.current[zones[activeZoneIndex]] = focusedIndex
  }, [activeZoneIndex, focusedIndex, zones])

  useEffect(() => {
    onZoneChange?.(zones[activeZoneIndex], focusedIndex)
    
    const focusedElement = document.querySelector(`[data-zone="${zones[activeZoneIndex]}"][data-index="${focusedIndex}"]`)
    if (focusedElement) {
      const rect = focusedElement.getBoundingClientRect()
      eventBus.emit('focus:changed', {
        elementId: focusedElement.id || null,
        elementType: focusedElement.tagName.toLowerCase(),
        coordinates: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      })
    }
  }, [activeZoneIndex, focusedIndex, zones, onZoneChange])

  const mapColumnBetweenZones = useCallback((
    fromZone: Zone, fromIdx: number, fromCols: number,
    toZone: Zone, toCols: number, toItems: number
  ): number => {
    if (toItems === 0) return 0
    const fromCol = fromIdx % fromCols
    const clamped = (v: number) => Math.min(Math.max(v, 0), toItems - 1)

    if (fromZone === 'toolbar' && toZone === 'sortTabs') {
      return clamped(fromCol)
    }
    if (fromZone === 'sortTabs' && toZone === 'toolbar') {
      return clamped(fromCol === 0 ? 0 : 1)
    }

    if (fromZone === 'sortTabs' && toZone === 'grid') {
      return clamped(fromCol)
    }
    if (fromZone === 'grid' && toZone === 'sortTabs') {
      if (fromCol <= 1) return clamped(1)
      return clamped(Math.min(fromCol, toCols - 1))
    }

    const position = (fromCol + 0.5) / fromCols
    const targetCol = Math.min(Math.floor(position * toCols), toCols - 1)
    return Math.min(targetCol, toItems - 1)
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isPaused) return

    const target = event.target as HTMLElement
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

    if (isInput && !['ArrowUp', 'ArrowDown'].includes(event.key)) {
      return
    }

    const key = event.key
    const zoneIdx = activeZoneIndex
    const idx = focusedIndex
    const config = getZoneConfig(zones[zoneIdx])
    const { columns, itemsCount } = config
    const row = Math.floor(idx / columns)

    switch (key) {
      case 'ArrowUp': {
        event.preventDefault()
        if (row > 0) {
          setFocusedIndex(idx - columns)
          return
        }
        if (zoneIdx > 0) {
          const prevZone = zones[zoneIdx - 1]
          const prevConfig = getZoneConfig(prevZone)

          if (prevZone === 'toolbar') {
            const mapped = mapColumnBetweenZones(
              zones[zoneIdx], idx, columns,
              prevZone, prevConfig.columns, prevConfig.itemsCount
            )
            setFocusedIndex(mapped)
          } else {
            const saved = memoryRef.current[prevZone]
            const lastIdx = prevConfig.itemsCount > 0 ? prevConfig.itemsCount - 1 : 0
            setFocusedIndex(saved !== undefined ? Math.min(saved, lastIdx) : lastIdx)
          }
          setActiveZoneIndex(zoneIdx - 1)
        }
        return
      }

      case 'ArrowDown': {
        event.preventDefault()
        const currentZone = zones[zoneIdx]
        const nextRow = row + 1

        if (nextRow * columns < itemsCount) {
          setFocusedIndex(nextRow * columns + (idx % columns))
          return
        }

        if (zoneIdx < zones.length - 1) {
          const nextZone = zones[zoneIdx + 1]
          const nextConfig = getZoneConfig(nextZone)
          const mapped = mapColumnBetweenZones(
            currentZone, idx, columns,
            nextZone, nextConfig.columns, nextConfig.itemsCount
          )
          setFocusedIndex(mapped)
          setActiveZoneIndex(zoneIdx + 1)
        }
        return
      }

      case 'ArrowLeft': {
        event.preventDefault()
        const col = idx % columns
        if (col > 0) {
          setFocusedIndex(idx - 1)
          return
        }
        if (zoneIdx > 0) {
          const prevZoneIdx = zoneIdx - 1
          const prevConfig = getZoneConfig(zones[prevZoneIdx])
          if (prevConfig.itemsCount > 0) {
            const saved = memoryRef.current[zones[prevZoneIdx]]
            const lastIdx = prevConfig.itemsCount - 1
            setFocusedIndex(saved !== undefined ? Math.min(saved, lastIdx) : lastIdx)
            setActiveZoneIndex(prevZoneIdx)
          }
        }
        return
      }

      case 'ArrowRight': {
        event.preventDefault()
        const col = idx % columns
        if (col < columns - 1 && idx < itemsCount - 1) {
          setFocusedIndex(idx + 1)
          return
        }
        if (zoneIdx < zones.length - 1) {
          const nextZone = zones[zoneIdx + 1]
          const nextConfig = getZoneConfig(nextZone)
          const saved = memoryRef.current[nextZone]
          setFocusedIndex(saved !== undefined ? Math.min(saved, nextConfig.itemsCount - 1) : 0)
          setActiveZoneIndex(zoneIdx + 1)
        }
        return
      }

      case 'Enter':
      case ' ': {
        event.preventDefault()
        onActivate(zones[zoneIdx], idx)
        return
      }
    }
  }, [activeZoneIndex, focusedIndex, zones, getZoneConfig, onActivate, isPaused, mapColumnBetweenZones])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    activeZone: zones[activeZoneIndex],
    focusedIndex,
    setFocusedIndex,
    setActiveZoneIndex,
  }
}
