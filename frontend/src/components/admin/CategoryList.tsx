import { Category, Channel } from '../../types/channel'
import { CategoryForm } from './CategoryForm'
import { useState } from 'react'

interface CategoryListProps {
  categories: Category[]
  channels: Channel[]
  onAdd: (name: string) => void
  onUpdate: (id: string, updates: Partial<Category>) => void
  onDelete: (id: string) => void
}

export const CategoryList = ({ categories, channels, onAdd, onUpdate, onDelete }: CategoryListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const getChannelCount = (categoryId: string) => {
    return channels.filter(ch => (ch.categoryIds || []).includes(categoryId)).length
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

      <div className="space-y-3">
        {categories.map(category => (
          <div
            key={category.id}
            className="bg-dark-surface border border-dark-border rounded-lg p-4"
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
