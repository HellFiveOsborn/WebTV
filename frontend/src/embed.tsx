import React from "react";
import { createRoot } from "react-dom/client";
import { ChannelWidget } from "./components/ChannelWidget";
import { Channel } from "./types/channel";
import { WIDGET_CSS } from "./embed-css";

const BASE = (window as any).__webtvBaseUrl || "";
const BASE_PATH = BASE.endsWith("/") ? BASE : `${BASE}/`;
const CONTAINER_ID = "webtv-widget-container";

console.log("[WebTVWidget] Loading widget bundle, BASE=", BASE);

function getChannels(): { channel: Channel; channels: Channel[] } {
  const data = (window as any).__webtvWidgetData;
  if (!data || !data.channels) throw new Error("Dados do widget nao disponiveis");
  const channel = (data.channels as Channel[]).find((ch) => ch.id === data.activeChannelId);
  if (!channel) throw new Error(`Canal ${data.activeChannelId} nao encontrado`);
  return { channel, channels: data.channels.filter((ch: Channel) => ch.active) };
}

function createContainer(): HTMLDivElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.id = CONTAINER_ID;
  wrapper.style.cssText =
    "position:fixed;top:0;right:0;bottom:0;width:40%;z-index:2147483646;pointer-events:none;";
  document.body.appendChild(wrapper);

  const shadow = wrapper.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = WIDGET_CSS;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.id = "webtv-widget-root";
  root.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  shadow.appendChild(root);

  return root;
}

function postWidget(msg: Record<string, unknown>) {
  window.parent.postMessage({ source: "webtv-widget", ...msg }, "*");
}

function navigateToChannel(ch: Channel) {
  const bridge = (window as any).WebTVBridge;
  if (bridge && bridge.onChannelClicked) {
    bridge.onChannelClicked(JSON.stringify({
      id: ch.id,
      name: ch.title,
      type: ch.alternativeUrls.some((u: any) => u.type === 'iframe') ? 'iframe' : 'redirect',
      channels: (window as any).__webtvWidgetData?.channels?.filter((c: Channel) => c.active) || [],
    }));
    const redirectUrl = ch.alternativeUrls.find((u: any) => u.type === 'redirect');
    if (redirectUrl) {
      window.location.href = redirectUrl.url;
    }
  } else {
    window.location.href = `${BASE_PATH}WebTV/widget/${ch.id}`;
  }
}

function renderWidget(
  rootEl: HTMLDivElement,
  channel: Channel,
  channels: Channel[],
) {
  const reactRoot = createRoot(rootEl);
  reactRoot.render(
    React.createElement(ChannelWidget, {
      channel,
      allChannels: channels,
      onChannelSelect: (ch: Channel) => {
        navigateToChannel(ch);
      },
      embedded: true,
      onClose: () => {
        postWidget({ type: "close" });
        removeWidget();
      },
      onSwitchUrl: (url: string) => {
        postWidget({ type: "switchUrl", url });
      },
    }),
  );
}

function removeWidget() {
  const el = document.getElementById(CONTAINER_ID);
  if (el) el.remove();
}

function init() {
  try {
    const { channel, channels } = getChannels();
    const rootEl = createContainer();
    renderWidget(rootEl, channel, channels);
    console.log("[WebTVWidget] Widget inicializado:", channel.title);
  } catch (err) {
    console.error("[WebTVWidget] Falha ao inicializar:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}