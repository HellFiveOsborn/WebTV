import { useEffect, useRef, useState, useCallback } from 'react'
import { loadHls } from '../lib/hlsLoader'
import { HLS_CONFIG_ANDROID_TV } from '../lib/hlsConfig'
import { eventBus } from '../lib/eventBus'
import { parseStreamQuery } from './parseStreamQuery'
import { classifyPlayError } from './classifyPlayError'
import { shouldStartMutedAfterAutoplayBlock } from './shouldStartMutedAfterAutoplayBlock'

type Status = 'loading' | 'playing' | 'paused' | 'error' | 'autoplay-blocked'

export const PlayerPage = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<HlsInstance | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')

  const streamUrl = parseStreamQuery(window.location.search)

  const unmuteAndPlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.play().then(() => {
      setStatus('playing')
    }).catch(() => {
      v.muted = true
    })
  }, [])

  const handleUserInteraction = useCallback(() => {
    if (status === 'autoplay-blocked') {
      unmuteAndPlay()
    }
  }, [status, unmuteAndPlay])

  const attach = useCallback(async () => {
    if (!streamUrl || !videoRef.current) return

    try {
      const Hls = await loadHls()

      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }

        const inst = new Hls(HLS_CONFIG_ANDROID_TV)
        hlsRef.current = inst

        inst.on(Hls.Events.ERROR, (_event: unknown, data: HlsErrorData) => {
          if (!data.fatal) return

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            inst.recoverMediaError()
            return
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            inst.startLoad()
            return
          }

          setStatus('error')
          setErrorMsg(data.details || data.error?.message || 'Erro desconhecido')
        })

        inst.loadSource(streamUrl)
        inst.attachMedia(videoRef.current)
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = streamUrl
      } else {
        setStatus('error')
        setErrorMsg('Seu dispositivo nao suporta HLS')
        return
      }

      const video = videoRef.current
      video.muted = false
      try {
        await video.play()
        setStatus('playing')
      } catch (e) {
        const kind = classifyPlayError(e)
        if (shouldStartMutedAfterAutoplayBlock(kind, video.muted)) {
          video.muted = true
          try {
            await video.play()
            setStatus('autoplay-blocked')
          } catch {
            setStatus('error')
            setErrorMsg('Falha ao iniciar o video')
          }
        } else {
          setStatus('error')
          setErrorMsg((e as Error).message || 'Erro ao reproduzir')
        }
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg((e as Error).message || 'Falha ao carregar hls.js')
    }
  }, [streamUrl])

  useEffect(() => {
    if (!streamUrl) {
      setStatus('error')
      setErrorMsg('Parametro ?stream= ausente ou invalido')
      return
    }

    eventBus.emit('standalone:player:opened', {
      streamUrl,
      timestamp: Date.now(),
    })

    attach()

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      eventBus.emit('standalone:player:closed', { streamUrl, timestamp: Date.now() })
    }
  }, [streamUrl, attach])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlay = () => setStatus('playing')
    const onPause = () => setStatus('paused')
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (status === 'autoplay-blocked') {
        e.preventDefault()
        unmuteAndPlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, unmuteAndPlay])

  const handleRetry = () => {
    setStatus('loading')
    setErrorMsg('')
    attach()
  }

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden select-none"
      onClick={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        autoPlay
        tabIndex={-1}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none">
          <div className="text-white text-lg">Carregando stream...</div>
        </div>
      )}

      {status === 'autoplay-blocked' && (
        <button
          onClick={unmuteAndPlay}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 cursor-pointer focus:outline-none"
          aria-label="Toque para ativar o som"
        >
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
          <div className="mt-6 text-white text-xl font-semibold">Toque para ativar o som</div>
          <div className="mt-2 text-white/70 text-sm">Pressione qualquer tecla ou clique na tela</div>
        </button>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 gap-4 px-6 text-center">
          <div className="text-red-400 text-xl font-semibold">Erro ao reproduzir</div>
          <div className="text-white/80 text-sm max-w-md break-words">{errorMsg}</div>
          {streamUrl && (
            <div className="text-white/50 text-xs max-w-md break-all">{streamUrl}</div>
          )}
          <button
            onClick={handleRetry}
            className="mt-2 px-6 py-3 bg-primary text-white rounded-lg hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-primary/50"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}
