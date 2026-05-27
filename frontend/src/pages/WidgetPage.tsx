import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Channel, ChannelsData } from '../types/channel'
import { ChannelWidget } from '../components/ChannelWidget'
import { FeedbackMessage } from '../components/FeedbackMessage'

const DATA_URL = `${import.meta.env.BASE_URL}data/channels.json`
const IN_IFRAME = window !== window.parent

type PageState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; channel: Channel; channels: Channel[] }

function postWidget(msg: Record<string, unknown>) {
  if (!IN_IFRAME) return
  window.parent.postMessage(
    { source: 'webtv-widget', ...msg },
    '*',
  )
}

export const WidgetPage = () => {
  const { channelId } = useParams<{ channelId: string }>()
  const [page, setPage] = useState<PageState>({ status: 'loading' })
  const navigate = useNavigate()

  useEffect(() => {
    if (IN_IFRAME) {
      const style = document.createElement('style')
      style.id = 'webtv-widget-transparent'
      style.textContent = `
        html, body, #root { background: transparent !important; height: 100%; margin: 0; overflow: hidden; }
        #loading-screen { display: none !important; }
      `
      document.head.appendChild(style)
      return () => { style.remove() }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(DATA_URL)
        if (!res.ok) throw new Error('Falha ao carregar dados')
        const data: ChannelsData = await res.json()
        if (cancelled) return
        const channel = data.channels.find(ch => ch.id === channelId)
        if (channel) {
          setPage({ status: 'ready', channel, channels: data.channels.filter(ch => ch.active) })
        } else {
          setPage({ status: 'error', message: 'Canal não encontrado' })
        }
      } catch {
        if (!cancelled) setPage({ status: 'error', message: 'Erro ao carregar dados' })
      }
    }
    load()
    return () => { cancelled = true }
  }, [channelId])

  if (page.status === 'loading') {
    return <FeedbackMessage type="loading" message="Carregando..." />
  }

  if (page.status === 'error') {
    return <FeedbackMessage type="error" message={page.message} />
  }

  const handleChannelSelect = (ch: Channel) => {
    if (IN_IFRAME) {
      postWidget({ type: 'channelSelect', channelId: ch.id })
    } else {
      navigate(`/widget/${ch.id}`, { replace: true })
    }
  }

  const handleClose = () => {
    if (IN_IFRAME) {
      postWidget({ type: 'close' })
    }
  }

  const handleSwitchUrl = (url: string) => {
    if (IN_IFRAME) {
      postWidget({ type: 'switchUrl', url })
    }
  }

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ background: 'transparent' }}>
      <ChannelWidget
        channel={page.channel}
        allChannels={page.channels}
        onChannelSelect={handleChannelSelect}
        embedded={IN_IFRAME}
        onClose={IN_IFRAME ? handleClose : undefined}
        onSwitchUrl={IN_IFRAME ? handleSwitchUrl : undefined}
      />
    </div>
  )
}