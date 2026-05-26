# WebTV — Guia de Scripts de Injeção para Players

Guia de referência para criar scripts de injeção que interagem com players de vídeo
em páginas externas carregadas via WebView.

## Quando Criar um Script de Injeção

Cenários que justificam um script de injeção para um URL de player:

| Cenário | O que o script faz |
|---------|-------------------|
| Player não expõe fullscreen automático | Força `requestFullscreen()` no `<video>` ao detectar `play` |
| Player embutido em iframe com banners/ads | Remove overlays via `MutationObserver` + `setInterval` |
| Precisa capturar eventos do player (play/pause/time) | Hook nos listeners nativos do `<video>` e emite via `postMessage` |
| Player usa API proprietária (Clappr, JW Player, Video.js) | Acessa a API do player e traduz para eventos padronizados |
| Controles customizados necessários | Injeta UI customizada (volume, qualidade, legendas) |

## Arquitetura de Injeção

```
┌─────────────────────────────────────────────────────────────────┐
│  Definição do Script (JSON)                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ { id, name, domains[], urls[], code: "..." }              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  Kotlin: ScriptRegistryService                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ allScriptsPayload ──▶ sendScriptRegistry()                │  │
│  │                          │                                │  │
│  │   Filtra por channelIds (se declarados no script)         │  │
│  │                          ▼                                │  │
│  │   webView.evaluateJavascript(                             │  │
│  │     "window.WebTV.scripts.register(...)"                  │  │
│  │   )                                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  appBridge.js: WebTV.scripts.register(payload)                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Armazena scripts no _registry{}                        │  │
│  │ 2. Chama injectAll() automaticamente                      │  │
│  │ 3. Para cada script, _matchUrl() verifica domain/url      │  │
│  │ 4. Se match → eval(code) no contexto da página            │  │
│  │ 5. Emite appBridge:script:injected ou :failed             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│  Script executado no DOM da página do player                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ IIFE com guarda de injeção única                          │  │
│  │ attach() com retry — procura <video> ou player API        │  │
│  │ Hook nos eventos nativos do player                        │  │
│  │ postMessage para comunicação cross-origin (iframe)        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de Disparo

| Gatilho | Quando | Chamada |
|---------|--------|---------|
| App carrega | `onPageFinished` | `sendScriptRegistry()` |
| Canal selecionado | `onChannelClicked` — tipo `redirect` | `sendScriptRegistry()` |
| Player abre | `onPlayerOpened` — tipo `iframe` | `injectScriptsForChannel()` → `sendScriptRegistry()` |
| Refresh manual | `onAppRefreshed` | `sendScriptRegistry()` |

## API do `window.WebTV.scripts`

Expõe o orquestrador de scripts no contexto da WebView. Todos os métodos são acessíveis
no console do Chrome DevTools para debug.

### Métodos

| Método | Parâmetros | Retorno | Descrição |
|--------|-----------|---------|-----------|
| `register(payload)` | `{ scripts: Script[] }` ou `Script[]` | `void` | Registra scripts e dispara `injectAll()` |
| `injectAll()` | — | `{ injected, failed }` | Injeta todos os scripts não-injetados, com match por domínio da URL atual |
| `injectForUrl(url)` | `string` | `{ injected, failed }` | Injeta scripts para uma URL específica |
| `injectOne(id)` | `string` | `boolean` | Injeta um script específico por ID |
| `disable(id)` | `string` | `void` | Desabilita script (não injeta em próximos ciclos) |
| `enable(id)` | `string` | `void` | Reabilita script |
| `reload(id)` | `string` | `boolean` | Reinjeta um script já injetado |
| `getRegistry()` | — | `Script[]` | Lista todos os scripts registrados |
| `getLogs()` | — | `LogEntry[]` | Últimos 200 eventos de injeção (debug) |
| `reset()` | — | `void` | Limpa registry e estado (chamado em `navigated:home`) |

### Eventos Emitidos

| Evento | Payload | Quando |
|--------|---------|--------|
| `appBridge:script:injected` | `{ scriptId, name, success: true }` | Script injetado com sucesso |
| `appBridge:script:failed` | `{ scriptId, name, error }` | Falha no `eval()` do script |
| `appBridge:scripts:ready` | `{ injected, failed, total }` | Ciclo de injeção concluído |
| `appBridge:script:toggled` | `{ scriptId, enabled }` | Script habilitado/desabilitado |

### Lógica de Matching

Cada script no registry é comparado com a URL atual. O matching usa dois campos:

- **`domains`**: array de strings. Match se `hostname === d` ou `hostname.endsWith('.' + d)`
- **`urls`**: array de strings. Match exato (`url === script.urls[j]`)

Um script é injetado se **qualquer** domínio ou URL der match. Scripts já injetados
(`_injected[id] === true`) ou desabilitados (`_disabled[id] === true`) são pulados.

> **Nota**: O matching de `domains` vs `urls` acontece no cliente (appBridge.js),
> não no Kotlin. O Kotlin apenas filtra por `channelIds` antes de enviar o registry.

## Template Canônico de Script

```javascript
(function() {
  'use strict';

  // ─── Guarda de injeção única ──────────────────────────────
  var SCRIPT_ID = 'SEU_SCRIPT_ID';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;

  // ─── Comunicação cross-origin ─────────────────────────────
  function postEvent(type, data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'webtv-player',
        type: type,
        timestamp: Date.now(),
        data: data
      }, '*');
    }
  }

  // ─── Remoção de banners/overlays ──────────────────────────
  function removeOverlays() {
    var selectors = ['.ad-overlay', '.vip-banner', '[class*="ad-"]' /* ... */];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) els[j].remove();
    }
  }

  function observeOverlays() {
    removeOverlays();
    var observer = new MutationObserver(function() { removeOverlays(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(removeOverlays, 3000);
  }

  // ─── Fullscreen automático ────────────────────────────────
  function requestFullscreen(video) {
    var fn = video.requestFullscreen ||
             video.webkitRequestFullscreen ||
             video.mozRequestFullScreen ||
             video.msRequestFullscreen;
    if (fn) {
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl) fn.call(video).catch(function() {});
    }
  }

  // ─── Hook nos eventos do player ───────────────────────────
  function attach() {
    var video = document.querySelector('video'); // ou seletor específico
    if (!video) return setTimeout(attach, 500);

    video.addEventListener('play', function() {
      requestFullscreen(video);
      postEvent('play', { currentTime: video.currentTime, duration: video.duration });
    });

    video.addEventListener('pause', function() {
      postEvent('pause', { currentTime: video.currentTime, duration: video.duration });
    });

    video.addEventListener('timeupdate', function() {
      postEvent('timeupdate', { currentTime: video.currentTime, duration: video.duration });
    });

    video.addEventListener('ended', function() {
      postEvent('ended', { currentTime: video.currentTime, duration: video.duration });
    });

    video.addEventListener('volumechange', function() {
      postEvent('volume', { volume: video.volume, muted: video.muted });
    });

    video.addEventListener('error', function() {
      postEvent('error', { error: video.error ? video.error.message : 'unknown' });
    });

    // Fullscreen
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function(evt) {
      document.addEventListener(evt, function() {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        postEvent('fullscreen', { isFullscreen: isFs });
      });
    });

    postEvent('ready', { currentTime: video.currentTime, duration: video.duration });
  }

  // ─── Bootstrap ────────────────────────────────────────────
  observeOverlays();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
```

### Pontos Críticos do Template

| Elemento | Propósito | Obrigatório? |
|----------|-----------|:---:|
| **Guarda `__webtv_<ID>`** | Evita injeção duplicada em reloads/navegação | Sim |
| **`postEvent()`** | Comunicação cross-origin para o frontend (iframe) | Se iframe |
| **`attach()` com retry** | Espera o player carregar dinamicamente | Sim |
| **`MutationObserver`** | Remove elementos injetados após carga inicial | Se banners |
| **Listeners nativos** | Captura play/pause/time/volume/etc | Sim |
| **Fullscreen em `play`** | UX: fullscreen automático ao iniciar | Recomendado |

## Mapeamento de Eventos do Player

### Eventos Nativos do `<video>`

| Evento HTML | PostMessage `type` | Payload | Dispara quando |
|-------------|-------------------|---------|---------------|
| `play` | `play` | `currentTime, duration` | Reprodução inicia/resume |
| `pause` | `pause` | `currentTime, duration` | Reprodução pausada |
| `timeupdate` | `timeupdate` | `currentTime, duration` | `currentTime` muda (~4x/s) |
| `ended` | `ended` | `currentTime, duration` | Player chega ao fim |
| `volumechange` | `volume` | `volume, muted` | Volume ou mute alterados |
| `error` | `error` | `error: string` | Erro de carregamento/reprodução |
| `loadedmetadata` | `ready` | `currentTime: 0, duration` | Metadados carregados (duração conhecida) |

### Eventos Sintéticos (não-nativos)

| PostMessage `type` | Payload | Dispara quando |
|-------------------|---------|---------------|
| `ready` | `currentTime, duration` | `attach()` conclui com sucesso |
| `fullscreen` | `isFullscreen: boolean` | Fullscreen entra/sai |
| `error` | `error: string` | Qualquer erro capturado pelo script |

### Payload Padronizado

```typescript
interface PlayerEventData {
  currentTime?: number   // segundos (0-based)
  duration?: number      // segundos (0 = live/desconhecido)
  volume?: number        // 0.0 a 1.0
  muted?: boolean
  isFullscreen?: boolean
  error?: string
}
```

> **Live streams**: `duration` será frequentemente `Infinity`, `NaN` ou `0`.
> Scripts devem tratar esses valores com fallback (`data.duration || 0`).

## Registro de Script via `appBridge.js`

Scripts são definidos como objetos JSON e enviados ao `appBridge.js` via Kotlin.
A definição segue a interface `Script`:

```typescript
interface Script {
  id: string            // UUID único (ex: "clappr-player-events")
  name: string          // Nome legível (ex: "Clappr Player Events")
  domains: string[]     // Domínios onde o script se aplica (ex: ["embedcanaisdetv.xyz"])
  urls: string[]        // URLs exatas onde o script se aplica (ex: ["https://exemplo.com/player"])
  code: string          // Código JavaScript do script (minificado)
  enabled: boolean      // true = ativo, false = desabilitado
  createdAt: number     // Timestamp de criação
  updatedAt: number     // Timestamp da última atualização
  channelIds?: string[] // (opcional) IDs de canais específicos
}
```

### Exemplo de Payload de Registro

```json
{
  "scripts": [
    {
      "id": "meu-player-script",
      "name": "Meu Player Script",
      "domains": ["exemplo.com", "cdn.exemplo.com"],
      "urls": ["https://exemplo.com/player/embed"],
      "code": "(function(){'use strict';var id='meu-player-script';if(window['__webtv_'+id])return;window['__webtv_'+id]=true;function attach(){var v=document.querySelector('video');if(!v)return setTimeout(attach,500);v.addEventListener('play',function(){postEvent('play',{currentTime:v.currentTime,duration:v.duration})});}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);else attach();function postEvent(t,d){if(window.parent&&window.parent!==window){window.parent.postMessage({source:'webtv-player',type:t,timestamp:Date.now(),data:d},'*')}}})();",
      "enabled": true,
      "createdAt": 1716150000000,
      "updatedAt": 1716150000000
    }
  ]
}
```

### Fluxo de Entrega

1. O payload é armazenado no Kotlin (`allScriptsPayload`)
2. `sendScriptRegistry()` escapa o JSON e chama:
   ```javascript
   window.WebTV.scripts.register(JSON.parse('{...}'));
   ```
3. `register()` popula `_registry{}` e chama `injectAll()`
4. `injectAll()` eval cada script cujo `domains`/`urls` dá match com a URL atual
5. Script é guardado (`__webtv_<ID>`) para evitar re-injeção

> **Importante**: O código do script (`code`) deve ser **minificado em uma única linha**
> para evitar problemas de escaping com `\n` e `\r` no `evaluateJavascript`.

## Exemplo Real: `clappr-player-events.js`

Localização: `frontend/docs/scripts/clappr-player-events.js`

Este script é o modelo de referência. Abaixo, um breakdown anotado:

```javascript
(function() {
  'use strict';
  // ─── IIFE: isola escopo, evita poluir window ──────────────

  const postEvent = (type, data) => {
    // ─── Emite evento cross-origin via postMessage ───────────
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'clappr-player',    // Identificador da origem
        type,                        // Tipo do evento (play, pause...)
        timestamp: Date.now(),
        data: {                      // Payload padronizado
          currentTime: data.currentTime || 0,
          duration: data.duration || 0,
          volume: data.volume ?? null,
          muted: data.muted ?? null,
          isFullscreen: data.isFullscreen ?? null
        }
      }, '*');
    }
  };

  const removeBanners = () => {
    // ─── Remove overlays de VIP/anúncios ────────────────────
    document.querySelectorAll(
      '.vip-modal, .vip-banner, [class*="vip"], [class*="anuncio"], ' +
      '[class*="ad-"], .fc-ab-root'
    ).forEach(el => el.remove());

    // ─── Remove elementos com z-index alto fora do player ────
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'absolute') &&
          parseInt(style.zIndex) > 9000 &&
          !el.closest('#player')) {
        el.remove();
      }
    });
  };

  const observeBanners = () => {
    // ─── Observer + polling para banners dinâmicos ──────────
    removeBanners();
    const observer = new MutationObserver(() => removeBanners());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(removeBanners, 3000);
  };

  const requestFullscreen = (video) => {
    // ─── Fullscreen cross-browser ───────────────────────────
    const fn = video.requestFullscreen ||
               video.webkitRequestFullscreen ||
               video.mozRequestFullScreen ||
               video.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      fn.call(video).catch(() => {});
    }
  };

  const attach = () => {
    // ─── Seletor específico do Clappr: video[data-html5-video] ──
    const video = document.querySelector('video[data-html5-video]');
    if (!video) return setTimeout(attach, 500);  // Retry

    // ─── Eventos do player ──────────────────────────────────
    video.addEventListener('play', () => {
      requestFullscreen(video);
      postEvent('play', { currentTime: video.currentTime, duration: video.duration });
    });
    video.addEventListener('pause', () =>
      postEvent('pause', { currentTime: video.currentTime, duration: video.duration })
    );
    video.addEventListener('volumechange', () =>
      postEvent('volume', { volume: video.volume, muted: video.muted })
    );
    video.addEventListener('timeupdate', () =>
      postEvent('timeupdate', { currentTime: video.currentTime, duration: video.duration })
    );
    video.addEventListener('ended', () =>
      postEvent('ended', { currentTime: video.currentTime, duration: video.duration })
    );

    // ─── Fullscreen events ──────────────────────────────────
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
      document.addEventListener(evt, () => {
        postEvent('fullscreen', {
          isFullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement)
        });
      });
    });

    postEvent('ready', { currentTime: video.currentTime, duration: video.duration });
  };

  // ─── Bootstrap ────────────────────────────────────────────
  observeBanners();                          // Começa imediatamente (banners)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
```

### Decisões de Design no Script Clappr

| Decisão | Motivo |
|---------|--------|
| Seletor `video[data-html5-video]` | Clappr marca o `<video>` com esse atributo; evita capturar vídeos de anúncios |
| `postMessage` com `source: 'clappr-player'` | Identifica a origem no listener do frontend |
| `setInterval(removeBanners, 3000)` | Fallback para banners injetados por JS após carga |
| `requestFullscreen` no `play` | UX desejada: fullscreen automático ao iniciar reprodução |
| Retry `setTimeout(attach, 500)` | Player Clappr carrega dinamicamente; script espera o `<video>` existir |

## Checklist de Criação

Use esta lista ao criar um novo script de injeção para player:

- [ ] **Analisar a página do player**
  - [ ] Identificar o seletor do elemento `<video>` (ou API do player)
  - [ ] Verificar se há overlays/banners para remover (inspecionar classes CSS)
  - [ ] Testar se o `<video>` existe no `DOMContentLoaded` ou é injetado depois
  - [ ] Verificar se a página usa iframe (necessário `postMessage` para cross-origin)

- [ ] **Criar o script**
  - [ ] Copiar o template canônico da seção acima
  - [ ] Definir `SCRIPT_ID` único (recomendado: slug do domínio, ex: `embedcanaisdetv-xyz`)
  - [ ] Ajustar seletor do `<video>` em `attach()`
  - [ ] Mapear eventos relevantes (no mínimo: `play`, `pause`, `ended`)
  - [ ] Adicionar `MutationObserver` se houver elementos dinâmicos
  - [ ] Adicionar `requestFullscreen()` se desejado

- [ ] **Minificar o código**
  - [ ] Reduzir para uma única linha (remover comentários e whitespace)
  - [ ] Testar minificação: `node -e "console.log(JSON.stringify(require('fs').readFileSync('script.js','utf8')))"`
  - [ ] Verificar que não há quebras de linha no código minificado

- [ ] **Registrar no sistema**
  - [ ] Criar entrada JSON com `id`, `name`, `domains[]`, `urls[]`, `code`, `enabled: true`
  - [ ] Adicionar ao array `scripts` no payload do `allScriptsPayload` (Kotlin)
  - [ ] Opcional: vincular a canais específicos via `channelIds[]`

- [ ] **Testar**
  - [ ] Abrir o player no WebView/Chrome DevTools
  - [ ] Verificar injeção: `window.WebTV.scripts.getLogs()`
  - [ ] Verificar guarda: `window['__webtv_<SCRIPT_ID>']` deve ser `true`
  - [ ] Verificar eventos: escutar `postMessage` no console do frontend
  - [ ] Testar reload: script não deve ser injetado duas vezes

## Referência Rápida: `window.WebTV`

API relevante para desenvolvimento e debug de scripts:

```javascript
// ─── Eventos (EventBus) ─────────────────────────────────────
window.WebTV.events.on('event:name', fn)     // Subscrever
window.WebTV.events.emit('event:name', data) // Emitir
window.WebTV.events.getHistory()             // Últimos 100 eventos

// ─── Canal ativo ────────────────────────────────────────────
window.WebTV.channel.activeId                // ID do canal ativo (string | null)
window.WebTV.channel.activeName              // Nome do canal ativo
window.WebTV.channel.close()                 // Fechar canal → BRIDGE.onChannelClosed

// ─── Scripts (Orquestrador) ─────────────────────────────────
window.WebTV.scripts.register(payload)       // Registrar scripts
window.WebTV.scripts.injectAll()             // Injeta todos com match
window.WebTV.scripts.injectForUrl(url)       // Injeta para URL específica
window.WebTV.scripts.injectOne(id)           // Injeta script específico
window.WebTV.scripts.disable(id)             // Desabilitar
window.WebTV.scripts.enable(id)              // Habilitar
window.WebTV.scripts.reload(id)              // Reinjetar
window.WebTV.scripts.getRegistry()           // Listar scripts registrados
window.WebTV.scripts.getLogs()               // Log de injeções (debug)
window.WebTV.scripts.reset()                 // Limpar estado

// ─── Console Interceptor ────────────────────────────────────
// console.log/warn/error são interceptados e enviados ao Kotlin
// via WebTVBridge.onConsoleLog({ level, message })
// Use console.log normalmente — as mensagens aparecem no logcat.
```

### Debug no Chrome DevTools

```javascript
// Verificar scripts registrados
JSON.stringify(window.WebTV.scripts.getRegistry(), null, 2)

// Verificar logs de injeção
window.WebTV.scripts.getLogs()

// Verificar guarda do script
window['__webtv_clappr-player-events']  // true se injetado

// Verificar canal ativo
window.WebTV.channel.activeId

// Emitir evento de teste
window.WebTV.events.emit('test', { msg: 'hello' })
```

---

## Apêndice: Scripts Existentes

| Script | Arquivo | Domínios | Função |
|--------|---------|----------|--------|
| Clappr Player Events | `frontend/docs/scripts/clappr-player-events.js` | `embedcanaisdetv.xyz` | Fullscreen, remoção de banners, eventos do player Clappr |
