/**
 * Ranking inteligente do Top 10.
 *
 * O catalogo do embedcanais.online nao expoe metricas de popularidade
 * (nem "vip", nem "destaque"): a listagem e um array simples.ENTAO o
 * ranking e calculado a partir de sinais reais:
 *
 *  SINAIS DO CATALOGO (universais, valem para qualquer visitante)
 *   1. Categoria         - "Canais Abertos" e a vitrine principal do
 *                          catalogo; TV aberta tem audiencia maior que
 *                          canal premium de streaming.
 *   2. Recencia no site  - o site lista os canais em ordem de
 *                          importancia comercial; o que esta no topo
 *                          (id baixo) e o mais relevante.
 *   3. Marca / familia   - canais que compartilham logo (Globo Rio,
 *                          Globo SP, Record...) pertencem a uma rede
 *                      comprogramacao consolidada: varias entradas
 *                          da mesma marca indicam relevancia.
 *   4. Variantes numeradas- "HBO 2", "ESPN 3": sao canais derivados de
 *                          um canal principal, entao pesam um pouco
 *                          menos que o original.
 *
 *  SINAIS DO USUARIO (adaptam o ranking a quem assiste)
 *   5. Frequencia        - quantas vezes o canal foi aberto.
 *   6. Recencia          - ha quanto tempo foi aberto (decai com o
 *                          tempo, como um "not interested" implicito).
 *
 * O peso dos sinais do usuario cresce conforme o historico cresce: com
 * pouca historico o ranking reflete o catalogo; com bastante historico
 * ele reflete o gosto de quem assiste.
 */

import { EmbedcanaisChannel } from './parseEmbedcanais.js'
import { UsageMap } from './usage.js'

/** Um canal com a nota calculada e os sinais que a compuseram. */
export interface RankedChannel {
  channel: EmbedcanaisChannel
  /** Nota final (maior = melhor). */
  score: number
  /** Sinais que explicam a nota (para exibir na UI). */
  reasons: RankReason[]
}

/** Um sinal individual que contribuiu para a nota. */
export interface RankReason {
  /** Identificador do sinal. */
  key: string
  /** Rotulo curto para exibicao. */
  label: string
  /** Peso que este sinal somou na nota. */
  weight: number
}

/** Pesos dos sinais. Soma maxima ≈ 1 (normalizado para 0..100). */
export const WEIGHTS = {
  /** Categoria (Canais Abertos > Noticias > ...). */
  category: 0.22,
  /** Posicao no catalogo do site (id). */
  siteOrder: 0.16,
  /** Marca consolidada (familia de canais). */
  brand: 0.12,
  /** Variante numerada (HBO 2, ESPN 3). */
  variant: 0.06,
  /** Frequencia de uso do usuario. */
  frequency: 0.26,
  /** Recencia de uso do usuario. */
  recency: 0.18,
} as const

/**
 * Peso das categorias. Categorias ausentes recebem `category` (o menor
 * valor da tabela) em vez de zero, para nao zerar canais novos.
 */
const CATEGORY_WEIGHT: Record<string, number> = {
  'Canais Abertos': 1,
  'Notícias': 0.62,
  Variedades: 0.55,
  Religiosos: 0.42,
  Infantil: 0.5,
  'Filmes e Séries': 0.45,
  Esportes: 0.38,
}

/** Chave de categoria quando o site nao declara uma conhecida. */
const DEFAULT_CATEGORY_WEIGHT = 0.3

/**
 * Quantas aberturas sao preciso para o sinal de frequencia valer 1.
 * Referencia absoluta (e nao relativa ao maximo), para que um unico
 * canal muito assistido nao "zere" a escala.
 */
const FREQUENCY_FULL_SCORE = 10

/**
 * Meia-vida do sinal de recencia (o peso cai a cada 7 dias).
 */
const RECENCY_HALFLIFE_DAYS = 7

/** Quantos dias a recencia ainda pesa (depois disso, zera). */
const RECENCY_WINDOW_DAYS = 60

/**
 * Identifica a "marca" de um canal: a parte do nome antes de um sufixo
 * numerado ou de um separador.
 *
 * "HBO 2"        -> "HBO"
 * "ESPN 03"      -> "ESPN"
 * "Globo Rio"    -> "Globo"
 * "Band SP"      -> "Band"
 * "SBT São Paulo"-> "SBT"
 */
export function extractBrand(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return ''

  // Sufixo numerado no fim: "HBO 2", "ESPN 03", "HBO +2"
  const numeric = trimmed.replace(/\s*[+]\s*\d+\s*$/, '').replace(/\s+\d+\s*$/, '')
  if (numeric !== trimmed && numeric.length >= 2) return numeric

  // Primeiro token: "Globo Rio" -> "Globo", "SBT São Paulo" -> "SBT".
  const first = trimmed.split(/\s+/)[0]
  return first.length >= 2 ? first : trimmed
}

/**
 * true se o canal e uma variante numerada de outro canal
 * ("HBO 2" e variante de "HBO").
 */
export function isVariant(name: string): boolean {
  const trimmed = (name ?? '').trim()
  return /\s*[+]?\s*\d+\s*$/.test(trimmed) && trimmed.replace(/\s*[+]?\s*\d+\s*$/, '').length >= 2
}

/**
 * Conta quantos canais do catalogo pertencem a cada marca.
 * Marcas com manyos canais (rede de TV) ganham peso.
 */
export function countBrands(channels: EmbedcanaisChannel[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const ch of channels) {
    const brand = extractBrand(ch.name)
    if (!brand) continue
    counts.set(brand, (counts.get(brand) ?? 0) + 1)
  }
  return counts
}

/**
 * Normaliza a posicao no site (id) para 0..1.
 *
 * O id cresce com a ordem da listagem: quanto MENOR o id, mais relevante
 * o canal. A menor nota e 0 (o ultimo da lista).
 */
function siteOrderScore(channels: EmbedcanaisChannel[], channel: EmbedcanaisChannel): number {
  const ids = channels.map(c => c.id).filter(id => Number.isFinite(id) && id > 0)
  if (ids.length === 0) return 0.5

  const min = Math.min(...ids)
  const max = Math.max(...ids)
  if (max === min) return 1

  const id = channel.id > 0 ? channel.id : max
  return 1 - (id - min) / (max - min)
}

/**
 * Peso da marca: canais de uma marca com varias entradas tem mais
 * audiencia media (rede de TV). Escala 0..1 com saturacao em 4 canais.
 */
function brandScore(brandCounts: Map<string, number>, channel: EmbedcanaisChannel): number {
  const count = brandCounts.get(extractBrand(channel.name)) ?? 1
  return Math.min(1, (count - 1) / 3)
}

/**
 * Recencia do uso do usuario: 1 = aberto agora, 0 = nunca / muito antigo.
 */
export function recencyScore(lastOpenedAt: number | undefined, now: number): number {
  if (!lastOpenedAt || !Number.isFinite(lastOpenedAt)) return 0

  const days = (now - lastOpenedAt) / 86_400_000
  if (days < 0) return 1
  if (days > RECENCY_WINDOW_DAYS) return 0

  return Math.pow(0.5, days / RECENCY_HALFLIFE_DAYS)
}

/**
 * Frequencia de uso do usuario.
 *
 * Escala ABSOLUTA (10 aberturas = nota 1): um unico canal muito
 * assistido nao pode "zere" a escala dos demais.
 */
export function frequencyScore(count: number | undefined): number {
  if (!count || count <= 0) return 0
  return Math.min(1, count / FREQUENCY_FULL_SCORE)
}

/**
 * Quanto o historico do usuario pesa em relacao aos sinais do catalogo.
 *
 * Conta o TOTAL de aberturas (nao o numero de canais distintos): abrir 3
 * vezes o mesmo canal e um sinal claro de preferencia. A partir de 3
 * aberturas, o ranking passa a refletir o gosto de quem assiste.
 */
export function userWeight(usage: UsageMap): number {
  const total = Object.values(usage).reduce(
    (sum, u) => sum + (u && u.count > 0 ? u.count : 0),
    0,
  )
  if (total <= 0) return 0
  return Math.min(1, total / 3)
}

/**
 * Calcula o ranking dos canais.
 *
 * @param channels catalogo completo
 * @param usage historico de uso do usuario (vazio = visitante novo)
 * @param now "agora" (injetavel para testes deterministicos)
 * @param limit quantos canais devolver
 */
export function rankChannels(
  channels: EmbedcanaisChannel[],
  usage: UsageMap = {},
  now: number = Date.now(),
  limit = 10,
): RankedChannel[] {
  if (!channels || channels.length === 0) return []

  const brandCounts = countBrands(channels)
  const uw = userWeight(usage)

  /*
   * Dois niveis de peso:
   *
   *   CATALOGO (sempre presente): categoria + posicao no site + marca.
   *   Representa o "cardapio" do site: o que o catalogo considera
   *   relevante. Mesmo com historico forte, esses sinais NAO desaparecem
   *   (piso de 45%): sem eles, todos os canais nunca assistidos
   *   empatariam em zero e a ordem viraria a ordem bruta do site.
   *
   *   USUARIO (cresce com o historico): frequencia + recencia.
   *   Entra com peso `uw`, que vai de 0 (visitante novo) a 1 (usuario
   *   com historico consolidado). Com historico consolidado, a soma dos
   *   sinais do usuario (0.44) supera o teto da categoria (0.22),
   *   invertendo a ordem - que e o comportamento desejado: o Top 10
   *   passa a refletir o uso real.
   */
  const catalogScale = 1 - 0.55 * uw
  const userScale = uw

  const scored: RankedChannel[] = channels.map(channel => {
    const reasons: RankReason[] = []

    // 1) Categoria (com teto, para nao dominar sozinha)
    const catWeight = CATEGORY_WEIGHT[channel.category] ?? DEFAULT_CATEGORY_WEIGHT
    const catScore = catWeight * WEIGHTS.category * catalogScale
    if (catScore > 0) {
      reasons.push({ key: 'category', label: channel.category, weight: catScore })
    }

    // 2) Posicao no site
    const orderScore = siteOrderScore(channels, channel) * WEIGHTS.siteOrder * catalogScale
    reasons.push({ key: 'siteOrder', label: 'Posicao no site', weight: orderScore })

    // 3) Marca consolidada
    const brand = brandScore(brandCounts, channel) * WEIGHTS.brand * catalogScale
    if (brand > 0) {
      reasons.push({
        key: 'brand',
        label: `Marca ${extractBrand(channel.name)}`,
        weight: brand,
      })
    }

    // 4) Variante numerada (desconto)
    const variantPenalty = isVariant(channel.name) ? -WEIGHTS.variant * catalogScale : 0
    if (variantPenalty !== 0) {
      reasons.push({ key: 'variant', label: 'Variante', weight: variantPenalty })
    }

    // 5) Frequencia de uso
    const u = usage[channel.slug]
    const freqScore = frequencyScore(u?.count) * WEIGHTS.frequency * userScale
    if (freqScore > 0) {
      reasons.push({ key: 'frequency', label: 'Vezes assistido', weight: freqScore })
    }

    // 6) Recencia de uso
    const recScore = recencyScore(u?.lastOpenedAt, now) * WEIGHTS.recency * userScale
    if (recScore > 0) {
      reasons.push({ key: 'recency', label: 'Assistido recentemente', weight: recScore })
    }

    const score = reasons.reduce((sum, r) => sum + r.weight, 0)

    return { channel, score, reasons }
  })

  // Desempate estavel: score, depois id (ordem do site).
  scored.sort((a, b) => b.score - a.score || a.channel.id - b.channel.id)

  return scored.slice(0, limit)
}

/**
 * Resumo legivel do porque o canal esta no topo.
 * Retorna os 2 sinais de maior peso absoluto.
 */
export function topReasons(ranked: RankedChannel, count = 2): RankReason[] {
  return [...ranked.reasons]
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, count)
}
