(function() {
  'use strict';

  if (window.__webtvAppBridgeInjected) return;
  window.__webtvAppBridgeInjected = true;

  function waitWebTV() {
    if (typeof window.WebTV === 'undefined' || typeof window.WebTV.events === 'undefined') {
      setTimeout(waitWebTV, 50);
      return;
    }

    window.WebTV.channel = window.WebTV.channel || {};
    window.WebTV.channel.activeId = window.__webtvActiveChannelId || null;
    window.WebTV.channel.activeName = window.__webtvActiveChannelName || null;

    window.WebTV.channel.close = function() {
      if (!window.WebTV.channel.activeId) {
        console.log('[WebTV] No active channel to close');
        return;
      }
      const payload = {
        channelId: window.WebTV.channel.activeId,
        channelName: window.WebTV.channel.activeName,
        timestamp: Date.now()
      };
      if (window.WebTVBridge && window.WebTVBridge.onChannelClosed) {
        window.WebTVBridge.onChannelClosed(JSON.stringify(payload));
      }
      console.log('[WebTV] channel.close() invoked:', payload);
    };

    console.log('[WebTV] AppBridge ready, activeId:', window.WebTV.channel.activeId);
  }

  waitWebTV();
})();
