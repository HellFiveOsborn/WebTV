import { Channel, Category } from '../../types/channel'
import { ChannelForm } from './ChannelForm'
import { useState } from 'react'

interface ChannelListProps {
  channels: Channel[]
  categories: Category[]
  onToggle: (id: string) => void
  onUpdate: (id: string, updates: Partial<Channel>) => void
  onDelete: (id: string) => void
  onAdd: (channel: Omit<Channel, 'id'>) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export const ChannelList = ({ channels, categories, onToggle, onUpdate, onDelete, onAdd, onReorder }: ChannelListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [duplicatingChannel, setDuplicatingChannel] = useState<Channel | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const getCategoryName = (id: string) => {
    return categories.find(c => c.id === id)?.name || 'Sem categoria'
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (index: number) => {
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorder(draggedIndex, dropIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDuplicate = (channel: Channel) => {
    setDuplicatingChannel(channel)
  }

  if (duplicatingChannel) {
    const duplicatedData: Omit<Channel, 'id'> = {
      ...duplicatingChannel,
      title: `${duplicatingChannel.title} (Cópia)`,
    }
    return (
      <ChannelForm
        channel={duplicatedData as Channel}
        categories={categories}
        onSave={(data) => {
          onAdd({ ...data, active: true })
          setDuplicatingChannel(null)
        }}
        onCancel={() => setDuplicatingChannel(null)}
      />
    )
  }

  if (showForm) {
    return (
      <ChannelForm
        categories={categories}
        onSave={(data) => {
          onAdd({ ...data, active: true })
          setShowForm(false)
        }}
        onCancel={() => setShowForm(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Canais</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
        >
          Novo Canal
        </button>
      </div>

      <div className="space-y-3">
        {channels.map((channel, index) => (
          <div
            key={channel.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`bg-dark-surface border rounded-lg p-4 transition-all cursor-move ${
              draggedIndex === index ? 'opacity-50 scale-95' : 'border-dark-border'
            } ${dragOverIndex === index && draggedIndex !== index ? 'border-blue-500 border-dashed border-2' : ''}`}
          >
            {editingId === channel.id ? (
              <ChannelForm
                channel={channel}
                categories={categories}
                onSave={(data) => {
                  onUpdate(channel.id, data)
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center gap-4">
                <img
                  src={channel.logoUrl}
                  alt={channel.title}
                  className="w-20 h-14 object-contain bg-dark-border rounded"
                />

                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white">{channel.title}</h3>
                  <p className="text-sm text-gray-400">
                    {(channel.categoryIds || []).map(id => getCategoryName(id)).join(', ')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {channel.alternativeUrls.filter(u => u.type === 'iframe').length} iframe(s) · {channel.alternativeUrls.filter(u => u.type === 'redirect').length} redirect(s)
                  </p>
                </div>

                <button
                  onClick={() => onToggle(channel.id)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    channel.active
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  {channel.active ? 'Ativo' : 'Inativo'}
                </button>

                <button
                  onClick={() => handleDuplicate(channel)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all"
                >
                  Duplicar
                </button>

                <button
                  onClick={() => setEditingId(channel.id)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                >
                  Editar
                </button>

                <button
                  onClick={() => {
                    if (confirm('Tem certeza que deseja excluir este canal?')) {
                      onDelete(channel.id)
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
                >
                  Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
