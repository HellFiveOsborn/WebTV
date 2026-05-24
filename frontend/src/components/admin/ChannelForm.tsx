import { useState } from 'react'
import { Channel, Category, AlternativeUrl, ChannelType } from '../../types/channel'

interface ChannelFormProps {
  channel?: Channel
  categories: Category[]
  onSave: (data: Omit<Channel, 'id'>) => void
  onCancel: () => void
}

export const ChannelForm = ({ channel, categories, onSave, onCancel }: ChannelFormProps) => {
  const [title, setTitle] = useState(channel?.title || '')
  const [logoUrl, setLogoUrl] = useState(channel?.logoUrl || '')
  const [alternativeUrls, setAlternativeUrls] = useState<AlternativeUrl[]>(
    channel?.alternativeUrls || []
  )
  const [selectedCategories, setSelectedCategories] = useState<string[]>(channel?.categoryIds || [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    onSave({
      title,
      logoUrl,
      alternativeUrls,
      categoryIds: selectedCategories,
      active: channel?.active ?? true,
    })
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const addAlternativeUrl = () => {
    setAlternativeUrls([...alternativeUrls, { url: '', type: 'iframe' as ChannelType }])
  }

  const updateAlternativeUrl = (index: number, field: keyof AlternativeUrl, value: string) => {
    setAlternativeUrls(prev =>
      prev.map((item, i) => i === index ? { ...item, [field]: value } : item)
    )
  }

  const removeAlternativeUrl = (index: number) => {
    setAlternativeUrls(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-gray-400 mb-2">Título</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-2 bg-dark-border border border-dark-border rounded-lg text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-gray-400 mb-2">Logo URL</label>
        <input
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          required
          className="w-full px-4 py-2 bg-dark-border border border-dark-border rounded-lg text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-gray-400">URLs Alternativas</label>
          <button
            type="button"
            onClick={addAlternativeUrl}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
          >
            + Adicionar
          </button>
        </div>
        
        {alternativeUrls.length === 0 ? (
          <p className="text-gray-500 text-sm italic">Nenhuma URL cadastrada</p>
        ) : (
          <div className="space-y-2">
            {alternativeUrls.map((altUrl, index) => (
              <div key={index} className="flex gap-2 items-start">
                <input
                  type="url"
                  value={altUrl.url}
                  onChange={(e) => updateAlternativeUrl(index, 'url', e.target.value)}
                  placeholder="https://..."
                  required
                  className="flex-1 px-4 py-2 bg-dark-border border border-dark-border rounded-lg text-white focus:border-blue-500 focus:outline-none"
                />
                <select
                  value={altUrl.type}
                  onChange={(e) => updateAlternativeUrl(index, 'type', e.target.value)}
                  className="px-3 py-2 bg-dark-border border border-dark-border rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="iframe">Iframe</option>
                  <option value="redirect">Nova Aba</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeAlternativeUrl(index)}
                  className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-gray-400 mb-2">Categorias</label>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedCategories.includes(cat.id)
                  ? 'bg-blue-500 text-white'
                  : 'bg-dark-border text-gray-400 hover:bg-dark-border/70'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 bg-dark-border hover:bg-dark-border/70 text-gray-300 rounded-lg font-semibold transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
