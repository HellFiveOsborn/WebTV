/**
 * Re-export do parser compartilhado.
 *
 * A implementacao vive em `shared/parseEmbedcanais.mjs` para ser usada tanto
 * pelo frontend (browser/build) quanto pelo backend Node, sem duplicar codigo.
 * Este arquivo existe para manter os imports do frontend em `src/lib/...`
 * e para que o TypeScript strict encontre os tipos.
 */

export {
  parseEmbedcanaisHtml,
  parseChannelsSource,
  parseStringArrayLiteral,
  parseStringMapLiteral,
  EMBEDCANAIS_SOURCE_URL,
} from '../../../shared/parseEmbedcanais.mjs'

export type {
  EmbedcanaisChannel,
  EmbedcanaisCatalog,
} from '../../../shared/parseEmbedcanais.d.mts'
