/**
 * WebTV — Injeção otimizada para 10embeddecanais.xyz
 *
 * Substitui o player pesado (Clappr + P2P) por um player Hls.js puro,
 * preservando o contrato WebTV (window.WebTV.events / channel / player).
 *
 * Comportamento:
 *   1. Mantém window.WebTV.* intacto (appBridge.js não é removido)
 *   2. Substitui <body> por DOM mínimo (1 <video>)
 *   3. Descobre a URL do stream dinamicamente em runtime (sem hardcodar)
 *   4. Carrega hls.js via CDN e reproduz
 *   5. Expõe window.WebTV.player.* (play/pause/stop/seek/volume/mute/quality/getStatus)
 *   6. Emite eventos padronizados via postMessage + CustomEvent
 *
 * Descoberta da URL (fallback chain):
 *   1. Hook de XHR/fetch — captura o primeiro .m3u8 que o player original pede
 *   2. Inspeção de scripts inline em busca de RAW_SRC / SRC / src
 *   3. window.SRC (logado pelo player original)
 *   4. Probe HEAD em CDNs conhecidos (cdn{1..12}embed.xyz)
 *
 * Funciona em qualquer página do domínio 10embeddecanais.xyz sem alterar o script.
 *   - Requer Referer: https://10embeddecanais.xyz/ (Cloudflare gate)
 *   - Sem token, sem auth
 *   - Origin mantida no WebView do app (mesma origem de quem carrega o embed)
 */
(function() {
  'use strict';

  if (window['__webtv_embeddecanais_replace']) return;
  window['__webtv_embeddecanais_replace'] = true;

  // ─── 1. Persistência de áudio (padrão EVENTS_API.md) ────────────
  if (sessionStorage.getItem('webtv_audio_unlocked')) window._webtvAudioUnlocked = true;

  // ─── 2. Hook muted — protege contra re-mute após unlock ────────
  try {
    var _md = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (_md && _md.set && !window.__webtv_muted_hook) {
      window.__webtv_muted_hook = true;
      var _oms = _md.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        get: _md.get,
        set: function(v) {
          if (window._webtvAudioUnlocked && v === true && !window._webtvRemoteMute) return;
          _oms.call(this, v);
        }
      });
    }
  } catch (e) {}

  // ─── 3. Descoberta dinâmica da URL do stream ──────────────────
  // Estratégia em camadas (fallback chain) — funciona com qualquer CDN do
  // domínio 10embeddecanais.xyz / embedcanaisdetv.xyz sem hardcodar URL.
  var VIDEO_SELECTOR = '#webtv-player-video';
  var HLSJS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  var CDN_HOST_PATTERN = /(?:^|\.)(cdn\d*embed\.xyz|embedcanaisdetv\.xyz)$/i;

  var _discoveredUrl = null;
  var _discoverPromise = null;
  var _discoverSource = null;

  function discoverStreamUrl() {
    if (_discoveredUrl) return Promise.resolve(_discoveredUrl);
    if (_discoverPromise) return _discoverPromise;

    // O site sempre expõe o manifesto raiz como <slug>/index.m3u8. Segmentos e
    // media playlists (mono.ts.m3u8, tracks-v1a1/*) NÃO são manifestos válidos
    // para hls.js carregar — eles causam `levels: []` e vídeo travado.
    function pickRootManifest(u) {
      var s = String(u || '');
      var m = s.match(/(https?:\/\/[^\s'"<>]*\/index\.m3u8(?:\?[^\s'"<>]*)?)/i);
      return m ? m[1] : null;
    }

    _discoverPromise = new Promise(function(resolve, reject) {
      var _origOpen, _origFetch, resolved = false, timeout;

      function finish(url, src) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (_origOpen) XMLHttpRequest.prototype.open = _origOpen;
        if (_origFetch) window.fetch = _origFetch;
        var root = pickRootManifest(url);
        if (root) { _discoveredUrl = root; _discoverSource = src || 'hook'; resolve(root); }
        else tryLayer2();
      }

      function tryLayer2() {
        try {
          var scripts = document.querySelectorAll('script');
          for (var i = 0; i < scripts.length; i++) {
            var t = scripts[i].textContent || '';
            if (t.indexOf('__webtv_embeddecanais_replace') !== -1) continue;
            var m = t.match(/(?:RAW_SRC|src|SRC)\s*[:=]\s*(?:q\([^)]*,\s*)?['"]\s*(https?:\/\/[^'"]*\/index\.m3u8[^'"]*)/i);
            if (m && m[1]) return finish(m[1], 'script-raw');
            m = t.match(/['"]\s*(https?:\/\/[^'"]*\/index\.m3u8[^'"]*)/i);
            if (m && m[1]) return finish(m[1], 'script-string');
          }
        } catch (e) {}

        if (typeof window.SRC === 'string') {
          var root = pickRootManifest(window.SRC);
          if (root) return finish(root, 'window.SRC');
        }

        try {
          var path = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
          if (path.length) {
            var slug = path[0];
            return probeCDNs(slug).then(function(u) { finish(u, 'probe'); }, function() { reject(new Error('Stream URL não descoberta')); });
          }
        } catch (e) {}

        reject(new Error('Stream URL não encontrada'));
      }

      function probeCDNs(slug) {
        var hosts = [
          'cdn12embed.xyz', 'cdn1embed.xyz', 'cdn2embed.xyz',
          'cdn7embed.xyz', 'cdn10embed.xyz', 'cdn5embed.xyz'
        ];
        return Promise.all(hosts.map(function(h) {
          var u = 'https://' + h + '/' + slug + '/index.m3u8';
          return fetch(u, { method: 'HEAD', mode: 'cors' })
            .then(function(r) { if (r.ok) return u; throw new Error('not found'); });
        })).then(function(results) { return results[0]; });
      }

      try {
        _origOpen = XMLHttpRequest.prototype.open;
        _origFetch = window.fetch;

        // Camada 1: hook de XHR/fetch antes do Clappr iniciar.
        // Só captura o manifesto raiz. Segmentos e media playlists (mono.ts.m3u8,
        // tracks-v1a1/*.m3u8) são ignorados — o Clappr emite esses requests
        // primeiro e o hook acabava capturando o URL errado.
        timeout = setTimeout(function() {
          if (!resolved) tryLayer2();
        }, 3000);

        XMLHttpRequest.prototype.open = function(method, url) {
          try {
            var s = String(url || '');
            if (/\/index\.m3u8(\?|$)/i.test(s)) finish(s, 'xhr');
          } catch (e) {}
          return _origOpen.apply(this, arguments);
        };

        window.fetch = function(input, init) {
          try {
            var s = (typeof input === 'string') ? input : (input && input.url) || '';
            if (/\/index\.m3u8(\?|$)/i.test(s)) finish(s, 'fetch');
          } catch (e) {}
          return _origFetch.apply(this, arguments);
        };
      } catch (e) {}
    });

    return _discoverPromise;
  }

  // ─── 4. postEvent — emite via 3 canais (EVENTS_API.md) ─────────
  function postEvent(type, data) {
    var event = {
      source: 'webtv',
      name: type,
      payload: data || {},
      timestamp: Date.now()
    };
    if (window.parent && window.parent !== window) window.parent.postMessage(event, '*');
    window.dispatchEvent(new CustomEvent(type, { detail: event }));
    window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
    if (window.WebViewBridge && window.WebViewBridge.postMessage) {
      window.WebViewBridge.postMessage(JSON.stringify(event));
    }
    if (window.WebTV && window.WebTV.events && window.WebTV.events.emit) {
      try { window.WebTV.events.emit(type, event.payload); } catch (e) {}
    }
  }

  // ─── 5. Substituição do DOM (preserva window.WebTV.*) ──────────
  // Tear down: stopa player original (Clappr) e bloqueia novos fetches
  // de m3u8/ts antes de substituir o DOM. Sem isso, o pipeline MSE do
  // Clappr sobrevive no JS heap e produz áudio em paralelo com o nosso
  // hls.js (bug "duas reproduções").
  var _origXHROpen = null, _origXHRSend = null, _origFetchRef = null;
  var _blockedHosts = null;
  function isStreamUrl(u) { return /\.m3u8(\?|$)|\.ts(\?|$)/i.test(String(u || '')); }
  function teardownOriginalPlayer() {
    try {
      // 1. Pausar e descarregar todos os <video>/<audio> ainda no DOM
      var media = document.querySelectorAll('video, audio');
      for (var i = 0; i < media.length; i++) {
        try {
          var m = media[i];
          m.pause();
          m.removeAttribute('src');
          try { m.load(); } catch (e) {}
        } catch (e) {}
      }
    } catch (e) {}
    try {
      // 2. Bloquear XHR + fetch para m3u8/ts (CDN descoberto) e abortar in-flight.
      //    Só instalamos UMA vez — depois disso os wrappers ficam até o fim da página.
      if (_origXHROpen === null) {
        _origXHROpen = XMLHttpRequest.prototype.open;
        _origXHRSend = XMLHttpRequest.prototype.send;
        _origFetchRef = window.fetch;

        XMLHttpRequest.prototype.open = function(method, url) {
          try { this.__webtv_url = String(url || ''); } catch (e) {}
          return _origXHROpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function() {
          try {
            if (isStreamUrl(this.__webtv_url)) {
              try { this.abort(); } catch (e) {}
              return undefined;
            }
          } catch (e) {}
          return _origXHRSend.apply(this, arguments);
        };

        window.fetch = function(input, init) {
          try {
            var u = (typeof input === 'string') ? input : (input && input.url) || '';
            if (isStreamUrl(u)) {
              return Promise.reject(new DOMException('Blocked by WebTV', 'AbortError'));
            }
          } catch (e) {}
          return _origFetchRef.apply(this, arguments);
        };
      }
    } catch (e) {}
    try {
      // 3. Tentar localizar Clappr Player/Core via DOM (#player) e chamar destroy()
      var p = document.getElementById('player');
      if (p && p.parentNode) {
        try {
          var kids = p.querySelectorAll('*');
          for (var j = 0; j < kids.length; j++) {
            var k = kids[j];
            for (var key in k) {
              if (key.charAt(0) === '_') {
                var v = k[key];
                if (v && typeof v === 'object' && typeof v.destroy === 'function') {
                  try { v.destroy(); } catch (e) {}
                }
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  function replaceDOM() {
    try { if (window.__webtv_hls) { window.__webtv_hls.destroy(); window.__webtv_hls = null; } } catch (e) {}
    document.documentElement.innerHTML =
      '<head><title>WebTV — Record SP</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
      '<body style="margin:0;background:#000;overflow:hidden;font-family:Arial,sans-serif">' +
        '<video id="' + VIDEO_SELECTOR.slice(1) + '" controls autoplay playsinline ' +
        'style="width:100vw;height:100vh;object-fit:contain;background:#000"></video>' +
        '<div id="webtv-status" style="position:fixed;bottom:8px;left:8px;color:#0f0;background:rgba(0,0,0,.7);' +
        'font:11px/1.4 monospace;padding:4px 8px;border-radius:4px;z-index:9;pointer-events:none;max-width:80vw"></div>' +
        '<div id="webtv-error" style="display:none;position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.9);' +
        'color:#fff;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:20px">' +
        '<div style="font:bold 18px Arial;margin-bottom:12px">Stream indisponível</div>' +
        '<div id="webtv-error-msg" style="font:13px Arial;color:#f88;margin-bottom:16px"></div>' +
        '<button id="webtv-retry" style="background:#0f3;color:#000;border:0;padding:10px 20px;' +
        'font:bold 14px Arial;border-radius:4px;cursor:pointer">Tentar novamente</button></div>' +
      '</body>';

    var retryBtn = document.getElementById('webtv-retry');
    if (retryBtn) retryBtn.addEventListener('click', function() { initPlayer(); });
  }

  // ─── 6. Status overlay (leve, throttle) ────────────────────────
  var _statusTimer = null;
  function setStatus(msg) {
    var el = document.getElementById('webtv-status');
    if (!el) return;
    el.textContent = msg;
    if (_statusTimer) clearTimeout(_statusTimer);
    if (msg) _statusTimer = setTimeout(function() { if (el.textContent === msg) el.textContent = ''; }, 4000);
  }

  function showError(msg) {
    var overlay = document.getElementById('webtv-error');
    var msgEl = document.getElementById('webtv-error-msg');
    if (overlay && msgEl) {
      msgEl.textContent = msg;
      overlay.style.display = 'flex';
    }
  }

  // ─── 7. Carrega Hls.js sob demanda ─────────────────────────────
  function loadHlsJs(cb) {
    if (window.Hls) return cb(window.Hls);
    var s = document.createElement('script');
    s.src = HLSJS_CDN;
    s.onload = function() { cb(window.Hls); };
    s.onerror = function() { showError('Falha ao carregar Hls.js'); postEvent('player:error', { message: 'hls.js load failed' }); };
    document.head.appendChild(s);
  }

  // ─── 8. Inicializa player ──────────────────────────────────────
  function initPlayer() {
    var errorEl = document.getElementById('webtv-error');
    if (errorEl) errorEl.style.display = 'none';

    var video = document.querySelector(VIDEO_SELECTOR);
    if (!video) return setTimeout(initPlayer, 50);

    setStatus('descobrindo stream...');

    discoverStreamUrl().then(function(HLS_URL) {
      setStatus('stream OK');
      postEvent('player:discovered', { url: HLS_URL, source: _discoverSource });

      loadHlsJs(function(Hls) {
      if (!Hls.isSupported()) {
        // Fallback nativo (Safari, Android WebView antigos)
        video.src = HLS_URL;
        video.addEventListener('loadedmetadata', function() { video.play().catch(function() {}); });
        return;
      }

      var cfg = {
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 20,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        capLevelToPlayerSize: true,
        autoStartLoad: true,
        fragLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 4,
        abrEwmaDefaultEstimate: 5000000,
        abrBandwidthFactor: 0.7,
        enableSoftwareAES: false
      };

      var hls = new Hls(cfg);
      window.__webtv_hls = hls;
      // Libera os hooks globais de XHR/fetch antes do Hls.js emitir requests —
      // sem isso, o próprio script bloquearia o manifesto raiz.
      releaseStreamHooks();
      hls.loadSource(HLS_URL);
      hls.attachMedia(video);

      var liveState = null;

      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        setStatus('manifest OK');
        video.play().then(function() {
          postEvent('player:loaded', { duration: 0, isLive: true, url: HLS_URL });
        }).catch(function() {
          setStatus('Toque para iniciar');
          postEvent('player:error', { message: 'autoplay blocked', requiresUserInteraction: true });
        });
      });

      hls.on(Hls.Events.LEVEL_LOADED, function(_e, d) {
        var isLive = !!(d && d.details && d.details.live);
        if (isLive !== liveState) {
          liveState = isLive;
          setStatus(isLive ? 'LIVE' : 'VOD');
        }
      });

      hls.on(Hls.Events.ERROR, function(_e, d) {
        if (!d || !d.fatal) return;
        setStatus('ERRO: ' + d.type);
        if (d.type === 'networkError') {
          hls.startLoad();
        } else if (d.type === 'mediaError') {
          hls.recoverMediaError();
        } else {
          showError('Tipo: ' + d.type + ' / ' + d.details);
          hls.destroy();
          postEvent('player:error', { message: d.details || d.type, code: d.type });
        }
      });

      bindVideoEvents(video);
      });
    }, function(err) {
      showError('Stream não encontrado: ' + (err && err.message || err));
      postEvent('player:error', { message: 'discovery failed', reason: String(err) });
    });
  }

  // ─── 9. Eventos nativos do <video> ─────────────────────────────
  function bindVideoEvents(video) {
    video.addEventListener('play', function() {
      postEvent('player:play', {
        currentTime: video.currentTime,
        duration: video.duration || 0,
        isLive: !video.duration || !isFinite(video.duration),
        source: 'native'
      });
    });
    video.addEventListener('pause', function() {
      postEvent('player:pause', { currentTime: video.currentTime, duration: video.duration || 0 });
    });
    video.addEventListener('ended', function() {
      postEvent('player:ended', { currentTime: 0 });
    });
    video.addEventListener('timeupdate', throttle(function() {
      postEvent('player:timeupdate', { currentTime: video.currentTime, duration: video.duration || 0 });
    }, 250));
    video.addEventListener('volumechange', function() {
      postEvent('player:volume:changed', { volume: video.volume, muted: video.muted });
    });
    video.addEventListener('seeked', function() {
      postEvent('player:seeked', { time: video.currentTime, duration: video.duration || 0 });
    });
    video.addEventListener('error', function() {
      postEvent('player:error', { message: video.error ? video.error.message : 'media error' });
    });
  }

  function throttle(fn, ms) {
    var last = 0, t = null;
    return function() {
      var now = Date.now(), args = arguments, self = this;
      if (now - last >= ms) { last = now; fn.apply(self, args); }
      else { clearTimeout(t); t = setTimeout(function() { last = Date.now(); fn.apply(self, args); }, ms - (now - last)); }
    };
  }

  // ─── 10. window.WebTV.player.* (contrato EVENTS_API.md) ────────
  function findVideo() { return document.querySelector(VIDEO_SELECTOR); }
  function isLive(video) { return !video.duration || !isFinite(video.duration); }

  function getQualityLevels() {
    var hls = window.__webtv_hls;
    if (!hls || !hls.levels) return null;
    var out = [{ index: 0, label: 'Auto', height: 0, width: 0, bitrate: 0 }];
    for (var i = 0; i < hls.levels.length; i++) {
      var l = hls.levels[i];
      var h = l.height || 0;
      out.push({
        index: i + 1,
        label: h ? (h + 'p') : (Math.round((l.bitrate || 0) / 1000) + 'k'),
        height: h,
        width: l.width || 0,
        bitrate: l.bitrate || 0
      });
    }
    return out;
  }

  var playerAPI = {
    play: function() {
      var v = findVideo();
      if (!v) return Promise.resolve({ ok: false, reason: 'no video' });
      return v.play().then(function() { return { ok: true, time: v.currentTime }; })
        .catch(function(e) { return { ok: false, reason: String(e) }; });
    },
    pause: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      v.pause();
      return { ok: true };
    },
    stop: function() {
      var v = findVideo();
      if (!v) return { ok: false };
      v.pause();
      v.currentTime = 0;
      return { ok: true };
    },
    seek: function(t) {
      var v = findVideo();
      if (!v) return { ok: false };
      v.currentTime = Math.max(0, Math.min(v.duration || Infinity, t));
      return { ok: true, time: v.currentTime };
    },
    rewind: function(s) {
      s = s || 10;
      var v = findVideo();
      if (!v) return { ok: false };
      v.currentTime = Math.max(0, v.currentTime - s);
      return { ok: true, time: v.currentTime };
    },
    forward: function(s) {
      s = s || 10;
      var v = findVideo();
      if (!v) return { ok: false };
      v.currentTime = Math.min(v.duration || Infinity, v.currentTime + s);
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
      var fn = v.requestFullscreen || v.webkitRequestFullscreen || v.mozRequestFullScreen || v.msRequestFullscreen;
      if (fn) { fn.call(v).catch(function() {}); return { ok: true }; }
      return { ok: false };
    },
    getStatus: function() {
      var v = findVideo();
      if (!v) return { found: false, quality: { current: 0, levels: [] } };
      var hls = window.__webtv_hls;
      var currentLevel = (hls && hls.currentLevel !== undefined) ? hls.currentLevel : -1;
      var qualityIdx = currentLevel === -1 ? 0 : currentLevel + 1;
      return {
        found: true,
        paused: v.paused,
        muted: v.muted,
        volume: v.volume,
        currentTime: v.currentTime,
        duration: v.duration || 0,
        src: v.currentSrc,
        isLive: isLive(v),
        quality: { current: qualityIdx, levels: getQualityLevels() || [] }
      };
    },
    quality: {
      getLevels: function() { return getQualityLevels(); },
      getCurrent: function() {
        var hls = window.__webtv_hls;
        if (!hls) return 0;
        return hls.currentLevel === -1 ? 0 : hls.currentLevel + 1;
      },
      set: function(idx) {
        var hls = window.__webtv_hls;
        if (!hls) return false;
        try {
          hls.autoLevelEnabled = false;
          hls.currentLevel = idx === 0 ? -1 : idx - 1;
          postEvent('player:quality:changed', { quality: idx, levels: getQualityLevels() || [] });
          return true;
        } catch (e) { return false; }
      },
      setAuto: function() { return this.set(0); }
    },
    reload: function() {
      try { if (window.__webtv_hls) { window.__webtv_hls.destroy(); window.__webtv_hls = null; } } catch (e) {}
      initPlayer();
      return { ok: true };
    },
    destroy: function() {
      try { if (window.__webtv_hls) { window.__webtv_hls.destroy(); window.__webtv_hls = null; } } catch (e) {}
      var v = findVideo();
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      return { ok: true };
    }
  };

  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;

  // Atalhos diretos (EVENTS_API.md)
  window.WebTV.toggleAudioMute = function() {
    window._webtvRemoteMute = true;
    try { var v = findVideo(); if (v) v.muted = !v.muted; } finally { window._webtvRemoteMute = false; }
  };
  window.WebTV.unmuteAudio = function() {
    sessionStorage.setItem('webtv_audio_unlocked', '1');
    window._webtvAudioUnlocked = true;
    var v = findVideo();
    if (v) { v.muted = false; v.volume = 1.0; }
    postEvent('player:audio:unlocked', { volume: 1.0 });
  };

  // ─── 11. Listener de comandos remotos (postMessage) ───────────
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || d.source !== 'webtv:command') return;
    var method = d.method, args = d.args || [], id = d.id;
    if (typeof playerAPI[method] !== 'function') return;
    Promise.resolve(playerAPI[method].apply(playerAPI, args)).then(function(result) {
      var r = { source: 'webtv:response', method: method, id: id, result: result };
      if (e.source) e.source.postMessage(r, '*');
      if (window.WebViewBridge && window.WebViewBridge.postMessage) {
        window.WebViewBridge.postMessage(JSON.stringify(r));
      }
    });
  });

  // ─── 12. Cleanup em navegação ─────────────────────────────────
  window.addEventListener('beforeunload', function() {
    try { if (window.__webtv_hls) { window.__webtv_hls.destroy(); window.__webtv_hls = null; } } catch (e) {}
  });
  window.addEventListener('pagehide', function() {
    try { if (window.__webtv_hls) { window.__webtv_hls.destroy(); window.__webtv_hls = null; } } catch (e) {}
  });

  // ─── 13. Bootstrap ────────────────────────────────────────────
  // IMPORTANTE: discovery primeiro, replace depois.
  // A Camada 2 do discovery (regex em scripts inline) só funciona
  // se os scripts originais do site ainda estiverem no DOM.
  function bootstrap() {
    // IMPORTANTE: instalar bloqueios ANTES de qualquer replace/init.
    // teardownOriginalPlayer() mata o pipeline MSE do Clappr (MediaSource,
    // XHR/fetch de segmentos) para evitar o bug "two streams". Os bloqueios
    // ficam ativos durante a fase de descoberta e são removidos em
    // initPlayer() (ANTES do Hls.js emitir requests) para que o nosso player
    // possa buscar o manifesto livremente.
    teardownOriginalPlayer();
    discoverStreamUrl().then(function() {
      // Só substitui o DOM depois de encontrar a URL — preserva scripts
      // originais para as Camadas 2/3 do discovery e reaproveita o contexto.
      replaceDOM();
      initPlayer();
    }, function(err) {
      // Mesmo em falha, tenta mostrar o player limpo com erro
      replaceDOM();
      showError('Stream não encontrado: ' + (err && err.message || err));
      postEvent('player:error', { message: 'discovery failed', reason: String(err) });
    });
  }

  // Remove os hooks globais de XHR/fetch para que o Hls.js possa buscar
  // o manifesto raiz sem ser bloqueado. Chamado em initPlayer() antes do
  // hls.loadSource(HLS_URL).
  function releaseStreamHooks() {
    if (_origXHROpen !== null) {
      XMLHttpRequest.prototype.open = _origXHROpen;
      _origXHROpen = null;
    }
    if (_origXHRSend !== null) {
      XMLHttpRequest.prototype.send = _origXHRSend;
      _origXHRSend = null;
    }
    if (_origFetchRef !== null) {
      window.fetch = _origFetchRef;
      _origFetchRef = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
