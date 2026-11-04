/**
 * WebTV — EmbedDeCanais / PlayerEmbCanais (player simples)
 *
 * Substitui o player pesado (Clappr + Hls.js + P2P) por um <video> único
 * controlado por Hls.js, mantendo o contrato window.WebTV.* do app.
 *
 * Por que este script existe:
 *   - embedcanaisdetv.xyz redireciona para <numero>.playerembcanais.com.
 *   - O player final expõe a URL do manifesto em window.vipPlayer.options.source
 *     (e window.vipCdnHost), então não é preciso interceptar XHR nem usar proxy.
 *   - O banner "Teste o VIP Canais grátis" (#vipModal) reaparece por timer e
 *     também é reposicionado em fullscreen. CSS + MutationObserver garantem
 *     que ele nunca volte, mesmo que o código antigo tente recriá-lo.
 *   - O monitor "vipStreamRecovery" recria sessões HLS a cada ~8s quando o
 *     <video> original some. Depois de destruir o player, anulamos load/play
 *     e travamos a recarga de emergência via sessionStorage.
 *
 * Descoberta da URL (em ordem):
 *   1. window.vipPlayer.options.source
 *   2. window.vipPlayer.core.getCurrentPlayback()._hls.url / levels[0].url
 *   3. window.vipCdnHost + slug da URL
 *   4. performance.getEntriesByType('resource') (/index.m3u8 primeiro)
 *   5. ?src= da URL
 *   6. <video>.currentSrc / .src (ignora blob:)
 *   7. scripts inline que contenham um .m3u8
 *
 * Funciona em qualquer canal do domínio sem hardcodar URL, CDN ou slug.
 * Não envia Referer manualmente: o manifesto é CORS-liberado na origem final.
 */
(function () {
  'use strict';

  if (window['__webtv_embedcanais_simple']) return;
  window['__webtv_embedcanais_simple'] = true;

  var VIDEO_ID = 'webtv-player-video';
  var HLSJS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  var DISCOVERY_TIMEOUT_MS = 30000;
  var POLL_MS = 250;
  var BANNER_SELECTOR = [
    '#vipModal',
    '#embedBtn',
    '#embedModal',
    '.embed-modal',
    '#p2pHud',
    '#vipRecoveryHud',
    '#erro',
    '.vip-modal-overlay',
    '.vip-modal-content',
    '[id^="vipModal"]',
    '[class*="vip-modal"]'
  ].join(',');

  var BANNER_CSS = [
    '#vipModal,#embedBtn,#embedModal,.embed-modal,#p2pHud,#vipRecoveryHud,#erro,',
    '.vip-modal-overlay,.vip-modal-content,[id^="vipModal"],[class*="vip-modal"]{',
    'display:none!important;visibility:hidden!important;opacity:0!important;',
    'pointer-events:none!important;z-index:-2147483647!important}'
  ].join('');

  var _streamUrl = null;
  var _streamSource = null;
  var _HlsCtor = null;
  var _statusTimer = null;

  // ─── 1. Áudio: persistência + proteção contra re-mute ─────────────
  try {
    if (sessionStorage.getItem('webtv_audio_unlocked')) window._webtvAudioUnlocked = true;
  } catch (e) {}

  try {
    var _mutedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (_mutedDesc && _mutedDesc.set && !window.__webtv_muted_hook) {
      window.__webtv_muted_hook = true;
      var _origMutedSet = _mutedDesc.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        get: _mutedDesc.get,
        set: function (value) {
          if (window._webtvAudioUnlocked && value === true && !window._webtvRemoteMute) return;
          _origMutedSet.call(this, value);
        }
      });
    }
  } catch (e) {}

  // ─── 2. Supressão permanente do banner VIP / HUDs / embed ─────────
  function installBannerStyle() {
    try {
      if (document.getElementById('webtv-banner-style')) return;
      var style = document.createElement('style');
      style.id = 'webtv-banner-style';
      style.textContent = BANNER_CSS;
      (document.head || document.getElementsByTagName('head')[0] || document.documentElement).appendChild(style);
    } catch (e) {}
  }

  function killBanners() {
    try {
      var nodes = document.querySelectorAll(BANNER_SELECTOR);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!el || !el.parentNode) continue;
        el.setAttribute('aria-hidden', 'true');
        // O modal VIP é removido de verdade. Se o timer antigo tentar
        // mostrá-lo de novo, o observer remove outra vez.
        if (el.id === 'vipModal' || (el.classList && el.classList.contains('vip-modal-overlay'))) {
          try { el.parentNode.removeChild(el); } catch (e) {}
          continue;
        }
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      }
    } catch (e) {}
  }

  function watchBanners() {
    installBannerStyle();
    killBanners();
    try {
      var pending = false;
      var observer = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          killBanners();
        }, 50);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  // ─── 3. Descoberta dinâmica da URL do stream ──────────────────────
  function slugFromLocation() {
    var querySlug = '';
    try {
      querySlug = (new URLSearchParams(location.search).get('canal') || '').toLowerCase();
    } catch (e) {}
    try {
      var parts = location.pathname.split('/').filter(Boolean);
      var last = (parts[parts.length - 1] || '').toLowerCase();
      if (!last || last === 'e' || last === 'index.php' || /\.php$/i.test(last)) return querySlug;
      return last;
    } catch (e) {
      return querySlug;
    }
  }

  // Só o manifesto raiz é carregável pelo hls.js. Media playlists como
  // mono.ts.m3u8 e tracks-v1a1/*.m3u8 são convertidas para o index.m3u8
  // do mesmo diretório.
  function normalizeManifest(url) {
    var u = String(url || '').replace(/\\\//g, '/').trim();
    if (!/^https?:\/\//i.test(u)) return null;
    if (/\/index\.m3u8(\?|$)/i.test(u)) return u;

    var media = u.match(/^(https?:\/\/[^\s'"<>]+?\/)(?:tracks-[^/]+\/)?(?:mono[^/]*\.m3u8|tracks-[^/]+\.m3u8)(?:\?.*)?$/i);
    if (media) return media[1] + 'index.m3u8';

    return u;
  }

  function manifestFrom(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (var i = 0; i < value.length; i++) {
        var found = manifestFrom(value[i]);
        if (found) return found;
      }
      return null;
    }
    if (typeof value === 'object') {
      return manifestFrom(value.src) || manifestFrom(value.url) || manifestFrom(value.source);
    }
    var s = String(value).replace(/&amp;/g, '&').trim();
    if (!/^https?:\/\//i.test(s)) {
      if (s.indexOf('.m3u8') === -1) return null;
      try { s = new URL(s, location.href).href; } catch (e) { return null; }
    }
    var match = s.match(/(https?:\/\/[^\s'"<>]+?\.m3u8(?:\?[^\s'"<>]*)?)/i);
    return match ? normalizeManifest(match[1]) : null;
  }

  function tryDiscover() {
    var player = window.vipPlayer;

    // 1. Fonte oficial do player final.
    try {
      if (player && player.options && player.options.source) {
        var sourceUrl = manifestFrom(player.options.source);
        if (sourceUrl) return ['vipPlayer.options.source', sourceUrl];
      }
    } catch (e) {}

    // 2. Instância do hls.js usada pelo Clappr.
    try {
      var playback = player && player.core && player.core.getCurrentPlayback
        ? player.core.getCurrentPlayback()
        : null;
      var hls = playback && (playback._hls || playback.hls);
      if (hls) {
        var hlsUrl = manifestFrom(hls.url);
        if (!hlsUrl && hls.levels && hls.levels.length) hlsUrl = manifestFrom(hls.levels[0].url);
        if (!hlsUrl && hls._url) hlsUrl = manifestFrom(hls._url);
        if (hlsUrl) return ['hls.url', hlsUrl];
      }
      if (playback) {
        var playbackUrl = manifestFrom(playback._url) ||
          manifestFrom(playback.options && playback.options.src);
        if (playbackUrl) return ['playback', playbackUrl];
      }
    } catch (e) {}

    // 3. Host do CDN + slug (ex.: 1210.playerembcanais.com/premiereclubes/).
    try {
      var cdnHost = window.vipCdnHost || (player && player.options && (player.options.cdnHost || player.options.host));
      var slug = slugFromLocation();
      if (cdnHost && slug) {
        var host = String(cdnHost).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        return ['vipCdnHost', location.protocol + '//' + host + '/' + slug + '/index.m3u8'];
      }
    } catch (e) {}

    // 4. Manifesto já solicitado pela página.
    try {
      var entries = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      var fallback = null;
      for (var i = entries.length - 1; i >= 0; i--) {
        var perfUrl = manifestFrom(entries[i].name);
        if (!perfUrl) continue;
        if (/\/index\.m3u8(\?|$)/i.test(perfUrl)) return ['performance', perfUrl];
        if (!fallback) fallback = perfUrl;
      }
      if (fallback) return ['performance-media', fallback];
    } catch (e) {}

    // 5. ?src= explícito.
    try {
      var queryUrl = manifestFrom(new URLSearchParams(location.search).get('src'));
      if (queryUrl) return ['query-src', queryUrl];
    } catch (e) {}

    // 6. <video> nativo (ignora blob:).
    try {
      var video = document.querySelector('video');
      if (video) {
        var videoUrl = manifestFrom(video.currentSrc || video.src);
        if (videoUrl) return ['video.src', videoUrl];
      }
    } catch (e) {}

    // 7. Scripts inline (último recurso).
    try {
      var scripts = document.querySelectorAll('script');
      for (var j = 0; j < scripts.length; j++) {
        var text = scripts[j].textContent || '';
        if (text.indexOf('.m3u8') === -1) continue;
        if (text.indexOf('__webtv_embedcanais_simple') !== -1) continue;
        var inlineUrl = manifestFrom(text);
        if (inlineUrl) return ['inline-script', inlineUrl];
      }
    } catch (e) {}

    return null;
  }

  function discoverStream(done) {
    var deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    (function poll() {
      var found = tryDiscover();
      if (found) {
        done(found[1], found[0]);
        return;
      }
      if (Date.now() >= deadline) {
        // Não substitui o DOM: em página de redirect isso preserva a navegação.
        done(null, null);
        return;
      }
      setTimeout(poll, POLL_MS);
    })();
  }

  // ─── 4. Teardown do player original ───────────────────────────────
  function blockRecoveryReload() {
    // O monitor de reconexão usa a chave
    // "vip_embed_recovery_page_<canal>" para limitar reloads de emergência.
    // Um valor no futuro desarma o location.reload() sem tocar no resto.
    try {
      var slug = slugFromLocation();
      if (slug) {
        sessionStorage.setItem('vip_embed_recovery_page_' + slug, String(Date.now() + 86400000));
      }
    } catch (e) {}

    try {
      if (!window.__webtv_storage_guard) {
        window.__webtv_storage_guard = true;
        var originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          if (typeof key === 'string' && key.indexOf('vip_embed_recovery_page_') === 0) {
            return String(Date.now() + 86400000);
          }
          return originalGetItem.apply(this, arguments);
        };
      }
    } catch (e) {}
  }

  function teardownOriginalPlayer() {
    blockRecoveryReload();

    // 1. Pausa e descarrega qualquer mídia antiga antes de remover o DOM.
    try {
      var media = document.querySelectorAll('video, audio');
      for (var i = 0; i < media.length; i++) {
        try {
          media[i].pause();
          media[i].removeAttribute('src');
          media[i].load();
        } catch (e) {}
      }
    } catch (e) {}

    // 2. Destrói P2P e Clappr.
    try {
      if (window.vipP2PEngine && typeof window.vipP2PEngine.destroy === 'function') {
        window.vipP2PEngine.destroy();
      }
    } catch (e) {}
    try {
      if (window.vipPlayer && typeof window.vipPlayer.destroy === 'function') {
        window.vipPlayer.destroy();
      }
    } catch (e) {}

    // 3. O monitor de reconexão chama vipPlayer.load() a cada ~8s. Sem isso
    //    ele recria sessões HLS mesmo com o <video> original removido.
    try {
      if (window.vipPlayer) {
        window.vipPlayer.load = function () { return this; };
        window.vipPlayer.play = function () { return this; };
        window.vipPlayer.pause = function () { return this; };
      }
    } catch (e) {}
    try {
      if (window.vipStreamRecovery) {
        window.vipStreamRecovery.reconnect = function () {};
      }
    } catch (e) {}
  }

  // ─── 5. DOM mínimo ────────────────────────────────────────────────
  function buildPlayer() {
    var slug = slugFromLocation();
    document.documentElement.innerHTML =
      '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
        '<title>' + (slug ? 'WebTV — ' + slug : 'WebTV') + '</title>' +
        '<style>' +
          'html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}' +
          'body{font-family:Arial,Helvetica,sans-serif}' +
          '#webtv-stage{position:fixed;top:0;left:0;right:0;bottom:0;background:#000}' +
          '#' + VIDEO_ID + '{width:100%;height:100%;object-fit:contain;background:#000;outline:none}' +
          '#webtv-status{position:fixed;left:10px;bottom:10px;z-index:20;color:#0f0;' +
            'background:rgba(0,0,0,.65);font:11px/1.4 monospace;padding:4px 8px;border-radius:4px;' +
            'pointer-events:none;max-width:80vw}' +
          '#webtv-tap{position:fixed;top:0;left:0;right:0;bottom:0;z-index:30;display:none;' +
            'align-items:center;justify-content:center;background:rgba(0,0,0,.72);cursor:pointer}' +
          '#webtv-tap button{background:#00c853;color:#000;border:0;border-radius:6px;' +
            'padding:14px 26px;font:bold 16px Arial;cursor:pointer}' +
          '#webtv-error{position:fixed;top:0;left:0;right:0;bottom:0;z-index:40;display:none;' +
            'align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,.92);' +
            'color:#fff;text-align:center;padding:20px}' +
          '#webtv-error-msg{font:14px/1.5 Arial;color:#f88;margin-bottom:16px;max-width:90vw}' +
          '#webtv-error button{background:#00c853;color:#000;border:0;border-radius:6px;' +
            'padding:10px 22px;font:bold 14px Arial;cursor:pointer}' +
          BANNER_CSS +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div id="webtv-stage">' +
          '<video id="' + VIDEO_ID + '" controls autoplay playsinline preload="auto"></video>' +
        '</div>' +
        '<div id="webtv-status"></div>' +
        '<div id="webtv-tap"><button type="button">Toque para iniciar</button></div>' +
        '<div id="webtv-error">' +
          '<div id="webtv-error-msg"></div>' +
          '<button type="button" id="webtv-retry">Tentar novamente</button>' +
        '</div>' +
      '</body>';

    var video = document.getElementById(VIDEO_ID);
    var tap = document.getElementById('webtv-tap');
    var retry = document.getElementById('webtv-retry');

    if (tap) {
      tap.addEventListener('click', function () {
        unlockAudio(video);
        hideTap();
      });
    }
    if (retry) {
      retry.addEventListener('click', function () {
        hideError();
        startPlayback(_streamUrl);
      });
    }
    if (video) {
      bindVideoEvents(video);
      video.addEventListener('play', hideTap);
      video.addEventListener('playing', hideTap);
    }
  }

  function unlockAudio(video) {
    try {
      sessionStorage.setItem('webtv_audio_unlocked', '1');
    } catch (e) {}
    window._webtvAudioUnlocked = true;
    if (!video) return;
    video.muted = false;
    if (!video.volume) video.volume = 1;
    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function () { showTap(); });
    }
  }

  function showTap() {
    var tap = document.getElementById('webtv-tap');
    if (tap) tap.style.display = 'flex';
  }

  function hideTap() {
    var tap = document.getElementById('webtv-tap');
    if (tap) tap.style.display = 'none';
  }

  function showError(message) {
    var overlay = document.getElementById('webtv-error');
    var msg = document.getElementById('webtv-error-msg');
    if (msg) msg.textContent = message || 'Stream indisponível';
    if (overlay) overlay.style.display = 'flex';
  }

  function hideError() {
    var overlay = document.getElementById('webtv-error');
    if (overlay) overlay.style.display = 'none';
  }

  function setStatus(message) {
    var el = document.getElementById('webtv-status');
    if (!el) return;
    el.textContent = message || '';
    if (_statusTimer) clearTimeout(_statusTimer);
    if (message) {
      _statusTimer = setTimeout(function () {
        if (el.textContent === message) el.textContent = '';
      }, 3500);
    }
  }

  // ─── 6. Hls.js ────────────────────────────────────────────────────
  function getHlsConfig() {
    // Config otimizada para Android TV 1.5 GB RAM (AGENTS.md).
    return {
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 30,
      maxBufferLength: 20,
      maxMaxBufferLength: 60,
      maxBufferSize: 30 * 1000 * 1000,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
      capLevelToPlayerSize: true,
      startLevel: -1,
      fragLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 3,
      manifestLoadingMaxRetry: 3,
      abrEwmaDefaultEstimate: 5000000,
      abrBandwidthFactor: 0.7,
      enableSoftwareAES: false
    };
  }

  function loadHls(done) {
    if (_HlsCtor) {
      done(_HlsCtor);
      return;
    }
    if (window.Hls) {
      _HlsCtor = window.Hls;
      done(_HlsCtor);
      return;
    }
    var script = document.createElement('script');
    script.src = HLSJS_CDN;
    script.onload = function () {
      _HlsCtor = window.Hls;
      done(_HlsCtor);
    };
    script.onerror = function () {
      done(null);
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function startPlayback(url) {
    if (!url) {
      showError('Stream não encontrado');
      return;
    }

    var video = document.getElementById(VIDEO_ID);
    if (!video) return;

    hideError();
    setStatus('conectando...');

    try {
      if (window.__webtv_hls) {
        window.__webtv_hls.destroy();
        window.__webtv_hls = null;
      }
    } catch (e) {}

    loadHls(function (Hls) {
      if (!Hls) {
        showError('Falha ao carregar Hls.js');
        postEvent('player:error', { message: 'hls.js load failed' });
        return;
      }

      if (!Hls.isSupported()) {
        video.src = url;
        video.addEventListener('loadedmetadata', function () {
          var promise = video.play();
          if (promise && promise.catch) promise.catch(showTap);
        });
        postEvent('player:loaded', { duration: 0, isLive: true, url: url, source: 'native' });
        return;
      }

      var hls = new Hls(getHlsConfig());
      window.__webtv_hls = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        setStatus('LIVE');
        var promise = video.play();
        if (promise && promise.catch) promise.catch(showTap);
        postEvent('player:loaded', { duration: 0, isLive: true, url: url });
      });

      hls.on(Hls.Events.LEVEL_LOADED, function (_event, data) {
        if (data && data.details && data.details.live) setStatus('LIVE');
      });

      hls.on(Hls.Events.ERROR, function (_event, data) {
        if (!data || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStatus('reconectando...');
          try { hls.startLoad(); } catch (e) {}
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setStatus('recuperando vídeo...');
          try { hls.recoverMediaError(); } catch (e) {}
        } else {
          showError('Stream indisponível (' + (data.details || data.type) + ')');
          postEvent('player:error', { message: data.details || data.type, code: data.type });
        }
      });

      hls.loadSource(url);
      hls.attachMedia(video);
    });
  }

  // ─── 7. Eventos nativos do <video> ────────────────────────────────
  function bindVideoEvents(video) {
    video.addEventListener('play', function () {
      postEvent('player:play', {
        currentTime: video.currentTime,
        duration: video.duration || 0,
        isLive: isLive(video),
        source: 'native'
      });
    });
    video.addEventListener('pause', function () {
      postEvent('player:pause', {
        currentTime: video.currentTime,
        duration: video.duration || 0
      });
    });
    video.addEventListener('ended', function () {
      postEvent('player:ended', { currentTime: 0 });
    });
    video.addEventListener('timeupdate', throttle(function () {
      postEvent('player:timeupdate', {
        currentTime: video.currentTime,
        duration: video.duration || 0
      });
    }, 250));
    video.addEventListener('volumechange', function () {
      postEvent('player:volume:changed', { volume: video.volume, muted: video.muted });
    });
    video.addEventListener('seeked', function () {
      postEvent('player:seeked', {
        currentTime: video.currentTime,
        duration: video.duration || 0
      });
    });
    video.addEventListener('waiting', function () {
      setStatus('buffering...');
    });
    video.addEventListener('playing', function () {
      setStatus('LIVE');
    });
    video.addEventListener('error', function () {
      postEvent('player:error', { message: video.error ? video.error.message : 'media error' });
    });
  }

  function isLive(video) {
    return !video.duration || !isFinite(video.duration);
  }

  function throttle(fn, ms) {
    var last = 0;
    var timer = null;
    return function () {
      var now = Date.now();
      var args = arguments;
      var self = this;
      if (now - last >= ms) {
        last = now;
        fn.apply(self, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(function () {
          last = Date.now();
          fn.apply(self, args);
        }, ms - (now - last));
      }
    };
  }

  // ─── 8. Contrato window.WebTV.player.* ────────────────────────────
  function findVideo() {
    return document.getElementById(VIDEO_ID);
  }

  function getQualityLevels() {
    var hls = window.__webtv_hls;
    if (!hls || !hls.levels) return [];
    var out = [{ index: 0, label: 'Auto', height: 0, width: 0, bitrate: 0 }];
    for (var i = 0; i < hls.levels.length; i++) {
      var level = hls.levels[i];
      var height = level.height || 0;
      out.push({
        index: i + 1,
        label: height ? (height + 'p') : (Math.round((level.bitrate || 0) / 1000) + 'k'),
        height: height,
        width: level.width || 0,
        bitrate: level.bitrate || 0
      });
    }
    return out;
  }

  var playerAPI = {
    play: function () {
      var video = findVideo();
      if (!video) return Promise.resolve({ ok: false, reason: 'no video' });
      return video.play().then(function () {
        return { ok: true, time: video.currentTime };
      }).catch(function (error) {
        return { ok: false, reason: String(error) };
      });
    },
    pause: function () {
      var video = findVideo();
      if (!video) return { ok: false };
      video.pause();
      return { ok: true };
    },
    stop: function () {
      var video = findVideo();
      if (!video) return { ok: false };
      video.pause();
      try { video.currentTime = 0; } catch (e) {}
      return { ok: true };
    },
    seek: function (time) {
      var video = findVideo();
      if (!video) return { ok: false };
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, time));
      return { ok: true, time: video.currentTime };
    },
    rewind: function (seconds) {
      var video = findVideo();
      if (!video) return { ok: false };
      video.currentTime = Math.max(0, video.currentTime - (seconds || 10));
      return { ok: true, time: video.currentTime };
    },
    forward: function (seconds) {
      var video = findVideo();
      if (!video) return { ok: false };
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (seconds || 10));
      return { ok: true, time: video.currentTime };
    },
    volumeUp: function (step) {
      var video = findVideo();
      if (!video) return { ok: false };
      video.volume = Math.min(1, video.volume + (step || 0.1));
      video.muted = false;
      return { ok: true, volume: video.volume };
    },
    volumeDown: function (step) {
      var video = findVideo();
      if (!video) return { ok: false };
      video.volume = Math.max(0, video.volume - (step || 0.1));
      return { ok: true, volume: video.volume };
    },
    mute: function () {
      var video = findVideo();
      if (!video) return { ok: false };
      window._webtvRemoteMute = true;
      video.muted = true;
      window._webtvRemoteMute = false;
      return { ok: true };
    },
    unmute: function () {
      var video = findVideo();
      if (!video) return { ok: false };
      video.muted = false;
      if (!video.volume) video.volume = 1;
      return { ok: true, volume: video.volume };
    },
    fullscreen: function () {
      var video = findVideo();
      if (!video) return { ok: false };
      var fn = video.requestFullscreen || video.webkitRequestFullscreen ||
        video.mozRequestFullScreen || video.msRequestFullscreen;
      if (!fn) return { ok: false };
      var result = fn.call(video);
      if (result && result.catch) result.catch(function () {});
      return { ok: true };
    },
    getStatus: function () {
      var video = findVideo();
      if (!video) return { found: false, quality: { current: 0, levels: [] } };
      var hls = window.__webtv_hls;
      var currentLevel = hls && hls.currentLevel !== undefined ? hls.currentLevel : -1;
      return {
        found: true,
        paused: video.paused,
        muted: video.muted,
        volume: video.volume,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        src: video.currentSrc,
        url: _streamUrl,
        isLive: isLive(video),
        quality: {
          current: currentLevel === -1 ? 0 : currentLevel + 1,
          levels: getQualityLevels()
        }
      };
    },
    quality: {
      getLevels: function () { return getQualityLevels(); },
      getCurrent: function () {
        var hls = window.__webtv_hls;
        if (!hls) return 0;
        return hls.currentLevel === -1 ? 0 : hls.currentLevel + 1;
      },
      set: function (index) {
        var hls = window.__webtv_hls;
        if (!hls) return false;
        try {
          hls.autoLevelEnabled = false;
          hls.currentLevel = index === 0 ? -1 : index - 1;
          postEvent('player:quality:changed', { quality: index, levels: getQualityLevels() });
          return true;
        } catch (e) {
          return false;
        }
      },
      setAuto: function () { return this.set(0); }
    },
    reload: function () {
      try {
        if (window.__webtv_hls) {
          window.__webtv_hls.destroy();
          window.__webtv_hls = null;
        }
      } catch (e) {}
      startPlayback(_streamUrl);
      return { ok: true };
    },
    destroy: function () {
      try {
        if (window.__webtv_hls) {
          window.__webtv_hls.destroy();
          window.__webtv_hls = null;
        }
      } catch (e) {}
      var video = findVideo();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        try { video.load(); } catch (e) {}
      }
      return { ok: true };
    }
  };

  // ─── 9. Eventos para o app (Events API) ───────────────────────────
  function postEvent(type, data) {
    var event = {
      source: 'webtv',
      name: type,
      payload: data || {},
      timestamp: Date.now()
    };
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(event, '*');
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(type, { detail: event })); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('webtv:event', { detail: event })); } catch (e) {}
    try {
      if (window.WebViewBridge && window.WebViewBridge.postMessage) {
        window.WebViewBridge.postMessage(JSON.stringify(event));
      }
    } catch (e) {}
    try {
      if (window.WebTV && window.WebTV.events && window.WebTV.events.emit) {
        window.WebTV.events.emit(type, event.payload);
      }
    } catch (e) {}
  }

  // ─── 10. API WebTV + comandos remotos ────────────────────────────
  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;

  window.WebTV.toggleAudioMute = function () {
    var video = findVideo();
    if (!video) return;
    window._webtvRemoteMute = true;
    video.muted = !video.muted;
    window._webtvRemoteMute = false;
  };

  window.WebTV.unmuteAudio = function () {
    try { sessionStorage.setItem('webtv_audio_unlocked', '1'); } catch (e) {}
    window._webtvAudioUnlocked = true;
    var video = findVideo();
    if (video) {
      video.muted = false;
      video.volume = 1;
    }
    postEvent('player:audio:unlocked', { volume: 1 });
  };

  // DPAD / teclado — Enter (13), DPAD_CENTER (23), Espaço (32),
  // MediaPlayPause (179) e Play (415) alternam play/pause.
  var KEY_PLAY_PAUSE = [13, 23, 32, 179, 415];
  document.addEventListener('keydown', function (event) {
    if (KEY_PLAY_PAUSE.indexOf(event.keyCode) === -1) return;
    var tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
    event.preventDefault();
    var video = findVideo();
    if (!video) return;
    if (video.paused) {
      unlockAudio(video);
    } else {
      video.pause();
    }
  }, true);

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== 'webtv:command') return;
    var method = data.method;
    var args = data.args || [];
    var id = data.id;
    if (typeof playerAPI[method] !== 'function') return;
    Promise.resolve(playerAPI[method].apply(playerAPI, args)).then(function (result) {
      var response = { source: 'webtv:response', method: method, id: id, result: result };
      try {
        if (event.source) event.source.postMessage(response, '*');
      } catch (e) {}
      try {
        if (window.WebViewBridge && window.WebViewBridge.postMessage) {
          window.WebViewBridge.postMessage(JSON.stringify(response));
        }
      } catch (e) {}
    });
  });

  // ─── 11. Cleanup ─────────────────────────────────────────────────
  function destroyHls() {
    try {
      if (window.__webtv_hls) {
        window.__webtv_hls.destroy();
        window.__webtv_hls = null;
      }
    } catch (e) {}
  }
  window.addEventListener('beforeunload', destroyHls);
  window.addEventListener('pagehide', destroyHls);

  // ─── 12. Bootstrap ───────────────────────────────────────────────
  function bootstrap() {
    watchBanners();

    discoverStream(function (url, source) {
      if (!url) {
        postEvent('player:error', { message: 'stream not found' });
        return;
      }
      _streamUrl = url;
      _streamSource = source || 'unknown';
      postEvent('player:discovered', { url: url, source: _streamSource });

      teardownOriginalPlayer();
      buildPlayer();
      startPlayback(url);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
