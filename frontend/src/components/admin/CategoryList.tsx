import { Category, Channel } from '../../types/channel'
import { CategoryForm } from './CategoryForm'
import { useState } from 'react'

interface CategoryListProps {
  categories: Category[]
  channels: Channel[]
  onAdd: (name: string) => void
  onUpdate: (id: string, updates: Partial<Category>) => void
  onDelete: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export const CategoryList = ({ categories, channels, onAdd, onUpdate, onDelete, onReorder }: CategoryListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const getChannelCount = (categoryId: string) => {
    return channels.filter(ch => (ch.categoryIds || []).includes(categoryId)).length
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

  if (showForm) {
    return (
      <CategoryForm
        onSave={(name) => {
          onAdd(name)
          setShowForm(false)
        }}
        onCancel={() => setShowForm(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-white">Categorias</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
        >
          Nova Categoria
        </button>
      </div>

      <div className="space-y-3 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2 discrete-scroll">
        {categories.map((category, index) => (
          <div
            key={category.id}
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
            {editingId === category.id ? (
              <CategoryForm
                category={category}
                onSave={(name) => {
                  onUpdate(category.id, { name })
                  setEditingId(null)
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white">{category.name}</h3>
                  <p className="text-sm text-gray-400">
                    {getChannelCount(category.id)} canal(is)
                  </p>
                </div>

                <button
                  onClick={() => setEditingId(category.id)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                >
                  Editar
                </button>

                <button
                  onClick={() => {
                    if (confirm('Tem certeza? Canais vinculados perderão esta categoria.')) {
                      onDelete(category.id)
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