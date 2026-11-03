/**
 * Tipos do parser compartilhado (shared/parseEmbedcanais.mjs).
 *
 * O parser e JavaScript puro (para rodar no Node do backend e no browser),
 * mas o frontend e TypeScript strict. Estas declaracoes sao a ponte entre os
 * dois - mantem uma unica implementacao do parser.
 */

export interface EmbedcanaisChannel {
  /** id numerico do site (1..N) */
  id: number
  /** slug unico do canal, usado na URL do player */
  slug: string
  /** nome exibido */
  name: string
  /** categoria (ex.: 'Esportes', 'Noticias') */
  category: string
  /** URL externa do canal */
  href: string
  /** URL do logo */
  image: string
  /** tag <iframe> pronta para uso */
  iframe: string
}

export interface EmbedcanaisCatalog {
  channels: EmbedcanaisChannel[]
  /** categorias presentes, na ordem do site */
  categories: string[]
  /** ordem de exibicao declarada pelo site */
  categoryOrder: string[]
  /** rotulos alternativos por categoria */
  categoryLabels: Record<string, string>
}

export declare const EMBEDCANAIS_SOURCE_URL: string
export declare function parseEmbedcanaisHtml(html: string): EmbedcanaisCatalog | null
export declare function parseChannelsSource(source: string): EmbedcanaisChannel[] | null
export declare function parseStringArrayLiteral(source: string): string[]
export declare function parseStringMapLiteral(source: string): Record<string, string>
