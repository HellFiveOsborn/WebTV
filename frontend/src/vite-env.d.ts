/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface HlsConfig {
  enableWorker?: boolean
  lowLatencyMode?: boolean
  backBufferLength?: number
  maxBufferLength?: number
  maxMaxBufferLength?: number
  maxBufferSize?: number
  liveSyncDurationCount?: number
  liveMaxLatencyDurationCount?: number
  capLevelToPlayerSize?: boolean
  startLevel?: number
  fragLoadingMaxRetry?: number
  levelLoadingMaxRetry?: number
  manifestLoadingMaxRetry?: number
  abrEwmaDefaultEstimate?: number
  abrBandwidthFactor?: number
  enableSoftwareAES?: boolean
  [key: string]: unknown
}

interface HlsLevel {
  height?: number
  width?: number
  bitrate?: number
  level?: number
}

interface HlsErrorData {
  type?: string
  details?: string
  fatal?: boolean
  error?: { message?: string }
  reason?: string
}

interface HlsInstance {
  loadSource(url: string): void
  attachMedia(element: HTMLMediaElement): void
  destroy(): void
  startLoad(startPosition?: number): void
  recoverMediaError(): boolean
  on(event: string, callback: (event: unknown, data: HlsErrorData) => void): void
  off(event: string, callback: (event: unknown, data: HlsErrorData) => void): void
  config: HlsConfig
}

interface HlsConstructor {
  new (config?: HlsConfig): HlsInstance
  isSupported(): boolean
  Events: {
    ERROR: string
    MANIFEST_PARSED: string
    MEDIA_ATTACHED: string
    FRAG_LOADED: string
  }
  ErrorTypes: {
    NETWORK_ERROR: string
    MEDIA_ERROR: string
    FRAG_LOAD_ERROR: string
    LEVEL_LOAD_ERROR: string
    MANIFEST_LOAD_ERROR: string
    KEY_SYSTEM_ERROR: string
  }
}

interface Window {
  Hls?: HlsConstructor
}
