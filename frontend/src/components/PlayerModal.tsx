import { useEffect, useCallback, useRef, useState } from 'react'
import { Channel } from '../types/channel'
import { ChannelWidget } from './ChannelWidget'
import { eventBus } from '../lib/eventBus'

interface PlayerModalProps {
  channel: Channel
  onClose: () => void
  allChannels: Channel[]
  onChannelSelect: (ch: Channel) => void
}

type FocusTarget = 'close' | 'backup' | 'iframe'

export const PlayerModal = ({ channel, onClose, allChannels, onChannelSelect }: PlayerModalProps) => {
  const iframeUrls = channel.alternativeUrls.filter(u => u.type === 'iframe')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [focusedElement, setFocusedElement] = useState<FocusTarget>('close')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const backupButtonRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeUrl = iframeUrls[currentIndex]?.url

  useEffect(() => {
    if (activeUrl) {
      eventBus.emit('player:opened', {
        channelId: channel.id,
        channelName: channel.title,
        url: activeUrl
      })
    }
  }, [channel.id, channel.title, activeUrl])

  const handleClose = useCallback(() => {
    eventBus.emit('player:closed', {
      channelId: channel.id,
      channelName: channel.title
    })
    onClose()
  }, [channel.id, channel.title, onClose])

  const handleSwitchUrl = useCallback((index: number) => {
    setCurrentIndex(index)
    setDropdownOpen(false)
    setFocusedElement('iframe')
    eventBus.emit('player:backupSelected', {
      channelId: channel.id,
      index,
      url: iframeUrls[index]?.url || ''
    })
  }, [channel.id, iframeUrls])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      handleClose()
      return
    }

    if (dropdownOpen) {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const items = dropdownRef.current?.querySelectorAll('[data-alt-item]')
        const focused = document.activeElement
        if (focused && items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i] === focused) {
              handleSwitchUrl(i)
              return
            }
          }
        }
        handleSwitchUrl(currentIndex)
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = dropdownRef.current?.querySelectorAll('[data-alt-item]')
        if (!items || items.length === 0) return
        const currentFocusedIndex = Array.from(items).indexOf(document.activeElement as Element)
        let nextIndex: number
        if (e.key === 'ArrowDown') {
          nextIndex = currentFocusedIndex < items.length - 1 ? currentFocusedIndex + 1 : 0
        } else {
          nextIndex = currentFocusedIndex > 0 ? currentFocusedIndex - 1 : items.length - 1
        }
        ;(items[nextIndex] as HTMLElement).focus()
        return
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        setDropdownOpen(false)
        setFocusedElement('close')
        return
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedElement(prev => {
        if (prev === 'iframe') {
          if (iframeUrls.length > 1) return 'backup'
          return 'close'
        }
        if (prev === 'backup') return 'close'
        return prev
      })
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (focusedElement === 'close' || focusedElement === 'backup') {
        setFocusedElement('iframe')
        return
      }
    }

    if (e.key === 'ArrowLeft' && (focusedElement === 'close' || focusedElement === 'backup')) {
      e.preventDefault()
      setFocusedElement(prev => {
        if (prev === 'close' && iframeUrls.length > 1) return 'backup'
        if (prev === 'backup') return 'close'
        return prev
      })
      return
    }

    if (e.key === 'ArrowRight' && focusedElement === 'backup') {
      e.preventDefault()
      setFocusedElement('close')
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (focusedElement === 'close') {
        handleClose()
      } else if (focusedElement === 'backup') {
        setDropdownOpen(prev => !prev)
      }
    }
  }, [onClose, dropdownOpen, focusedElement, iframeUrls.length, currentIndex, handleSwitchUrl])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  useEffect(() => {
    if (focusedElement === 'close') {
      closeButtonRef.current?.focus()
    } else if (focusedElement === 'backup') {
      backupButtonRef.current?.focus()
    } else if (focusedElement === 'iframe') {
      overlayRef.current?.focus()
    }
  }, [focusedElement, dropdownOpen])

  useEffect(() => {
    if (dropdownOpen && iframeUrls.length > 1) {
      const firstActive = dropdownRef.current?.querySelector(`[data-alt-index="${currentIndex}"]`) as HTMLElement
      firstActive?.focus()
    }
  }, [dropdownOpen, currentIndex, iframeUrls.length])

  if (!activeUrl) return null

  const handleWidgetSwitchUrl = (url: string) => {
    const idx = iframeUrls.findIndex(u => u.url === url)
    if (idx !== -1) {
      setCurrentIndex(idx)
      setFocusedElement('iframe')
      eventBus.emit('player:backupSelected', {
        channelId: channel.id,
        index: idx,
        url,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <ChannelWidget
        channel={channel}
        allChannels={allChannels}
        onChannelSelect={onChannelSelect}
        embedded
        onClose={handleClose}
        onSwitchUrl={handleWidgetSwitchUrl}
      />
      <div className="absolute top-6 right-6 z-[60] flex items-start gap-3">
        {iframeUrls.length > 1 && (
          <div className="relative">
            <button
              ref={backupButtonRef}
              onClick={() => setDropdownOpen(prev => !prev)}
              className={`w-14 h-14 bg-black/60 backdrop-blur-sm text-white rounded-full transition-all flex items-center justify-center ${
                focusedElement === 'backup'
                  ? 'scale-110 ring-4 ring-primary bg-primary'
                  : 'hover:bg-primary focus:outline-none'
              }`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>

            {dropdownOpen && (
              <div
                ref={dropdownRef}
                className="absolute top-full right-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-700">
                  <p className="text-gray-400 text-sm font-semibold">Canais de Backup</p>
                </div>
                {iframeUrls.map((altUrl, index) => (
                  <div
                    key={index}
                    data-alt-item
                    data-alt-index={index}
                    tabIndex={0}
                    onClick={() => handleSwitchUrl(index)}
                className={`px-4 py-3 cursor-pointer text-sm transition-colors outline-none focus:bg-primary/40 ${
                  altUrl.url === activeUrl
                    ? 'bg-primary/20 text-primary border-l-2 border-primary'
                    : 'text-gray-300 hover:bg-dark-hover'
                }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="truncate">
                        {altUrl.url.length > 40 ? altUrl.url.substring(0, 40) + '...' : altUrl.url}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          ref={closeButtonRef}
          onClick={handleClose}
          className={`w-14 h-14 bg-black/60 backdrop-blur-sm text-white rounded-full transition-all flex items-center justify-center ${
            focusedElement === 'close'
              ? 'scale-110 ring-4 ring-white bg-red-600'
              : 'hover:bg-red-600 focus:outline-none'
          }`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <iframe
        src={activeUrl}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <div
        ref={overlayRef}
        tabIndex={0}
        onFocus={() => setFocusedElement('iframe')}
        className={`absolute inset-0 z-[55] ${focusedElement === 'iframe' ? '' : 'pointer-events-none'}`}
      />
    </div>
  )
}
