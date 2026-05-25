(function() {
  'use strict';

  if (window.__webtvWidgetInjected) return;
  window.__webtvWidgetInjected = true;

  var channelId = window.__webtvActiveChannelId ||
    (window.WebTV && window.WebTV.channel && window.WebTV.channel.activeId);
  var baseUrl = window.__webtvBaseUrl ||
    (window.WebTV && window.WebTV.baseUrl);

  if (!channelId || !baseUrl) {
    console.log('[WebTV Widget] Missing channelId or baseUrl, skipping');
    return;
  }

  function ensureWebTVEvents() {
    if (window.WebTV && window.WebTV.events && typeof window.WebTV.events.emit === 'function') {
      return window.WebTV.events;
    }

    window.WebTV = window.WebTV || {};
    if (window.WebTV.events && typeof window.WebTV.events.emit === 'function') {
      return window.WebTV.events;
    }

    var listeners = {};
    var history = [];

    window.WebTV.events = {
      on: function(eventName, callback) {
        listeners[eventName] = listeners[eventName] || [];
        listeners[eventName].push(callback);
        return function() {
          var idx = (listeners[eventName] || []).indexOf(callback);
          if (idx !== -1) listeners[eventName].splice(idx, 1);
        };
      },

      off: function(eventName, callback) {
        var idx = (listeners[eventName] || []).indexOf(callback);
        if (idx !== -1) listeners[eventName].splice(idx, 1);
      },

      emit: function(type, payload) {
        var event = { type: type, payload: payload || {}, timestamp: Date.now() };
        history.push({ type: type, payload: payload || {}, timestamp: event.timestamp });

        var cbs = listeners[type] || [];
        for (var i = 0; i < cbs.length; i++) {
          try { cbs[i](event); } catch (e) {
            console.error('[WebTV Widget] Error in listener for ' + type, e);
          }
        }

        var wildcards = listeners['*'] || [];
        for (var j = 0; j < wildcards.length; j++) {
          try { wildcards[j](event); } catch (e) {
            console.error('[WebTV Widget] Error in wildcard listener', e);
          }
        }

        window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
        window.postMessage({
          source: 'webtv:event',
          event: event
        }, '*');
      },

      getHistory: function(filter) {
        if (!filter) return history;
        return history.filter(function(h) { return h.type === filter; });
      },

      clearHistory: function() {
        history.length = 0;
      }
    };

    window.WebTV.channel = window.WebTV.channel || {};
    window.WebTV.channel.activeId = channelId;
    window.WebTV.channel.activeName = window.__webtvActiveChannelName || null;

    console.log('[WebTV Widget] WebTV.events shim initialized');
    return window.WebTV.events;
  }

  var events = ensureWebTVEvents();

  console.log('[WebTV Widget] Injecting widget for channel:', channelId);

  var iframe = document.createElement('iframe');
  iframe.id = '__webtv_widget';
  iframe.src = baseUrl + 'widget/' + channelId;
  iframe.allowTransparency = 'true';
  iframe.scrolling = 'no';
  iframe.tabIndex = -1;
  iframe.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'width:56px',
    'height:56px',
    'border:none',
    'background:transparent',
    'z-index:2147483646',
    'overflow:visible',
    'transition:width 0.3s ease, height 0.3s ease'
  ].join(';');

  var pendingInsertRetries = 0;
  var MAX_INSERT_RETRIES = 20;

  function insertIframe() {
    if (document.body) {
      document.body.appendChild(iframe);
      console.log('[WebTV Widget] Iframe inserted');
      return;
    }
    pendingInsertRetries++;
    if (pendingInsertRetries < MAX_INSERT_RETRIES) {
      setTimeout(insertIframe, 100);
    }
  }

  window.addEventListener('message', function(e) {
    if (!e.data) return;

    if (e.data.source !== 'webtv') return;

    if (e.data.name === 'widget:resize') {
      var payload = e.data.payload || {};
      if (payload.width) iframe.style.width = payload.width + 'px';
      if (payload.height) iframe.style.height = payload.height + 'px';
      return;
    }

    if (e.data.type) {
      var type = e.data.type;
      var payload = e.data.payload || {};

      if (type === 'widget:resize') {
        if (payload.width) iframe.style.width = payload.width + 'px';
        if (payload.height) iframe.style.height = payload.height + 'px';
        return;
      }

      events.emit(type, payload);
      console.log('[WebTV Widget] Emitted event:', type, payload);

      if (type === 'widget:expanded') {
        setTimeout(function() { iframe.focus(); iframe.contentWindow.focus(); }, 100);
      }
    }
  });

  var domReadyRetries = 0;
  var MAX_DOM_READY_RETRIES = 50;

  function waitDomReady() {
    if (document.body || document.readyState === 'interactive' || document.readyState === 'complete') {
      insertIframe();
      return;
    }
    domReadyRetries++;
    if (domReadyRetries < MAX_DOM_READY_RETRIES) {
      setTimeout(waitDomReady, 100);
    }
  }

  waitDomReady();

  events.emit('widget:injected', {
    channelId: channelId,
    baseUrl: baseUrl
  });

  console.log('[WebTV Widget] Ready, events available at window.WebTV.events');
})();