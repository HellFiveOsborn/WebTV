import { useState, useCallback, useEffect, useRef } from "react";
import { Channel, AlternativeUrl } from "../types/channel";
import { eventBus } from "../lib/eventBus";

function postWidget(msg: Record<string, unknown>) {
  if (window === window.parent) return;
  window.parent.postMessage({ source: "webtv-widget", ...msg }, "*");
}

interface ChannelWidgetProps {
  channel: Channel;
  allChannels: Channel[];
  onChannelSelect: (ch: Channel) => void;
  embedded?: boolean;
  onClose?: () => void;
  onSwitchUrl?: (url: string) => void;
}

export const ChannelWidget = ({
  channel,
  allChannels,
  onChannelSelect,
  embedded = false,
  onClose,
  onSwitchUrl,
}: ChannelWidgetProps) => {
  const [mode, setMode] = useState<"collapsed" | "panel" | "sidebar">(
    "collapsed",
  );
  const [focused, setFocused] = useState("toggle");
  const [widgetActive, setWidgetActive] = useState(!embedded);
  const pageFocusRef = useRef<Element | null>(null);
  const posClass = embedded ? "absolute" : "fixed";
  const toggleRef = useRef<HTMLButtonElement>(null);
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const skipFocusRef = useRef(true);

  const visible = channel.alternativeUrls.slice(0, 5);
  const channels = allChannels
    .filter((ch) => ch.id !== channel.id)
    .slice(0, 20);

  const panelItems = [
    "toggle",
    "sidebar-btn",
    ...visible.map((_, i) => `url-${i}`),
    "close",
  ];
  const sidebarItems = ["sidebar-btn", ...channels.map((_, i) => `ch-${i}`)];
  const items: Record<string, string[]> = {
    collapsed: ["toggle"],
    panel: panelItems,
    sidebar: sidebarItems,
  };

  const activate = useCallback(() => {
    if (!embedded) return;
    setWidgetActive(true);
    skipFocusRef.current = false;
    postWidget({ type: "focus:enter" });
  }, [embedded]);

  const deactivate = useCallback(() => {
    if (!embedded) return;
    setWidgetActive(false);
    setMode("collapsed");
    setFocused("toggle");
    skipFocusRef.current = true;
    postWidget({ type: "focus:leave" });
    if (pageFocusRef.current instanceof HTMLElement) {
      pageFocusRef.current.focus();
    }
    pageFocusRef.current = null;
  }, [embedded]);

  const navigateFocus = useCallback(
    (dir: 1 | -1) => {
      if (!widgetActive) return;
      setFocused((prev) => {
        const list = items[mode];
        const idx = list.indexOf(prev);
        if (idx === -1) return list[0];
        return list[(idx + dir + list.length) % list.length];
      });
    },
    [items, mode, widgetActive],
  );

  const handleSwitchUrl = useCallback(
    (url: string, index: number) => {
      setMode("collapsed");
      setFocused("toggle");
      eventBus.emit("player:backupSelected", {
        channelId: channel.id,
        index,
        url,
      });
      if (embedded && onSwitchUrl) {
        onSwitchUrl(url);
      } else {
        window.location.href = url;
      }
    },
    [channel.id, embedded, onSwitchUrl],
  );

  const handleClose = useCallback(() => {
    eventBus.emit("channel:closing", {});
    eventBus.emit("channel:close", {
      channelId: channel.id,
      channelName: channel.title,
      timestamp: Date.now(),
    });
    if ((window as any).WebTVBridge?.onChannelClosed) {
      (window as any).WebTVBridge.onChannelClosed(
        JSON.stringify({
          channelId: channel.id,
          channelName: channel.title,
          timestamp: Date.now(),
        }),
      );
    }
    if (embedded && onClose) {
      onClose();
    } else {
      if (window.opener) window.close();
    }
  }, [channel.id, channel.title, embedded, onClose]);

  useEffect(() => {
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    if (!widgetActive) return;
    if (focused === "toggle") toggleRef.current?.focus();
    else refs.current.get(focused)?.focus();
  }, [focused, mode, widgetActive]);

  useEffect(() => {
    if (embedded) {
      const handler = (e: MessageEvent) => {
        if (!e.data || e.data.source !== "webtv-parent") return;
        if (e.data.type === "focus:enter") {
          setWidgetActive(true);
          skipFocusRef.current = true;
          setFocused("toggle");
        }
        if (e.data.type === "focus:leave") {
          setWidgetActive(false);
          setMode("collapsed");
          setFocused("toggle");
          skipFocusRef.current = true;
        }
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }
  }, [embedded]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && embedded && !widgetActive) {
        e.preventDefault();
        pageFocusRef.current = document.activeElement;
        setWidgetActive(true);
        setMode("panel");
        setFocused(visible.length > 0 ? "url-0" : "toggle");
        skipFocusRef.current = false;
        postWidget({ type: "focus:enter" });
        return;
      }

      if (!widgetActive) return;

      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        if (mode === "sidebar") {
          setMode("panel");
          setFocused("sidebar-btn");
          return;
        }
        if (mode === "panel") {
          if (embedded) {
            setWidgetActive(false);
            setMode("collapsed");
            setFocused("toggle");
            skipFocusRef.current = true;
            if (pageFocusRef.current instanceof HTMLElement) {
              pageFocusRef.current.focus();
            }
            pageFocusRef.current = null;
            postWidget({ type: "focus:leave" });
          } else {
            setMode("collapsed");
            setFocused("toggle");
          }
          return;
        }
        handleClose();
        return;
      }

      if (e.key === "ArrowLeft" && mode === "collapsed" && embedded) {
        e.preventDefault();
        deactivate();
        return;
      }

      if (mode === "collapsed") {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setMode("panel");
          setFocused(visible.length > 0 ? "url-0" : "toggle");
          return;
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (mode === "panel" && focused === "sidebar-btn") {
          setFocused("toggle");
          return;
        }
        if (mode === "panel" && focused === "close") {
          setFocused("toggle");
          return;
        }
        navigateFocus(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (mode === "panel" && focused === "url-0") {
          setFocused("sidebar-btn");
          return;
        }
        if (mode === "panel" && focused === "toggle") {
          setFocused("close");
          return;
        }
        navigateFocus(-1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (mode === "panel" && /^url-\d+$/.test(focused)) {
          setFocused("sidebar-btn");
          return;
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (mode === "panel" && focused === "sidebar-btn") {
          setFocused("url-0");
          return;
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (mode === "panel") {
          if (focused === "toggle") {
            setMode("collapsed");
            setFocused("toggle");
          } else if (focused === "sidebar-btn") {
            setMode("sidebar");
            setFocused(
              sidebarItems.length > 0 ? "ch-0" : "sidebar-btn",
            );
          } else if (focused === "close") handleClose();
          else {
            const m = focused.match(/^url-(\d+)$/);
            if (m) {
              const i = parseInt(m[1]);
              if (visible[i]) handleSwitchUrl(visible[i].url, i);
            }
          }
        } else if (mode === "sidebar") {
          if (focused === "sidebar-btn") {
            setMode("collapsed");
            setFocused("toggle");
          } else if (focused.startsWith("ch-")) {
            const i = parseInt(focused.split("-")[1]);
            if (channels[i]) onChannelSelect(channels[i]);
          }
        }
      }
    },
    [
      mode,
      focused,
      widgetActive,
      embedded,
      navigateFocus,
      visible,
      channels,
      handleClose,
      handleSwitchUrl,
      onChannelSelect,
      sidebarItems,
      deactivate,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  const handleToggleClick = () => {
    if (embedded && !widgetActive) {
      pageFocusRef.current = document.activeElement;
      activate();
    }
    setMode((m) => {
      if (embedded && m === "panel") {
        setWidgetActive(false);
        postWidget({ type: "focus:leave" });
        if (pageFocusRef.current instanceof HTMLElement) {
          pageFocusRef.current.focus();
        }
        pageFocusRef.current = null;
      }
      return m === "collapsed" ? "panel" : "collapsed";
    });
    skipFocusRef.current = false;
    setFocused(visible.length > 0 ? "url-0" : "toggle");
  };

  return (
    <>
      <button
        ref={toggleRef}
        tabIndex={widgetActive ? 0 : -1}
        aria-label={mode !== "collapsed" ? "Fechar painel" : "Abrir painel"}
        className={`${posClass} bottom-2 right-2 z-50 w-10 h-10 rounded-full bg-dark-surface border border-dark-border text-white flex items-center justify-center transition-all pointer-events-auto ${
          focused === "toggle" ? "ring-2 ring-primary bg-primary" : ""
        }`}
        onClick={handleToggleClick}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          {mode !== "collapsed" ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </>
          )}
        </svg>
      </button>

      {mode === "panel" && (
        <div className={`${posClass} bottom-14 right-2 z-50 pointer-events-auto`}>
          <button
            ref={(el) => {
              if (el) refs.current.set("sidebar-btn", el);
            }}
            tabIndex={0}
            aria-label="Abrir lista de canais"
            onClick={() => {
              setMode("sidebar");
              setFocused(
                sidebarItems.length > 0 ? "ch-0" : "sidebar-btn",
              );
            }}
            className={`absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center transition-all ${
              focused === "sidebar-btn"
                ? "bg-primary text-white shadow-[0_0_0_3px_theme(colors.dark.border)]"
                : "text-gray-400"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div
            className="w-80 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden text-base"
            role="dialog"
          >
            <div className="px-3 py-2 border-b border-dark-border flex items-center gap-2">
              <img
                src={channel.logoUrl}
                alt=""
                className="w-7 h-7 rounded object-contain bg-dark-bg flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <p className="text-white text-base font-semibold truncate">
                {channel.title}
              </p>
            </div>
            {visible.length > 0 ? (
              <div className="py-0.5">
                {visible.map((alt: AlternativeUrl, i: number) => (
                  <button
                    key={i}
                    ref={(el) => {
                      if (el) refs.current.set(`url-${i}`, el);
                    }}
                    tabIndex={0}
                    onClick={() => handleSwitchUrl(alt.url, i)}
                    className={`w-full px-3 py-2.5 text-left outline-none flex items-center gap-2 ${
                      focused === `url-${i}`
                        ? "bg-primary/40 text-white"
                        : "text-gray-300"
                    }`}
                  >
                    <span className="w-4 h-4 bg-gray-700 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate">
                      {alt.url.length > 30
                        ? alt.url.substring(0, 30) + "..."
                        : alt.url}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-gray-500">
                Sem URLs alternativas
              </div>
            )}
            <div className="border-t border-dark-border p-1.5">
              <button
                ref={(el) => {
                  if (el) refs.current.set("close", el);
                }}
                tabIndex={0}
                onClick={handleClose}
                className={`w-full py-2 rounded text-sm font-medium outline-none ${
                  focused === "close"
                    ? "bg-red-600 text-white"
                    : "bg-red-600/20 text-red-400"
                }`}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "sidebar" && (
        <div
          className={`${posClass} top-0 right-0 bottom-0 z-50 w-72 bg-dark-surface border-l border-dark-border shadow-xl flex flex-col pointer-events-auto`}
          role="listbox"
        >
          <div className="px-4 py-3 border-b border-dark-border flex items-center gap-3 flex-shrink-0">
            <button
              ref={(el) => {
                if (el) refs.current.set("sidebar-btn", el);
              }}
              tabIndex={0}
              aria-label="Fechar widget"
              onClick={() => {
                setMode("collapsed");
                setFocused("toggle");
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                focused === "sidebar-btn"
                  ? "bg-primary text-white"
                  : "bg-dark-border text-gray-400"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <p className="text-white text-base font-semibold truncate">
              Canais
            </p>
          </div>
          <div className="overflow-y-auto flex-1 py-0.5">
            {channels.map((ch, i) => (
              <button
                key={ch.id}
                ref={(el) => {
                  if (el) refs.current.set(`ch-${i}`, el);
                }}
                tabIndex={0}
                onClick={() => onChannelSelect(ch)}
                className={`w-full px-4 py-3 text-left outline-none flex items-center gap-3 ${
                  focused === `ch-${i}`
                    ? "bg-primary/40 text-white"
                    : "text-gray-300"
                }`}
              >
                <img
                  src={ch.logoUrl}
                  alt=""
                  className="w-6 h-6 rounded object-contain bg-dark-bg flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <span className="truncate text-base">{ch.title}</span>
              </button>
            ))}
            {channels.length === 0 && (
              <div className="px-3 py-3 text-center text-gray-500 text-sm">
                Nenhum canal disponível
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};