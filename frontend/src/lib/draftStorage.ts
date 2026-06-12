/**
 * WebTV — Rascunho local para o painel admin
 *
 * Persiste edições não sincronizadas com o Gist em localStorage.
 * Recupera o trabalho após reload ou fechamento acidental da aba.
 */

type ChannelsData = {
  channels: unknown[]
  categories: unknown[]
  scripts?: unknown[]
}

const DRAFT_KEY = 'webtv_channels_draft'
const DEBOUNCE_MS = 300

export interface DraftEnvelope extends ChannelsData {
  savedAt: number
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingData: ChannelsData | null = null

function writeNow(data: ChannelsData): void {
  try {
    const envelope: DraftEnvelope = { ...data, savedAt: Date.now() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(envelope))
  } catch {
    // localStorage indisponível (modo privado, quota cheia) — falha silenciosa
  }
}

export function saveDraft(data: ChannelsData): void {
  pendingData = data
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (pendingData) writeNow(pendingData)
    pendingData = null
    debounceTimer = null
  }, DEBOUNCE_MS)
}

export function loadDraft(): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEnvelope
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.channels)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
      pendingData = null
    }
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

export function hasDraft(): boolean {
  try {
    return localStorage.getItem(DRAFT_KEY) !== null
  } catch {
    return false
  }
}