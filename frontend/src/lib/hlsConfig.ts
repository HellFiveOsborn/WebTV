/**
 * WebTV — Hls.js config otimizada para Android TV 1.5GB RAM.
 *
 * Mesmos tunings documentados em frontend/AGENTS.md (sessao "Config Hls.js
 * otimizada para Android TV 1.5GB RAM"). Centralizado aqui para reuso entre
 * scripts de injecao e a rota /WebTV/player.
 */
export const HLS_CONFIG_ANDROID_TV = {
  enableWorker: true,
  lowLatencyMode: false,
  backBufferLength: 30,
  maxBufferLength: 20,
  maxMaxBufferLength: 60,
  maxBufferSize: 30 * 1000 * 1000,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 6,
  capLevelToPlayerSize: true,
  startLevel: -1,
  fragLoadingMaxRetry: 3,
  levelLoadingMaxRetry: 3,
  manifestLoadingMaxRetry: 3,
  abrEwmaDefaultEstimate: 5000000,
  abrBandwidthFactor: 0.7,
  enableSoftwareAES: false,
}
