/**
 * WebTV — Linter para scripts de injeção
 *
 * Detecta erros de balanceamento de { } ( ) [ ] respeitando contexto:
 *   - strings "..." / '...'
 *   - template literals `...` com ${...} recursivos
 *   - comentários // e /* ... *\/
 *   - regex literais /.../[gimsuy]
 *   - escape sequences \\( \\) \\{ \\} em strings/regex
 *
 * Replica a lógica do validateScript() em
 * frontend/src/utils/scriptMinifier.ts, mas como CLI standalone
 * para rodar em dev/CI antes de commitar scripts minificados.
 *
 * Convenção: frontend/docs/scripts/<canal>-replace-content.min.js
 *
 * Uso:
 *   node frontend/tests/lint-scripts.mjs                       # valida todos os .min.js
 *   node frontend/tests/lint-scripts.mjs path/to/foo.js         # valida arquivo único
 *   node frontend/tests/lint-scripts.mjs --dev                  # inclui .js (não-min)
 *   node frontend/tests/lint-scripts.mjs --allow-eval           # não falha em eval
 *
 * Exit codes:
 *   0 = todos os arquivos OK
 *   1 = algum arquivo inválido
 *   2 = erro de execução (path não existe, etc.)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const SCRIPTS_DIR = resolve(__dirname, '..', 'docs', 'scripts')

// ============================================================================
// NÚCLEO — tokenizador que respeita contexto
// ============================================================================

/**
 * Conta delimitadores balanceados em código JavaScript.
 *
 * @param {string} code
 * @returns {{ brace: number, paren: number, bracket: number }}
 */
export function countDelimiters(code) {
  let brace = 0
  let paren = 0
  let bracket = 0

  let i = 0
  const n = code.length

  let mode = 'code' // 'code' | 'string' | 'template' | 'line_comment' | 'block_comment' | 'regex'
  const stack = []
  let stringQuote = ''

  function isRegexContext() {
    let j = i - 1
    while (j >= 0 && /\s/.test(code[j])) j--
    if (j < 0) return true
    const c = code[j]
    return !/[A-Za-z0-9_$\])\]"']/.test(c)
  }

  function pushMode(newMode) {
    stack.push(mode)
    mode = newMode
  }

  function popMode() {
    mode = stack.pop() || 'code'
  }

  while (i < n) {
    const ch = code[i]
    const next = code[i + 1]

    if ((mode === 'string' || mode === 'template' || mode === 'regex') && ch === '\\') {
      i += 2
      continue
    }

    if (mode === 'line_comment') {
      if (ch === '\n') mode = stack.pop() || 'code'
      i++
      continue
    }

    if (mode === 'block_comment') {
      if (ch === '*' && next === '/') {
        i += 2
        mode = stack.pop() || 'code'
        continue
      }
      i++
      continue
    }

    if (mode === 'string') {
      if (ch === stringQuote) {
        i++
        stringQuote = ''
        popMode()
        continue
      }
      i++
      continue
    }

    if (mode === 'template') {
      if (ch === '`') {
        i++
        popMode()
        continue
      }
      if (ch === '$' && next === '{') {
        i += 2
        pushMode('code')
        brace++
        continue
      }
      i++
      continue
    }

    if (mode === 'regex') {
      if (ch === '/') {
        i++
        while (i < n && /[gimsuy]/.test(code[i])) i++
        popMode()
        continue
      }
      if (ch === '[') {
        i++
        while (i < n && code[i] !== ']') {
          if (code[i] === '\\') i += 2
          else i++
        }
        if (i < n) i++
        continue
      }
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      pushMode('line_comment')
      i += 2
      continue
    }

    if (ch === '/' && next === '*') {
      pushMode('block_comment')
      i += 2
      continue
    }

    if (ch === '/' && isRegexContext()) {
      pushMode('regex')
      i++
      continue
    }

    if (ch === '"' || ch === "'") {
      pushMode('string')
      stringQuote = ch
      i++
      continue
    }

    if (ch === '`') {
      pushMode('template')
      i++
      continue
    }

    if (ch === '{') brace++
    else if (ch === '}') brace--
    else if (ch === '(') paren++
    else if (ch === ')') paren--
    else if (ch === '[') bracket++
    else if (ch === ']') bracket--

    i++
  }

  return { brace, paren, bracket }
}

/**
 * Valida um script. Mesma interface de validateScript() do frontend.
 *
 * @param {string} code
 * @param {{ allowEval?: boolean }} [opts]
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateCode(code, opts = {}) {
  const errors = []
  const warnings = []

  if (code.length > 50000) {
    errors.push(`Script excede o limite de 50KB (${code.length} bytes)`)
  }

  try {
    // eslint-disable-next-line no-new-func
    new Function(code)
  } catch (err) {
    if (err instanceof SyntaxError) {
      errors.push(`Erro de sintaxe: ${err.message}`)
    }
  }

  if (!opts.allowEval && /\beval\s*\(/.test(code)) {
    warnings.push('Uso de eval() detectado')
  }
  if (/\bnew\s+Function\s*\(/.test(code)) {
    warnings.push('Uso de new Function() detectado')
  }
  if (/\bdocument\.write\s*\(/.test(code)) {
    warnings.push('Uso de document.write() detectado')
  }

  const counts = countDelimiters(code)

  if (counts.brace !== 0) errors.push(`Chaves não balanceadas (${counts.brace})`)
  if (counts.paren !== 0) errors.push(`Parênteses não balanceados (${counts.paren})`)
  if (counts.bracket !== 0) errors.push(`Colchetes não balanceados (${counts.bracket})`)

  return { valid: errors.length === 0, errors, warnings }
}

// ============================================================================
// DESCOBERTA DE ARQUIVOS
// ============================================================================

export function findScripts(dir, includeDev) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (!st.isFile()) continue
    if (entry.endsWith('.min.js')) files.push(full)
    else if (includeDev && entry.endsWith('.js')) files.push(full)
  }
  return files.sort()
}

// ============================================================================
// CLI
// ============================================================================

function lintFile(path) {
  const code = readFileSync(path, 'utf8')
  const result = validateCode(code)
  return { path, size: code.length, ...result }
}

function formatReport(reports) {
  const lines = []
  let bad = 0

  for (const r of reports) {
    const tag = r.valid ? 'OK' : 'FAIL'
    lines.push(`[${tag}] ${r.path}  (${r.size} bytes)`)
    for (const e of r.errors) lines.push(`       error: ${e}`)
    for (const w of r.warnings) lines.push(`       warn:  ${w}`)
    if (!r.valid) bad++
  }

  lines.push('')
  lines.push(`Total: ${reports.length} arquivo(s), ${bad} com erro(s)`)
  return { text: lines.join('\n'), bad }
}

export function runCli() {
  const args = process.argv.slice(2)

  const includeDev = args.includes('--dev')
  const positional = args.filter(a => !a.startsWith('--'))

  let files
  if (positional.length > 0) {
    files = positional.map(p => resolve(p))
  } else {
    files = findScripts(SCRIPTS_DIR, includeDev)
  }

  if (files.length === 0) {
    console.error('Nenhum script encontrado.')
    process.exit(2)
  }

  const reports = files.map(lintFile)
  const { text, bad } = formatReport(reports)
  console.log(text)

  process.exit(bad === 0 ? 0 : 1)
}

if (import.meta.main) {
  runCli()
}
