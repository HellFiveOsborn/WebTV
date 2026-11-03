// WebTV v2 - API do catalogo de canais (Deno Function na Suga).
//
// Gerado por scripts/build-suga-function.mjs a partir de
// shared/parseEmbedcanais.mjs (fonte unica de verdade). NAO editar a mao.
//
// Resolve o bloqueio de CORS do embedcanais.online: o fetch acontece no
// servidor (sem Same-Origin Policy) e a resposta sai com CORS liberado.

/**
 * Parser da listagem de canais do embedcanais.online  (fonte unica de verdade)
 *
 * O site https://embedcanais.online/ nao expoe nenhuma API: a listagem completa
 * esta embutida no HTML como um array JavaScript literal:
 *
 *   <script>
 *   const CHANNELS=[{"id":1,"slug":"...","name":"...","category":"...",
 *                     "href":"...","image":"...","iframe":"<iframe ...>"}];
 *   const categoryOrder=['Canais Abertos','Variedades', ...];
 *   const categoryLabels={'Variedades':'Entretenimento'};
 *   </script>
 *
 * Este modulo extrai esses literais SEM usar eval() e SEM new Function()
 * (restricao do validador de scripts de injecao do WebTV), usando um scanner
 * que respeita strings e escapes.
 *
 * Modulo PURO (sem DOM, sem Node): roda em Node (backend, script de build,
 * testes) e no browser.
 *
 * Consumidores:
 *   - backend/server.mjs                -> monta a resposta JSON com CORS
 *   - frontend-v2/scripts/fetch-channels.mjs -> gera o snapshot do build
 *   - frontend-v2/tests/                 -> testes unitarios
 */

/**
 * @typedef {Object} EmbedcanaisChannel
 * @property {number} id       id numerico do site (1..N)
 * @property {string} slug     slug unico do canal, usado na URL do player
 * @property {string} name     nome exibido
 * @property {string} category categoria (ex.: 'Esportes', 'Noticias')
 * @property {string} href     URL externa do canal
 * @property {string} image    URL do logo
 * @property {string} iframe   tag <iframe> pronta para uso
 */

/**
 * @typedef {Object} EmbedcanaisCatalog
 * @property {EmbedcanaisChannel[]} channels
 * @property {string[]} categories    categorias presentes, na ordem do site
 * @property {string[]} categoryOrder ordem de exibicao declarada pelo site
 * @property {Record<string,string>} categoryLabels rotulos alternativos
 */

const EMBEDCANAIS_SOURCE_URL = 'https://embedcanais.online/'

const CHANNELS_VAR = 'CHANNELS'

/**
 * Localiza o inicio do valor atribuido a `name` (literal de array ou objeto).
 * @param {string} html
 * @param {string} name
 * @returns {number|null} indice do primeiro caractere do valor, ou null
 */
function findAssignmentValueStart(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    // const CHANNELS = / let / var
    new RegExp(`(?:^|[\\s;{(])(?:const|let|var)\\s+${escaped}\\s*=\\s*`),
    // window.CHANNELS =
    new RegExp(`(?:^|[\\s;{(])window\\.${escaped}\\s*=\\s*`),
    // CHANNELS = (sem declarador)
    new RegExp(`(?:^|[\\s;{(])${escaped}\\s*=\\s*(?=\\[)`),
  ]

  for (const re of patterns) {
    const m = re.exec(html)
    if (m) return m.index + m[0].length
  }
  return null
}

/**
 * Le um literal de array `[...]` a partir de `start`, respeitando strings e escapes.
 * @param {string} html
 * @param {number} start
 * @returns {string|null} texto do array (com colchetes) ou null
 */
function readArrayLiteral(html, start) {
  let i = start
  while (i < html.length && /\s/.test(html[i])) i++
  if (html[i] !== '[') return null

  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false

  for (let j = i; j < html.length; j++) {
    const ch = html[j]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (inString) {
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return html.slice(i, j + 1)
    }
  }
  return null
}

/**
 * Le um literal de objeto `{...}` a partir de `start`, com contagem de chaves.
 * @param {string} html
 * @param {number} start
 * @returns {string|null}
 */
function readObjectLiteral(html, start) {
  let i = start
  while (i < html.length && /\s/.test(html[i])) i++
  if (html[i] !== '{') return null

  let depth = 0
  let inString = false
  let quote = ''
  let escaped = false

  for (let j = i; j < html.length; j++) {
    const ch = html[j]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (inString) {
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return html.slice(i, j + 1)
    }
  }
  return null
}

/**
 * Converte strings de aspas simples para aspas duplas, para permitir JSON.parse
 * em payloads que nao sejam JSON puro (fallback defensivo).
 * @param {string} source
 * @returns {string}
 */
function singleQuotesToDoubleQuotes(source) {
  let out = ''
  let i = 0

  while (i < source.length) {
    const ch = source[i]

    // string com aspas duplas: copia verbatim
    if (ch === '"') {
      out += '"'
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          out += source[j] + (source[j + 1] ?? '')
          j += 2
          continue
        }
        out += source[j]
        if (source[j] === '"') {
          j++
          break
        }
        j++
      }
      i = j
      continue
    }

    // string com aspas simples: converte para aspas duplas
    if (ch === "'") {
      out += '"'
      let j = i + 1
      while (j < source.length) {
        const c = source[j]
        if (c === '\\') {
          const next = source[j + 1] ?? ''
          if (next === "'") {
            out += "'"
            j += 2
            continue
          }
          out += c + next
          j += 2
          continue
        }
        if (c === '"') {
          out += '\\"'
          j++
          continue
        }
        if (c === "'") {
          j++
          break
        }
        out += c
        j++
      }
      out += '"'
      i = j
      continue
    }

    out += ch
    i++
  }
  return out
}

/**
 * JSON.parse com fallback para literais JS de aspas simples.
 * @param {string} source
 * @returns {unknown}
 */
function safeJsonParse(source) {
  try {
    return JSON.parse(source)
  } catch {
    /* tenta o fallback abaixo */
  }
  try {
    return JSON.parse(singleQuotesToDoubleQuotes(source))
  } catch {
    return null
  }
}

/**
 * Extrai um array de strings de um literal JS (ex.: ['A', 'B']).
 * @param {string} source
 * @returns {string[]}
 */
function parseStringArrayLiteral(source) {
  const out = []
  const re = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g
  let m

  while ((m = re.exec(source)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2]
    out.push(raw.replace(/\\(['"\\])/g, '$1'))
  }
  return out
}

/**
 * Extrai um mapa de strings de um literal JS (ex.: {'A': 'B'}).
 * @param {string} source
 * @returns {Record<string,string>}
 */
function parseStringMapLiteral(source) {
  const out = {}
  const re = /(['"])((?:\\.|[^\\])*?)\1\s*:\s*(['"])((?:\\.|[^\\])*?)\3/g
  let m

  while ((m = re.exec(source)) !== null) {
    const key = m[2].replace(/\\(['"\\])/g, '$1')
    const value = m[4].replace(/\\(['"\\])/g, '$1')
    out[key] = value
  }
  return out
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {EmbedcanaisChannel|null}
 */
function normalizeChannel(raw) {
  const slug = toText(raw.slug)
  const name = toText(raw.name)
  if (!slug && !name) return null

  const numericId = Number(raw.id)

  return {
    id: Number.isFinite(numericId) ? numericId : 0,
    slug,
    name,
    category: toText(raw.category) || 'Sem categoria',
    href: toText(raw.href),
    image: toText(raw.image),
    iframe: toText(raw.iframe),
  }
}

/**
 * Parseia o array CHANNELS.
 * @param {string} source
 * @returns {EmbedcanaisChannel[]|null}
 */
function parseChannelsSource(source) {
  const parsed = safeJsonParse(source)
  if (!Array.isArray(parsed)) return null

  const channels = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const normalized = normalizeChannel(item)
    if (normalized) channels.push(normalized)
  }
  return channels.length > 0 ? channels : null
}

/**
 * Parseia o HTML completo do embedcanais.online e devolve o catalogo.
 * @param {string} html
 * @returns {EmbedcanaisCatalog|null}
 */
function parseEmbedcanaisHtml(html) {
  if (!html || typeof html !== 'string') return null

  const valueStart = findAssignmentValueStart(html, CHANNELS_VAR)
  if (valueStart === null) return null

  const arraySource = readArrayLiteral(html, valueStart)
  if (!arraySource) return null

  const channels = parseChannelsSource(arraySource)
  if (!channels) return null

  const categoryOrderStart = findAssignmentValueStart(html, 'categoryOrder')
  let categoryOrder = []
  if (categoryOrderStart !== null) {
    const raw = readArrayLiteral(html, categoryOrderStart)
    if (raw) categoryOrder = parseStringArrayLiteral(raw)
  }

  const categoryLabelsStart = findAssignmentValueStart(html, 'categoryLabels')
  let categoryLabels = {}
  if (categoryLabelsStart !== null) {
    const raw = readObjectLiteral(html, categoryLabelsStart)
    if (raw) categoryLabels = parseStringMapLiteral(raw)
  }

  const present = new Set(channels.map(c => c.category))
  const categories = [
    ...categoryOrder.filter(cat => present.has(cat)),
    ...[...present]
      .filter(cat => !categoryOrder.includes(cat))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ]

  return { channels, categories, categoryOrder, categoryLabels }
}


const PORT = Number(Deno.env.get("PORT") || "8080");
const SOURCE_URL = Deno.env.get("EMBEDCANAIS_SOURCE_URL") || "https://embedcanais.online/";
const CACHE_TTL_MS = Number(Deno.env.get("CACHE_TTL_MS") || 10 * 60 * 1000);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let cache = null;
let cacheAt = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function getCatalog(force = false) {
  const fresh = cache && Date.now() - cacheAt < CACHE_TTL_MS;
  if (fresh && !force) return { catalog: cache, cached: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let html;
  try {
    const upstream = await fetch(SOURCE_URL, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!upstream.ok) throw new Error(`upstream respondeu HTTP ${upstream.status}`);
    html = await upstream.text();
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseEmbedcanaisHtml(html);
  if (!parsed) throw new Error("HTML do site sem a listagem de canais");

  cache = parsed;
  cacheAt = Date.now();
  return { catalog: parsed, cached: false };
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url || "/", `http://${req.headers.get("host") || "localhost"}`);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return json(405, { error: "metodo nao permitido" });
  }

  if (url.pathname === "/health") {
    return json(200, {
      ok: true,
      source: SOURCE_URL,
      cached: !!cache,
      channels: cache ? cache.channels.length : 0,
      cacheAgeMs: cache ? Date.now() - cacheAt : null,
    });
  }

  if (url.pathname === "/channels") {
    const force = url.searchParams.get("fresh") === "1";
    try {
      const { catalog, cached } = await getCatalog(force);
      return json(200, {
        generatedAt: new Date().toISOString(),
        source: SOURCE_URL,
        cached,
        count: catalog.channels.length,
        categories: catalog.categories,
        categoryOrder: catalog.categoryOrder,
        categoryLabels: catalog.categoryLabels,
        channels: catalog.channels,
      });
    } catch (err) {
      if (cache) {
        return json(200, {
          generatedAt: new Date(cacheAt).toISOString(),
          source: SOURCE_URL,
          cached: true,
          stale: true,
          warning: `falha ao atualizar: ${err.message}`,
          count: cache.channels.length,
          categories: cache.categories,
          categoryOrder: cache.categoryOrder,
          categoryLabels: cache.categoryLabels,
          channels: cache.channels,
        });
      }
      return json(502, { error: err.message });
    }
  }

  return json(404, { error: "rota nao encontrada" });
});

console.log(`[webtv-function] ouvindo na porta ${PORT}`);
console.log(`[webtv-function] origem: ${SOURCE_URL}`);
