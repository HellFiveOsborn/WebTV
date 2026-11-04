/**
 * Tema da interface (claro / escuro).
 *
 * O tema padrao e o ESCURO (visual de TV). O usuario pode alternar pelo
 * painel de configuracoes; a escolha fica no storage unificado
 * (IndexedDB, namespace `theme`).
 *
 * O modulo nao importa NADA de proposito: assim compila isolado para os
 * testes em Node (tests/theme.test.mjs), igual ao catalogCache.ts.
 */

import { get, remove, set } from './storage.js'

/** Namespace no storage unificado. */
export const NAMESPACE = 'theme' as const

/** Temas disponiveis. */
export type Theme = 'dark' | 'light'

/** Tema usado quando nao ha preferencia salva. */
export const DEFAULT_THEME: Theme = 'dark'

/** true se o valor e um tema valido. */
export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/**
 * Le o tema salvo.
 *
 * Devolve o padrao (dark) se nao houver preferencia salva ou se o valor
 * gravado for invalido.
 */
export async function readTheme(): Promise<Theme> {
  const raw = await get<{ theme?: unknown } | undefined>(NAMESPACE, undefined)
  const theme = raw?.theme
  return isTheme(theme) ? theme : DEFAULT_THEME
}

/**
 * Grava o tema.
 *
 * Devolve false se nao houver storage ou se a escrita falhar (quota).
 */
export async function writeTheme(theme: Theme): Promise<boolean> {
  if (!isTheme(theme)) return false
  return set(NAMESPACE, { theme })
}

/** Alterna entre os dois temas e devolve o novo tema. */
export async function toggleTheme(): Promise<Theme> {
  const current = await readTheme()
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  await writeTheme(next)
  return next
}

/** O outro tema em relacao ao atual. */
export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

/** Remove a preferencia de tema (volta ao padrao). */
export async function clearTheme(): Promise<void> {
  await remove(NAMESPACE)
}
