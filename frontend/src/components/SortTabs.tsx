import { useFocusable } from '../hooks/FocusContext'

interface SortTabsProps {
  options: { value: string; label: string }[]
  selectedValue: string
  onSelect: (value: string) => void
}

export const SortTabs = ({
  options,
  selectedValue,
  onSelect,
}: SortTabsProps) => {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <span className="text-gray-400 mr-1 sm:mr-2 whitespace-nowrap text-xs sm:text-sm">Ordenar por:</span>
      <div className="flex gap-2">
        {options.map((option, index) => {
          const isSelected = option.value === selectedValue
          const { ref, isFocused } = useFocusable('sortTabs', index)
          return (
            <button
              key={option.value}
              ref={ref as React.RefObject<HTMLButtonElement>}
              onClick={() => onSelect(option.value)}
              onMouseDown={(e) => e.preventDefault()}
              className={`
                px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150
                ${isSelected ? 'bg-primary text-white' : 'bg-dark-surface text-gray-400 border border-dark-border'}
                ${isFocused && !isSelected ? 'ring-4 ring-primary text-white border-primary' : ''}
                ${isFocused && isSelected ? 'ring-4 ring-white' : ''}
              `}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
