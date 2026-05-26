import { useState, useEffect, useCallback, useRef } from 'react'
import { navigateSectionedGrid } from '../utils/focus'

export type Zone = 'toolbar' | 'sortTabs' | 'recentGrid' | 'allGrid' | 'grid' | 'channelsGrid'

interface ZoneConfig {
  columns: number
  itemsCount: number
  sectionStarts?: number[]
}

interface UseDpadNavigationProps {
  zones: Zone[]
  getZoneConfig: (zone: Zone) => ZoneConfig
  onActivate: (zone: Zone, index: number) => void
  onZoneChange?: (zone: Zone, index: number) => void
  isPaused?: boolean
}

type DpadAction = 'up' | 'down' | 'left' | 'right' | 'enter'

function remapColumn(
  index: number,
  fromCols: number,
  toConfig: ZoneConfig,
  sectionStarts?: number[]
): number {
  if (toConfig.itemsCount <= 0) return 0

  if (sectionStarts && sectionStarts.length > 0) {
    const col = index % fromCols
    const firstStart = sectionStarts[0]
    return Math.min(firstStart + col, toConfig.itemsCount - 1)
  }

  const col = index % fromCols
  return Math.min(col, toConfig.itemsCount - 1)
}

function handleFlatNav(
  key: 'ArrowUp' | 'ArrowDown',
  idx: number,
  columns: number,
  itemsCount: number
): number {
  const row = Math.floor(idx / columns)
  const totalRows = Math.ceil(itemsCount / columns)

  if (key === 'ArrowUp') {
    if (row > 0) return idx - columns
    return -1
  }

  if (row < totalRows - 1) return Math.min(idx + columns, itemsCount - 1)
  return -1
}

export function useDpadNavigation({
  zones,
  getZoneConfig,
  onActivate,
  onZoneChange,
  isPaused = false,
}: UseDpadNavigationProps) {
  const [activeZoneIndex, setActiveZoneIndex] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const memoryRef = useRef<Record<string, number>>({})

  const activeZone = zones[activeZoneIndex] ?? zones[0]

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isPaused) return

      const keyMap: Record<string, DpadAction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        Enter: 'enter',
      }
      const action = keyMap[e.key]
      if (!action) return

      e.preventDefault()
      e.stopPropagation()

      const zoneIdx = activeZoneIndex
      const zone = zones[zoneIdx]
      const config = getZoneConfig(zone)
      const { columns, itemsCount, sectionStarts } = config
      const idx = focusedIndex

      if (action === 'enter') {
        onActivate(zone, idx)
        return
      }

      if (itemsCount <= 0) return

      if (e.key === 'ArrowLeft') {
        const canMoveLeft = sectionStarts && sectionStarts.length > 0
          ? (() => {
              let secIdx = sectionStarts.length - 1
              for (let i = sectionStarts.length - 1; i >= 0; i--) {
                if (idx >= sectionStarts[i]) { secIdx = i; break }
              }
              const secStart = sectionStarts[secIdx]
              const relIdx = idx - secStart
              return relIdx % columns > 0
            })()
          : idx % columns > 0

        if (canMoveLeft) {
          setFocusedIndex(idx - 1)
          return
        }
        if (zoneIdx > 0) {
          const prevZone = zones[zoneIdx - 1]
          const prevConfig = getZoneConfig(prevZone)
          if (prevConfig.itemsCount > 0) {
            const saved = memoryRef.current[prevZone]
            const lastIdx = prevConfig.itemsCount - 1
            setFocusedIndex(saved !== undefined ? Math.min(saved, lastIdx) : lastIdx)
            setActiveZoneIndex(zoneIdx - 1)
          }
        }
        return
      }

      if (e.key === 'ArrowRight') {
        const canMoveRight = sectionStarts && sectionStarts.length > 0
          ? (() => {
              let secIdx = sectionStarts.length - 1
              for (let i = sectionStarts.length - 1; i >= 0; i--) {
                if (idx >= sectionStarts[i]) { secIdx = i; break }
              }
              const secStart = sectionStarts[secIdx]
              const secEnd = secIdx < sectionStarts.length - 1
                ? sectionStarts[secIdx + 1] - 1
                : itemsCount - 1
              const relIdx = idx - secStart
              const relCol = relIdx % columns
              const secLen = secEnd - secStart + 1
              const relRow = Math.floor(relIdx / columns)
              const secRows = Math.ceil(secLen / columns)
              const rowCols = (relRow < secRows - 1) ? columns : (secLen % columns || columns)
              return relCol < rowCols - 1 && idx < secEnd
            })()
          : idx < itemsCount - 1 && idx % columns < columns - 1

        if (canMoveRight) {
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

      const checkBoundary = (key: 'up' | 'down'): boolean => {
        if (sectionStarts && sectionStarts.length > 0) {
          const next = navigateSectionedGrid(idx, key, sectionStarts, itemsCount, columns)
          if (next !== idx) {
            setFocusedIndex(next)
            return false
          }
          return true
        }

        const next = handleFlatNav(key === 'up' ? 'ArrowUp' : 'ArrowDown', idx, columns, itemsCount)
        if (next >= 0) {
          setFocusedIndex(next)
          return false
        }
        return true
      }

      if (e.key === 'ArrowUp') {
        if (!checkBoundary('up')) return
        if (zoneIdx <= 0) return

        const prevZone = zones[zoneIdx - 1]
        const prevConfig = getZoneConfig(prevZone)

        if (prevZone === 'toolbar') {
          setFocusedIndex(0)
          setActiveZoneIndex(zoneIdx - 1)
          return
        }

        const mapped = remapColumn(idx, columns, prevConfig, prevConfig.sectionStarts)
        setFocusedIndex(mapped)
        setActiveZoneIndex(zoneIdx - 1)
        return
      }

      if (e.key === 'ArrowDown') {
        if (!checkBoundary('down')) return
        if (zoneIdx >= zones.length - 1) return

        const nextZone = zones[zoneIdx + 1]
        const nextConfig = getZoneConfig(nextZone)
        const mapped = remapColumn(idx, columns, nextConfig, nextConfig.sectionStarts)
        setFocusedIndex(mapped)
        setActiveZoneIndex(zoneIdx + 1)
      }
    },
    [activeZoneIndex, zones, getZoneConfig, onActivate, focusedIndex, isPaused]
  )

  useEffect(() => {
    memoryRef.current[activeZone] = focusedIndex
    onZoneChange?.(activeZone, focusedIndex)
  }, [activeZone, focusedIndex, onZoneChange])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  const navigateTo = useCallback((zone: Zone, index: number) => {
    const zoneIdx = zones.indexOf(zone)
    if (zoneIdx >= 0) {
      setActiveZoneIndex(zoneIdx)
      setFocusedIndex(index)
    }
  }, [zones])

  return {
    activeZone,
    focusedIndex,
    navigateTo,
    setFocusedIndex,
  }
}