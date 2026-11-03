/**
 * Gera o codigo da Deno Function (Suga) a partir do parser compartilhado.
 *
 * A Suga aceita Deno Functions com codigo inline. Isso permite rodar o
 * backend sem GitHub App (que o MCP nao pode instalar) e sem imagem de
 * registry (que exige plano pago).
 *
 * Para manter a implementacao unica, este script embute
 * `shared/parseEmbedcanais.mjs` no codigo da function. Rode de novo sempre
 * que o parser mudar.
 *
 * Run: node scripts/build-suga-function.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const SHARED = resolve(ROOT, 'shared/parseEmbedcanais.mjs')
const OUT = resolve(ROOT, 'scripts/suga-function.ts')

const shared = readFileSync(SHARED, 'utf8')

// Remove imports/exports: o arquivo vira codigo solto dentro da function.
const parserBody = shared
  .replace(/^export\s+/gm, '')
  .replace(/^import\s+.*$/gm, '')

const code = `// WebTV v2 - API do catalogo de canais (Deno Function na Suga).
//
// Gerado por scripts/build-suga-function.mjs a partir de
// shared/parseEmbedcanais.mjs (fonte unica de verdade). NAO editar a mao.
//
// Resolve o bloqueio de CORS do embedcanais.online: o fetch acontece no
// servidor (sem Same-Origin Policy) e a resposta sai com CORS liberado.

${parserBody}

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
    if (!upstream.ok) throw new Error(\`upstream respondeu HTTP \${upstream.status}\`);
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
  const url = new URL(req.url || "/", \`http://\${req.headers.get("host") || "localhost"}\`);

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
          warning: \`falha ao atualizar: \${err.message}\`,
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

console.log(\`[webtv-function] ouvindo na porta \${PORT}\`);
console.log(\`[webtv-function] origem: \${SOURCE_URL}\`);
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, code, 'utf8')
console.log(`gerado: ${OUT} (${code.length} bytes)`)
