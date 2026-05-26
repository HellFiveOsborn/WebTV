import { useState, useCallback, useRef, useEffect, useContext, createContext, ReactNode } from 'react'
import { FocusableItem, findNextFocus, Direction } from '../utils/spatialNavigation'

interface Item extends FocusableItem {
  zone: string
}

const FocusContext = createContext<{
  focusedId: string | null
  register: (id: string, zone: string, element: HTMLElement) => void
  unregister: (id: string) => void
} | null>(null)

export function FocusProvider({ children, isPaused = false }: { children: ReactNode; isPaused?: boolean }) {
  const itemsRef = useRef(new Map<string, Item>())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focusedIdRef = useRef<string | null>(null)
  const isPausedRef = useRef(isPaused)

  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])

  const syncFocus = useCallback((id: string | null) => {
    focusedIdRef.current = id
    setFocusedId(id)
  }, [])

  const register = useCallback((id: string, zone: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    itemsRef.current.set(id, {
      id, zone,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      element
    })
    if (!focusedIdRef.current && focusedIdRef.current !== id) {
      syncFocus(id)
    }
  }, [syncFocus])

  const unregister = useCallback((id: string) => {
    itemsRef.current.delete(id)
    if (focusedIdRef.current === id) {
      const first = itemsRef.current.values().next().value as Item | undefined
      syncFocus(first?.id ?? null)
    }
  }, [syncFocus])

  const navigateDirection = useCallback((direction: Direction) => {
    const items = itemsRef.current
    const currentId = focusedIdRef.current
    if (!currentId) return

    const current = items.get(currentId)
    if (!current || !current.element.isConnected) return

    const currentRect = current.element.getBoundingClientRect()
    const candidates: FocusableItem[] = []

    items.forEach(item => {
      if (item.id === currentId) return
      if (!item.element.isConnected) return
      const r = item.element.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      candidates.push({
        id: item.id,
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
        element: item.element
      })
    })

    const next = findNextFocus(
      { x: currentRect.left, y: currentRect.top, width: currentRect.width, height: currentRect.height },
      direction,
      candidates
    )

    if (next) {
      syncFocus(next.id)
      next.element.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  }, [syncFocus])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPausedRef.current) return

      const target = e.target as HTMLElement | null
      const inInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable

      if (inInput && e.key === 'Escape') {
        ;(target as HTMLElement).blur()
        return
      }

      const map: Record<string, Direction> = {
        ArrowUp: 'up', ArrowDown: 'down',
        ArrowLeft: 'left', ArrowRight: 'right'
      }

      const dir = map[e.key]
      if (dir) {
        if (inInput) {
          ;(target as HTMLElement).blur()
        }
        e.preventDefault()
        e.stopPropagation()
        navigateDirection(dir)
        return
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const id = focusedIdRef.current
        if (id) {
          const item = itemsRef.current.get(id)
          if (item?.element?.isConnected) {
            if (item.element instanceof HTMLInputElement) {
              item.element.focus()
            } else {
              e.preventDefault()
              item.element.click()
            }
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigateDirection])

  return (
    <FocusContext.Provider value={{ focusedId, register, unregister }}>
      {children}
    </FocusContext.Provider>
  )
}

export function useFocusContext() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocusContext must be used inside FocusProvider')
  return ctx
}

export function useFocusable(zone: string, index: number) {
  const { register, unregister, focusedId } = useFocusContext()
  const id = `${zone}-${index}`
  const ref = useRef<HTMLElement>(null)
  const registeredIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (ref.current) {
      registeredIdRef.current = id
      register(id, zone, ref.current)
    }
    return () => {
      if (registeredIdRef.current) {
        unregister(registeredIdRef.current)
        registeredIdRef.current = null
      }
    }
  }, [id, zone, register, unregister])

  return { ref, isFocused: focusedId === id }
}

export function useFocusableById(focusId: string) {
  const { register, unregister, focusedId } = useFocusContext()
  const ref = useRef<HTMLElement>(null)
  const registeredIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (ref.current) {
      registeredIdRef.current = focusId
      register(focusId, 'channel', ref.current)
    }
    return () => {
      if (registeredIdRef.current) {
        unregister(registeredIdRef.current)
        registeredIdRef.current = null
      }
    }
  }, [focusId, register, unregister])

  return { ref, isFocused: focusedId === focusId }
}
