(function() {
  'use strict';
  var SCRIPT_ID = 'rdcanais-clappr-p2p';
  if (window['__webtv_' + SCRIPT_ID]) return;
  window['__webtv_' + SCRIPT_ID] = true;
  var VIDEO_SELECTOR = 'video[data-html5-video]';
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
  function requestFullscreen(el) {
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) fn.call(el).catch(function(){});
  }
  function tryAutoplay(video) {
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function(){ postEvent('player:play',{time:video.currentTime,isLive:!video.duration||!isFinite(video.duration),source:'auto'}); })
      .catch(function(){
        postEvent('player:error',{message:'Autoplay blocked',requiresUserInteraction:true});
        createAudioUnlockOverlay();
      });
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
      var vs = document.querySelectorAll(VIDEO_SELECTOR);
      for (var i=0;i<vs.length;i++){ vs[i].muted=false; vs[i].volume=1.0; if(vs[i].paused)vs[i].play().catch(function(){}); }
      o.style.opacity='0'; o.style.pointerEvents='none'; setTimeout(function(){o.remove();},300);
      postEvent('player:audio:unlocked',{volume:1.0});
    }
    o.addEventListener('click',unlock,{once:true});
    o.addEventListener('touchstart',unlock,{once:true});
  }
  function findVideo() { return document.querySelector(VIDEO_SELECTOR); }
  function setupVideoEvents(video) {
    video.addEventListener('play',function(){ requestFullscreen(video); postEvent('player:play',{currentTime:video.currentTime,duration:video.duration||0,isLive:!video.duration||!isFinite(video.duration)}); });
    video.addEventListener('pause',function(){ postEvent('player:pause',{currentTime:video.currentTime,duration:video.duration||0}); });
    video.addEventListener('ended',function(){ postEvent('player:ended',{currentTime:0}); });
    video.addEventListener('timeupdate',function(){ postEvent('player:timeupdate',{currentTime:video.currentTime,duration:video.duration||0}); });
    video.addEventListener('volumechange',function(){ postEvent('player:volume',{volume:video.volume,muted:video.muted}); });
    video.addEventListener('seeked',function(){ postEvent('player:seeked',{time:video.currentTime,duration:video.duration||0}); });
  }
  var playerAPI = {
    play:function(){ var v=findVideo(); if(!v)return {ok:false,reason:'no video'}; return v.play().then(function(){postEvent('player:play',{source:'api',time:v.currentTime});return {ok:true,time:v.currentTime};}).catch(function(e){return {ok:false,reason:String(e)};}); },
    pause:function(){ var v=findVideo(); if(!v)return {ok:false}; v.pause(); postEvent('player:pause',{time:v.currentTime}); return {ok:true}; },
    stop:function(){ var v=findVideo(); if(!v)return {ok:false}; v.pause(); v.currentTime=0; postEvent('player:ended',{}); return {ok:true}; },
    seek:function(t){ var v=findVideo(); if(!v)return {ok:false}; v.currentTime=Math.max(0,Math.min(v.duration||Infinity,t)); return {ok:true,time:v.currentTime}; },
    volumeUp:function(s){ s=s||0.1; var v=findVideo(); if(!v)return {ok:false}; v.volume=Math.min(1,v.volume+s); v.muted=false; return {ok:true,volume:v.volume}; },
    volumeDown:function(s){ s=s||0.1; var v=findVideo(); if(!v)return {ok:false}; v.volume=Math.max(0,v.volume-s); return {ok:true,volume:v.volume}; },
    mute:function(){ var v=findVideo(); if(!v)return {ok:false}; v.muted=true; return {ok:true}; },
    unmute:function(){ var v=findVideo(); if(!v)return {ok:false}; v.muted=false; if(v.volume===0)v.volume=1; return {ok:true,volume:v.volume}; },
    fullscreen:function(){ var v=findVideo(); if(!v)return {ok:false}; requestFullscreen(v); return {ok:true}; },
    getStatus:function(){ var v=findVideo(); if(!v)return {found:false}; return {found:true,paused:v.paused,muted:v.muted,volume:v.volume,currentTime:v.currentTime,duration:v.duration||0,src:v.src}; }
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
    var video = findVideo();
    if(video){ setupVideoEvents(video); tryAutoplay(video); postEvent('player:loaded',{duration:video.duration||0,isLive:!video.duration||!isFinite(video.duration)}); }
    else {
      var obs=new MutationObserver(function(){var v=findVideo(); if(v){obs.disconnect();setupVideoEvents(v);tryAutoplay(v);postEvent('player:loaded',{duration:v.duration||0,isLive:!v.duration||!isFinite(v.duration)});}});
      obs.observe(document.body||document.documentElement,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();