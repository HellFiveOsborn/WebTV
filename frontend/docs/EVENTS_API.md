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

### `player:quality:changed`
Emitido quando a qualidade/resolução do vídeo muda.

**Payload:**
```typescript
{
  quality: number      // Índice da qualidade atual (0 = Auto)
  levels: Array<{
    index: number
    label: string      // Ex: "Auto", "720p", "540p"
    height: number
    width: number
    bitrate: number
  }>
}
```

**Exemplo Kotlin:**
```kotlin
webView.evaluateJavascript("""
  window.WebTV.events.on('player:quality:changed', (event) => {
    const { quality, levels } = event.payload;
    console.log(`Qualidade: ${levels[quality]?.label || 'Auto'}`);
  });
""", null)
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

## API de Qualidade de Vídeo

`window.WebTV.player.quality` expõe controle de qualidade/resolução. Funciona
tanto com JWPlayer (`getQualityLevels`/`setCurrentQuality`) quanto com Clappr
(`hls.js.levels`/`currentLevel`).

### `window.WebTV.player.getStatus().quality`

`getStatus()` retorna um campo `quality` incluso:

```typescript
{
  current: number      // Índice atual (0 = Auto)
  levels: [            // Array de níveis disponíveis
    { index: 0, label: 'Auto', height: 0, width: 0, bitrate: 0 },
    { index: 1, label: '720p', height: 720, width: 1280, bitrate: 3860587 },
    { index: 2, label: '540p', height: 540, width: 960, bitrate: 2071916 },
    // ...
  ]
}
```

### `window.WebTV.player.quality.getLevels()`

Retorna o array de níveis disponíveis (ou `null` se indisponível).

```typescript
const levels = window.WebTV.player.quality.getLevels()
// [
//   { index: 0, label: 'Auto', height: 0, width: 0, bitrate: 0 },
//   { index: 1, label: '720p', height: 720, ... },
//   { index: 2, label: '540p', height: 540, ... },
// ]
```

### `window.WebTV.player.quality.getCurrent()`

Retorna o índice da qualidade atual (`0` = Auto).

```typescript
const current = window.WebTV.player.quality.getCurrent()
```

### `window.WebTV.player.quality.set(index)`

Seleciona uma qualidade pelo índice. `0` = Auto. Retorna `true` se funcionou.

```typescript
// Mudar para 720p (índice 1)
window.WebTV.player.quality.set(1)

// Voltar para Auto
window.WebTV.player.quality.set(0)
```

### `window.WebTV.player.quality.setAuto()`

Atalho para `quality.set(0)`.

### Evento: `player:quality:changed`

Emitido quando a qualidade muda (automaticamente ou via `quality.set()`).

**Payload:**
```typescript
{
  quality: number      // Índice da qualidade atual
  levels: [            // Array completo de níveis
    { index: number, label: string, height: number, width: number, bitrate: number }
  ]
}
```

### Mapeamento por Player

| Ação | JWPlayer | Clappr (hls.js via DOM) |
|------|----------|------------------------|
| Listar níveis | `jwplayer().getQualityLevels()` | Percorre `hls.levels` do playback interno |
| Obter atual | `jwplayer().getCurrentQuality()` | `hls.currentLevel` (-1 = Auto, n = índice - 1) |
| Selecionar | `jwplayer().setCurrentQuality(idx)` | `hls.currentLevel = idx === 0 ? -1 : idx - 1` |

### Exemplo Kotlin

```kotlin
// Obter qualidades disponíveis
webView.evaluateJavascript("""
  window.WebTV.player.quality.getLevels()
""") { result ->
    val jsonArray = JSONArray(result)
    for (i in 0 until jsonArray.length()) {
        val level = jsonArray.getJSONObject(i)
        Log.d("WebTV", "Qualidade: ${level.getString("label")}")
    }
}

// Selecionar qualidade
webView.evaluateJavascript("window.WebTV.player.quality.set(1)", null)

// Escutar mudança de qualidade
webView.evaluateJavascript("""
  window.WebTV.events.on('player:quality:changed', (event) => {
    WebTVBridge.onQualityChanged(JSON.stringify(event.payload));
  });
""", null)

@JavascriptInterface
fun onQualityChanged(payload: String) {
    val json = JSONObject(payload)
    val quality = json.getInt("quality")
    val levels = json.getJSONArray("levels")
    Log.d("WebTV", "Qualidade mudou para índice: $quality")
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

---

## Contrato Padrão para Scripts de Injeção

Todo script de injeção de player **deve** seguir este contrato para garantir
interoperabilidade com o sistema WebTV (DPAD, Android TV, Kotlin bridge).

### `window.WebTV.player` — API Obrigatória

| Método | Retorno | Descrição |
|--------|---------|-----------|
| `play()` | `Promise<{ok, reason?}>` | Iniciar reprodução |
| `pause()` | `{ok}` | Pausar reprodução |
| `stop()` | `{ok}` | Parar e resetar `currentTime` para 0 |
| `seek(t)` | `{ok, time}` | Ir para `t` segundos |
| `rewind(s?)` | `{ok, time}` | Voltar `s` segundos (padrão 10) |
| `forward(s?)` | `{ok, time}` | Avançar `s` segundos (padrão 10) |
| `volumeUp(s?)` | `{ok, volume}` | Aumentar volume em `s` (0–1) |
| `volumeDown(s?)` | `{ok, volume}` | Diminuir volume em `s` (0–1) |
| `mute()` | `{ok}` | Mutar áudio |
| `unmute()` | `{ok, volume}` | Desmutar áudio |
| `getStatus()` | `PlayerStatus` | Estado completo do player |
| `quality.getLevels()` | `QualityLevel[] \| null` | Níveis de qualidade disponíveis |
| `quality.getCurrent()` | `number` | Índice da qualidade atual (0 = Auto) |
| `quality.set(index)` | `boolean` | Selecionar qualidade pelo índice |
| `quality.setAuto()` | `boolean` | Voltar para qualidade Auto |
| `toggleAudioMute()` | `void` | Alternar mute (com hook `_webtvRemoteMute`) |
| `unmuteAudio()` | `void` | Forçar unmute + persistir `sessionStorage` |

```typescript
interface PlayerStatus {
  found: boolean
  paused: boolean
  muted: boolean
  volume: number           // 0.0 a 1.0
  currentTime: number
  duration: number
  src?: string             // apenas se found via <video>
  state?: string           // apenas JWPlayer: "playing", "paused", "idle"...
  quality: {
    current: number
    levels: QualityLevel[]
  }
}

interface QualityLevel {
  index: number
  label: string            // "Auto", "720p", "540p"...
  height: number
  width: number
  bitrate: number
}
```

### `window.WebTV.toggleAudioMute()` e `window.WebTV.unmuteAudio()`

Métodos utilitários expostos diretamente em `window.WebTV` para acesso rápido
do Kotlin sem precisar navegar pela hierarquia `player.*`.

### Estado de Áudio — `window._webtvAudioUnlocked`

- Controlado por `sessionStorage.getItem('webtv_audio_unlocked')` na inicialização
- Quando `true`, o hook `HTMLMediaElement.prototype.muted` **bloqueia** novas
  chamadas `muted = true` (impede que o player re-mute após desbloqueio do usuário)
- `window._webtvRemoteMute` permite que `toggleAudioMute()` bypass o hook

### Eventos que o Script Deve Emitir

| Evento | Payload | Quando |
|--------|---------|--------|
| `player:play` | `{currentTime, duration, isLive?, url?, source?}` | Reprodução inicia |
| `player:pause` | `{currentTime, duration}` | Reprodução pausa |
| `player:ended` | `{time: 0}` | Stream termina |
| `player:timeupdate` | `{currentTime, duration}` | `currentTime` muda |
| `player:seeked` | `{time, duration, direction?}` | Seek executado |
| `player:volume:changed` | `{volume, direction?}` | Volume alterado |
| `player:muted` | `{}` | Player mutado |
| `player:unmuted` | `{volume}` | Player desmutado |
| `player:error` | `{message, code?}` | Erro de reprodução |
| `player:loaded` | `{duration, isLive, quality?}` | Player pronto |
| `player:quality:changed` | `{quality, levels}` | Qualidade mudou |
| `player:audio:unlocked` | `{volume: 1.0}` | Usuário desbloqueou áudio |

### Padrão de `postEvent()`

```javascript
function postEvent(type, data) {
  var event = { source: 'webtv', name: type, payload: data || {}, timestamp: Date.now() };
  if (window.parent && window.parent !== window) window.parent.postMessage(event, '*');
  window.dispatchEvent(new CustomEvent(type, { detail: event }));
  window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
  if (window.WebViewBridge && window.WebViewBridge.postMessage) window.WebViewBridge.postMessage(JSON.stringify(event));
}
```

### Estrutura do Script (Template)

```javascript
(function() {
  'use strict';

  // 1. Persistência de áudio (sempre)
  if (sessionStorage.getItem('webtv_audio_unlocked')) window._webtvAudioUnlocked = true;

  // 2. Guarda de injeção única
  var SCRIPT_ID = 'meu-script-id';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;

  // 3. Hook muted (sempre) — protege contra re-mute
  try {
    var _md = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (_md && _md.set) {
      var _oms = _md.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        get: _md.get,
        set: function(v) {
          if (window._webtvAudioUnlocked && v === true && !window._webtvRemoteMute) return;
          _oms.call(this, v);
        }
      });
    }
  } catch(e) {}

  // 4. Remoção de overlays (se aplicável)
  // 5. Detecção do player (JWPlayer / Clappr / nativo)
  // 6. Autoplay com fallback muted → unmuted
  // 7. Setup de eventos do player
  // 8. Exposição da API (window.WebTV.player)
  // 9. Listener de comandos (webtv:command)
})();
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
  'player:quality:changed': PlayerQualityChangedPayload
  'player:backupSelected': PlayerBackupSelectedPayload
  'search:changed': SearchChangedPayload
  'sort:changed': SortChangedPayload
  'category:changed': CategoryChangedPayload
  'focus:changed': FocusChangedPayload
  'scroll:moved': ScrollMovedPayload
  'script:retrieved': ScriptRetrievedPayload
}

export interface PlayerQualityChangedPayload {
  quality: number
  levels: Array<{
    index: number
    label: string
    height: number
    width: number
    bitrate: number
  }>
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
