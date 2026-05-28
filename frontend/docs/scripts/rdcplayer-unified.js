(function() {
  'use strict';

  // ─── Persist audio unlock state ──────────────────────────
  if (sessionStorage.getItem('webtv_audio_unlocked')) window._webtvAudioUnlocked = true;

  var SCRIPT_ID = 'rdcplayer-unified';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;

  var currentTime = 0, duration = 0, playerReady = false;
  var qualityLevels = [], currentQualityIdx = -1;

  // ─── Ad blocking ────────────────────────────────────────────
  var _AD_DOMAINS = [
    'adexchangerapid.com', 'dtscout.com', 'dtscdn.com',
    'usrpubtrk.com', 'mrktmtrcs.net', 'onaudience.com',
    'histats.com', 'tynt.com', 'llvpn.com',
    'crwdcntrl.net', 'waust.at', 'whos.amung.us'
  ];

  var _AD_IDS = ['dontfoid', 'vipModal', 'banner-container', 'cookie-alert'];

  try {
    if (typeof aclib !== 'undefined') { aclib.runPop = function(){}; aclib.isShowingPop = false; }
  } catch(e) {}

  try { if (typeof sbChecker === 'function') sbChecker = function(){ return false; }; } catch(e) {}

  try { if (typeof _Hasync !== 'undefined') _Hasync = []; } catch(e) {}
  try { if (typeof _wau !== 'undefined') _wau = []; } catch(e) {}

  try { delete window['ZpQw9XkLmN8c3vR3']; } catch(e) {}

  try {
    if (window.ConsoleBan) {
      if (ConsoleBan.clear) ConsoleBan.clear();
      ConsoleBan.init = function(){};
      ConsoleBan.clear = function(){};
    }
  } catch(e) {}

  (function() {
    var _op = window.open;
    window.open = function() { return null; };
    window._originalOpen = _op;
  })();

  (function() {
    try {
      var _ce = document.createElement.bind(document);
      var _tagSet = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
      document.createElement = function(tagName) {
        var el = _ce(tagName);
        if (tagName.toLowerCase() === 'script' && _tagSet && _tagSet.set) {
          var _val = '';
          Object.defineProperty(el, 'src', {
            set: function(url) {
              for (var i = 0; i < _AD_DOMAINS.length; i++) {
                if (url.indexOf(_AD_DOMAINS[i]) !== -1) return;
              }
              _tagSet.set.call(this, url);
              _val = url;
            },
            get: function() { return _val; },
            configurable: true
          });
        }
        return el;
      };
    } catch(e) {}
  })();

  function removeKnownAds() {
    for (var i = 0; i < _AD_IDS.length; i++) {
      var el = document.getElementById(_AD_IDS[i]);
      if (el) el.remove();
    }
    var vj = document.getElementsByClassName('vjeyln');
    while(vj.length) vj[0].remove();
    try {
      var ifs = document.querySelectorAll('iframe[width="0"],iframe[height="0"],iframe[style*="display: none"],iframe[style*="display:none"]');
      for (var j = 0; j < ifs.length; j++) {
        if (ifs[j].src && _AD_DOMAINS.some(function(d){ return ifs[j].src.indexOf(d) !== -1; })) {
          ifs[j].remove();
        }
      }
    } catch(e) {}
  }

  removeKnownAds();

  // ─── Event bridge ────────────────────────────────────────
  function postEvent(type, data) {
    var event = { source: 'webtv', name: type, payload: data || {}, timestamp: Date.now() };
    if (window.parent && window.parent !== window) window.parent.postMessage(event, '*');
    window.dispatchEvent(new CustomEvent(type, { detail: event }));
    window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
    if (window.WebViewBridge && window.WebViewBridge.postMessage) window.WebViewBridge.postMessage(JSON.stringify(event));
  }

  // ─── Auto-unmute: prevent re-mute after user unlocks ────
  try {
    var _md = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted') ||
             Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'muted');
    if (_md && _md.set) {
      var _oms = _md.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
        get: _md.get,
        set: function(v) {
          if (window._webtvAudioUnlocked && v === true && !window._webtvRemoteMute) return;
          _oms.call(this, v);
        },
        configurable: true,
        enumerable: _md.enumerable
      });
    }
  } catch(e) {}

  // ─── Fullscreen helpers ──────────────────────────────────
  function requestFs(el) {
    if (!el) return;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) fn.call(el).catch(function(){});
  }

  function exitFs() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) fn.call(document).catch(function(){});
  }

  // ─── Overlay suppression ─────────────────────────────────
  var AD_SELECTORS = [
    '#dontfoid', '#vipModal', '#banner-container', '.vjeyln',
    '[class*="ad-"]', '[id*="ad-"]', '[class*="overlay"]', '[class*="popup"]',
    '[class*="modal"]:not(#webtv-audio-overlay)', 'iframe[src*="ad"]',
    'iframe[src*="banner"]', '[onclick*="window.open"]',
    'iframe[width="0"]', 'iframe[height="0"]',
    'iframe[style*="display: none"]', 'iframe[style*="display:none"]'
  ];

  function suppressOverlays() {
    var observer = new MutationObserver(function(mutations) {
      for (var mi = 0; mi < mutations.length; mi++) {
        var added = mutations[mi].addedNodes;
        for (var ai = 0; ai < added.length; ai++) {
          var node = added[ai];
          if (node.nodeType !== 1) continue;
          for (var si = 0; si < AD_SELECTORS.length; si++) {
            try {
              if (node.matches && node.matches(AD_SELECTORS[si]) && node.id !== 'webtv-audio-overlay') {
                var doRemove = true;
                // Only remove zero-dim/hidden iframes from known ad domains
                if ((AD_SELECTORS[si] === 'iframe[width="0"]' || AD_SELECTORS[si] === 'iframe[height="0"]' || AD_SELECTORS[si] === 'iframe[style*="display: none"]' || AD_SELECTORS[si] === 'iframe[style*="display:none"]') && node.tagName === 'IFRAME') {
                  if (!node.src || !_AD_DOMAINS.some(function(d){ return node.src.indexOf(d) !== -1; })) { doRemove = false; }
                }
                if (doRemove) node.remove();
              }
            } catch (e) {}
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setInterval(function() {
      for (var si = 0; si < AD_SELECTORS.length; si++) {
        try {
          document.querySelectorAll(AD_SELECTORS[si]).forEach(function(el) {
            if (el.id !== 'webtv-audio-overlay') { el.style.pointerEvents = 'none'; el.style.zIndex = '-1'; }
          });
        } catch(e) {}
      }
      removeKnownAds();
    }, 1000);
  }

  // ─── Audio unlock overlay ────────────────────────────────
  function createAudioUnlockOverlay() {
    if (document.getElementById('webtv-audio-overlay') || sessionStorage.getItem('webtv_audio_unlocked')) return;
    window._webtvAudioUnlocked = false;

    var overlay = document.createElement('div');
    overlay.id = 'webtv-audio-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:pointer;';

    overlay.innerHTML = '<svg width="120" height="120" viewBox="0 0 24 24" fill="none"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.17v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="white"/></svg>';

    document.body.appendChild(overlay);

    var unlock = function() {
      document.querySelectorAll('video').forEach(function(v) {
        v.muted = false;
        v.play().catch(function(){});
      });
      overlay.remove();
      window._webtvAudioUnlocked = true;
      sessionStorage.setItem('webtv_audio_unlocked', '1');
      var _audioWatch = setInterval(function() {
        var vs = document.querySelectorAll('video');
        if (vs.length > 0) { vs.forEach(function(av){ av.muted = false; }); }
        else { clearInterval(_audioWatch); }
      }, 200);
    };
    overlay.addEventListener('click', unlock, { once: true });
    overlay.addEventListener('touchstart', unlock, { once: true });
  }

  // ─── Player detection ────────────────────────────────────
  var __player = null;

  function detectPlayer() {
    try {
      if (typeof jwplayer === 'function') {
        var j = jwplayer();
        if (j && typeof j.getState === 'function' && j.getContainer && j.getContainer()) {
          __player = 'jwplayer'; return 'jwplayer';
        }
      }
    } catch(e) {}
    if (document.querySelector('video[data-html5-video]')) { __player = 'clappr'; return 'clappr'; }
    if (typeof Clappr !== 'undefined') { __player = 'clappr'; return 'clappr'; }
    if (document.querySelector('video')) { __player = 'native'; return 'native'; }
    return null;
  }

  // ─── Autoplay ────────────────────────────────────────────
  function tryAutoplay(video) {
    if (!video) return;

    if (__player === 'jwplayer') {
      try { jwplayer().play(); return; } catch(e) {}
      video.muted = true; video.play().catch(function(){});
      return;
    }

    if (__player === 'clappr') {
      var poster = document.querySelector('.player-poster.clickable');
      if (poster && poster.offsetParent !== null) { poster.click(); }
    }

    if (!window._webtvAudioUnlocked) { video.muted = true; }
    video.playsInline = true;
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function() { postEvent('player:play', { time: video.currentTime, isLive: !video.duration || !isFinite(video.duration), source: 'auto' }); })
      .catch(function() {
        video.muted = false;
        video.play().then(function() { postEvent('player:play', { time: video.currentTime, isLive: !video.duration || !isFinite(video.duration), source: 'auto' }); })
        .catch(function() { postEvent('player:error', { message: 'Autoplay blocked', requiresUserInteraction: true }); createAudioUnlockOverlay(); });
      });
    }
  }

  // ─── Video element discovery ─────────────────────────────
  function findVideo() {
    return document.querySelector('video[data-html5-video]') || document.querySelector('video.jw-video') || document.querySelector('video');
  }

  function waitVideo() {
    return new Promise(function(resolve) {
      var v = findVideo();
      if (v) { resolve(v); return; }
      var iv = setInterval(function() {
        var vv = findVideo();
        if (vv) { clearInterval(iv); resolve(vv); }
      }, 300);
    });
  }

  // ─── Video events ────────────────────────────────────────
  function setupVideoEvents(video) {
    video.addEventListener('play', function() {
      requestFs(document.getElementById('player') || video.parentElement);
      postEvent('player:play', { currentTime: video.currentTime, duration: video.duration || 0, isLive: !video.duration || !isFinite(video.duration), url: video.src });
    });
    video.addEventListener('pause', function() { postEvent('player:pause', { currentTime: video.currentTime, duration: video.duration || 0 }); });
    video.addEventListener('ended', function() { postEvent('player:ended', { time: 0 }); });
    video.addEventListener('timeupdate', function() { currentTime = video.currentTime; duration = video.duration || 0; postEvent('player:timeupdate', { currentTime: currentTime, duration: duration }); });
    video.addEventListener('seeked', function() { postEvent('player:seeked', { time: video.currentTime, duration: video.duration || 0 }); });
    var lastVolume = video.volume;
    video.addEventListener('volumechange', function() {
      var vol = video.volume, muted = video.muted;
      if (vol !== lastVolume) { postEvent('player:volume:changed', { volume: vol, direction: vol > lastVolume ? 'up' : 'down' }); lastVolume = vol; }
      if (muted) postEvent('player:muted', {}); else if (!muted) postEvent('player:unmuted', { volume: vol });
    });
    video.addEventListener('error', function() { postEvent('player:error', { message: video.error ? video.error.message : 'unknown' }); });
  }

  // ─── Quality (JWPlayer) ──────────────────────────────────
  function getJWQualityLevels() {
    try { var jwp = jwplayer(); if (typeof jwp.getQualityLevels !== 'function') return null; return jwp.getQualityLevels().map(function(l, i) { return { index: i, label: l.label || (l.height ? l.height + 'p' : 'Auto'), height: l.height || 0, width: l.width || 0, bitrate: l.bitrate || 0 }; }); } catch(e) { return null; }
  }

  // ─── Quality (Clappr / hls.js) ──────────────────────────
  function findClapprHls() {
    try {
      var video = document.querySelector('video[data-html5-video]');
      if (!video) return null;
      var cur = video.parentElement;
      for (var d = 0; d < 12 && cur; d++) {
        var own = Object.getOwnPropertyNames(cur);
        for (var i = 0; i < own.length; i++) {
          if (own[i].indexOf('__container') !== -1 || own[i].indexOf('_container') !== -1) {
            var c = cur[own[i]];
            if (c && c.core && c.core.getCurrentPlayback) {
              var pb = c.core.getCurrentPlayback();
              var hls = pb && (pb._hls || pb.hls);
              if (hls && hls.levels) return hls;
            }
          }
        }
        cur = cur.parentElement;
      }
      if (typeof p2pml !== 'undefined' && p2pml.core && p2pml.core._engine && p2pml.core._engine._hls) return p2pml.core._engine._hls;
      return null;
    } catch(e) { return null; }
  }

  function getClapprQualityLevels() {
    var hls = findClapprHls();
    if (!hls || !hls.levels) return null;
    var lvls = [{ index: 0, label: 'Auto', height: 0, width: 0, bitrate: 0 }];
    for (var i = 0; i < hls.levels.length; i++) {
      var l = hls.levels[i];
      lvls.push({ index: i + 1, label: (l.height ? l.height + 'p' : 'Level ' + (i + 1)), height: l.height || 0, width: l.width || 0, bitrate: l.bitrate || 0 });
    }
    return lvls;
  }

  function refreshQualityLevels() {
    var lvls = __player === 'jwplayer' ? getJWQualityLevels() : null;
    if (!lvls) lvls = getClapprQualityLevels();
    if (lvls) { qualityLevels = lvls; var cur = -1; if (__player === 'jwplayer') try { cur = jwplayer().getCurrentQuality(); } catch(e) {} currentQualityIdx = cur; }
  }

  function setJWQuality(idx) { try { jwplayer().setCurrentQuality(idx); return true; } catch(e) { return false; } }
  function setClapprQuality(idx) { var hls = findClapprHls(); if (!hls) return false; try { hls.currentLevel = idx === 0 ? -1 : idx - 1; return true; } catch(e) { return false; } }

  var qualityAPI = {
    getLevels: function() { refreshQualityLevels(); return qualityLevels.length > 0 ? qualityLevels.slice() : null; },
    getCurrent: function() { refreshQualityLevels(); return currentQualityIdx; },
    set: function(idx) {
      var ok = __player === 'jwplayer' ? setJWQuality(idx) : setClapprQuality(idx);
      if (ok) { currentQualityIdx = idx; postEvent('player:quality:changed', { quality: idx, levels: qualityLevels }); }
      return ok;
    },
    setAuto: function() { return qualityAPI.set(0); }
  };

  // ─── JWPlayer events ────────────────────────────────────
  function setupJWPlayerEvents() {
    if (__player !== 'jwplayer') return false;
    try {
      var jwp = jwplayer();
      if (!jwp || typeof jwp.on !== 'function') return false;
      jwp.on('play', function() { jwp.setFullscreen(true); postEvent('player:play', { currentTime: jwp.getPosition(), duration: jwp.getDuration() || 0, isLive: !jwp.getDuration() }); });
      jwp.on('pause', function() { postEvent('player:pause', { currentTime: jwp.getPosition(), duration: jwp.getDuration() || 0 }); });
      jwp.on('complete', function() { postEvent('player:ended', { time: 0 }); });
      jwp.on('time', function(d) { currentTime = d.position; duration = d.duration || 0; postEvent('player:timeupdate', { currentTime: currentTime, duration: duration }); });
      jwp.on('volume', function(d) { postEvent('player:volume:changed', { volume: d.volume / 100, direction: 'change' }); if (d.muted) postEvent('player:muted', {}); else postEvent('player:unmuted', { volume: d.volume / 100 }); });
      jwp.on('error', function(e) { postEvent('player:error', { message: (e && e.message) || 'unknown' }); });
      jwp.on('levelsChanged', function() { refreshQualityLevels(); postEvent('player:quality:changed', { quality: currentQualityIdx, levels: qualityLevels }); });
      jwp.on('ready', function() { playerReady = true; refreshQualityLevels(); postEvent('player:loaded', { duration: jwp.getDuration() || 0, isLive: !jwp.getDuration(), quality: { levels: qualityLevels, current: currentQualityIdx } }); });
      return true;
    } catch(e) { return false; }
  }

  function setupClapprQualityEvents() {
    var hls = findClapprHls();
    if (!hls) return;
    try { hls.onLevelSwitched = function() { refreshQualityLevels(); postEvent('player:quality:changed', { quality: currentQualityIdx, levels: qualityLevels }); }; } catch(e) {}
  }

  // ─── Player API ──────────────────────────────────────────
  var playerAPI = {
    play: function() {
      if (__player === 'jwplayer') try { jwplayer().play(); postEvent('player:play',{source:'api'}); return Promise.resolve({ok:true}); } catch(e) {}
      var v = findVideo();
      if (!v) return Promise.resolve({ ok: false, reason: 'no video' });
      return v.play().then(function() { postEvent('player:play', { source: 'api', time: v.currentTime }); return { ok: true, time: v.currentTime, muted: v.muted, volume: v.volume }; }).catch(function(e) { return { ok: false, reason: String(e) }; });
    },
    pause: function() {
      if (__player === 'jwplayer') try { jwplayer().pause(); return {ok:true}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.pause(); postEvent('player:pause', { time: v.currentTime }); return { ok: true, time: v.currentTime };
    },
    stop: function() {
      if (__player === 'jwplayer') try { jwplayer().stop(); postEvent('player:ended',{}); return {ok:true}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.pause(); v.currentTime = 0; postEvent('player:ended', {}); return { ok: true };
    },
    rewind: function(s) { s = s || 10; var v = findVideo(); if (!v) return { ok: false }; v.currentTime = Math.max(0, v.currentTime - s); postEvent('player:seeked', { time: v.currentTime, direction: 'backward' }); return { ok: true, time: v.currentTime }; },
    forward: function(s) { s = s || 10; var v = findVideo(); if (!v) return { ok: false }; v.currentTime = Math.min(v.duration || Infinity, v.currentTime + s); postEvent('player:seeked', { time: v.currentTime, direction: 'forward' }); return { ok: true, time: v.currentTime }; },
    seek: function(t) {
      if (__player === 'jwplayer') try { jwplayer().seek(t); return {ok:true}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.currentTime = Math.max(0, Math.min(v.duration || Infinity, t)); postEvent('player:seeked', { time: v.currentTime }); return { ok: true, time: v.currentTime };
    },
    volumeUp: function(s) {
      s = s || 0.1;
      if (__player === 'jwplayer') try { var vol = Math.min(100, jwplayer().getVolume() + (s*100)); jwplayer().setVolume(vol); return {ok:true,volume:vol/100}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.volume = Math.min(1, v.volume + s); v.muted = false; postEvent('player:volume:changed', { volume: v.volume, direction: 'up' }); return { ok: true, volume: v.volume, muted: false };
    },
    volumeDown: function(s) {
      s = s || 0.1;
      if (__player === 'jwplayer') try { var vol = Math.max(0, jwplayer().getVolume() - (s*100)); jwplayer().setVolume(vol); return {ok:true,volume:vol/100}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.volume = Math.max(0, v.volume - s); postEvent('player:volume:changed', { volume: v.volume, direction: 'down' }); return { ok: true, volume: v.volume, muted: v.muted };
    },
    mute: function() {
      if (__player === 'jwplayer') try { jwplayer().setMute(); postEvent('player:muted',{}); return {ok:true}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.muted = true; postEvent('player:muted', {}); return { ok: true, muted: true };
    },
    unmute: function() {
      if (__player === 'jwplayer') try { jwplayer().setMute(false); if(jwplayer().getVolume()===0)jwplayer().setVolume(100); postEvent('player:unmuted',{volume:1}); return {ok:true}; } catch(e) {}
      var v = findVideo(); if (!v) return { ok: false }; v.muted = false; if (v.volume === 0) v.volume = 1; postEvent('player:unmuted', { volume: v.volume }); return { ok: true, muted: false, volume: v.volume };
    },
    getStatus: function() {
      if (__player === 'jwplayer') try { var j=jwplayer(); return {found:true,paused:j.getState()!=='playing',muted:j.getMute(),volume:j.getVolume()/100,currentTime:j.getPosition()||0,duration:j.getDuration()||0,state:j.getState(),quality:{current:currentQualityIdx,levels:qualityLevels}}; } catch(e) {}
      var v = findVideo(); if (!v) return { found: false }; return { found: true, paused: v.paused, muted: v.muted, volume: v.volume, currentTime: v.currentTime, duration: v.duration || 0, src: v.src, quality: { current: currentQualityIdx, levels: qualityLevels } };
    },
    quality: qualityAPI,
    toggleAudioMute: function() {
      var vs = findVideo(); if (!vs) return;
      var m = vs.muted; window._webtvRemoteMute = true; vs.muted = !m; window._webtvRemoteMute = false;
    },
    unmuteAudio: function() {
      var vs = findVideo(); if (!vs) return;
      vs.muted = false; window._webtvAudioUnlocked = true; sessionStorage.setItem('webtv_audio_unlocked', '1');
    }
  };

  // ─── Expose API ──────────────────────────────────────────
  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;
  window.WebTV.toggleAudioMute = playerAPI.toggleAudioMute;
  window.WebTV.unmuteAudio = playerAPI.unmuteAudio;

  // ─── Command listener ────────────────────────────────────
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || d.source !== 'webtv:command') return;
    var method = d.method, args = d.args || [], id = d.id;
    if (typeof playerAPI[method] !== 'function') return;
    Promise.resolve(playerAPI[method].apply(playerAPI, args)).then(function(result) {
      var response = { source: 'webtv:response', method: method, id: id, result: result };
      if (e.source) e.source.postMessage(response, '*');
      window.dispatchEvent(new CustomEvent('webtv:event', { detail: { type: 'api:response', data: response } }));
      if (window.WebViewBridge && window.WebViewBridge.postMessage) window.WebViewBridge.postMessage(JSON.stringify(response));
    });
  });

  // ─── Init ────────────────────────────────────────────────
  function init() {
    suppressOverlays();
    detectPlayer();
    refreshQualityLevels();
    var jwHooked = setupJWPlayerEvents();

    waitVideo().then(function(video) {
      if (!jwHooked) { setupVideoEvents(video); setupClapprQualityEvents(); }
      tryAutoplay(video);
      if (!playerReady) postEvent('player:loaded', { duration: video.duration || 0, isLive: !video.duration || !isFinite(video.duration), quality: { levels: qualityLevels, current: currentQualityIdx } });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();