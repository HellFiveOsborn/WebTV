import { useEffect, useRef, useState, useCallback } from 'react'
import { loadHls } from '../lib/hlsLoader'
import { HLS_CONFIG_ANDROID_TV } from '../lib/hlsConfig'
import { eventBus } from '../lib/eventBus'
import { parseStreamQuery } from './parseStreamQuery'

type Status = 'loading' | 'playing' | 'paused' | 'error'

export const PlayerPage = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<HlsInstance | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')

  const streamUrl = parseStreamQuery(window.location.search)

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
      try {
        await video.play()
      } catch (e) {
        setStatus('error')
        setErrorMsg('Autoplay bloqueado pelo navegador')
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
      const v = videoRef.current
      if (!v) return

      if (e.key === 'Enter' || e.key === 'OK' || e.key === 'MediaPlayPause') {
        e.preventDefault()
        if (v.paused) {
          v.play()
        } else {
          v.pause()
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        v.currentTime = Math.max(0, v.currentTime - 10)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        v.volume = Math.min(1, v.volume + 0.1)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        v.volume = Math.max(0, v.volume - 0.1)
        return
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        handleClose()
        return
      }
    }

    const handleClose = () => {
      if (window.history.length > 1) {
        window.history.back()
      } else {
        window.close()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleRetry = () => {
    setStatus('loading')
    setErrorMsg('')
    attach()
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        playsInline
        autoPlay
        tabIndex={-1}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-white text-lg">Carregando stream...</div>
        </div>
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
