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

  let braceCount = 0
  let parenCount = 0
  let bracketCount = 0

  for (const ch of code) {
    if (ch === '{') braceCount++
    if (ch === '}') braceCount--
    if (ch === '(') parenCount++
    if (ch === ')') parenCount--
    if (ch === '[') bracketCount++
    if (ch === ']') bracketCount--
  }

  if (braceCount !== 0) errors.push('Chaves não balanceadas')
  if (parenCount !== 0) errors.push('Parênteses não balanceados')
  if (bracketCount !== 0) errors.push('Colchetes não balanceados')

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
