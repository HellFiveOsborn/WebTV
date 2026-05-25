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

## Eventos Disponíveis

### `app:loaded`
Emitido quando o app carrega completamente.

**Payload:**
```typescript
{
  channels: number      // Quantidade total de canais
  categories: number    // Quantidade de categorias
  timestamp: number     // Timestamp Unix do carregamento
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('app:loaded', (event) => {
    const { channels, categories } = event.payload;
    console.log(`App loaded: ${channels} canais, ${categories} categorias`);
  });
""", null)
```

---

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

### `navigated:home`
Emitido quando o frontend retorna à página inicial (grade de canais), permitindo
que o app Kotlin resete o estado de injeção de scripts sem depender de verificação
de URL.

**Payload:**
```typescript
{
  timestamp: number     // Timestamp Unix da navegação
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('navigated:home', (event) => {
    console.log('Returned to home grid:', event.payload.timestamp);
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
