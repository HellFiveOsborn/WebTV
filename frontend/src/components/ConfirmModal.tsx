import { useEffect, useCallback, useState } from 'react'

interface ConfirmModalProps {
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ onConfirm, onCancel }: ConfirmModalProps) {
  const [selectedButton, setSelectedButton] = useState<'cancel' | 'confirm'>('confirm')

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape' || e.key === 'Backspace') {
      onCancel()
      return
    }

    if (e.key === 'ArrowLeft') {
      setSelectedButton('cancel')
      return
    }

    if (e.key === 'ArrowRight') {
      setSelectedButton('confirm')
      return
    }

    if (e.key === 'Enter') {
      if (selectedButton === 'confirm') {
        onConfirm()
      } else {
        onCancel()
      }
      return
    }
  }, [selectedButton, onConfirm, onCancel])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-8 max-w-md mx-4">
        <h3 className="text-2xl font-bold text-white mb-4">
          Recarregar Página
        </h3>
        <p className="text-gray-400 mb-8">
          Deseja limpar o cache e recarregar a página?
        </p>

        <div className="flex gap-4 justify-end">
          <button
            onClick={onCancel}
            className={`
              px-6 py-3 rounded-lg font-medium transition-all duration-150
              ${selectedButton === 'cancel'
                ? 'bg-primary text-white ring-2 ring-primary'
                : 'bg-dark-border text-gray-300 hover:bg-dark-hover'}
            `}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`
              px-6 py-3 rounded-lg font-medium transition-all duration-150
              ${selectedButton === 'confirm'
                ? 'bg-primary text-white ring-2 ring-primary'
                : 'bg-dark-border text-gray-300 hover:bg-dark-hover'}
            `}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
