/**
 * Extrai o codigo do script de injecao (VIP_BANNER_SCRIPT_CODE) do
 * modulo TypeScript e grava um .js puro.
 *
 * Uso: node scripts/extract-vip-script.mjs
 *
 * Serve para validar o script no browser (Playwright) e para conferir
 * a sintaxe com `node --check`.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'src/lib/injectionScripts.ts')
const OUT = resolve(ROOT, 'scratch-vip-banner.js')

const source = readFileSync(SRC, 'utf8')

const match = source.match(
  /export const VIP_BANNER_SCRIPT_CODE = `([\s\S]*?)`\r?\n/,
)
if (!match) {
  console.error('ERRO: nao encontrei VIP_BANNER_SCRIPT_CODE')
  process.exit(1)
}

// Desescapa o template literal: \` -> ` e \${ -> ${
const code = match[1].replace(/\\`/g, '`').replace(/\$\{/g, '${')

writeFileSync(OUT, code, 'utf8')

console.log('OK: ' + code.length + ' bytes -> ' + OUT)
console.log('--- primeiros 400 chars ---')
console.log(code.slice(0, 400))
