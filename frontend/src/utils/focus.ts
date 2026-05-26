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

export const navigateSectionedGrid = (
  currentIndex: number,
  direction: 'up' | 'down',
  sectionStarts: number[],
  totalItems: number,
  columns: number
): number => {
  if (sectionStarts.length === 0 || totalItems <= 0) return currentIndex

  let secIdx = sectionStarts.length - 1
  for (let i = sectionStarts.length - 1; i >= 0; i--) {
    if (currentIndex >= sectionStarts[i]) { secIdx = i; break }
  }
  const sectionStart = sectionStarts[secIdx]
  const sectionEnd = secIdx < sectionStarts.length - 1
    ? sectionStarts[secIdx + 1] - 1
    : totalItems - 1
  const col = (currentIndex - sectionStart) % columns

  if (direction === 'up') {
    const next = currentIndex - columns
    if (next >= sectionStart) return next
    if (secIdx > 0) {
      const prevStart = sectionStarts[secIdx - 1]
      const prevEnd = sectionStarts[secIdx] - 1
      const prevLen = prevEnd - prevStart + 1
      const prevRows = Math.ceil(prevLen / columns)
      const prevLastRowStart = prevStart + (prevRows - 1) * columns
      return Math.min(prevLastRowStart + col, prevEnd)
    }
    return currentIndex
  }

  const next = currentIndex + columns
  if (next <= sectionEnd) return next
  if (secIdx < sectionStarts.length - 1) {
    const nextStart = sectionStarts[secIdx + 1]
    if (nextStart >= totalItems) return currentIndex
    const nextEnd = secIdx + 1 < sectionStarts.length - 1
      ? sectionStarts[secIdx + 2] - 1
      : totalItems - 1
    return Math.min(nextStart + col, nextEnd)
  }
  return currentIndex
}
