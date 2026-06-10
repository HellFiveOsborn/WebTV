(function () {
  "use strict";

  if (window["__webtv_rdcanais_replace"]) return;
  window["__webtv_rdcanais_replace"] = true;

  // ─── 1. Persistência de áudio (padrão EVENTS_API.md) ────────────
  if (sessionStorage.getItem("webtv_audio_unlocked"))
    window._webtvAudioUnlocked = true;

  // ─── 2. Hook muted — protege contra re-mute após unlock ────────
  try {
    var _md = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "muted",
    );
    if (_md && _md.set && !window.__webtv_muted_hook) {
      window.__webtv_muted_hook = true;
      var _oms = _md.set;
      Object.defineProperty(HTMLMediaElement.prototype, "muted", {
        get: _md.get,
        set: function (v) {
          if (
            window._webtvAudioUnlocked &&
            v === true &&
            !window._webtvRemoteMute
          )
            return;
          _oms.call(this, v);
        },
      });
    }
  } catch (e) {}

  // ─── Configuração ──────────────────────────────────────────────
  var PARENT_REFERER = location.origin + "/";
  // Aceita QUALQUER iframe cross-origin — o discovery vai inspecionar a URL
  // para detectar o padrão (hls/, multi/, multtv/player.php, etc.)
  var IFRAME_HOST_PATTERN = /^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}\//i;
  var HLSJS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js";

  // ─── Estado ────────────────────────────────────────────────────
  var _discoveredUrl = null;
  var _discoverSource = null;

  // ─── Helpers ───────────────────────────────────────────────────
  function pickRootManifest(u) {
    var s = String(u || "");
    var m = s.match(
      /(https?:\/\/[^\s'"<>]*\/(?:index|master)\.m3u8(?:\?[^\s'"<>]*)?)/i,
    );
    return m ? m[1] : null;
  }

  function isM3u8Url(u) {
    return /\.m3u8(\?|$)/i.test(String(u || ""));
  }

  // Decodifica o array obfuscado do rdcplayer (decoder rotativo):
  // O site gera nomes aleatórios para variável do array, acumulador E offset.
  // Formato: var X = ""; var Y = ["str1", "str2", ...];
  //   Y.forEach(v => X += String.fromCharCode(parseInt(atob(v).replace(/\D/g,'')) - <OFFSET>));
  // Procuramos: var X = ""; var Y = [...]; E extraímos o offset do forEach.
  function decodeNeq(html) {
    try {
      // Captura o nome do acumulador (var X = "";) — aceita maiúsculas/minúsculas
      var accMatch = html.match(/var\s+([a-zA-Z]{2,4})\s*=\s*["']["']\s*;/);
      // Captura o array (var Y = [...])
      var arrMatch = html.match(/var\s+([a-zA-Z]{2,4})\s*=\s*(\[[^\]]+\])/s);
      if (!accMatch || !arrMatch) return null;

      // Extrai o offset numérico do forEach:
      //   ... -= <OFFSET>);
      var offsetMatch = html.match(/-\s*(\d{6,12})\s*\)\s*;/);
      var offset = offsetMatch ? parseInt(offsetMatch[1], 10) : 17009184;

      // Parse manual do array: extrai strings base64 entre aspas (simples/duplas)
      // sem usar construtores dinâmicos. O array é grande (~6KB) mas tem formato
      // regular: ["str1", \n"str2", \n"str3", \n...]
      var arr = [];
      var s = arrMatch[2];
      var strRe = /['"]([A-Za-z0-9+\/=]+)['"]/g;
      var mm;
      while ((mm = strRe.exec(s)) !== null) arr.push(mm[1]);
      if (!arr.length) return null;

      var zgg = "";
      for (var i = 0; i < arr.length; i++) {
        try {
          var digits = atob(arr[i]).replace(/\D/g, "");
          zgg += String.fromCharCode(parseInt(digits, 10) - offset);
        } catch (e) {}
      }
      return decodeURIComponent(escape(zgg));
    } catch (e) {
      return null;
    }
  }

  // Extrai m3u8Url de um HTML decodificado (procura em 'var m3u8Url = ...' ou 'm3u8 = ...' ou 'streamUrl = ...')
  function extractM3u8FromDecoded(decoded) {
    if (!decoded) return null;
    var patterns = [
      /var\s+m3u8Url\s*=\s*['"]([^'"]+\.m3u8[^'"]*)/i,
      /const\s+m3u8Url\s*=\s*['"]([^'"]+\.m3u8[^'"]*)/i,
      /const\s+streamUrl\s*=\s*['"]([^'"]+\.m3u8[^'"]*)/i,
      /const\s+streamUrl\s*=\s*["']([^"']+\.m3u8[^"']*)/i,
      /m3u8Url\s*=\s*['"]([^'"]+\.m3u8[^'"]*)/i,
      /source\s*:\s*['"]([^'"]+\.m3u8[^'"]*)/i,
      /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = decoded.match(patterns[i]);
      if (m && m[1]) return m[1].replace(/\\\//g, "/");
    }
    return null;
  }

  // Segue redirects manualmente (porque AWS API Gateway retorna 302 sem CORS
  // quando chamado de outro domínio)
  function followRedirects(url, maxHops) {
    maxHops = maxHops || 5;
    var visited = [];
    var current = url;
    return fetch(current, { method: "GET", redirect: "follow" })
      .then(function (r) {
        return r.url || current;
      })
      .catch(function () {
        return current;
      });
  }

  // ─── Discovery ────────────────────────────────────────────────
  function discoverStreamUrl() {
    if (_discoveredUrl) return Promise.resolve(_discoveredUrl);

    // Usa o iframe.src salvo pelo bootstrap (capturado antes do iframe ser removido)
    var iframeSrc = window.__webtv_iframe_src || "";
    if (!iframeSrc) {
      var iframe = document.querySelector("iframe");
      if (!iframe || !IFRAME_HOST_PATTERN.test(iframe.src)) {
        return Promise.reject(new Error("Iframe não encontrado"));
      }
      iframeSrc = iframe.src;
    }

    var urlObj;
    try {
      urlObj = new URL(iframeSrc);
    } catch (e) {
      return Promise.reject(new Error("iframe.src inválida"));
    }

    var pathParts = urlObj.pathname.split("/").filter(Boolean);
    // pathParts = ['hls', '<slug>.html']  OU  ['multi', '<slug>.html']
    //          OU ['multtv', 'player.php']  OU outros
    var iframeType = pathParts[0];

    // Fetch do HTML do iframe. Em Android WebView (produção), CORS não se aplica —
    // o fetch direto sempre funciona. Em browser de teste, o fetch pode falhar por
    // CORS — nesse caso exibimos erro de discovery (não temos proxy em produção).
    function fetchIframeHtml() {
      return fetch(iframeSrc, { headers: { Referer: PARENT_REFERER } }).then(
        function (r) {
          if (r.ok && r.type !== "opaque") return r.text();
          throw new Error(
            "Iframe HTML status " +
              r.status +
              " (CORS bloqueado em browser — funciona em Android WebView)",
          );
        },
      );
    }

    return fetchIframeHtml().then(function (html) {
      if (!html) throw new Error("Empty iframe HTML");

      // 3a. Padrão 'hls/<slug>.html' — decoder NEQ
      if (iframeType === "hls") {
        var decoded = decodeNeq(html);
        if (!decoded) throw new Error("NEQ não encontrado em hls/<slug>.html");
        var m3u8 = extractM3u8FromDecoded(decoded);
        if (!m3u8)
          throw new Error("m3u8Url não encontrada no HTML decodificado");
        _discoveredUrl = pickRootManifest(m3u8) || m3u8;
        if (!_discoverSource) _discoverSource = "neq-decode";
        return _discoveredUrl;
      }

      // 3b. Padrão 'multi/<slug>.html?m3u8=<endpoint>' — query param + redirect
      if (iframeType === "multi") {
        var m3u8Param = urlObj.searchParams.get("m3u8");
        if (!m3u8Param)
          throw new Error("Query m3u8 ausente em multi/<slug>.html");
        return followRedirects(m3u8Param).then(function (finalUrl) {
          _discoveredUrl = pickRootManifest(finalUrl) || finalUrl;
          if (!_discoverSource) _discoverSource = "multi-redirect";
          return _discoveredUrl;
        });
      }

      // 3c. Padrão 'multtv/player.php?id=<uuid>' ou 'b-cdn/player.php?id=...' —
      //     procurar const streamUrl = "..." ou var m3u8Url = "..." no HTML bruto
      var inlineM3u8 = html.match(
        /(?:var|const|let)\s+(?:m3u8Url|streamUrl)\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i,
      );
      if (inlineM3u8 && inlineM3u8[1]) {
        var cleaned = inlineM3u8[1].replace(/\\\//g, "/");
        _discoveredUrl = pickRootManifest(cleaned) || cleaned;
        if (!_discoverSource) _discoverSource = "inline-stream-url";
        return _discoveredUrl;
      }

      // 3c-bis. Padrão Turnstile + POST (streamrdc.xyz/embed/player.php?id=<slug>) —
      //          stream URL é obtido via POST que retorna {success, url}.
      //          Tenta o POST com cf_token vazio — em Android WebView o Turnstile
      //          managed mode resolve automaticamente. Se Err3, retorna erro.
      if (
        /turnstile|cf_token/i.test(html) &&
        /player\.php\?id=/.test(iframeSrc)
      ) {
        var slugMatch = iframeSrc.match(/[?&]id=([^&]+)/);
        if (slugMatch) {
          var slug = decodeURIComponent(slugMatch[1]);
          return fetch(iframeSrc, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Referer: PARENT_REFERER,
            },
            body: JSON.stringify({ id: slug, cf_token: "0.test-managed-mode" }),
          })
            .then(function (turnstileResp) {
              return turnstileResp.json();
            })
            .then(function (turnstileData) {
              if (turnstileData && turnstileData.success && turnstileData.url) {
                _discoveredUrl =
                  pickRootManifest(turnstileData.url) || turnstileData.url;
                _discoverSource = "turnstile-post";
                return _discoveredUrl;
              }
              throw new Error(
                "Turnstile POST: " +
                  (turnstileData && (turnstileData.error || "no url")),
              );
            });
        }
      }

      // 3d. Fallback genérico — tenta NEQ decode
      var decoded2 = decodeNeq(html);
      if (decoded2) {
        var m3u82 = extractM3u8FromDecoded(decoded2);
        if (m3u82) {
          _discoveredUrl = pickRootManifest(m3u82) || m3u82;
          if (!_discoverSource) _discoverSource = "neq-fallback";
          return _discoveredUrl;
        }
      }

      // 3e. Última tentativa — regex genérico no HTML bruto
      var m = html.match(/(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)/i);
      if (m && m[1]) {
        _discoveredUrl = pickRootManifest(m[1]) || m[1];
        if (!_discoverSource) _discoverSource = "html-regex";
        return _discoveredUrl;
      }
      throw new Error("Stream URL não encontrada no iframe HTML");
    });
  }

  // ─── postEvent (contrato WebTV) ─────────────────────────────────
  function postEvent(type, data) {
    var event = {
      source: "webtv",
      name: type,
      payload: data || {},
      timestamp: Date.now(),
    };
    if (window.parent && window.parent !== window)
      window.parent.postMessage(event, "*");
    window.dispatchEvent(new CustomEvent("webtv:event", { detail: event }));
    if (window.WebViewBridge && window.WebViewBridge.postMessage) {
      window.WebViewBridge.postMessage(JSON.stringify(event));
    }
    if (window.WebTV && window.WebTV.events && window.WebTV.events.emit) {
      try {
        window.WebTV.events.emit(type, event.payload);
      } catch (e) {}
    }
  }

  // ─── DOM replacement ───────────────────────────────────────────
  function replaceDOM() {
    // Remove iframe e tudo mais
    var iframes = document.querySelectorAll("iframe");
    for (var i = 0; i < iframes.length; i++) {
      try {
        iframes[i].parentNode.removeChild(iframes[i]);
      } catch (e) {}
    }

    // Garante que html/body ocupem viewport inteiro — sem isso o <video> com
    // height:100vh pode ficar menor se o body tiver padding/margin residual
    var htmlEl = document.documentElement;
    htmlEl.style.cssText =
      "margin:0;padding:0;height:100%;width:100%;background:#000;overflow:hidden";

    document.body.style.cssText =
      "margin:0;padding:0;height:100vh;width:100vw;background:#000;overflow:hidden;font-family:Arial,sans-serif";

    var video = document.createElement("video");
    video.id = "webtv-player-video";
    video.controls = false; // sem controls nativos — economiza ~50px de tela e memória em Android TV
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // necessário para autoplay em Android WebView
    video.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:contain;background:#000;display:block;z-index:1";

    var status = document.createElement("div");
    status.id = "webtv-status";
    status.style.cssText =
      "position:fixed;bottom:8px;left:8px;color:#0f0;background:rgba(0,0,0,.7);font:11px/1.4 monospace;padding:4px 8px;border-radius:4px;z-index:9;pointer-events:none;max-width:80vw";

    var error = document.createElement("div");
    error.id = "webtv-error";
    error.style.cssText =
      "display:none;position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.9);color:#fff;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:20px";

    var errTitle = document.createElement("div");
    errTitle.style.cssText = "font:bold 18px Arial;margin-bottom:12px";
    errTitle.textContent = "Stream indisponível";

    var errMsg = document.createElement("div");
    errMsg.id = "webtv-error-msg";
    errMsg.style.cssText = "font:13px Arial;color:#f88;margin-bottom:16px";

    var retry = document.createElement("button");
    retry.id = "webtv-retry";
    retry.style.cssText =
      "background:#0f3;color:#000;border:0;padding:10px 20px;font:bold 14px Arial;border-radius:4px;cursor:pointer";
    retry.textContent = "Tentar novamente";
    retry.addEventListener("click", function () {
      initPlayer();
    });

    error.appendChild(errTitle);
    error.appendChild(errMsg);
    error.appendChild(retry);

    // Limpa body
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    document.body.appendChild(video);
    document.body.appendChild(status);
    document.body.appendChild(error);
  }

  // ─── Status overlay ────────────────────────────────────────────
  var _statusTimer = null;
  function setStatus(msg) {
    var el = document.getElementById("webtv-status");
    if (!el) return;
    el.textContent = msg;
    if (_statusTimer) clearTimeout(_statusTimer);
    if (msg)
      _statusTimer = setTimeout(function () {
        if (el.textContent === msg) el.textContent = "";
      }, 4000);
  }

  function showError(msg) {
    var overlay = document.getElementById("webtv-error");
    var msgEl = document.getElementById("webtv-error-msg");
    if (overlay && msgEl) {
      msgEl.textContent = msg;
      overlay.style.display = "flex";
    }
  }

  // ─── Hls.js loader ─────────────────────────────────────────────
  function loadHlsJs(cb) {
    if (window.Hls) return cb(window.Hls);
    var s = document.createElement("script");
    s.src = HLSJS_CDN;
    s.onload = function () {
      cb(window.Hls);
    };
    s.onerror = function () {
      showError("Falha ao carregar Hls.js");
      postEvent("player:error", { message: "hls.js load failed" });
    };
    document.head.appendChild(s);
  }

  // ─── Player init ───────────────────────────────────────────────
  function initPlayer() {
    var errorEl = document.getElementById("webtv-error");
    if (errorEl) errorEl.style.display = "none";

    var video = document.querySelector("#webtv-player-video");
    if (!video) {
      return setTimeout(initPlayer, 50);
    }

    setStatus("descobrindo stream...");

    discoverStreamUrl().then(
      function (HLS_URL) {
        window.__webtv_discovered_url = HLS_URL;
        window.__webtv_discover_source = _discoverSource;
        setStatus("stream OK");
        postEvent("player:discovered", {
          url: HLS_URL,
          source: _discoverSource,
        });

        loadHlsJs(function (Hls) {
          if (!Hls.isSupported()) {
            // Fallback nativo
            video.src = HLS_URL;
            video.addEventListener("loadedmetadata", function () {
              video.play().catch(function () {});
            });
            return;
          }

          // Config otimizada para Android TV 1.5GB RAM
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
            startLevel: -1,
            fragLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
            manifestLoadingMaxRetry: 3,
            abrEwmaDefaultEstimate: 5000000,
            abrBandwidthFactor: 0.7,
            enableSoftwareAES: false,
            // Reduz uso de memória em devices low-RAM
            maxAudioFramesPerSecond: 30,
            stretchShortVideoTrack: false,
          };

          var hls = new Hls(cfg);
          window.__webtv_hls = hls;

          // Em Android WebView, CORS não se aplica — o fetch direto sempre
          // funciona e o Referer do iframe é preservado automaticamente.
          var iframeSrcForReferer = window.__webtv_iframe_src || "";
          var iframeOrigin = "";
          try {
            iframeOrigin = new URL(iframeSrcForReferer).origin;
          } catch (e) {}

          var hls = new Hls(cfg);
          window.__webtv_hls = hls;

          // Setar Referer para o iframe do player (rdcplayer.online, pescaplay.store, etc.)
          // — não o parent (rdcanais.com). Os CDNs Cloudflare-gated exigem o Referer
          // do contexto onde o iframe é carregado. iframeSrc foi capturado no bootstrap
          // antes do iframe ser removido.
          var iframeSrcForReferer = window.__webtv_iframe_src || "";
          var iframeOrigin = "";
          try {
            iframeOrigin = new URL(iframeSrcForReferer).origin;
          } catch (e) {}

          if (iframeOrigin) {
            var refHeader = iframeOrigin + "/";
            hls.config.xhrSetup = function (xhr, url) {
              try {
                xhr.setRequestHeader("Referer", refHeader);
              } catch (e) {}
            };
            if (hls.config.fetchSetup) {
              var origFs = hls.config.fetchSetup;
              hls.config.fetchSetup = function (input, init) {
                init = init || {};
                init.referrer = refHeader;
                init.referrerPolicy = "no-referrer-when-downgrade";
                return origFs ? origFs(input, init) : init;
              };
            }
          }

          hls.loadSource(HLS_URL);
          hls.attachMedia(video);

          var liveState = null;

          hls.on(Hls.Events.MANIFEST_PARSED, function () {
            setStatus("manifest OK");
            video
              .play()
              .then(function () {
                postEvent("player:loaded", {
                  duration: 0,
                  isLive: true,
                  url: HLS_URL,
                });

                // Tenta entrar em fullscreen automaticamente — necessário em
                // Android TV onde o controls bar pode cobrir parte do vídeo.
                // Falha silenciosa é OK (browser desktop pode não suportar).
                try {
                  var fn =
                    video.requestFullscreen ||
                    video.webkitRequestFullscreen ||
                    video.webkitEnterFullscreen;
                  if (fn) fn.call(video);
                } catch (e) {}
              })
              .catch(function () {
                setStatus("Toque para iniciar");
                postEvent("player:error", {
                  message: "autoplay blocked",
                  requiresUserInteraction: true,
                });
              });
          });

          hls.on(Hls.Events.LEVEL_LOADED, function (_e, d) {
            var isLive = !!(d && d.details && d.details.live);
            if (isLive !== liveState) {
              liveState = isLive;
              setStatus(isLive ? "LIVE" : "VOD");
            }
          });

          hls.on(Hls.Events.ERROR, function (_e, d) {
            if (!d || !d.fatal) return;
            setStatus("ERRO: " + d.type);
            if (d.type === "networkError") hls.startLoad();
            else if (d.type === "mediaError") hls.recoverMediaError();
            else {
              showError("Tipo: " + d.type + " / " + d.details);
              hls.destroy();
              postEvent("player:error", { message: d.details || d.type });
            }
          });

          bindVideoEvents(video);
        });
      },
      function (err) {
        showError("Stream não encontrado: " + ((err && err.message) || err));
        postEvent("player:error", {
          message: "discovery failed",
          reason: String(err),
        });
      },
    );
  }

  // ─── Video events ──────────────────────────────────────────────
  function bindVideoEvents(video) {
    video.addEventListener("play", function () {
      postEvent("player:play", {
        currentTime: video.currentTime,
        duration: video.duration || 0,
        isLive: !video.duration || !isFinite(video.duration),
      });
    });
    video.addEventListener("pause", function () {
      postEvent("player:pause", {
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });
    video.addEventListener("volumechange", function () {
      postEvent("player:volume:changed", {
        volume: video.volume,
        muted: video.muted,
      });
    });
    video.addEventListener(
      "timeupdate",
      throttle(function () {
        postEvent("player:timeupdate", {
          currentTime: video.currentTime,
          duration: video.duration || 0,
        });
      }, 250),
    );
  }

  function throttle(fn, ms) {
    var last = 0,
      t = null;
    return function () {
      var now = Date.now(),
        args = arguments,
        self = this;
      if (now - last >= ms) {
        last = now;
        fn.apply(self, args);
      } else {
        clearTimeout(t);
        t = setTimeout(
          function () {
            last = Date.now();
            fn.apply(self, args);
          },
          ms - (now - last),
        );
      }
    };
  }

  // ─── Player API ────────────────────────────────────────────────
  function findVideo() {
    return document.querySelector("#webtv-player-video");
  }

  var playerAPI = {
    play: function () {
      var v = findVideo();
      if (!v) return Promise.resolve({ ok: false });
      return v
        .play()
        .then(function () {
          return { ok: true };
        })
        .catch(function (e) {
          return { ok: false, reason: String(e) };
        });
    },
    pause: function () {
      var v = findVideo();
      if (!v) return { ok: false };
      v.pause();
      return { ok: true };
    },
    stop: function () {
      var v = findVideo();
      if (!v) return { ok: false };
      v.pause();
      v.currentTime = 0;
      return { ok: true };
    },
    reload: function () {
      try {
        if (window.__webtv_hls) {
          window.__webtv_hls.destroy();
          window.__webtv_hls = null;
        }
      } catch (e) {}
      initPlayer();
      return { ok: true };
    },
    getStatus: function () {
      var v = findVideo();
      if (!v) return { found: false };
      return {
        found: true,
        paused: v.paused,
        muted: v.muted,
        volume: v.volume,
        currentTime: v.currentTime,
        src: v.currentSrc,
      };
    },
  };

  window.WebTV = window.WebTV || {};
  window.WebTV.player = playerAPI;
  window.WebTVPlayer = playerAPI;

  // ─── Cleanup ───────────────────────────────────────────────────
  window.addEventListener("beforeunload", function () {
    try {
      if (window.__webtv_hls) {
        window.__webtv_hls.destroy();
        window.__webtv_hls = null;
      }
    } catch (e) {}
  });

  // ─── Bootstrap ─────────────────────────────────────────────────
  function bootstrap() {
    // Aguarda o iframe existir no DOM, então FAZ DISCOVERY ANTES de remover
    // o iframe (precisamos do iframe.src para detectar o padrão)
    function waitForIframe() {
      var iframe = document.querySelector("iframe");
      if (iframe && IFRAME_HOST_PATTERN.test(iframe.src)) {
        // Salva o iframe.src ANTES de remover o iframe — usado pelo Hls.js
        // para setar o Referer correto (CDNs Cloudflare-gated exigem o
        // Referer do contexto do iframe, não do parent).
        window.__webtv_iframe_src = iframe.src;
        discoverStreamUrl().then(
          function (url) {
            window.__webtv_discovered_url = url;
            window.__webtv_discover_source = _discoverSource;
            replaceDOM();
            initPlayer();
          },
          function (err) {
            window.__webtv_discovered_url = null;
            window.__webtv_discover_source = null;
            replaceDOM();
            initPlayer();
          },
        );
      } else {
        setTimeout(waitForIframe, 100);
      }
    }
    waitForIframe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
