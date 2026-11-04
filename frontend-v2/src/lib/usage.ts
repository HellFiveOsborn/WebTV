/**
 * Historico de uso dos canais.
 *
 * Guarda quantas vezes cada canal foi aberto e quando foi pela ultima
 * vez. Esses dados alimentam o ranking inteligente do Top 10.
 *
 * Fica no storage unificado (IndexedDB, namespace `usage`).
 *
 * O modulo nao importa NADA de proposito: assim compila isolado para os
 * testes em Node (tests/usage.test.mjs).
 */

import { get, remove, set } from './storage.js'

/** Namespace no storage unificado. */
export const NAMESPACE = 'usage' as const

/** Uso de um canal. */
export interface ChannelUsage {
  /** Quantas vezes o canal foi aberto. */
  count: number
  /** Timestamp (ms) da ultima abertura. */
  lastOpenedAt: number
  /** Timestamp (ms) da primeira abertura. */
  firstOpenedAt: number
}

/** Mapa de uso por identificador do canal (o slug). */
export interface UsageMap {
  [key: string]: ChannelUsage
}

/**
 * Le o historico de uso.
 *
 * Devolve um mapa vazio se nao houver historico ou se o dado estiver
 * corrompido.
 */
export async function readUsage(): Promise<UsageMap> {
  const raw = await get<UsageMap | undefined>(NAMESPACE, undefined)
  if (!raw || typeof raw !== 'object') return {}

  const out: UsageMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue
    const count = Number(value.count)
    const lastOpenedAt = Number(value.lastOpenedAt)
    if (!Number.isFinite(count) || count <= 0) continue
    if (!Number.isFinite(lastOpenedAt)) continue
    out[key] = {
      count,
      lastOpenedAt,
      firstOpenedAt: Number(value.firstOpenedAt) || lastOpenedAt,
    }
  }
  return out
}

/**
 * Grava o historico de uso inteiro.
 */
export async function writeUsage(usage: UsageMap): Promise<boolean> {
  return set(NAMESPACE, usage)
}

/**
 * Registra a abertura de um canal.
 *
 * Incrementa o contador e atualiza o timestamp da ultima abertura.
 */
export async function recordOpen(key: string, now: number = Date.now()): Promise<ChannelUsage | null> {
  if (!key) return null

  const usage = await readUsage()
  const current = usage[key]

  const next: ChannelUsage = {
    count: (current?.count ?? 0) + 1,
    lastOpenedAt: now,
    firstOpenedAt: current?.firstOpenedAt ?? now,
  }

  usage[key] = next
  await writeUsage(usage)
  return next
}

/** Uso de um canal especifico (null se nunca aberto). */
export async function getUsage(key: string): Promise<ChannelUsage | null> {
  const usage = await readUsage()
  return usage[key] ?? null
}

/** Remove todo o historico de uso. */
export async function clearUsage(): Promise<void> {
  await remove(NAMESPACE)
}

/** true se o usuario ainda nao abriu nenhum canal. */
export async function isEmptyUsage(): Promise<boolean> {
  return Object.keys(await readUsage()).length === 0
}
