export const calculateGridPosition = (
  index: number,
  _totalItems: number,
  columns: number
): { row: number; col: number } => {
  return {
    row: Math.floor(index / columns),
    col: index % columns,
  }
}

export const navigateGrid = (
  currentIndex: number,
  direction: 'up' | 'down' | 'left' | 'right',
  totalItems: number,
  columns: number
): number => {
  const { row, col } = calculateGridPosition(currentIndex, totalItems, columns)
  const totalRows = Math.ceil(totalItems / columns)

  switch (direction) {
    case 'up':
      if (row > 0) {
        return currentIndex - columns
      }
      break
    case 'down':
      if (row < totalRows - 1) {
        const nextIndex = currentIndex + columns
        return Math.min(nextIndex, totalItems - 1)
      }
      break
    case 'left':
      if (col > 0) {
        return currentIndex - 1
      }
      break
    case 'right':
      if (col < columns - 1 && currentIndex < totalItems - 1) {
        return currentIndex + 1
      }
      break
  }
  return currentIndex
}
