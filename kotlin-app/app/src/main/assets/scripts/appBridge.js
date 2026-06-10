(function() {
  'use strict';

  if (window.__webtvAppBridgeInjected) return;
  window.__webtvAppBridgeInjected = true;

  window.WebTV = window.WebTV || {};
  window.WebTV.events = window.WebTV.events || {};
  window.WebTV.events._listeners = window.WebTV.events._listeners || {};

  window.WebTV.events.on = function(type, fn) {
    this._listeners[type] = this._listeners[type] || [];
    this._listeners[type].push(fn);
  };

  window.WebTV.events.emit = function(type, payload) {
    var listeners = this._listeners[type];
    if (listeners) {
      listeners.forEach(function(fn) {
        try { fn(payload); } catch(e) { console.error('[WebTV.events]', e); }
      });
    }
  };

  window.addEventListener('webtv:event', function(e) {
    if (e.detail && e.detail.type) {
      console.log('[appBridge] Forwarding event:', e.detail.type);
      window.WebTV.events.emit(e.detail.type, e.detail.payload);
    }
  });

  // Bug2 fix: rastrear qual URL alternativa está ativa por canal.
  // Quando o user clica numa URL alternativa no widget, o React emite
  // 'player:backupSelected' com {channelId, index, url}. Persistimos
  // para o widget standalone saber qual source destacar.
  window.__webtvActiveUrlByChannel = window.__webtvActiveUrlByChannel || {};
  window.addEventListener('webtv:event', function(e) {
    var p = e.detail && e.detail.payload;
    if (!p || e.detail.type !== 'player:backupSelected') return;
    if (!p.channelId || !p.url) return;
    window.__webtvActiveUrlByChannel[p.channelId] = { url: p.url, index: p.index };
  });

  window.WebTV.channel = window.WebTV.channel || {};
  window.WebTV.channel.activeId = null;
  window.WebTV.channel.activeName = null;

  window.WebTV.channel.close = function() {
    if (!this.activeId) return;

    window.WebTV.events.emit('channel:closing', {});

    var payload = {
      channelId: this.activeId,
      channelName: this.activeName,
      timestamp: Date.now()
    };
    if (window.WebTVBridge && window.WebTVBridge.onChannelClosed) {
      window.WebTVBridge.onChannelClosed(JSON.stringify(payload));
    }
    this.activeId = null;
    this.activeName = null;
  };

  window.WebTV.events.on('channel:clicked', function(payload) {
    if (payload && payload.id) {
      window.WebTV.channel.activeId = payload.id;
      window.WebTV.channel.activeName = payload.name;
      window.__webtvActiveChannelId = payload.id;
      window.__webtvActiveChannelName = payload.name;
    }
  });

  window.WebTV.events.on('channel:closing', function() {
    if (document.getElementById('webtv-close-fade')) return;
    var overlay = document.createElement('div');
    overlay.id = 'webtv-close-fade';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;opacity:0;transition:opacity 250ms ease;pointer-events:none;';
    document.body.appendChild(overlay);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        overlay.style.opacity = '0.92';
      });
    });
  });

  if (window.__webtvActiveChannelId) {
    window.WebTV.channel.activeId = window.__webtvActiveChannelId;
    window.WebTV.channel.activeName = window.__webtvActiveChannelName || '';
  }

  console.log('[WebTV] appBridge.js loaded');
})();