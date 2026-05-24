import { useState } from 'react'
import { Category } from '../../types/channel'

interface CategoryFormProps {
  category?: Category
  onSave: (name: string) => void
  onCancel: () => void
}

export const CategoryForm = ({ category, onSave, onCancel }: CategoryFormProps) => {
  const [name, setName] = useState(category?.name || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(name)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-gray-400 mb-2">Nome da Categoria</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-4 py-2 bg-dark-border border border-dark-border rounded-lg text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-all"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
