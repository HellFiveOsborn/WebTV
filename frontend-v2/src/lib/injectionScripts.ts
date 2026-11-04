/**
 * Scripts de injecao que a v2 entrega ao app Kotlin.
 *
 * ## Como o Kotlin injeta
 *
 * O Kotlin mantem um indice de scripts e injeta o que casar com a
 * pagina do canal:
 *
 * | Caminho | Evento | Onde injeta |
 * |---|---|---|
 * | `injectChannelScripts(url)` | `scripts:loaded` | **documento principal** |
 * | `injectPreloadedScripts()` | `scripts:preloaded` | `window.frames[0]` |
 *
 * O segundo chama o injetor com a URL **vazia**, e o injetor procura
 * `iframeUrl.includes('')` - sempre verdadeiro - caindo no primeiro
 * frame da pagina. No player isso e um iframe de anuncio
 * (cross-origin), nao o documento principal onde o `#vipModal` vive.
 *
 * Por isso o script do banner e entregue pelo primeiro caminho.
 *
 * ## Por que o indice e POR CANAL (e nao por dominio)
 *
 * O player roda em subdominio **rotativo**:
 *
 * ```
 * embedcanaisdetv.xyz --302--> 2910.playerembcanais.com/<slug>/
 * embedcanaisdetv.xyz --302--> 4477.playerembcanais.com/<slug>/
 * ```
 *
 * E o Kotlin casa o dominio **EXATO** (`domainScripts[host]`). Como o
 * subdominio numerico muda, hardcodar `2910.playerembcanais.com`
 * quebraria assim que o player trocasse de instancia.
 *
 * O indice **por canal** nao depende de host nenhum:
 *
 * ```
 * channel:clicked  {id: "104-globodf"}   ->  activeChannelId = "104-globodf"
 * scripts:loaded   {channelIds: ["104-globodf"]}
 *                                        ->  channelScripts["104-globodf"]
 * onPageFinished   ->  injectChannelScripts(url)
 *                                        ->  channelScripts[activeChannelId]  ✅
 * ```
 *
 * O `activeChannelId` vem do `id` que a **propria v2** mandou no
 * `channel:clicked`, entao o batimento e exato por construcao - e
 * sobrevive a qualquer rotacao de host.
 *
 * ## Limite do indice
 *
 * `channelScripts` e um LRU de **50 entradas**. Indexar os 156 canais
 * de uma vez descartaria 106. Por isso o `scripts:loaded` e reemitido
 * **a cada abertura de canal**, indexado apenas para o canal atual -
 * o Kotlin sempre tem o script na mao, sem depender do limite.
 */

/** Id do script (usado pelo Kotlin na deduplicacao). */
export const VIP_BANNER_SCRIPT_ID = 'webtv-vip-banner-remover'

/** Nome legivel (aparece no log de injecao do app). */
export const VIP_BANNER_SCRIPT_NAME = 'WebTV - Remover Banner VIP'

/**
 * Dominios **estaveis** onde o script se aplica.
 *
 * O Kotlin casa o dominio exato, entao:
 *
 * - `embedcanaisdetv.xyz` - host do catalogo (estavel). E por ele que
 *   a v2 resolve o redirect e monta a URL do canal.
 * - `playerembcanais.com` - dominio **pai** do player. Vale como rede
 *   de seguranca caso o player seja servido no dominio raiz.
 *
 * O subdominio numerico (`2910.`, `4477.`...) **nao entra aqui**: ele
 * rotaciona e quebraria o casamento. Quem garante a injecao no host
 * rotativo e o indice por canal.
 */
export const VIP_BANNER_SCRIPT_DOMAINS = [
  'embedcanaisdetv.xyz',
  'playerembcanais.com',
]

/**
 * Codigo do script de injecao.
 *
 * ## O que ele enfrenta
 *
 * O player agenda a exibicao do banner:
 *
 * ```js
 * setTimeout(function () {
 *   abrir();                       // classList.add('is-visible')
 *   setInterval(abrir, 60000);     // reabre a cada 60 s
 * }, 60000);
 * ```
 *
 * E antes de abrir, o jogador move o `#vipModal` para dentro do
 * elemento em fullscreen - ou seja, remover o elemento uma vez **nao
 * resolve**: ele volta no ciclo seguinte.
 *
 * Por isso o script trabalha em tres frentes:
 *
 * 1. **CSS com `!important`** - invisibilidade garantida, sem chance
 *    de flash. O seletor usa o `#id` porque a regra do player em
 *    fullscreen (`:fullscreen .vip-modal-overlay.is-visible`) tem
 *    `!important` e especificidade (0,3,0); o id leva a
 *    especificidade para (1,2,0) e vence.
 * 2. **Remocao + `MutationObserver`** - o elemento e removido do DOM e
 *    um observador o remove de novo sempre que o jogador o reinsere.
 * 3. **Varredura periodica** - rede de seguranca: se o observador for
 *    interrompido (ou o elemento for recriado em outro lugar), a
 *    varredura de 1 s ainda o remove.
 *
 * O script e idempotente, nao depende de `eval`/`new Function` e nao
 * depende de host nenhum - ele age pelo `#id` e pelas classes, entao
 * funciona igual em qualquer instancia rotativa do player.
 */
export const VIP_BANNER_SCRIPT_CODE = `(function () {
  'use strict';

  // Idempotencia: nunca rodar duas vezes na mesma pagina.
  if (window.__webtvVipBannerRemoved) return;
  window.__webtvVipBannerRemoved = true;

  var STYLE_ID = 'webtv-vip-banner-blocker';
  var VIP_ID = 'vipModal';

  // O id vence a regra do player em fullscreen (que usa !important).
  var CSS = [
    '#vipModal{display:none !important;visibility:hidden !important;pointer-events:none !important;}',
    '#vipModal.vip-modal-overlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}',
    '#vipModal.vip-modal-overlay.is-visible{display:none !important;visibility:hidden !important;pointer-events:none !important;opacity:0 !important;}',
    '.vip-modal-overlay.is-visible{display:none !important;visibility:hidden !important;pointer-events:none !important;}'
  ].join('');

  function installStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
    }
    var host = document.head || document.documentElement;
    if (!host) return;
    if (style.parentNode !== host) host.appendChild(style);
  }

  function neutralize(el) {
    try {
      el.classList.remove('is-visible');
      el.setAttribute('aria-hidden', 'true');
    } catch (e) {}
  }

  // O banner e encontrado pelo id OU pela classe: o player pode
  // recria-lo com outra estrutura.
  function findBanners() {
    var found = [];
    var byId = document.getElementById(VIP_ID);
    if (byId) found.push(byId);
    var list = document.querySelectorAll('.vip-modal-overlay');
    for (var i = 0; i < list.length; i++) {
      if (found.indexOf(list[i]) === -1) found.push(list[i]);
    }
    return found;
  }

  function removeBanners() {
    var banners = findBanners();
    for (var i = 0; i < banners.length; i++) {
      neutralize(banners[i]);
      try {
        if (banners[i].parentNode) banners[i].parentNode.removeChild(banners[i]);
      } catch (e) {}
    }
    return banners.length > 0;
  }

  function sweep() {
    installStyle();
    removeBanners();
  }

  function watch() {
    if (window.__webtvVipBannerObserver) return;
    var observer = new MutationObserver(function () {
      // O jogador reinsere o #vipModal a cada 60 s (e o move para o
      // elemento em fullscreen). Cada reinsercao e removida aqui.
      removeBanners();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    window.__webtvVipBannerObserver = observer;
  }

  function bootstrap() {
    sweep();
    watch();
    // Rede de seguranca: o MutationObserver ja cobre a reinsercao, mas
    // a varredura garante a remocao mesmo se o observador for
    // interrompido (ou se o elemento for recriado em outro lugar).
    if (!window.__webtvVipBannerTimer) {
      window.__webtvVipBannerTimer = setInterval(sweep, 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();`

/**
 * O script do banner VIP, pronto para o formato do bridge.
 *
 * ## Por que `channelIds` e `domains` sao separados
 *
 * O Kotlin indexa cada script em ate tres mapas:
 *
 * - `channelScripts[channelId]` - o que **garante** a injecao no host
 *   rotativo (nao depende de host nenhum);
 * - `domainScripts[host]` - casa o dominio **exato**;
 * - `urlScripts[url]` - casa a URL exata.
 *
 * Sao maps LRU de 50 entradas. Encher um deles com o mesmo script
 * varias vezes so desperdica espaco (e `storeDomainScript` **acrescenta**
 * a uma lista, sem deduplicar) - por isso o parametro `domains` pode
 * ser omitido, para indexar o script so pelo canal.
 *
 * @param options.channelIds Canais onde o script se aplica. E o campo
 *   que garante a injecao: o Kotlin injeta no documento principal,
 *   independente do host rotativo.
 * @param options.domains Dominios estaveis. Indexa o script por
 *   dominio (rede de seguranca).
 */
export function vipBannerScript(options: {
  channelIds?: string[]
  domains?: string[]
} = {}): {
  id: string
  name: string
  code: string
  domains?: string[]
  urls?: string[]
  channelIds?: string[]
} {
  const domains = options.domains ?? []
  const channelIds = options.channelIds ?? []

  return {
    id: VIP_BANNER_SCRIPT_ID,
    name: VIP_BANNER_SCRIPT_NAME,
    code: VIP_BANNER_SCRIPT_CODE,
    // O Kotlin le com `optJSONArray`: ausente = nao indexa nessa dimensao.
    domains: domains.length > 0 ? [...domains] : undefined,
    urls: [],
    channelIds: channelIds.length > 0 ? [...channelIds] : undefined,
  }
}
