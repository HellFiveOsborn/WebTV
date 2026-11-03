/**
 * Teste LIVE: baixa o HTML real do embedcanais.online e valida o parser.
 *
 * Este teste depende de rede. Se a rede falhar, ele e marcado como
 * "skipped" em vez de reprovar (build nao deve quebrar por causa da rede).
 *
 * Run: npm run test:parser:live
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseEmbedcanaisHtml, EMBEDCANAIS_SOURCE_URL } from '../../shared/parseEmbedcanais.mjs'

async function fetchHtml(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

test(
  'o site real expoe a listagem de canais no HTML',
  { skip: false },
  async t => {
    let html
    try {
      html = await fetchHtml(EMBEDCANAIS_SOURCE_URL)
    } catch (err) {
      t.skip(`rede indisponivel: ${err.message}`)
      return
    }

    const catalog = parseEmbedcanaisHtml(html)

    assert.ok(catalog, 'o parser deveria extrair um catalogo do site real')
    assert.ok(catalog.channels.length > 50, `esperava >50 canais, veio ${catalog.channels.length}`)
    assert.ok(catalog.categories.length > 0, 'deveria haver categorias')

    for (const ch of catalog.channels) {
      assert.ok(ch.name, `canal sem nome: ${JSON.stringify(ch)}`)
      assert.ok(ch.slug, `canal sem slug: ${JSON.stringify(ch)}`)
      assert.ok(ch.category, `canal sem categoria: ${JSON.stringify(ch)}`)
      assert.ok(ch.href, `canal sem href: ${JSON.stringify(ch)}`)
      assert.ok(ch.image, `canal sem image: ${JSON.stringify(ch)}`)
    }

    console.log(
      `      [live] ${catalog.channels.length} canais / ${catalog.categories.length} categorias`,
    )
    console.log(`      [live] categorias: ${catalog.categories.join(', ')}`)
  },
)
