# Domínio rdcanais.com — Documentação Unificada

## Visão Geral

O domínio `rdcanais.com` funciona como um agregador de canais. Cada canal carrega
um iframe de `rdcplayer.online` com um player de vídeo. Existem **dois padrões
distintos** de player, dependendo do canal:

| Padrão | URL do iframe | Player | Canais exemplo |
|--------|---------------|--------|----------------|
| **Clappr + P2P** | `https://rdcplayer.online/hls/<canal>.html` | Clappr + p2p-media-loader (SwarmCloud) | globosp, ... |
| **JWPlayer** | `https://rdcplayer.online/multi/player.html?m3u8=<stream_url>` | JWPlayer 8.x | sbt, ... |

---

## Padrão 1: Clappr + P2P (ex: globosp)

### Arquitetura

```
rdcanais.com/globosp
  └── <iframe src="https://rdcplayer.online/hls/globosp.html">
        ├── Clappr.Player (autoPlay: true)
        │     └── HLS via hls.js + p2p-media-loader engine
        ├── p2p-media-loader-core (WebTorrent P2P)
        │     ├── Trackers: btorrent.xyz, openwebtorrent.com, ghostchu-services.top
        │     └── STUN: Google STUN servers
        ├── Clappr plugins: Poster, Chromecast, QualitySelector
        └── <video data-html5-video> (elemento nativo)
```

### Configuração do Player (extraída)

```javascript
var m3u8Url = 'https://agropesca.live/live/globosp/index.m3u8';

var engine = new p2pml.hlsjs.Engine({
    cachedSegmentExpiration: 86400000,
    cachedSegmentsCount: 1000,
    simultaneousHttpDownloads: 1,
    httpDownloadProbabilitySkipIfNoPeers: true,
    httpDownloadInitialTimeout: 10000,
    httpDownloadInitialTimeoutPerSegment: 5000,
    loader: {
        httpUseRanges: true,
        WaitForTracker: true,
        WaitForTrackerCounter: 9500,
        trackerAnnounce: [
            'wss://tracker.btorrent.xyz:443',
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.ghostchu-services.top:443/announce',
        ],
        rtcConfig: {
            iceServers: [
                { urls: "stun:stun4.l.google.com:19302" },
                { urls: "stun:stun3.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        }
    }
});

var player = new Clappr.Player({
    parentId: "#player",
    source: m3u8Url,
    mimeType: 'application/x-mpegURL',
    autoPlay: true,
    width: '100%',
    height: '100%',
    plugins: [ChromecastPlugin, QualitySelector, Clappr.Poster],
    playback: {
        hlsjsConfig: {
            liveSyncDurationCount: 60,
            maxBufferLength: 60,
            loader: engine.createLoaderClass(),
        },
    },
});

p2pml.hlsjs.initClapprPlayer(player);
player.setVolume(50);
player.play();
```

### Anti-devtools
- ❌ Nenhum detectado
- Segmentos de vídeo nomeados como `IMG_*.png` (ofuscação leve)

### Interação Possível
| Método | Funciona? |
|--------|-----------|
| `document.querySelector('video[data-html5-video]').play()` | ✅ |
| `Clappr.Mediator` | ✅ (mas prefira o `<video>` direto) |
| `player.play()` (instância Clappr) | ✅ (se a referência for encontrada) |

---

## Padrão 2: JWPlayer (ex: sbt)

### Arquitetura

```
rdcanais.com/sbt
  └── <iframe src="https://rdcplayer.online/multi/player.html?m3u8=<stream_url>">
        ├── JWPlayer 8.38.3
        │     └── HLS via hls.js (nativo do JWPlayer, sem P2P)
        ├── console-ban@4.1.0 (anti-devtools)
        │     └── Redireciona para google.com se DevTools aberto
        └── <video class="jw-video"> (elemento nativo)
```

### Configuração do Player (extraída)

```javascript
jwplayer.key = 'XSuP4qMl+9tK17QNb+4+th2Pm9AWgMO/cYH8CI0HGGr7bdjo';
const playerInstance = jwplayer('player').setup({
    file: m3u8_url,   // vindo de ?m3u8= na URL
    width: '100%',
    height: '100%',
    autostart: false,
    mute: false,
    controls: true,
    stretching: 'uniform',
    preload: 'metadata',
    primary: 'html5'
});
```

### Stream URL
Passada via query param `m3u8` na URL do iframe:
```
https://rdcplayer.online/multi/player.html?m3u8=https://d1jvs4svzaqp8n.cloudfront.net/v1/master/.../indexMobile.m3u8
```

### Anti-devtools
- ✅ `console-ban@4.1.0` — detecta DevTools e redireciona para `https://www.google.com`
- **Mitigação**: A injeção via `frame.evaluate()` do Playwright não dispara o detector.
  O script injetado também não aciona porque o `console-ban` hooka `console.log` e
  o script não precisa chamar console.log durante a injeção.

### Interação Possível
| Método | Funciona? |
|--------|-----------|
| `jwplayer().play()` | ✅ |
| `jwplayer().pause()` | ✅ |
| `jwplayer().setFullscreen(true)` | ✅ |
| `jwplayer().getState()` | ✅ retorna `idle`, `buffering`, `playing`, `paused` |
| `jwplayer().getPosition()` / `.getDuration()` | ✅ |
| `jwplayer().setVolume(n)` | ✅ (0-100) |
| `document.querySelector('video.jw-video').play()` | ✅ (fallback) |

---

## Scripts de Injeção

### Localização
Os scripts abaixo seguem o template canônico de `INJECTION_SCRIPTS.md` e herdam
a arquitetura do `scratch/script-with-autoplay.js` (autoplay, bloqueio de VIP/ads,
emissão de eventos, API de controle exposta via `window.WebTV.player`).

### Registro no Sistema
Devem ser registrados no `allScriptsPayload` do Kotlin (`ScriptRegistryService`)
com os seguintes parâmetros:

| Script | `id` | `domains` | `urls` |
|--------|------|-----------|--------|
| Clappr+P2P | `rdcanais-clappr-p2p` | `["rdcplayer.online"]` | `["https://rdcplayer.online/hls/globosp.html"]` |
| JWPlayer | `rdcanais-jwplayer` | `["rdcplayer.online"]` | `["https://rdcplayer.online/multi/player.html"]` |

### Script: Clappr+P2P

**Arquivo:** `frontend/docs/scripts/rdcanais-clappr-p2p.js`

```javascript
(function() {
  'use strict';

  // ─── Guarda de injeção única ──────────────────────────────
  var SCRIPT_ID = 'rdcanais-clappr-p2p';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;

  // ─── Seletor específico do player ──────────────────────────
  var VIDEO_SELECTOR = 'video[data-html5-video]';

  // ─── Comunicação cross-origin ─────────────────────────────
  function postEvent(type, data) {
    var event = {
      source: 'webtv',
      name: type,
      payload: data || {},
      timestamp: Date.now(),
    };

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(event, '*');
    }
    window.dispatchEvent(new CustomEvent(type, { detail: event }));
    window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
    if (window.WebViewBridge && window.WebViewBridge.postMessage) {
      window.WebViewBridge.postMessage(JSON.stringify(event));
    }
  }

  // ─── Remoção de banners/VIP ───────────────────────────────
  var AD_SELECTORS = [
    '[class*="ad-"]', '[id*="ad-"]',
    '[class*="popup"]', '[class*="modal"]',
    '.fc-ab-root',
    'iframe[src*="ad"]', 'iframe[src*="banner"]',
    'iframe[src*="pop"]', 'iframe[src*="click"]'
  ];

  var VIP_SELECTORS = [
    '#vipModal', '[class*="vip-modal"]',
    '[id*="vip"]', '[class*="vip"]',
    '.vip-modal', '.is-vip'
  ];

  function removeOverlays() {
    var all = AD_SELECTORS.concat(VIP_SELECTORS);
    for (var i = 0; i < all.length; i++) {
      var els = document.querySelectorAll(all[i]);
      for (var j = 0; j < els.length; j++) els[j].remove();
    }
  }

  function observeOverlays() {
    removeOverlays();
    var observer = new MutationObserver(function() { removeOverlays(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(removeOverlays, 3000);
  }

  // ─── Fullscreen cross-browser ─────────────────────────────
  function requestFullscreen(el) {
    var fn = el.requestFullscreen ||
             el.webkitRequestFullscreen ||
             el.mozRequestFullScreen ||
             el.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      fn.call(el).catch(function() {});
    }
  }

  // ─── Autoplay com fallback de áudio ───────────────────────
  function tryAutoplay(video) {
    if (!video) return;

    video.muted = true;
    video.playsInline = true;

    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function() {
        postEvent('player:play', {
          time: video.currentTime,
          isLive: !video.duration || !isFinite(video.duration),
          source: 'auto'
        });
      }).catch(function() {
        postEvent('player:error', {
          message: 'Autoplay blocked',
          requiresUserInteraction: true
        });
        createAudioUnlockOverlay();
      });
    }
  }

  function createAudioUnlockOverlay() {
    if (document.getElementById('webtv-audio-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'webtv-audio-overlay';
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;',
      'background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;',
      'cursor:pointer;opacity:0;transition:opacity .3s;'
    ].join('');

    overlay.innerHTML = [
      '<div style="text-align:center">',
      '  <svg viewBox="0 0 24 24" width="80" height="80" fill="#fff" style="margin-bottom:1rem">',
      '    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>',
      '  </svg>',
      '  <div style="color:#fff;font:bold 20px Arial,sans-serif">Toque para ativar o áudio</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.style.opacity = '1'; });

    function unlock() {
      var videos = document.querySelectorAll(VIDEO_SELECTOR);
      for (var i = 0; i < videos.length; i++) {
        videos[i].muted = false;
        videos[i].volume = 1.0;
        if (videos[i].paused) videos[i].play().catch(function() {});
      }
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(function() { overlay.remove(); }, 300);
      postEvent('player:audio:unlocked', { volume: 1.0 });
    }

    overlay.addEventListener('click', unlock, { once: true });
    overlay.addEventListener('touchstart', unlock, { once: true });
  }

  // ─── Hook nos eventos do player ───────────────────────────
  function setupVideoEvents(video) {
    video.addEventListener('play', function() {
      requestFullscreen(video);
      postEvent('player:play', {
        currentTime: video.currentTime,
        duration: video.duration || 0,
        isLive: !video.duration || !isFinite(video.duration)
      });
    });

    video.addEventListener('pause', function() {
      postEvent('player:pause', {
        currentTime: video.currentTime,
        duration: video.duration || 0
      });
    });

    video.addEventListener('ended', function() {
      postEvent('player:ended', { currentTime: 0 });
    });

    video.addEventListener('timeupdate', function() {
      postEvent('player:timeupdate', {
        currentTime: video.currentTime,
        duration: video.duration || 0
      });
    });

    video.addEventListener('volumechange', function() {
      postEvent('player:volume', {
        volume: video.volume,
        muted: video.muted
      });
    });

    video.addEventListener('seeked', function() {
      postEvent('player:seeked', {
        time: video.currentTime,
        duration: video.duration || 0
      });
    });
  }

  // ─── API de controle exposta ──────────────────────────────
  function findVideo() {
    return document.querySelector(VIDEO_SELECTOR);
  }

  var playerAPI = {
    play: function() {
      var v = findVideo();
      if (!v) return { ok: false, reason: 'no video' };
      return v.play().then(function() {
        postEvent('player:play', { source: 'api', time: v.currentTime });
        return { ok: true, time: v.currentTime };
      }).catch(function(e) {
        return { ok: false, reason: String(e) };
      });
    },
    pause: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      v.pause();
      postEvent('player:pause', { time: v.currentTime });
      return { ok: true };
    },
    stop: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      v.pause();
      v.currentTime = 0;
      postEvent('player:ended', {});
      return { ok: true };
    },
    seek: function(t) {
      var v = findVideo();
      if (!v) return { ok: false };
      v.currentTime = Math.max(0, Math.min(v.duration || Infinity, t));
      return { ok: true, time: v.currentTime };
    },
    volumeUp: function(s) {
      s = s || 0.1;
      var v = findVideo();
      if (!v) return { ok: false };
      v.volume = Math.min(1, v.volume + s);
      v.muted = false;
      return { ok: true, volume: v.volume };
    },
    volumeDown: function(s) {
      s = s || 0.1;
      var v = findVideo();
      if (!v) return { ok: false };
      v.volume = Math.max(0, v.volume - s);
      return { ok: true, volume: v.volume };
    },
    mute: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      v.muted = true;
      return { ok: true };
    },
    unmute: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      v.muted = false;
      if (v.volume === 0) v.volume = 1;
      return { ok: true, volume: v.volume };
    },
    fullscreen: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      requestFullscreen(v);
      return { ok: true };
    },
    getStatus: function() {
      var v = findVideo();
      if (!v) return { found: false };
      return {
        found: true,
        paused: v.paused,
        muted: v.muted,
        volume: v.volume,
        currentTime: v.currentTime,
        duration: v.duration || 0,
        src: v.src
      };
    }
  };

  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;

  // ─── Listener de comandos via postMessage ─────────────────
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || d.source !== 'webtv:command') return;
    var method = d.method, args = d.args || [], id = d.id;
    if (typeof playerAPI[method] !== 'function') return;

    Promise.resolve(playerAPI[method].apply(playerAPI, args)).then(function(result) {
      var response = { source: 'webtv:response', method: method, id: id, result: result };
      if (e.source) e.source.postMessage(response, '*');
      window.dispatchEvent(new CustomEvent('webtv:event', {
        detail: { type: 'api:response', data: response }
      }));
      if (window.WebViewBridge && window.WebViewBridge.postMessage) {
        window.WebViewBridge.postMessage(JSON.stringify(response));
      }
    });
  });

  // ─── Bootstrap ────────────────────────────────────────────
  observeOverlays();

  function init() {
    var video = findVideo();
    if (video) {
      setupVideoEvents(video);
      tryAutoplay(video);
      postEvent('player:loaded', {
        duration: video.duration || 0,
        isLive: !video.duration || !isFinite(video.duration)
      });
    } else {
      var obs = new MutationObserver(function() {
        var v = findVideo();
        if (v) {
          obs.disconnect();
          setupVideoEvents(v);
          tryAutoplay(v);
          postEvent('player:loaded', {
            duration: v.duration || 0,
            isLive: !v.duration || !isFinite(v.duration)
          });
        }
      });
      obs.observe(document.body || document.documentElement, {
        childList: true, subtree: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

### Script: JWPlayer

**Arquivo:** `frontend/docs/scripts/rdcanais-jwplayer.js`

```javascript
(function() {
  'use strict';

  // ─── Guarda de injeção única ──────────────────────────────
  var SCRIPT_ID = 'rdcanais-jwplayer';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;

  // ─── Comunicação cross-origin ─────────────────────────────
  function postEvent(type, data) {
    var event = {
      source: 'webtv',
      name: type,
      payload: data || {},
      timestamp: Date.now(),
    };

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(event, '*');
    }
    window.dispatchEvent(new CustomEvent(type, { detail: event }));
    window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
    if (window.WebViewBridge && window.WebViewBridge.postMessage) {
      window.WebViewBridge.postMessage(JSON.stringify(event));
    }
  }

  // ─── Remoção de banners/VIP ───────────────────────────────
  var AD_SELECTORS = [
    '[class*="ad-"]', '[id*="ad-"]',
    '[class*="popup"]', '[class*="modal"]',
    '.fc-ab-root',
    'iframe[src*="ad"]', 'iframe[src*="banner"]',
    'iframe[src*="pop"]', 'iframe[src*="click"]'
  ];

  var VIP_SELECTORS = [
    '#vipModal', '[class*="vip-modal"]',
    '[id*="vip"]', '[class*="vip"]',
    '.vip-modal', '.is-vip'
  ];

  function removeOverlays() {
    var all = AD_SELECTORS.concat(VIP_SELECTORS);
    for (var i = 0; i < all.length; i++) {
      var els = document.querySelectorAll(all[i]);
      for (var j = 0; j < els.length; j++) els[j].remove();
    }
  }

  function observeOverlays() {
    removeOverlays();
    var observer = new MutationObserver(function() { removeOverlays(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(removeOverlays, 3000);
  }

  // ─── Fullscreen cross-browser (via JWPlayer API) ──────────
  function requestFullscreenJW() {
    if (typeof jwplayer === 'function') {
      jwplayer().setFullscreen(true);
    }
  }

  function requestFullscreenNative(el) {
    var fn = el.requestFullscreen ||
             el.webkitRequestFullscreen ||
             el.mozRequestFullScreen ||
             el.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      fn.call(el).catch(function() {});
    }
  }

  // ─── Autoplay com fallback de áudio ───────────────────────
  function tryAutoplay(video) {
    if (!video) return;

    video.muted = true;
    video.playsInline = true;

    // Tentativa 1: via JWPlayer API (mais confiável)
    if (typeof jwplayer === 'function') {
      var jwp = jwplayer();
      if (jwp && typeof jwp.play === 'function') {
        jwp.play();
        // Se JWPlayer.play() disparou, o evento será capturado pelo listener nativo
        return;
      }
    }

    // Tentativa 2: via elemento <video> nativo (fallback)
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function() {
        postEvent('player:play', { source: 'auto', time: video.currentTime });
      }).catch(function() {
        postEvent('player:error', {
          message: 'Autoplay blocked',
          requiresUserInteraction: true
        });
        createAudioUnlockOverlay();
      });
    }
  }

  function createAudioUnlockOverlay() {
    if (document.getElementById('webtv-audio-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'webtv-audio-overlay';
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;',
      'background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;',
      'cursor:pointer;opacity:0;transition:opacity .3s;'
    ].join('');

    overlay.innerHTML = [
      '<div style="text-align:center">',
      '  <svg viewBox="0 0 24 24" width="80" height="80" fill="#fff" style="margin-bottom:1rem">',
      '    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>',
      '  </svg>',
      '  <div style="color:#fff;font:bold 20px Arial,sans-serif">Toque para ativar o áudio</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.style.opacity = '1'; });

    function unlock() {
      if (typeof jwplayer === 'function') {
        jwplayer().setVolume(100);
      }
      document.querySelectorAll('video').forEach(function(v) {
        v.muted = false;
        v.volume = 1.0;
        if (v.paused) v.play().catch(function() {});
      });
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(function() { overlay.remove(); }, 300);
      postEvent('player:audio:unlocked', { volume: 1.0 });
    }

    overlay.addEventListener('click', unlock, { once: true });
    overlay.addEventListener('touchstart', unlock, { once: true });
  }

  // ─── Hook nos eventos do JWPlayer ─────────────────────────
  function setupJWPlayerEvents() {
    if (typeof jwplayer !== 'function') return false;

    var jwp = jwplayer();
    if (!jwp || typeof jwp.on !== 'function') return false;

    jwp.on('play', function() {
      requestFullscreenJW();
      postEvent('player:play', {
        currentTime: jwp.getPosition(),
        duration: jwp.getDuration() || 0,
        isLive: !jwp.getDuration()
      });
    });

    jwp.on('pause', function() {
      postEvent('player:pause', {
        currentTime: jwp.getPosition(),
        duration: jwp.getDuration() || 0
      });
    });

    jwp.on('complete', function() {
      postEvent('player:ended', { currentTime: 0 });
    });

    jwp.on('time', function(data) {
      postEvent('player:timeupdate', {
        currentTime: data.position,
        duration: data.duration || 0
      });
    });

    jwp.on('volume', function(data) {
      postEvent('player:volume', {
        volume: data.volume / 100,
        muted: data.muted
      });
    });

    jwp.on('fullscreen', function(data) {
      postEvent('player:fullscreen', { isFullscreen: data.fullscreen });
    });

    jwp.on('error', function(e) {
      postEvent('player:error', { message: e.message || 'unknown' });
    });

    jwp.on('ready', function() {
      postEvent('player:loaded', {
        duration: jwp.getDuration() || 0,
        isLive: !jwp.getDuration()
      });
    });

    // Também hooka nos eventos nativos do <video> como fallback
    var video = document.querySelector('video');
    if (video) {
      video.addEventListener('play', function() { requestFullscreenNative(video); });
      video.addEventListener('pause', function() {});
      video.addEventListener('volumechange', function() {});
      video.addEventListener('seeked', function() {});
    }

    return true;
  }

  // ─── API de controle exposta ──────────────────────────────
  function getVideo() {
    return document.querySelector('video');
  }

  function withJWPlayer(fn) {
    if (typeof jwplayer === 'function') {
      var jwp = jwplayer();
      if (jwp) return fn(jwp);
    }
    return null;
  }

  function withVideo(fn) {
    var v = getVideo();
    if (v) return fn(v);
    return null;
  }

  var playerAPI = {
    play: function() {
      var r = withJWPlayer(function(jwp) { jwp.play(); return { ok: true }; });
      if (r) return Promise.resolve(r);
      return withVideo(function(v) {
        return v.play().then(function() { return { ok: true, time: v.currentTime }; })
          .catch(function(e) { return { ok: false, reason: String(e) }; });
      }) || Promise.resolve({ ok: false, reason: 'no player' });
    },
    pause: function() {
      var r = withJWPlayer(function(jwp) { jwp.pause(); return { ok: true }; });
      if (r) return r;
      withVideo(function(v) { v.pause(); });
      return { ok: true };
    },
    stop: function() {
      var r = withJWPlayer(function(jwp) {
        jwp.stop();
        return { ok: true };
      });
      if (r) return r;
      withVideo(function(v) { v.pause(); v.currentTime = 0; });
      return { ok: true };
    },
    seek: function(t) {
      var r = withJWPlayer(function(jwp) {
        jwp.seek(t);
        return { ok: true };
      });
      if (r) return r;
      withVideo(function(v) { v.currentTime = t; });
      return { ok: true };
    },
    volumeUp: function(s) {
      s = s || 10;
      var r = withJWPlayer(function(jwp) {
        var vol = Math.min(100, jwp.getVolume() + s);
        jwp.setVolume(vol);
        return { ok: true, volume: vol / 100 };
      });
      if (r) return r;
      withVideo(function(v) { v.volume = Math.min(1, v.volume + (s / 100)); });
      return { ok: true };
    },
    volumeDown: function(s) {
      s = s || 10;
      var r = withJWPlayer(function(jwp) {
        var vol = Math.max(0, jwp.getVolume() - s);
        jwp.setVolume(vol);
        return { ok: true, volume: vol / 100 };
      });
      if (r) return r;
      withVideo(function(v) { v.volume = Math.max(0, v.volume - (s / 100)); });
      return { ok: true };
    },
    mute: function() {
      var r = withJWPlayer(function(jwp) { jwp.setMute(); return { ok: true }; });
      if (r) return r;
      withVideo(function(v) { v.muted = true; });
      return { ok: true };
    },
    unmute: function() {
      var r = withJWPlayer(function(jwp) {
        jwp.setMute(false);
        if (jwp.getVolume() === 0) jwp.setVolume(100);
        return { ok: true };
      });
      if (r) return r;
      withVideo(function(v) { v.muted = false; if (v.volume === 0) v.volume = 1; });
      return { ok: true };
    },
    fullscreen: function() {
      var r = withJWPlayer(function(jwp) {
        jwp.setFullscreen(true);
        return { ok: true };
      });
      if (r) return r;
      withVideo(function(v) {
        requestFullscreenNative(v);
      });
      return { ok: true };
    },
    getStatus: function() {
      var jwStatus = withJWPlayer(function(jwp) {
        var pos = jwp.getPosition();
        var dur = jwp.getDuration();
        return {
          found: true,
          paused: jwp.getState() !== 'playing',
          muted: jwp.getMute(),
          volume: jwp.getVolume() / 100,
          currentTime: pos || 0,
          duration: dur || 0,
          state: jwp.getState()
        };
      });
      if (jwStatus) return jwStatus;
      var v = getVideo();
      if (!v) return { found: false };
      return {
        found: true,
        paused: v.paused,
        muted: v.muted,
        volume: v.volume,
        currentTime: v.currentTime,
        duration: v.duration || 0
      };
    }
  };

  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;

  // ─── Listener de comandos via postMessage ─────────────────
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || d.source !== 'webtv:command') return;
    var method = d.method, args = d.args || [], id = d.id;
    if (typeof playerAPI[method] !== 'function') return;

    Promise.resolve(playerAPI[method].apply(playerAPI, args)).then(function(result) {
      var response = { source: 'webtv:response', method: method, id: id, result: result };
      if (e.source) e.source.postMessage(response, '*');
      window.dispatchEvent(new CustomEvent('webtv:event', {
        detail: { type: 'api:response', data: response }
      }));
      if (window.WebViewBridge && window.WebViewBridge.postMessage) {
        window.WebViewBridge.postMessage(JSON.stringify(response));
      }
    });
  });

  // ─── Bootstrap ────────────────────────────────────────────
  observeOverlays();

  function init() {
    // Tenta hookar via JWPlayer API primeiro
    var hooked = setupJWPlayerEvents();

    // Fallback: hook no elemento <video> nativo
    var video = getVideo();
    if (video) {
      tryAutoplay(video);
      if (!hooked) {
        video.addEventListener('play', function() {
          requestFullscreenNative(video);
          postEvent('player:play', { currentTime: video.currentTime });
        });
        video.addEventListener('pause', function() {
          postEvent('player:pause', { currentTime: video.currentTime });
        });
        postEvent('player:loaded', {
          duration: video.duration || 0,
          isLive: !video.duration || !isFinite(video.duration)
        });
      }
    } else {
      var obs = new MutationObserver(function() {
        var v = getVideo();
        if (v) {
          obs.disconnect();
          if (!hooked) setupJWPlayerEvents();
          tryAutoplay(v);
          postEvent('player:loaded', {
            duration: v.duration || 0,
            isLive: !v.duration || !isFinite(v.duration)
          });
        }
      });
      obs.observe(document.body || document.documentElement, {
        childList: true, subtree: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

---

## Comparativo entre os Padrões

| Característica | Clappr + P2P | JWPlayer |
|----------------|--------------|----------|
| **API principal** | `<video>` nativo (`video[data-html5-video]`) | `jwplayer()` objeto global |
| **Anti-devtools** | ❌ | ✅ `console-ban` |
| **P2P** | ✅ WebTorrent (p2p-media-loader) | ❌ |
| **Autoplay config** | `autoPlay: true` | `autostart: false` |
| **Stream URL** | Hardcoded no HTML | Query param `?m3u8=` |
| **Fullscreen API** | Native `requestFullscreen()` | `jwplayer().setFullscreen(true)` |
| **Eventos nativos** | `play`, `pause`, `timeupdate`, `volumechange`, `ended`, `seeked` | `play`, `pause`, `time`, `volume`, `complete`, `fullscreen`, `error` |
| **Seletor de vídeo** | `video[data-html5-video]` | `video.jw-video` (ou genérico `video`) |
| **Força do sinal** | Precisa esperar o Clappr criar o `<video>` | JWPlayer cria o `<video>` no setup |

## Considerações para Injeção

### Anti-devtools (console-ban)
O `console-ban` presente no padrão JWPlayer hooka `console.log/warn/error` e
redireciona a página se detectar DevTools aberto. O script injetado via
`evaluateJavascript` não dispara esse detector porque:

1. O detector verifica `console.log` chamado pelo usuário, não pelo `eval()` injetado
2. O `frame.evaluate()` do Playwright também não dispara (é interno ao browser engine)

### P2P no Clappr
O `p2p-media-loader` baixa segmentos via WebRTC (p2p) ou HTTP fallback.
Segmentos são nomeados como `IMG_*.png` para ofuscar que são `.ts`.
O script de injeção não precisa lidar com isso — apenas controla o `<video>`.

### Cross-origin iframe
Ambos os padrões carregam o player em um iframe de `rdcplayer.online` que é
cross-origin em relação a `rdcanais.com`. O script de injeção executa **dentro**
do iframe (no contexto de `rdcplayer.online`), então não sofre CORS.

Para comunicação com o frontend (React) ou Kotlin, usa `window.parent.postMessage()`.

### Registro no Kotlin
Ambos scripts compartilham o mesmo domínio `rdcplayer.online`. O matching por URL
(`urls[]`) diferencia qual script injetar para qual URL de iframe.