(function() {
  'use strict';
  
  const postEvent = (type, data) => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'clappr-player',
        type,
        timestamp: Date.now(),
        data: {
          currentTime: data.currentTime || 0,
          duration: data.duration || 0,
          volume: data.volume ?? null,
          muted: data.muted ?? null,
          isFullscreen: data.isFullscreen ?? null
        }
      }, '*');
    }
  };
  
  const removeBanners = () => {
    document.querySelectorAll('.vip-modal, .vip-banner, [class*="vip"], [class*="anuncio"], [class*="ad-"], .fc-ab-root').forEach(el => el.remove());
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'absolute') && parseInt(style.zIndex) > 9000 && !el.closest('#player')) {
        el.remove();
      }
    });
  };

  const observeBanners = () => {
    removeBanners();
    const observer = new MutationObserver(() => removeBanners());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(removeBanners, 3000);
  };

  const requestFullscreen = (video) => {
    const requestFullscreen = video.requestFullscreen || video.webkitRequestFullscreen || video.mozRequestFullScreen || video.msRequestFullscreen;
    if (requestFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      requestFullscreen.call(video).catch(() => {});
    }
  };

  const attach = () => {
    const video = document.querySelector('video[data-html5-video]');
    if (!video) return setTimeout(attach, 500);

    video.addEventListener('play', () => {
      requestFullscreen(video);
      postEvent('play', { currentTime: video.currentTime, duration: video.duration });
    });
    video.addEventListener('pause', () => postEvent('pause', { currentTime: video.currentTime, duration: video.duration }));
    video.addEventListener('volumechange', () => postEvent('volume', { volume: video.volume, muted: video.muted }));
    video.addEventListener('timeupdate', () => postEvent('timeupdate', { currentTime: video.currentTime, duration: video.duration }));
    video.addEventListener('ended', () => postEvent('ended', { currentTime: video.currentTime, duration: video.duration }));
    
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
      document.addEventListener(evt, () => {
        postEvent('fullscreen', { isFullscreen: !!(document.fullscreenElement || document.webkitFullscreenElement) });
      });
    });
    
    postEvent('ready', { currentTime: video.currentTime, duration: video.duration });
  };

  observeBanners();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
