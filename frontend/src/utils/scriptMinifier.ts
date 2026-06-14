export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const STRING_PLACEHOLDER = '\x00STR:'
const PLACEHOLDER_END = '\x00'

interface StringStore {
  strings: string[]
  regexes: string[]
}

function preserveStringsAndRegex(code: string, store: StringStore): string {
  let result = ''
  let i = 0

  while (i < code.length) {
    const ch = code[i]

    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') {
        result += code[i]
        i++
      }
      continue
    }

    if (ch === '/' && code[i + 1] === '*') {
      result += code[i]
      i++
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        result += code[i]
        i++
      }
      if (i < code.length) {
        result += '*/'
        i += 2
      }
      continue
    }

    if (ch === '"') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === '"') break
        j++
      }
      const str = code.substring(i, j + 1)
      store.strings.push(str)
      result += STRING_PLACEHOLDER + (store.strings.length - 1) + PLACEHOLDER_END
      i = j + 1
      continue
    }

    if (ch === "'") {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === "'") break
        j++
      }
      const str = code.substring(i, j + 1)
      store.strings.push(str)
      result += STRING_PLACEHOLDER + (store.strings.length - 1) + PLACEHOLDER_END
      i = j + 1
      continue
    }

    if (ch === '`') {
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') {
          j += 2
          continue
        }
        if (code[j] === '`') break
        j++
      }
      const str = code.substring(i, j + 1)
      store.strings.push(str)
      result += STRING_PLACEHOLDER + (store.strings.length - 1) + PLACEHOLDER_END
      i = j + 1
      continue
    }

    result += ch
    i++
  }

  return result
}

function restoreStringsAndRegex(code: string, store: StringStore): string {
  let result = code

  const stringRegex = new RegExp(STRING_PLACEHOLDER.replace(/\x00/g, '\\x00') + '(\\d+)' + PLACEHOLDER_END.replace(/\x00/g, '\\x00'), 'g')
  result = result.replace(stringRegex, (_match, idx) => {
    return store.strings[parseInt(idx, 10)]
  })

  return result
}

function removeLineComments(code: string): string {
  let result = ''
  let i = 0

  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '/') {
      result += '/**/'
      while (i < code.length && code[i] !== '\n') {
        i++
      }
      continue
    }

    if (code[i] === '/' && code[i + 1] === '*') {
      result += code[i]
      i++
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        result += code[i]
        i++
      }
      if (i < code.length) {
        result += '*/'
        i += 2
      }
      continue
    }

    result += code[i]
    i++
  }

  return result
}

function removeBlockComments(code: string): string {
  let result = ''
  let i = 0

  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      if (end !== -1) {
        i = end + 2
        continue
      }
    }
    result += code[i]
    i++
  }

  return result
}

function compressWhitespace(code: string): string {
  return code
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n+/g, '\n')
    .trim()
}

function removeSpacesAroundOperators(code: string): string {
  const operators = [
    '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=',
    '&&', '||', '+=', '-=', '*=', '/=', '%=', '**=',
    '&=', '|=', '^=', '<<=', '>>=', '>>>='
  ]

  let result = code

  for (const op of operators.sort((a, b) => b.length - a.length)) {
    const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\s*${escapedOp}\\s*`, 'g')
    result = result.replace(regex, op)
  }

  result = result.replace(/\s*([{}[\]();,])\s*/g, '$1')
  result = result.replace(/\s*(:)\s*/g, '$1')

  return result
}

export function minifyScript(code: string): string {
  if (!code || code.trim().length === 0) return ''

  const store: StringStore = { strings: [], regexes: [] }

  let result = preserveStringsAndRegex(code, store)

  result = removeLineComments(result)
  result = removeBlockComments(result)

  result = compressWhitespace(result)
  result = removeSpacesAroundOperators(result)

  result = result.replace(/\n+/g, '')

  result = restoreStringsAndRegex(result, store)

  return result
}

interface DelimiterCounts {
  brace: number
  paren: number
  bracket: number
}

type ParseMode = 'code' | 'string' | 'template' | 'line_comment' | 'block_comment' | 'regex'

/**
 * Conta delimitadores balanceados em código JavaScript respeitando contexto.
 *
 * Itera caractere a caractere e rastreia o estado do parser:
 *   - string normal "..." / '...'
 *   - template literal `...` com expressões ${...} recursivas
 *   - comentário de linha // ...
 *   - comentário de bloco /* ... *\/
 *   - regex literal /.../[gimsuy] (apenas em contexto de expressão, não divisão)
 *
 * Apenas fora desses contextos os delimitadores { } ( ) [ ] são contados.
 * Escape sequences \\( \\) \\{ \\} dentro de strings/regex são puladas.
 */
function countDelimiters(code: string): DelimiterCounts {
  let brace = 0
  let paren = 0
  let bracket = 0

  let i = 0
  const n = code.length

  let mode: ParseMode = 'code'
  const stack: ParseMode[] = []
  // Profundidade de chaves JS dentro da expressão ${...} de um template literal.
  // Quando > 0, o próximo '}' que fechar uma chave JS não é o '}' do ${...}.
  // Apenas quando o contador volta a 0 é que o '}' fecha o ${...} e volta para 'template'.
  let templateBraceDepth = 0
  let stringQuote = ''

  function isRegexContext(): boolean {
    let j = i - 1
    while (j >= 0 && /\s/.test(code[j])) j--
    if (j < 0) return true
    const c = code[j]
    // Se o char anterior é identificador/numérico ou ], ), }, "', `, / é divisão
    return !/[A-Za-z0-9_$\])\}"']/.test(c)
  }

  function pushMode(newMode: ParseMode): void {
    stack.push(mode)
    mode = newMode
  }

  function popMode(): void {
    mode = stack.pop() ?? 'code'
  }

  while (i < n) {
    const ch = code[i]
    const next = code[i + 1]

    // Escape: pula próximo char dentro de string/template/regex
    if ((mode === 'string' || mode === 'template' || mode === 'regex') && ch === '\\') {
      i += 2
      continue
    }

    if (mode === 'line_comment') {
      if (ch === '\n') mode = stack.pop() ?? 'code'
      i++
      continue
    }

    if (mode === 'block_comment') {
      if (ch === '*' && next === '/') {
        i += 2
        mode = stack.pop() ?? 'code'
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
        // Entramos no ${...}. O próprio ${ abre uma "chave" lógica.
        // A chave JS real só existe quando { é encontrado dentro do code.
        templateBraceDepth = 1
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

    // mode === 'code'
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

    if (ch === '{') {
      brace++
      if (templateBraceDepth > 0) templateBraceDepth++
    } else if (ch === '}') {
      if (templateBraceDepth > 0) {
        templateBraceDepth--
        if (templateBraceDepth === 0) {
          // Esse '}' fecha o ${...}, não conta como chave JS e volta para 'template'
          popMode()
        } else {
          // É um '}' interno ao ${...} (ex: fecha um objeto literal)
          brace--
        }
      } else {
        brace--
      }
    } else if (ch === '(') paren++
    else if (ch === ')') paren--
    else if (ch === '[') bracket++
    else if (ch === ']') bracket--

    i++
  }

  return { brace, paren, bracket }
}

export function validateScript(code: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (code.length > 50000) {
    errors.push('Script excede o limite de 50KB')
  }

  try {
    new Function(code)
  } catch (err) {
    if (err instanceof SyntaxError) {
      errors.push(`Erro de sintaxe: ${err.message}`)
    }
  }

  const dangerousPatterns = [
    { pattern: /\beval\s*\(/, name: 'eval()' },
    { pattern: /\bnew\s+Function\s*\(/, name: 'new Function()' },
    { pattern: /\bdocument\.write\s*\(/, name: 'document.write()' }
  ]

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(code)) {
      warnings.push(`Uso de ${name} detectado - verifique se é intencional`)
    }
  }

  const counts = countDelimiters(code)

  if (counts.brace !== 0) errors.push(`Chaves não balanceadas (${counts.brace})`)
  if (counts.paren !== 0) errors.push(`Parênteses não balanceados (${counts.paren})`)
  if (counts.bracket !== 0) errors.push(`Colchetes não balanceados (${counts.bracket})`)

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
