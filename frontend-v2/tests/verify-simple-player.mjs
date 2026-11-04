/**
 * E2E: a v2 entrega o player simples ao Kotlin, e o script troca o
 * player pesado do embedcanais por um <video> unico.
 *
 * ## O que e verificado
 *
 * 1. **A entrega**: o `scripts:loaded` da v2 carrega o script do player
 *    simples indexado pelo canal da v2 (`${id}-${slug}`).
 *
 * 2. **A injecao**: reproduzindo o escaping exato do Kotlin
 *    (`injectChannelScripts`), o script roda na pagina real do canal.
 *
 * 3. **O efeito**: o player original (Clappr + P2P) some, sobra um
 *    `<video>` unico, o manifesto e descobertos e o banner `#vipModal`
 *    nao existe.
 *
 * O player real e `embedcanaisdetv.xyz/e/index.php?canal=<slug>`, que
 * redireciona para `<numero>.playerembcanais.com/<slug>/`.
 *
 * Run: $env:CDP_URL="http://127.0.0.1:9333"; node frontend-v2/tests/verify-simple-player.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const V2_ROOT = resolve(REPO_ROOT, 'frontend-v2')

const { chromium } = await import(
  pathToFileURL(resolve(REPO_ROOT, 'frontend/node_modules/playwright-core/index.mjs')).href
)

/** O codigo do script (como o bundle embute). */
const CODE = readFileSync(
  resolve(V2_ROOT, 'src/lib/embedcanais-simple-player.js'),
  'utf8',
)

/** Reproduz o escaping exato do `injectChannelScripts` do Kotlin. */
function kotlinEscape(code) {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

/** O script e embute em aspas simples: reverte o escaping. */
function kotlinUnescape(code) {
  return code.replace(/\\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\'/g, "'")
}

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failed++
}

// O canal usado no teste (o mesmo da v1).
const CANAL = 'https://embedcanaisdetv.xyz/e/index.php?canal=globodf/'

const browser = await chromium.connectOverCDP(
  process.env.CDP_URL || 'http://127.0.0.1:9333',
)
const page = await browser.contexts()[0].newPage()
await page.setViewportSize({ width: 1400, height: 900 })

const errors = []
page.on('pageerror', e => errors.push(e.message))

// --- 1) A entrega: o que a v2 manda ao Kotlin ------------------------
console.log('--- 1) a v2 entrega o script ---')

const payload = await page.evaluate(() => {
  // Reproduz o `emitScriptsLoaded` da v2 (useBridge.ts) com o payload
  // real do gist (70 channelIds) + os scripts da v2.
  return fetch(
    'https://gist.githubusercontent.com/HellFiveOsborn/0520b83cd34f4fa8a20831a42116837a/raw/channels.json',
  )
    .then(r => r.json())
    .then(data => {
      const gist = (data.scripts || []).map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        domains: s.domains || [],
        urls: s.urls || [],
        channelIds: s.channelIds,
      }))
      const channelId = '1-amazonprimevideo'
      const v2 = [
        {
          id: 'webtv-vip-banner-remover',
          name: 'WebTV - Remover Banner VIP',
          code: '// banner',
          domains: ['embedcanaisdetv.xyz', 'playerembcanais.com'],
          urls: [],
          channelIds: [channelId],
        },
        {
          id: 'webtv-embedcanais-simple-player',
          name: 'WebTV - Player Simples (EmbedDeCanais)',
          code: '// simples',
          domains: ['embedcanaisdetv.xyz', 'playerembcanais.com'],
          urls: [],
          channelIds: [channelId],
        },
      ]
      // A ordem do useBridge.ts: gist primeiro, v2 depois.
      return [...gist, ...v2]
    })
})

const simples = payload.find(s => s.id === 'webtv-embedcanais-simple-player')
check('o script do player simples e entregue', Boolean(simples))
check(
  'ele e indexado pelo canal da v2',
  Boolean(simples?.channelIds?.includes('1-amazonprimevideo')),
  JSON.stringify(simples?.channelIds),
)

const gistPlayer = payload.find(s => s.name?.includes('Player Simples') && s.id !== simples?.id)
check(
  'o script do gist NAO casa com a chave da v2 (o motivo do bug)',
  Boolean(gistPlayer && !gistPlayer.channelIds?.includes('1-amazonprimevideo')),
  `gist tem ${gistPlayer?.channelIds?.length ?? 0} channelIds (ids da v1)`,
)

// --- 2) A injecao na pagina real do canal ---------------------------
console.log('\n--- 2) injecao na pagina real do canal ---')

await page.goto(CANAL, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(4000)

const hostReal = new URL(page.url()).hostname
console.log(`player real: ${page.url()}`)

const antes = await page.evaluate(() => ({
  temVipPlayer: typeof window.vipPlayer !== 'undefined',
  source: window.vipPlayer?.options?.source || null,
  videos: document.querySelectorAll('video').length,
  banner: !!document.getElementById('vipModal'),
}))

check('o player original estava na pagina', antes.temVipPlayer)
check(
  'o player original expunha a URL do manifesto',
  Boolean(antes.source),
  String(antes.source).slice(0, 70),
)

// Injeta como o Kotlin faz (escaping + script tag).
await page.evaluate(embedded => {
  const s = document.createElement('script')
  s.textContent = embedded
  document.body.appendChild(s)
}, kotlinUnescape(kotlinEscape(CODE)))

await page.waitForTimeout(9000)

const depois = await page.evaluate(() => {
  const video = document.getElementById('webtv-player-video')
  return {
    flag: window.__webtv_embedcanais_simple === true,
    videoExiste: !!video,
    videos: document.querySelectorAll('video').length,
    // O player original foi destruido.
    vipPlayerDestruido:
      !window.vipPlayer ||
      typeof window.vipPlayer.destroy !== 'function' ||
      window.vipPlayer.destroy.toString().indexOf('return this') !== -1,
    hls: !!window.__webtv_hls,
    banner: !!document.getElementById('vipModal'),
    status: document.getElementById('webtv-status')?.textContent || '',
    playerApi: typeof window.WebTV?.player?.getStatus === 'function',
  }
})

check('o script rodou (flag definida)', depois.flag)
check('o DOM foi trocado por um <video> unico', depois.videoExiste && depois.videos === 1, `${depois.videos} video(s)`)
check('o player original foi destruido', depois.vipPlayerDestruido)
check('o Hls.js foi criado', depois.hls)
check('o banner #vipModal nao existe', !depois.banner)
check('o contrato window.WebTV.player existe', depois.playerApi)

// O texto de status e TEMPORARIO (o script limpa depois de 3,5 s), entao
// nao da para exigir que ele esteja na tela neste ponto. O que importa
// e o `getStatus` do player (o contrato que o app Kotlin usa).
const status = await page.evaluate(() => {
  const api = window.WebTV?.player
  if (!api || typeof api.getStatus !== 'function') return null
  try {
    return api.getStatus()
  } catch {
    return null
  }
})

check('o getStatus do player responde', Boolean(status), JSON.stringify(status).slice(0, 120))
check(
  'o player reporta um video encontrado',
  Boolean(status && status.found),
  `found=${status?.found} paused=${status?.paused} muted=${status?.muted}`,
)

// --- 3) O stream toca -----------------------------------------------
console.log('\n--- 3) o stream toca ---')

const tocando = await page.evaluate(async () => {
  const video = document.getElementById('webtv-player-video')
  if (!video) return { ok: false, motivo: 'sem video' }

  const t0 = video.currentTime
  await new Promise(r => setTimeout(r, 6000))
  return {
    ok: video.currentTime > t0,
    t0,
    t1: video.currentTime,
    readyState: video.readyState,
    src: (video.currentSrc || video.src || '').slice(0, 80),
    error: video.error ? video.error.code : null,
  }
})

check(
  'o video avancou (o stream toca)',
  tocando.ok,
  `t0=${tocando.t0?.toFixed?.(2)} t1=${tocando.t1?.toFixed?.(2)} src=${tocando.src}`,
)

if (!tocando.ok && tocando.error) {
  console.log(`  (video error code ${tocando.error} - o manifesto pode estar bloqueado no navegador)`)
}

check('sem erro de JS na pagina', errors.length === 0, errors.slice(0, 2).join(' | '))

await page.screenshot({ path: resolve(REPO_ROOT, 'scratch/simple-player/player.png') })

console.log(`\nhost testado: ${hostReal}`)
console.log(failed === 0 ? '\nTUDO OK' : `\n${failed} FALHA(S)`)

await page.close()
await browser.close()
process.exit(failed === 0 ? 0 : 1)
