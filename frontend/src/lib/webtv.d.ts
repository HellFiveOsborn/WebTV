import type { EventType, EventHandlers, WebTVEvent } from './eventTypes'

interface WebTVEventsAPI {
  on<K extends EventType>(type: K, listener: (event: WebTVEvent<EventHandlers[K]>) => void): () => void
  off<K extends EventType>(type: K, listener: (event: WebTVEvent<EventHandlers[K]>) => void): void
  getHistory(filter?: EventType | EventType[]): WebTVEvent[]
  clearHistory(): void
}

declare global {
  interface Window {
    WebTV?: {
      events?: WebTVEventsAPI
    }
  }
}
