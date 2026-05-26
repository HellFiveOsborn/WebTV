export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface FocusableItem {
  id: string
  rect: Rect
  element: HTMLElement
}

export function findNextFocus(
  currentRect: Rect,
  direction: Direction,
  candidates: FocusableItem[]
): FocusableItem | null {
  if (candidates.length === 0) return null

  const valid = candidates.filter(c => isInDirection(currentRect, c.rect, direction))
  if (valid.length === 0) return null

  // For horizontal (left/right): prefer items in same row (vertical band overlap)
  if (direction === 'left' || direction === 'right') {
    const sameRow = valid.filter(c => hasVerticalBandOverlap(currentRect, c.rect))
    const pool = sameRow.length > 0 ? sameRow : valid
    const scored = pool.map(c => ({
      item: c,
      score: calculateScore(currentRect, c.rect, direction),
    }))
    scored.sort((a, b) => a.score - b.score)
    return scored[0].item
  }

  // For vertical (up/down): find the nearest "row" of candidates
  const currentCy = currentRect.y + currentRect.height / 2
  const verticalDists = valid.map(c => ({
    item: c,
    dist: direction === 'down'
      ? (c.rect.y + c.rect.height / 2) - currentCy
      : currentCy - (c.rect.y + c.rect.height / 2),
  }))
  verticalDists.sort((a, b) => a.dist - b.dist)

  // Candidates within ~20% vertical distance of the closest one form the same row
  const nearestDist = verticalDists[0].dist
  const threshold = Math.max(20, nearestDist * 0.2)
  const nearestRow = verticalDists.filter(v => v.dist - nearestDist <= threshold)

  // Among the nearest row, prefer the one with better horizontal alignment
  const scored = nearestRow.map(v => ({
    item: v.item,
    score: calculateScore(currentRect, v.item.rect, direction),
  }))
  scored.sort((a, b) => a.score - b.score)
  return scored[0].item
}

function hasVerticalBandOverlap(current: Rect, candidate: Rect): boolean {
  const cTop = current.y
  const cBottom = current.y + current.height
  const tTop = candidate.y
  const tBottom = candidate.y + candidate.height
  return Math.min(cBottom, tBottom) - Math.max(cTop, tTop) > 0
}

function isInDirection(current: Rect, candidate: Rect, direction: Direction): boolean {
  const ccx = current.x + current.width / 2
  const ccy = current.y + current.height / 2
  const tcx = candidate.x + candidate.width / 2
  const tcy = candidate.y + candidate.height / 2

  switch (direction) {
    case 'up': return tcy < ccy - 5
    case 'down': return tcy > ccy + 5
    case 'left': return tcx < ccx - 5
    case 'right': return tcx > ccx + 5
  }
}

function calculateScore(current: Rect, candidate: Rect, direction: Direction): number {
  const ccx = current.x + current.width / 2
  const ccy = current.y + current.height / 2
  const tcx = candidate.x + candidate.width / 2
  const tcy = candidate.y + candidate.height / 2

  if (direction === 'left' || direction === 'right') {
    const primary = Math.abs(tcx - ccx)
    const secondary = Math.abs(tcy - ccy)
    return primary + secondary * 2
  } else {
    const primary = Math.abs(tcy - ccy)
    const secondary = Math.abs(tcx - ccx)
    return primary + secondary * 2
  }
}
