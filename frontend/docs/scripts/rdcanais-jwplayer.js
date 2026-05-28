(function() {
  'use strict';
  var SCRIPT_ID = 'rdcanais-jwplayer';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;
  function postEvent(type, data) {
    var event = { source: 'webtv', name: type, payload: data || {}, timestamp: Date.now() };
    if (window.parent && window.parent !== window) window.parent.postMessage(event, '*');
    window.dispatchEvent(new CustomEvent(type, { detail: event }));
    window.dispatchEvent(new CustomEvent('webtv:event', { detail: event }));
    if (window.WebViewBridge && window.WebViewBridge.postMessage) window.WebViewBridge.postMessage(JSON.stringify(event));
  }
  var AD_SELECTORS = ['[class*="ad-"]','[id*="ad-"]','[class*="popup"]','[class*="modal"]','.fc-ab-root','iframe[src*="ad"]','iframe[src*="banner"]','iframe[src*="pop"]','iframe[src*="click"]'];
  var VIP_SELECTORS = ['#vipModal','[class*="vip-modal"]','[id*="vip"]','[class*="vip"]','.vip-modal','.is-vip'];
  function removeOverlays() {
    var all = AD_SELECTORS.concat(VIP_SELECTORS);
    for (var i = 0; i < all.length; i++) { var els = document.querySelectorAll(all[i]); for (var j = 0; j < els.length; j++) els[j].remove(); }
  }
  function observeOverlays() { removeOverlays(); var o = new MutationObserver(function(){removeOverlays();}); o.observe(document.body,{childList:true,subtree:true}); setInterval(removeOverlays,3000); }
  function rfsJW() { if (typeof jwplayer === 'function') jwplayer().setFullscreen(true); }
  function rfsNative(el) {
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) fn.call(el).catch(function(){});
  }
  function tryAutoplay(video) {
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    if (typeof jwplayer === 'function') { var jwp = jwplayer(); if (jwp && typeof jwp.play === 'function') { jwp.play(); return; } }
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function(){ postEvent('player:play',{source:'auto',time:video.currentTime}); })
      .catch(function(){ postEvent('player:error',{message:'Autoplay blocked',requiresUserInteraction:true}); createAudioUnlockOverlay(); });
    }
  }
  function createAudioUnlockOverlay() {
    if (document.getElementById('webtv-audio-overlay')) return;
    var o = document.createElement('div');
    o.id = 'webtv-audio-overlay';
    o.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .3s;';
    o.innerHTML = '<div style="text-align:center"><svg viewBox="0 0 24 24" width="80" height="80" fill="#fff" style="margin-bottom:1rem"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg><div style="color:#fff;font:bold 20px Arial,sans-serif">Toque para ativar o audio</div></div>';
    document.body.appendChild(o);
    requestAnimationFrame(function(){o.style.opacity='1';});
    function unlock() {
      if (typeof jwplayer === 'function') { jwplayer().setVolume(100); }
      document.querySelectorAll('video').forEach(function(v){ v.muted=false; v.volume=1.0; if(v.paused)v.play().catch(function(){}); });
      o.style.opacity='0'; o.style.pointerEvents='none'; setTimeout(function(){o.remove();},300);
      postEvent('player:audio:unlocked',{volume:1.0});
    }
    o.addEventListener('click',unlock,{once:true});
    o.addEventListener('touchstart',unlock,{once:true});
  }
  function getVideo() { return document.querySelector('video'); }
  function withJW(fn) { if (typeof jwplayer==='function') { var j=jwplayer(); if(j)return fn(j); } return null; }
  function setupJWEvents() {
    if (typeof jwplayer !== 'function') return false;
    var jwp = jwplayer();
    if (!jwp || typeof jwp.on !== 'function') return false;
    jwp.on('play', function(){ rfsJW(); postEvent('player:play',{currentTime:jwp.getPosition(),duration:jwp.getDuration()||0,isLive:!jwp.getDuration()}); });
    jwp.on('pause', function(){ postEvent('player:pause',{currentTime:jwp.getPosition(),duration:jwp.getDuration()||0}); });
    jwp.on('complete', function(){ postEvent('player:ended',{currentTime:0}); });
    jwp.on('time', function(d){ postEvent('player:timeupdate',{currentTime:d.position,duration:d.duration||0}); });
    jwp.on('volume', function(d){ postEvent('player:volume',{volume:d.volume/100,muted:d.muted}); });
    jwp.on('fullscreen', function(d){ postEvent('player:fullscreen',{isFullscreen:d.fullscreen}); });
    jwp.on('error', function(e){ postEvent('player:error',{message:(e&&e.message)||'unknown'}); });
    jwp.on('ready', function(){ postEvent('player:loaded',{duration:jwp.getDuration()||0,isLive:!jwp.getDuration()}); });
    var v = getVideo();
    if (v) { v.addEventListener('play',function(){rfsNative(v);}); v.addEventListener('pause',function(){}); v.addEventListener('volumechange',function(){}); v.addEventListener('seeked',function(){}); }
    return true;
  }
  var playerAPI = {
    play:function(){ var r=withJW(function(j){j.play();return {ok:true};}); if(r)return Promise.resolve(r); var v=getVideo(); if(v)return v.play().then(function(){return {ok:true,time:v.currentTime};}).catch(function(e){return{ok:false,reason:String(e)};}); return Promise.resolve({ok:false,reason:'no player'}); },
    pause:function(){ var r=withJW(function(j){j.pause();return {ok:true};}); if(r)return r; var v=getVideo(); if(v)v.pause(); return {ok:true}; },
    stop:function(){ var r=withJW(function(j){j.stop();return {ok:true};}); if(r)return r; var v=getVideo(); if(v){v.pause();v.currentTime=0;} return {ok:true}; },
    seek:function(t){ var r=withJW(function(j){j.seek(t);return {ok:true};}); if(r)return r; var v=getVideo(); if(v)v.currentTime=t; return {ok:true}; },
    volumeUp:function(s){ s=s||10; var r=withJW(function(j){var vol=Math.min(100,j.getVolume()+s);j.setVolume(vol);return{ok:true,volume:vol/100};}); if(r)return r; var v=getVideo(); if(v){v.volume=Math.min(1,v.volume+(s/100));} return {ok:true}; },
    volumeDown:function(s){ s=s||10; var r=withJW(function(j){var vol=Math.max(0,j.getVolume()-s);j.setVolume(vol);return{ok:true,volume:vol/100};}); if(r)return r; var v=getVideo(); if(v){v.volume=Math.max(0,v.volume-(s/100));} return {ok:true}; },
    mute:function(){ var r=withJW(function(j){j.setMute();return {ok:true};}); if(r)return r; var v=getVideo(); if(v)v.muted=true; return {ok:true}; },
    unmute:function(){ var r=withJW(function(j){j.setMute(false);if(j.getVolume()===0)j.setVolume(100);return{ok:true};}); if(r)return r; var v=getVideo(); if(v){v.muted=false;if(v.volume===0)v.volume=1;} return {ok:true}; },
    fullscreen:function(){ var r=withJW(function(j){j.setFullscreen(true);return {ok:true};}); if(r)return r; var v=getVideo(); if(v)rfsNative(v); return {ok:true}; },
    getStatus:function(){ var s=withJW(function(j){var p=j.getPosition(),d=j.getDuration();return{found:true,paused:j.getState()!=='playing',muted:j.getMute(),volume:j.getVolume()/100,currentTime:p||0,duration:d||0,state:j.getState()};}); if(s)return s; var v=getVideo(); if(!v)return {found:false}; return {found:true,paused:v.paused,muted:v.muted,volume:v.volume,currentTime:v.currentTime,duration:v.duration||0}; }
  };
  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;
  window.addEventListener('message',function(e){
    var d=e.data; if(!d||d.source!=='webtv:command')return;
    var method=d.method,args=d.args||[],id=d.id;
    if(typeof playerAPI[method]!=='function')return;
    Promise.resolve(playerAPI[method].apply(playerAPI,args)).then(function(result){
      var r={source:'webtv:response',method:method,id:id,result:result};
      if(e.source)e.source.postMessage(r,'*');
      window.dispatchEvent(new CustomEvent('webtv:event',{detail:{type:'api:response',data:r}}));
      if(window.WebViewBridge&&window.WebViewBridge.postMessage)window.WebViewBridge.postMessage(JSON.stringify(r));
    });
  });
  observeOverlays();
  function init(){
    var hooked = setupJWEvents();
    var video = getVideo();
    if (video) {
      tryAutoplay(video);
      if (!hooked) {
        video.addEventListener('play',function(){rfsNative(video);postEvent('player:play',{currentTime:video.currentTime});});
        video.addEventListener('pause',function(){postEvent('player:pause',{currentTime:video.currentTime});});
        postEvent('player:loaded',{duration:video.duration||0,isLive:!video.duration||!isFinite(video.duration)});
      }
    } else {
      var obs=new MutationObserver(function(){var v=getVideo();if(v){obs.disconnect();if(!hooked)setupJWEvents();tryAutoplay(v);postEvent('player:loaded',{duration:v.duration||0,isLive:!v.duration||!isFinite(v.duration)});}});
      obs.observe(document.body||document.documentElement,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();