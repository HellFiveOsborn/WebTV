# WebTV Events API

Sistema completo de eventos para comunicação entre o frontend React e o app Kotlin Android.

## Arquitetura

O sistema usa um EventBus central que emite eventos via:
1. `CustomEvent` nativo do browser (`webtv:event`)
2. `window.postMessage` para comunicação cross-origin
3. API global via `window.WebTV.events`

## Acesso aos Eventos

### Do Kotlin (Android WebView)

```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('app:loaded', (event) => {
    console.log('App loaded:', event.payload);
  });
""", null)
```

### Do Frontend React

```typescript
import { eventBus } from './lib/eventBus'

eventBus.on('channel:clicked', (event) => {
  console.log('Channel clicked:', event.payload)
})
```

### Do Script Injetado (Player Control)

O script `script-with-autoplay.js` injetado em páginas de streaming expõe a API do player via `window.WebTV.player`:

```javascript
// Dentro do script injetado na WebView
window.WebTV.player.play();
window.WebTV.player.pause();
window.WebTV.player.seek(120);
window.WebTV.player.volumeUp(0.1);

// Eventos são emitidos automaticamente via:
// - CustomEvent (e.g. 'player:play', 'player:volume:changed')
// - window.postMessage (cross-origin)
// - window.WebViewBridge.postMessage (Kotlin bridge)
window.addEventListener('player:play', (e) => {
  console.log('Player started:', e.detail.payload);
});
```

**Comunicação de comandos via postMessage:**

```javascript
// De um iframe parent para o script injetado
iframe.contentWindow.postMessage({
  source: 'webtv:command',
  method: 'play',        // play | pause | stop | rewind | forward | seek | volumeUp | volumeDown | mute | unmute
  args: [],              // Argumentos do método (ex: [10] para rewind(10))
  id: 'cmd-001'          // ID para correlacionar resposta
}, '*');

// Resposta recebida
window.addEventListener('message', (e) => {
  if (e.data.source === 'webtv:response') {
    console.log('Comando executado:', e.data.method, e.data.result);
  }
});
```

---

## Comandos de Controle do Player

O script injetado (`script-with-autoplay.js`) expõe uma API completa em `window.WebTV.player` para controle do player de vídeo. Comandos podem ser enviados via **chamada direta** ou **postMessage**.

### Métodos Disponíveis

| Método | Argumentos | Descrição | Exemplo |
|--------|------------|-----------|---------|
| `play()` | — | Inicia/reinicia a reprodução | `WebTV.player.play()` |
| `pause()` | — | Pausa a reprodução | `WebTV.player.pause()` |
| `stop()` | — | Pausa e reinicia para o início (currentTime = 0) | `WebTV.player.stop()` |
| `rewind(seconds)` | `seconds: number` (default: 10) | Retrocede N segundos | `WebTV.player.rewind(30)` |
| `forward(seconds)` | `seconds: number` (default: 10) | Avança N segundos | `WebTV.player.forward(15)` |
| `seek(time)` | `time: number` | Pula para posição específica (segundos) | `WebTV.player.seek(120)` |
| `volumeUp(step)` | `step: number` (default: 0.1) | Aumenta volume (0.0-1.0) | `WebTV.player.volumeUp(0.2)` |
| `volumeDown(step)` | `step: number` (default: 0.1) | Diminui volume (0.0-1.0) | `WebTV.player.volumeDown(0.1)` |
| `mute()` | — | Silencia o áudio | `WebTV.player.mute()` |
| `unmute()` | — | Reativa o áudio | `WebTV.player.unmute()` |
| `getStatus()` | — | Retorna estado atual do player | `WebTV.player.getStatus()` |

### Envio de Comandos via postMessage

Para controlar o player remotamente (ex: de um iframe parent ou do app Kotlin):

```javascript
// Enviar comando
iframe.contentWindow.postMessage({
  source: 'webtv:command',
  method: 'rewind',
  args: [30],
  id: 'cmd-123'
}, '*');
```

**Estrutura do comando:**
```typescript
{
  source: 'webtv:command',  // Identificador obrigatório
  method: string,           // Nome do método da API
  args: any[],              // Array de argumentos
  id: string                // ID único para correlacionar resposta
}
```

### Respostas aos Comandos

Todos os comandos retornam uma resposta via postMessage:

```javascript
{
  source: 'webtv:response',
  method: 'rewind',
  id: 'cmd-123',
  result: {
    ok: true,
    time: 1532.45  // Nova posição do player (quando aplicável)
  },
  timestamp: 1234567890
}
```

**Estrutura da resposta:**
```typescript
{
  source: 'webtv:response',
  method: string,           // Método que foi executado
  id: string,               // ID do comando original
  result: {
    ok: boolean,            // Sucesso da operação
    time?: number,          // Posição atual (para play/pause/seek/rewind/forward)
    volume?: number,        // Volume atual (para mute/unmute/volumeUp/volumeDown)
    muted?: boolean,        // Estado de mudo
    reason?: string         // Motivo do erro (quando ok: false)
  },
  timestamp: number
}
```

### Exemplos Práticos

**Controlador remoto via postMessage:**
```javascript
class PlayerRemote {
  constructor(iframe) {
    this.iframe = iframe;
    this.listeners = new Map();
    
    window.addEventListener('message', (e) => {
      if (e.data.source === 'webtv:response') {
        const callback = this.listeners.get(e.data.id);
        if (callback) callback(e.data.result);
      }
    });
  }

  send(method, args = []) {
    const id = `cmd-${Date.now()}-${Math.random()}`;
    
    return new Promise((resolve) => {
      this.listeners.set(id, resolve);
      
      this.iframe.contentWindow.postMessage({
        source: 'webtv:command',
        method,
        args,
        id
      }, '*');
    });
  }

  play() { return this.send('play'); }
  pause() { return this.send('pause'); }
  rewind(seconds) { return this.send('rewind', [seconds]); }
  forward(seconds) { return this.send('forward', [seconds]); }
  seek(time) { return this.send('seek', [time]); }
  volumeUp(step) { return this.send('volumeUp', [step]); }
  volumeDown(step) { return this.send('volumeDown', [step]); }
  mute() { return this.send('mute'); }
  unmute() { return this.send('unmute'); }
  getStatus() { return this.send('getStatus'); }
}

// Uso
const remote = new PlayerRemote(document.getElementById('player-iframe'));
remote.play().then(result => console.log('Playing:', result));
```

**Controle via Kotlin WebView:**
```kotlin
// Enviar comando play
webView.evaluateJavascript("""
  window.postEvent('webtv:command', {
    method: 'play',
    args: [],
    id: 'cmd-${System.currentTimeMillis()}'
  });
""", null)

// Ouvir respostas
webView.evaluateJavascript("""
  window.addEventListener('message', (e) => {
    if (e.data.source === 'webtv:response') {
      window.AndroidBridge.onPlayerResponse(JSON.stringify(e.data));
    }
  });
""", null)
```

### Eventos Emitidos Automaticamente

Cada comando que altera o estado do player emite eventos correspondentes:

| Comando | Evento Disparado | Payload Relevante |
|---------|------------------|-------------------|
| `play()` | `player:play` | `{ time: number, source: 'user' }` |
| `pause()` | `player:pause` | `{ time: number }` |
| `stop()` | `player:pause` | `{ time: 0 }` |
| `seek(time)` | `player:seek` | `{ time: number }` |
| `rewind(seconds)` | `player:seek` | `{ time: number, direction: 'backward' }` |
| `forward(seconds)` | `player:seek` | `{ time: number, direction: 'forward' }` |
| `volumeUp(step)` | `player:volume:changed` | `{ volume: number, direction: 'up' }` |
| `volumeDown(step)` | `player:volume:changed` | `{ volume: number, direction: 'down' }` |
| `mute()` | `player:mute` | `{}` |
| `unmute()` | `player:unmute` | `{ volume: number }` |

---

## Eventos do Player (Script Injetado)

O script `script-with-autoplay.js` emite automaticamente eventos quando o estado do player muda. Estes eventos seguem o mesmo padrão dos eventos principais.

### `player:play`
Emitido quando a reprodução inicia.

**Payload:**
```typescript
{
  channelId?: string,        // ID do canal (se disponível)
  time: number,              // Posição atual do player (segundos)
  source: 'user' | 'auto',  // Origem do comando (usuário ou autoplay)
  isLive?: boolean,          // Se é canal ao vivo
  url?: string               // URL da stream (se aplicável)
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:play', (e) => {
  const { time, source } = e.detail.payload;
  console.log(`Reprodução iniciada em ${time}s via ${source}`);
});
```

---

### `player:pause`
Emitido quando a reprodução pausa.

**Payload:**
```typescript
{
  channelId?: string,
  time: number              // Posição onde pausou (segundos)
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:pause', (e) => {
  console.log(`Pausado em ${e.detail.payload.time}s`);
});
```

---

### `player:ended`
Emitido quando a reprodução termina ou é interrompida (stop).

**Payload:**
```typescript
{
  channelId?: string,
  time: number              // Sempre 0 (stop reinicia para o início)
}
```

---

### `player:muted`
Emitido quando o áudio é silenciado.

**Payload:**
```typescript
{
  channelId?: string
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:muted', (e) => {
  console.log('Áudio mutado');
});
```

---

### `player:unmuted`
Emitido quando o áudio é reativado.

**Payload:**
```typescript
{
  channelId?: string,
  volume: number            // Volume atual (0.0-1.0)
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:unmuted', (e) => {
  console.log(`Áudio reativado, volume: ${e.detail.payload.volume}`);
});
```

---

### `player:volume:changed`
Emitido quando o volume é alterado.

**Payload:**
```typescript
{
  channelId?: string,
  volume: number,           // Novo volume (0.0-1.0)
  direction: 'up' | 'down'  // Direção da mudança
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:volume:changed', (e) => {
  const { volume, direction } = e.detail.payload;
  console.log(`Volume ${direction}: ${Math.round(volume * 100)}%`);
});
```

---

### `player:seeked`
Emitido quando a posição do player muda (seek, rewind, forward).

**Payload:**
```typescript
{
  channelId?: string,
  time: number,                    // Nova posição (segundos)
  direction?: 'forward' | 'backward'  // Direção (para rewind/forward)
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:seeked', (e) => {
  const { time, direction } = e.detail.payload;
  console.log(`Pulou para ${time}s${direction ? ` (${direction})` : ''}`);
});
```

---

### `player:loaded`
Emitido quando o script é injetado e o player está pronto.

**Payload:**
```typescript
{
  channelId?: string,
  duration?: number,        // Duração do vídeo (se disponível)
  isLive?: boolean          // Se é canal ao vivo
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:loaded', (e) => {
  console.log('Player pronto para uso');
});
```

---

### `player:audio:unlocked`
Emitido quando o usuário desbloqueia o áudio (overlay de áudio clicada).

**Payload:**
```typescript
{
  channelId?: string,
  volume: number            // Volume atual após desbloqueio
}
```

**Como ouvir:**
```javascript
window.addEventListener('player:audio:unlocked', (e) => {
  console.log('Áudio desbloqueado pelo usuário');
});
```

---

### Estrutura Completa de Evento do Player

Todos os eventos do player seguem esta estrutura:

```typescript
{
  source: 'webtv',          // Identificador do sistema
  name: 'player:evento',    // Nome do evento
  payload: {                // Dados específicos
    channelId?: string,
    // ... campos específicos do evento
  },
  timestamp: number         // Timestamp Unix
}
```

**Exemplo completo:**
```javascript
{
  source: 'webtv',
  name: 'player:play',
  payload: {
    channelId: 'globo-sp',
    time: 123.456,
    source: 'user',
    isLive: true,
    url: 'blob:https://...'
  },
  timestamp: 1704567890123
}
```

### `app:reloaded`
Emitido quando o usuário recarrega manualmente.

**Payload:**
```typescript
{
  reason: 'manual'
}
```

---

### `channel:clicked`
Emitido quando um canal é clicado.

**Payload:**
```typescript
{
  id: string           // ID do canal
  name: string         // Nome do canal
  type: 'iframe' | 'redirect' | 'mixed'
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('channel:clicked', (event) => {
    const { id, name, type } = event.payload;
    console.log(`Canal clicado: ${name} (${type})`);
  });
""", null)
```

---

### `channel:close`
Emitido quando um canal externo (tipo `redirect` ou `mixed`) é fechado pelo
usuário (tecla BACK, botão, ou chamada programática).

> NOTA: Esse evento é disparado pelo **Kotlin** após o usuário fechar o canal
> (via botão BACK físico ou `window.WebTV.channel.close()` no contexto do site).
> O evento é entregue na página de grade após ela recarregar, garantindo que
> o frontend receba a notificação mesmo após navegação externa.

**Payload:**
```typescript
{
  channelId: string
  channelName: string
  timestamp: number
}
```

**Programaticamente (fechar canal via JS):**
```javascript
if (window.WebTV?.channel?.close) {
  window.WebTV.channel.close();
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('channel:close', (event) => {
    const { channelId, channelName } = event.payload;
    console.log('Canal fechado: ' + channelName);
  });
""", null)
```

---

### `player:opened`
Emitido quando o player modal abre.

**Payload:**
```typescript
{
  channelId: string
  channelName: string
  url: string          // URL do iframe
}
```

---

### `player:closed`
Emitido quando o player modal fecha.

**Payload:**
```typescript
{
  channelId: string
  channelName: string
}
```

---

### `player:backupSelected`
Emitido quando o usuário seleciona uma URL alternativa.

**Payload:**
```typescript
{
  channelId: string
  index: number        // Índice da URL alternativa
  url: string          // URL selecionada
}
```

---

### `search:changed`
Emitido quando a busca muda.

**Payload:**
```typescript
{
  query: string        // Termo de busca atual
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('search:changed', (event) => {
    const { query } = event.payload;
    console.log(`Busca: ${query}`);
  });
""", null)
```

---

### `sort:changed`
Emitido quando a ordenação muda.

**Payload:**
```typescript
{
  sortBy: 'alphabetical' | 'recent' | 'category'
}
```

---

### `category:changed`
Emitido quando uma categoria é selecionada.

**Payload:**
```typescript
{
  categoryId: string | null    // null = "Todas"
  categoryName: string
}
```

---

### `focus:changed`
Emitido quando o foco de navegação muda (controle remoto/teclado).

**Payload:**
```typescript
{
  elementId: string | null
  elementType: string          // 'button', 'div', etc
  coordinates: {
    x: number
    y: number
    width: number
    height: number
  }
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('focus:changed', (event) => {
    const { elementId, elementType, coordinates } = event.payload;
    console.log(`Foco em: ${elementType} (${coordinates.x}, ${coordinates.y})`);
  });
""", null)
```

---

### `scroll:moved`
Emitido quando a página faz scroll.

**Payload:**
```typescript
{
  x: number
  y: number
  element: 'window' | string
}
```

---

## Widget de Canal (Script Injetado)

O widget (`widget.js`) é um script JavaScript puro injetado pelo app Kotlin em páginas externas de player. Ele cria um iframe transparente no canto inferior direito que renderiza um card expansível com informações do canal e URLs alternativas.

### Fluxo de Injeção

```
Kotlin (onPageFinished)
  ├─ Injeta appBridge.js (cria window.WebTV.events shim se ausente)
  ├─ Injeta eventListenerGuard (registra listeners via WebTV.events.on())
  ├─ Injeta window.__webtvActiveChannelId
  ├─ Injeta window.__webtvBaseUrl
  └─ Injeta widget.js (carregado de assets/scripts/widget.js)

widget.js (auto-executa)
  ├─ Cria window.WebTV.events shim (se ainda não existir)
  ├─ Cria <iframe id="__webtv_widget">
  │    src = baseUrl + "widget/" + channelId
  ├─ Posiciona fixo bottom:16px right:16px
  ├─ Escuta postMessage do iframe (source: 'webtv')
  └─ Encaminha eventos via window.WebTV.events.emit(type, payload)

WidgetPage.tsx (React, dentro do iframe)
  ├─ fetch('/WebTV/data/channels.json')
  ├─ Busca canal por ID, resolve categoria
  ├─ Renderiza botão circular (recolhido)
  ├─ Suporte D-PAD (ArrowUp/Down/Left/Right/Enter/Escape)
  └─ Ao expandir: card com info + URLs alternativas

Fluxo completo de evento (ex: channel:alternative:selected):
  WidgetPage → parent.postMessage({ source:'webtv', type, payload })
    → widget.js → window.WebTV.events.emit(type, payload)
      → EventListenerGuard → WebTVBridge.onChannelAlternativeSelected(json)
        → navigateToAlternativeUrl(channelId, title, url)
```

### Eventos do Widget

#### `channel:alternative:selected`
Emitido quando o usuário seleciona uma URL alternativa no card expandido (via click ou D-PAD Enter). Segue o padrão `window.WebTV.events.emit()` como todos os eventos da API.

**Direção:** Widget → listenerGuard → Kotlin

**Type:** `channel:alternative:selected`

**Payload:**
```typescript
{
  channelId: string    // ID do canal atual
  channelTitle: string // Nome do canal
  url: string          // Nova URL para navegar
  type: string         // 'iframe' | 'redirect'
}
```

**Escuta (EventListenerGuard):**
```javascript
window.WebTV.events.on('channel:alternative:selected', (event) => {
  WebTVBridge.onChannelAlternativeSelected(JSON.stringify(event));
});
```

#### `widget:expanded` / `widget:collapsed`
Emitidos quando o card do widget expande ou recolhe (via click ou D-PAD).

**Direção:** Widget (informational, sem handler obrigatório)

**Payload:** `{ channelId: string, channelTitle: string }`

#### `widget:resize`
Emitido pelo iframe React para redimensionar o iframe container quando o card expande/recolhe.

**Direção:** Widget iframe → widget.js (via postMessage)

**Payload:**
```typescript
{
  width: number   // 56 (recolhido) ou 280 (expandido)
  height: number  // altura calculada automaticamente
}
```

### Estrutura de Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `frontend/public/widget.js` | Script JS puro servido pelo frontend |
| `kotlin-app/assets/scripts/widget.js` | Cópia nos assets do app Android |
| `frontend/src/pages/WidgetPage.tsx` | Página React do widget (rota `/widget/:channelId`) |
| `WebTVBridge.kt` | Handlers `onChannelAlternativeSelected()` + `onWidgetAction()` |
| `MainActivity.kt` | `injectEventListenerGuard()` com listener `channel:alternative:selected` + `injectWidgetScript()` + `navigateToAlternativeUrl()` |

---

## API Completa

### `window.WebTV.events.on(eventName, callback)`
Registra um listener para um evento.

```typescript
const unsubscribe = window.WebTV.events.on('channel:clicked', (event) => {
  console.log(event.payload)
})

// Remove o listener
unsubscribe()
```

### `window.WebTV.events.off(eventName, callback)`
Remove um listener específico.

### `window.WebTV.events.getHistory(filter?)`
Retorna o histórico de eventos emitidos (últimos 100).

```typescript
// Todos os eventos
const allEvents = window.WebTV.events.getHistory()

// Filtrar por tipo
const channelEvents = window.WebTV.events.getHistory('channel:clicked')

// Múltiplos tipos
const filtered = window.WebTV.events.getHistory(['app:loaded', 'app:reloaded'])
```

### `window.WebTV.events.clearHistory()`
Limpa o histórico de eventos.

---

## Integração Completa com Kotlin

### MainActivity.kt

```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true

        // Adicionar JavaScript interface
        webView.addJavascriptInterface(WebTVBridge(), "WebTVBridge")

        // Injetar listener após carregar
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectEventListeners()
            }
        }

        webView.loadUrl("file:///android_asset/index.html")
    }

    private fun injectEventListeners() {
        val script = """
            window.WebTV.events.on('app:loaded', (event) => {
                WebTVBridge.onAppLoaded(JSON.stringify(event.payload));
            });
            
            window.WebTV.events.on('channel:clicked', (event) => {
                WebTVBridge.onChannelClicked(JSON.stringify(event.payload));
            });
            
            window.WebTV.events.on('player:opened', (event) => {
                WebTVBridge.onPlayerOpened(JSON.stringify(event.payload));
            });
        """
        webView.evaluateJavascript(script, null)
    }

    inner class WebTVBridge {
        @JavascriptInterface
        fun onAppLoaded(payload: String) {
            runOnUiThread {
                Log.d("WebTV", "App loaded: $payload")
                // Handle app loaded
            }
        }

        @JavascriptInterface
        fun onChannelClicked(payload: String) {
            runOnUiThread {
                Log.d("WebTV", "Channel clicked: $payload")
                // Handle channel clicked
            }
        }

        @JavascriptInterface
        fun onPlayerOpened(payload: String) {
            runOnUiThread {
                Log.d("WebTV", "Player opened: $payload")
                // Handle player opened
            }
        }
    }
}
```

---

## API de Scripts

O frontend expõe uma API global para gerenciamento e recuperação de scripts JavaScript.

### `window.WebTV.scripts.getScriptsForUrl(url)`

Recupera todos os scripts habilitados que correspondem a uma URL específica.

**Parâmetros:**
- `url` (string): URL para buscar scripts correspondentes

**Retorna:**
```typescript
Array<{
  id: string
  name: string
  code: string
  domains: string[]
  urls: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}>
```

**Exemplo Kotlin:**
```kotlin
// Quando um canal é carregado no WebView
val channelUrl = "https://example.com/stream/video.m3u8"

webView.evaluateJavascript("""
    (function() {
        const scripts = window.WebTV.scripts.getScriptsForUrl('$channelUrl');
        return JSON.stringify(scripts);
    })()
""") { result ->
    val jsonArray = JSONArray(result)
    
    for (i in 0 until jsonArray.length()) {
        val script = jsonArray.getJSONObject(i)
        val code = script.getString("code")
        
        // Injetar script no WebView
        webView.evaluateJavascript(code, null)
    }
}
```

---

### Evento: `script:retrieved`

Emitido automaticamente quando `getScriptsForUrl()` é chamado.

**Payload:**
```typescript
{
  url: string                // URL consultada
  count: number             // Quantidade de scripts encontrados
  scripts: Array<{
    id: string
    name: string
    code: string
    domains: string[]
    urls: string[]
    enabled: boolean
    createdAt: number
    updatedAt: number
  }>
}
```

**Exemplo Kotlin:**
```kotlin
// Registrar listener para monitorar scripts recuperados
webView.evaluateJavascript("""
    window.WebTV.events.on('script:retrieved', (event) => {
        const payload = JSON.stringify({
            url: event.payload.url,
            count: event.payload.count,
            scripts: event.payload.scripts
        });
        WebTVBridge.onScriptRetrieved(payload);
    });
""", null)

// Bridge Kotlin
@JavascriptInterface
fun onScriptRetrieved(payload: String) {
    val json = JSONObject(payload)
    val url = json.getString("url")
    val count = json.getInt("count")
    
    Log.d("WebTV", "Recuperados $count scripts para: $url")
    
    val scriptsArray = json.getJSONArray("scripts")
    for (i in 0 until scriptsArray.length()) {
        val script = scriptsArray.getJSONObject(i)
        val code = script.getString("code")
        
        runOnUiThread {
            webView.evaluateJavascript(code, null)
        }
    }
}
```

---

## TypeScript Types

Todos os tipos estão definidos em `frontend/src/lib/eventTypes.ts`:

```typescript
export interface WebTVEvent<T = any> {
  type: string
  timestamp: number
  payload: T
}

export interface EventHandlers {
  'app:loaded': AppLoadedPayload
  'app:reloaded': AppReloadedPayload
  'channel:clicked': ChannelClickedPayload
  'player:opened': PlayerOpenedPayload
  'player:closed': PlayerClosedPayload
  'player:backupSelected': PlayerBackupSelectedPayload
  'search:changed': SearchChangedPayload
  'sort:changed': SortChangedPayload
  'category:changed': CategoryChangedPayload
  'focus:changed': FocusChangedPayload
  'scroll:moved': ScrollMovedPayload
  'script:retrieved': ScriptRetrievedPayload
}

export interface ScriptRetrievedPayload {
  url: string
  count: number
  scripts: Array<{
    id: string
    name: string
    code: string
    domains: string[]
    urls: string[]
    enabled: boolean
    createdAt: number
    updatedAt: number
  }>
}
```

---

## Debug

Para debugar eventos no console do browser:

```javascript
// Log todos os eventos
window.WebTV.events.on('*', (event) => {
  console.log(`[${event.type}]`, event.payload)
})

// Ver histórico
console.table(window.WebTV.events.getHistory())
```

---

## Licença

MIT
