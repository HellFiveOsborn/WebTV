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

  window.WebTV.channel = window.WebTV.channel || {};
  window.WebTV.channel.activeId = null;
  window.WebTV.channel.activeName = null;

  window.WebTV.channel.close = function() {
    if (!this.activeId) {
      console.log('[WebTV] No active channel to close');
      return;
    }
    var payload = {
      channelId: this.activeId,
      channelName: this.activeName,
      timestamp: Date.now()
    };
    console.log('[WebTV] Channel close requested:', payload);
    if (window.WebTVBridge && window.WebTVBridge.onChannelClosed) {
      window.WebTVBridge.onChannelClosed(JSON.stringify(payload));
    }
    this.activeId = null;
    this.activeName = null;
  };

  window.WebTV.events.on('channel:clicked', function(payload) {
    if (payload && payload.id) {
      console.log('[appBridge] Setting active channel:', payload.id);
      window.WebTV.channel.activeId = payload.id;
      window.WebTV.channel.activeName = payload.name;
      window.__webtvActiveChannelId = payload.id;
      window.__webtvActiveChannelName = payload.name;
    }
  });

  console.log('[WebTV] appBridge.js loaded (created window.WebTV)');
})();
