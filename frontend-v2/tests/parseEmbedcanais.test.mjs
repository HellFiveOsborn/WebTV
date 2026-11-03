/**
 * Testes do parser do embedcanais.online
 * (shared/parseEmbedcanais.mjs)
 *
 * Logica pura: extrai a listagem de canais, as categorias e os rotulos a
 * partir do HTML real do site, sem eval() e sem new Function().
 *
 * Run: npm run test:parser
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseEmbedcanaisHtml,
  parseChannelsSource,
  parseStringArrayLiteral,
  parseStringMapLiteral,
  EMBEDCANAIS_SOURCE_URL,
} from '../../shared/parseEmbedcanais.mjs'

/** HTML minimo no formato exato do site. */
const SAMPLE_HTML = `
<html><body>
<script>
const CHANNELS=[{"id":1,"slug":"canal-a","name":"Canal A","category":"Esportes","href":"https://exemplo.com/a","image":"https://exemplo.com/a.png","iframe":"<iframe src=\\"https://exemplo.com/a\\"></iframe>"},{"id":2,"slug":"canal-b","name":"Canal B","category":"Notícias","href":"https://exemplo.com/b","image":"https://exemplo.com/b.png","iframe":"<iframe src=\\"https://exemplo.com/b\\"></iframe>"}];
const categoryOrder=['Canais Abertos','Esportes','Notícias'];
const categoryLabels={'Variedades':'Entretenimento'};
</script>
</body></html>
`

test('extrai os canais do HTML real do site', () => {
  const html = SAMPLE_HTML
  const catalog = parseEmbedcanaisHtml(html)

  assert.ok(catalog, 'deveria retornar um catalogo')
  assert.equal(catalog.channels.length, 2)
  assert.equal(catalog.channels[0].name, 'Canal A')
  assert.equal(catalog.channels[0].slug, 'canal-a')
  assert.equal(catalog.channels[0].category, 'Esportes')
  assert.equal(catalog.channels[0].href, 'https://exemplo.com/a')
  assert.equal(catalog.channels[0].image, 'https://exemplo.com/a.png')
  assert.ok(catalog.channels[0].iframe.includes('iframe'))
})

test('extrai a ordem e os rotulos das categorias', () => {
  const catalog = parseEmbedcanaisHtml(SAMPLE_HTML)

  assert.deepEqual(catalog.categoryOrder, ['Canais Abertos', 'Esportes', 'Notícias'])
  assert.equal(catalog.categoryLabels['Variedades'], 'Entretenimento')
})

test('lista apenas as categorias presentes, na ordem declarada pelo site', () => {
  const catalog = parseEmbedcanaisHtml(SAMPLE_HTML)

  // 'Canais Abertos' esta na order mas nao tem canais -> nao entra
  assert.deepEqual(catalog.categories, ['Esportes', 'Notícias'])
})

test('normaliza campos ausentes sem quebrar', () => {
  const catalog = parseEmbedcanaisHtml(
    '<script>const CHANNELS=[{"id":1,"slug":"x","name":"X"}];</script>',
  )

  assert.equal(catalog.channels.length, 1)
  assert.equal(catalog.channels[0].category, 'Sem categoria')
  assert.equal(catalog.channels[0].href, '')
  assert.equal(catalog.channels[0].image, '')
  assert.equal(catalog.channels[0].iframe, '')
})

test('retorna null quando o HTML nao tem a listagem de canais', () => {
  assert.equal(parseEmbedcanaisHtml('<html><body>sem nada</body></html>'), null)
  assert.equal(parseEmbedcanaisHtml(''), null)
})

test('lida com array que usa aspas simples (fallback)', () => {
  const catalog = parseEmbedcanaisHtml(
    "<script>const CHANNELS=[{'id':1,'slug':'y','name':'Y','category':'Z'}];</script>",
  )

  assert.equal(catalog.channels.length, 1)
  assert.equal(catalog.channels[0].name, 'Y')
})

test('nao confunde chaves dentro de strings com o fim do array', () => {
  const catalog = parseEmbedcanaisHtml(
    '<script>const CHANNELS=[{"id":1,"slug":"a","name":"Fechado ] aqui","category":"X"}];const OUTRO=1;</script>',
  )

  assert.equal(catalog.channels.length, 1)
  assert.equal(catalog.channels[0].name, 'Fechado ] aqui')
})

test('parseStringArrayLiteral extrai strings', () => {
  assert.deepEqual(parseStringArrayLiteral("['a', 'b', 'c']"), ['a', 'b', 'c'])
})

test('parseStringMapLiteral extrai pares chave/valor', () => {
  assert.deepEqual(parseStringMapLiteral("{'a':'1','b':'2'}"), { a: '1', b: '2' })
})

test('parseChannelsSource aceita JSON puro', () => {
  const channels = parseChannelsSource('[{"id":1,"slug":"a","name":"A"}]')
  assert.equal(channels.length, 1)
})

test('a URL de origem esta correta', () => {
  assert.equal(EMBEDCANAIS_SOURCE_URL, 'https://embedcanais.online/')
})
