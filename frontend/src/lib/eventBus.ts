import type { WebTVEvent, EventType, EventHandlers } from './eventTypes'

type Listener<T> = (event: WebTVEvent<T>) => void

class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>()
  private history: WebTVEvent[] = []
  private maxHistory = 100

  emit<K extends EventType>(type: K, payload: EventHandlers[K]) {
    const event: WebTVEvent = {
      type,
      payload,
      timestamp: Date.now()
    }

    this.history.push(event)
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error(`[WebTV Event] Error in listener for ${type}:`, error)
        }
      })
    }

    window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }))
    window.postMessage({ source: 'webtv', event }, '*')
  }

  on<K extends EventType>(type: K, listener: Listener<EventHandlers[K]>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
    return () => this.off(type, listener)
  }

  off<K extends EventType>(type: K, listener: Listener<EventHandlers[K]>) {
    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.delete(listener)
    }
  }

  getHistory(filter?: EventType | EventType[]): WebTVEvent[] {
    if (!filter) return [...this.history]
    const types = Array.isArray(filter) ? filter : [filter]
    return this.history.filter(e => types.includes(e.type as EventType))
  }

  clearHistory() {
    this.history = []
  }
}

export const eventBus = new EventBus()

export default eventBus
