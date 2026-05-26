import { useFocusable } from '../hooks/FocusContext'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export const SearchBar = ({ value, onChange }: SearchBarProps) => {
  const { ref, isFocused } = useFocusable('toolbar', 0)
  
  return (
    <div className={`relative ${isFocused ? 'ring-4 ring-primary rounded-lg' : ''}`}>
      <div className="absolute inset-y-0 left-0 flex items-center pl-4 sm:pl-6 pointer-events-none">
        <svg
          className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={0}
        autoComplete="off"
        placeholder="Buscar canal..."
        className={`w-full py-3 sm:py-4 pl-12 sm:pl-16 pr-4 sm:pr-6 text-base sm:text-lg bg-dark-surface border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none transition-colors caret-primary ${isFocused ? 'border-primary' : ''}`}
      />
    </div>
  )
}