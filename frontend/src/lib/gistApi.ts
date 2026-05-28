import { ChannelsData } from '../types/channel'

const GIST_ID = '0520b83cd34f4fa8a20831a42116837a'
const GIST_RAW_URL = `https://gist.githubusercontent.com/HellFiveOsborn/${GIST_ID}/raw/channels.json`
const GIST_API_URL = `https://api.github.com/gists/${GIST_ID}`
const TOKEN_KEY = 'webtv_gist_token'

export function getGistRawUrl(): string {
  return GIST_RAW_URL
}

export function hasToken(): boolean {
  try {
    return !!localStorage.getItem(TOKEN_KEY)
  } catch {
    return false
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function validateToken(token: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(GIST_API_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return { valid: true }
    if (res.status === 401) return { valid: false, error: 'Token inválido' }
    if (res.status === 403) return { valid: false, error: 'Token sem permissão. O scope "gist" está habilitado?' }
    if (res.status === 404) return { valid: false, error: 'Gist não encontrado' }
    return { valid: false, error: `Erro HTTP ${res.status}` }
  } catch {
    return { valid: false, error: 'Erro de rede ao validar token' }
  }
}

export async function fetchGistData(): Promise<ChannelsData> {
  const res = await fetch(GIST_RAW_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Gist fetch failed (${res.status})`)
  return res.json()
}

export async function saveGistData(data: ChannelsData, token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(GIST_API_URL, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          'channels.json': { content: JSON.stringify(data, null, 2) },
        },
      }),
    })
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, error: 'Token inválido' }
    if (res.status === 403) return { ok: false, error: 'Sem permissão para editar este Gist' }
    return { ok: false, error: `Erro HTTP ${res.status}` }
  } catch {
    return { ok: false, error: 'Erro de rede ao salvar' }
  }
}