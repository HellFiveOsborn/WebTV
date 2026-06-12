/**
 * WebTV — Detecção de alterações pendentes
 *
 * Compara o estado atual com o baseline (último sincronizado com o Gist)
 * para alimentar o badge "N alterações pendentes" do painel admin.
 */

type AnyData = {
  channels: unknown[]
  categories: unknown[]
  scripts?: unknown[]
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  const bk = Object.keys(bo)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!deepEqual(ao[k], bo[k])) return false
  }
  return true
}

export function isDirty(baseline: AnyData | null, current: AnyData | null): boolean {
  if (!baseline || !current) return false
  return !deepEqual(baseline, current)
}

export function countPendingChanges(baseline: AnyData | null, current: AnyData | null): number {
  if (!baseline || !current) return 0
  let count = 0
  if (!deepEqual(baseline.channels, current.channels)) count++
  if (!deepEqual(baseline.categories, current.categories)) count++
  if (!deepEqual(baseline.scripts ?? [], current.scripts ?? [])) count++
  return count
}