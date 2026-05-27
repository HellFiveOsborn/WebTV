import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { OwnPage } from './pages/OwnPage'
import { WidgetPage } from './pages/WidgetPage'
import { eventBus } from './lib/eventBus'
import { ScriptManager } from './lib/scriptManager'
import './index.css'

// Expor API de eventos globalmente para o app Kotlin
declare global {
  interface Window {
    WebTV?: {
      events: typeof eventBus
      scriptManager: ScriptManager
      channel?: {
        activeId: string | null
        activeName: string | null
        close: () => void
      }
    }
  }
}

window.WebTV = {
  events: eventBus,
  scriptManager: null as any,
  channel: {
    activeId: window.WebTV?.channel?.activeId ?? null,
    activeName: window.WebTV?.channel?.activeName ?? null,
    close: () => {
      const ch = window.WebTV?.channel
      if (ch && ch.activeId) {
        eventBus.emit('channel:closing', {})
        if ((window as any).WebTVBridge && (window as any).WebTVBridge.onChannelClosed) {
          ;(window as any).WebTVBridge.onChannelClosed(JSON.stringify({
            channelId: ch.activeId,
            channelName: ch.activeName,
            timestamp: Date.now()
          }))
        }
        ch.activeId = null
        ch.activeName = null
      }
    }
  }
}

// Listener de scroll global
window.addEventListener('scroll', () => {
  eventBus.emit('scroll:moved', {
    x: window.scrollX,
    y: window.scrollY,
    element: 'window'
  })
}, { passive: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/channel/:id" element={<App />} />
        <Route path="/widget/:channelId" element={<WidgetPage />} />
        <Route path="/own" element={<OwnPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
