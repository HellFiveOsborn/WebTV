import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { OwnPage } from './pages/OwnPage'
import { eventBus } from './lib/eventBus'
import { ScriptManager } from './lib/scriptManager'
import './index.css'

// Expor API de eventos globalmente para o app Kotlin
declare global {
  interface Window {
    WebTV?: {
      events: typeof eventBus
      scripts: ScriptManager
    }
  }
}

window.WebTV = { events: eventBus, scripts: null as any }

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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/channel/:id" element={<App />} />
        <Route path="/own" element={<OwnPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
