import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installEventBus } from './lib/events.js'
import './styles.css'

/*
 * Publica `window.WebTV.events` (e o flag `__webtvAppBridgeInjected`)
 * ANTES do React montar.
 *
 * O app Kotlin assina os eventos assim que a pagina termina de
 * carregar; se o bus nao existir, ele espera e nunca recebe nada.
 */
installEventBus()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
