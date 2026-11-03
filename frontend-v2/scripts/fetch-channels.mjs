#!/usr/bin/env node
/**
 * Gera o snapshot do catalogo de canais do embedcanais.online.
 *
 * Executa NO BUILD (GitHub Actions / npm run build), nunca em runtime.
 * O resultado fica em public/data/embedcanais.json e e servido como arquivo
 * estatico pelo GitHub Pages.
 *
 * Uso:
 *   node scripts/fetch-channels.mjs [--out public/data/embedcanais.json] [--url <url>]
 *
 * Saida: JSON com { generatedAt, source, count, channels[], categories[], ... }
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEmbedcanaisHtml, EMBEDCANAIS_SOURCE_URL } from '../../shared/parseEmbedcanais.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(HERE, '..')

const DEFAULT_OUT = resolve(PROJECT_ROOT, 'public/data/embedcanais.json')
const TIMEOUT_MS = 30000

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, url: EMBEDCANAIS_SOURCE_URL, minChannels: 1 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') args.out = resolve(process.cwd(), argv[++i])
    else if (a === '--url') args.url = argv[++i]
    else if (a === '--min-channels') args.minChannels = Number(argv[++i])
  }
  return args
}

async function fetchHtml(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.log(`[fetch-channels] baixando ${args.url}`)
  let html
  try {
    html = await fetchHtml(args.url)
  } catch (err) {
    console.error(`[fetch-channels] FALHA ao baixar: ${err.message}`)
    console.error('[fetch-channels] mantendo snapshot existente (build nao deve quebrar por causa da rede)')
    process.exit(0)
  }

  const catalog = parseEmbedcanaisHtml(html)
  if (!catalog) {
    console.error('[fetch-channels] FALHA ao parsear: HTML sem a listagem de canais')
    console.error('[fetch-channels] mantendo snapshot existente')
    process.exit(0)
  }

  if (catalog.channels.length < args.minChannels) {
    console.error(
      `[fetch-channels] FALHA: apenas ${catalog.channels.length} canais (minimo ${args.minChannels})`,
    )
    process.exit(0)
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: args.url,
    count: catalog.channels.length,
    ...catalog,
  }

  await mkdir(dirname(args.out), { recursive: true })
  await writeFile(args.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(
    `[fetch-channels] OK: ${catalog.channels.length} canais, ${catalog.categories.length} categorias -> ${args.out}`,
  )
  console.log(`[fetch-channels] categorias: ${catalog.categories.join(', ')}`)
}

main().catch(err => {
  console.error('[fetch-channels] erro inesperado:', err)
  process.exit(0)
})
