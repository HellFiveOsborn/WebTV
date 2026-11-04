# WebTV v2 (frontend)

Front-end local da **v2** do WebTV. O objetivo inicial desta v2 e **validar o parser**
que extrai a listagem de canais de `https://embedcanais.online/`.

## Como funciona

O site `embedcanais.online` nao expoe API: a listagem completa de canais esta
embutida no HTML como um array JavaScript literal:

```html
<script>
const CHANNELS=[{"id":1,"slug":"amazonprimevideo","name":"Amazon Prime","category":"Esportes","href":"...","image":"...","iframe":"<iframe ...>"}];
const categoryOrder=['Canais Abertos','Variedades','Esportes','Filmes e Séries','Infantil','Notícias','Religiosos'];
const categoryLabels={'Variedades':'Entretenimento'};
</script>
```

O parser (`shared/parseEmbedcanais.mjs`) extrai esses literais **sem `eval()` e sem
`new Function()`** (restricao do validador de scripts de injecao do WebTV), usando
um scanner que respeita strings e escapes.

### Tres vias de obtencao do catalogo

| Via | Quando | Como |
|---|---|---|
| `cache` | Padrao (localStorage) | Ultimo catalogo salvo no navegador. Dentro do TTL **nao ha requisicao nenhuma**. |
| `api` | Producao (principal) | Backend Node no **Netlify** (Function `channels`). Busca o site no servidor (sem restricao de CORS) e devolve JSON limpo com `Access-Control-Allow-Origin: *`. **Resolve o CORS de vez.** |
| `live` | Dev local | `fetch` direto ao site, via proxy do Vite (mesma origem => sem CORS). Tambem funciona se o site liberar CORS no futuro. |
| `snapshot` | Build (fallback) | `npm run fetch:channels` baixa o site no build e gera `public/data/embedcanais.json`, servido como arquivo estatico. |

O app le o **cache local** e o **snapshot do build** primeiro (instantaneo, sem
rede) e so entao consulta as vias online. A UI sempre mostra qual via forneceu
os dados + o log de tentativas.

> **Por que um backend proprio:** `embedcanais.online` **nao envia headers CORS**.
> Testado em browser real, o `fetch` direto e bloqueado pela Same-Origin Policy.
> Como GitHub Pages e 100% estatico (sem Node/Bun no runtime), nao existe proxy
> proprio em producao. Os proxies publicos de CORS sao instaveis (522/520) e
> falham justamente quando o header `Origin` e enviado - ou seja, falham
> exatamente no caso do browser. A Function no Netlify e a unica via confiavel
> em producao estatica.
>
> Detalhes do backend em [`../backend/README.md`](../backend/README.md).

### Trocar a URL da API sem publicar nada

A URL da API fica **embutida no bundle** (`VITE_API_URL`). Isso significa que
trocar a API exigiria rebuild + deploy - ou seja, um push a cada queda.

Para evitar isso, a v2 tem um **override local** da URL da API:

- A tela de **fallback** (quando a API cai e nao ha cache para renderizar)
  deixa trocar a URL **na hora**, com o teclado virtual do controle remoto.
- O painel de **configuracoes** tem o mesmo campo, para trocar a API a
  qualquer momento.
- O override fica no storage unificado (namespace `apiUrl`) e **vence** a URL
  do build. Ele e local: **nao altera o bundle publicado** - serve para o
  aparelho do usuario continuar funcionando enquanto a API oficial volta.

**So a base e necessaria.** O app acrescenta o `/channels` sozinho:

| O usuario digita | O app consulta |
|---|---|
| `https://api.exemplo.com` | `https://api.exemplo.com/channels` |
| `https://api.exemplo.com/v1` | `https://api.exemplo.com/v1/channels` |
| `https://api.exemplo.com/channels` | `https://api.exemplo.com/channels` |

> **O que aparece no campo:** a URL BASE em uso (a do build ou a que o
> usuario trocou). O path `/channels` e responsabilidade do app - quem
> configura a API informa so o host.

> **Quando a tela de fallback aparece:** SO quando nao ha nada para
> renderizar - nem cache local, nem snapshot do build, nem rede. Com o
> cache ou o snapshot disponivel, a app mostra o catalogo velho e avisa que
> a atualizacao online falhou.

## Interface

A v2 replica o visual de um catalogo de streaming (referencia: tela "Top 10").

| Elemento | Onde | O que faz |
|---|---|---|
| Bloco "Top 10" | Home | Card grande do #1 com o numero gigante ao fundo + os demais em rolagem horizontal. |
| Linhas horizontais | Home | Uma linha por categoria, com setas de navegacao (aparecem no hover). |
| Grid | Categoria / busca | Todos os canais da categoria ou do resultado da busca. |
| Busca | Icone na barra superior | Abre uma tela cheia com teclado virtual (celular) e **microfone** (Web Speech API, `pt-BR`). |
| Configuracoes | Icone de engrenagem | Modal dialog (fundo desfocado, foco preso, navegacao por setas) com tema, acoes de cache e a **URL da API**. |
| Tela de fallback | So quando nao ha dados | Explica a falha e permite **trocar a URL da API** (com teclado virtual). |

**Clique no canal** abre o endereco *redirect* do catalogo
(`https://embedcanaisdetv.xyz/e/index.php?canal=<slug>/`) em nova aba - e o
player do canal no site de origem.

## Events API (integracao com o app Kotlin)

A v2 fala com o app Android pela **Events API** - o mesmo contrato da v1
(documentado em [`../frontend/docs/EVENTS_API.md`](../frontend/docs/EVENTS_API.md)).

O Kotlin expoe `window.WebTVBridge` (`addJavascriptInterface`) e assina
`window.WebTV.events`. Cada evento da v2 chega no Kotlin como
`WebTVBridge.onXxx(JSON.stringify(payload))`.

### O payload vai no nivel raiz

Este e o ponto mais importante do contrato. O guard do Kotlin faz:

```js
window.WebTV.events.on('channel:clicked', (event) => {
  const channelId = event.id;              // <- payload-level
  WebTVBridge.onChannelClicked(JSON.stringify(event));
});
```

E o `WebTVBridge` le `json.getString("id")` no **nivel raiz** do JSON. Se o
listener recebesse `{type, payload, timestamp}`, o `id` estaria um nivel
abaixo e o Kotlin lancaria `JSONException`.

Por isso o `on()` da v2 entrega o **payload**, e nao o evento inteiro - o
mesmo contrato do `appBridge.js` que o proprio Kotlin injeta.

### Eventos emitidos pela v2

| Evento | Quando | Payload |
|---|---|---|
| `app:loaded` | Catalogo carregado | `{channels, categories, timestamp}` |
| `channel:clicked` | Clique num card | `{id, name, type}` (`id`/`name`/`type` no nivel raiz) |
| `scripts:loaded` | Scripts baixados | `{scripts: [...]}` - o Kotlin indexa por canal/URL/dominio |
| `scripts:preloaded` | Antes de abrir um canal | `{url, scripts: [...]}` - os scripts que valem para a URL |
| `search:changed` | Termo da busca mudou | `{query}` |
| `category:changed` | Categoria escolhida | `{categoryId, categoryName}` |
| `navigated:home` | Volta para a home | `{timestamp}` |
| `channel:closing` / `player:closed` / `channel:close` | Fecha o canal | `{channelId, channelName, timestamp}` |

### `window.WebTV.channel`

API que o Kotlin e o site carregado no WebView chamam para fechar o canal:

```js
window.WebTV.channel.close()   // fecha o canal e avisa o Kotlin
```

### Detalhes que exigem cuidado

| Caso | Como foi resolvido |
|---|---|
| **O flag `__webtvAppBridgeInjected`** | O guard do Kotlin so assina os eventos quando `window.WebTV`, `window.WebTV.events` **e** `window.__webtvAppBridgeInjected` existem. A v2 liga o flag no `installEventBus()` - senao o Kotlin nunca receberia nada. |
| **A `appBridge.js` do Kotlin** | Ela sai cedo se o flag estiver ligado (`if (window.__webtvAppBridgeInjected) return;`) e assim **nao sobrescreve** o bus da v2. Se ela chegar primeiro (ordem invertida), a v2 **preserva** o bus do Kotlin e envolve o `emit` dele. As duas ordens funcionam. |
| **`channel:close` x `onChannelClosed`** | O Kotlin expoe `onChannelClosed` (com "d"), mas o evento se chama `channel:close`. A conversao automatica geraria `onChannelClose` - que nao existe. Ha um mapa de excecoes em `lib/events.ts`. |
| **Corrida do `app:loaded`** | O Kotlin assina no `onPageFinished`; a v2 resolve o catalogo do cache local em milissegundos. O `app:loaded` (e o `scripts:loaded`) sao guardedos por `emitWhenBridgeReady()`, que espera o flag `__webtvListenersActive` do Kotlin. |
| **Nao emitir `player:opened`** | Ele faz o Kotlin injetar os scripts **imediatamente**. No fluxo `redirect` a pagina do canal ainda nao carregou - a injecao cairia na pagina da v2, e o script do player substitui o documento inteiro (destruindo a UI). A injecao acontece no `onPageFinished` do Kotlin, na pagina do canal. |
| **Evitar laco de eventos** | O `emit` da v2 **nao** chama o `WebTVBridge` diretamente: quem encaminha e o guard que o Kotlin instala. Se o `emit` chamasse o bridge, os eventos injetados pelo Kotlin voltariam como `player:closed` -> `onPlayerClosed` -> re-emissao -> laco. |
| **Os scripts de injecao** | Vem do mesmo gist da v1 (mesma fonte, sem divergencia). O gist envia `Access-Control-Allow-Origin: *`, entao a v2 le direto do browser. |
| **O player simples nao vem do gist** | O gist tem o script, mas indexado pelos ids de canal da **v1** (`1779525189328`) e pelas URLs do Gist - nenhum casa com a chave da v2 (`${id}-${slug}`). A v2 entrega o seu proprio, indexado pelo canal (ver abaixo). |
| **A ordem do `scripts:loaded`** | O `channelScripts` do Kotlin e um LRU de **50** entradas, e o gist traz **70 `channelIds`** - que enchem o LRU e expulsam o canal da v2. Por isso o payload vai **gist primeiro, scripts da v2 depois**: o canal indexado por ultimo fica como a entrada mais recente. Ver `lib/useBridge.ts`. |

## Scripts de injecao (o que o Kotlin injeta na pagina do canal)

A v2 entrega dois scripts proprios ao app Kotlin, alem dos que vem do gist.
Os dois sao indexados pelo **canal aberto** (`channelIds`), que e o caminho
rotation-proof: o player do embedcanais roda em subdominio numerico
rotativo (`2910.` -> `4477.`...) e o Kotlin casa o dominio **exato**.

| Script | Id | O que faz |
|---|---|---|
| Remover banner VIP | `webtv-vip-banner-remover` | Esconde e remove o `#vipModal` (que reaparece a cada 60 s). |
| Player simples | `webtv-embedcanais-simple-player` | Troca o player pesado (Clappr + Hls.js + P2P) por um `<video>` unico com Hls.js. |

### O player simples

O codigo vem de `src/lib/embedcanais-simple-player.js`, que nasceu do
script da v1 (`frontend/docs/scripts/embedcanais-simple-player.js`) e foi
evoluido na v2: sem o selo "LIVE", sem controles nativos e com a faixa de
informacoes do canal. O arquivo e importado com `?raw` e embutido no
bundle - sem `eval`, sem `new Function`.

O `simplePlayerScript()` aceita `channel: { name, image }` e embute esses
dados num prefixo `window.__webtv_channel_info` antes do corpo do script.
O nome e o logo vem do catalogo da v2; a pagina do player so expoe o slug.

O que ele faz, em resumo:

1. **Descobre a URL do manifesto** pelo proprio player (sem interceptar
   XHR): `window.vipPlayer.options.source` -> `core.getCurrentPlayback()._hls.url`
   -> `window.vipCdnHost` + slug -> `performance.getEntriesByType('resource')`
   -> `?src=` -> `<video>.currentSrc` -> scripts inline.
2. **Destroi o player original**: `vipP2PEngine.destroy()`, `vipPlayer.destroy()`,
   e trava o `vipPlayer.load()` (o monitor `vipStreamRecovery` recriava
   sessao HLS a cada ~8 s).
3. **Monta um DOM minimo**: um `<video>` em tela cheia, sem controles, mais
   um overlay de erro.
4. **Toca com Hls.js** (config otimizada para Android TV com 1,5 GB de RAM).
5. **Mostra a faixa de informacoes do canal** no OK/Enter do controle:
   nome, logo e hora atual, no estilo de receptor de TV por assinatura. A
   faixa ocupa a metade inferior da tela e some sozinha depois de 6 s.
6. **Mantem o contrato `window.WebTV.player.*`** (`play`, `pause`, `seek`,
   `volumeUp`, `getStatus`, `quality`, ...) que o app usa.

O E2E (`tests/verify-simple-player.mjs`) verifica o fluxo completo no
player real: o DOM e trocado, o player original e destruido, o stream
**toca** e o banner nao existe.

## Navegacao por D-pad (controle remoto do Android TV)

Toda a interface e navegavel pelo controle remoto. O motor vive em
`src/lib/dpad.ts` (nucleo puro, sem React) + `src/components/DpadContext.tsx`
(estado do foco).

### Como funciona

O D-pad funciona com **grupos** e **camadas**:

| Conceito | O que e | Onde |
|---|---|---|
| **Grupo** | Um conjunto de itens da mesma tela. As setas andam dentro dele. | Barra superior, Top 10, cada linha de canais, grid. |
| **Camada** | Um modal por cima (configuracoes, busca). Enquanto ela estiver no topo, as setas **nao vazam** para a pagina de tras. | `ModalDialog`, `SearchOverlay`. |

Regras:

- **Esquerda/Direita** andam dentro do grupo atual (uma linha de canais e
  horizontal). No grid, quando nao ha nada a direita, avanca para o proximo
  item (como um controle remoto de verdade).
- **Cima/Baixo** mudam de grupo: o vizinho na ordem do DOM e escolhido
  preservando a **coluna** (a posicao horizontal) do foco.
- **Alinhamento manda**: o alvo na direcao pedida que esta mais alinhado com
  o foco ganha (heuristica espacial em `lib/dpad.ts`).
- **Enter/OK** ativa o item em foco (o clique nativo).
- **Esc/Back** sobe um nivel: fecha o modal, sai da busca.
- A direcao e **estrita**: no fim de uma lista o foco **para** - ele nao da
  a volta nem troca de direcao.

### Foco visual

O foco **nao e um contorno**. E um *highlight*: o item em foco ganha
elevacao (escala + sombra) e os **vizinhos perdem cor e opacidade**. O olho
vai direto para o item ativo - e o visual fica limpo, no estilo Apple TV.

| Onde | Item em foco | Vizinhos |
|---|---|---|
| Cards (linhas e grid) | `scale(1.08)` + sombra de elevacao | `opacity: .32` + `saturate(.3)` |
| Bloco Top 10 | `scale(1.03)` (o card #1 ja e grande) | `opacity: .32` + `saturate(.3)` |
| Barra superior | peso 700 + cor plena | `opacity: .45` (texto: precisa continuar legivel) |
| Botoes do modal | `translateY(-1px) scale(1.02)` + sombra | `opacity: .45` |
| Teclado virtual | cor de acento + `scale(1.06)` | `opacity: .4` + `saturate(.4)` |
| **Toggle do tema** | **halo no botao deslizante** | `opacity: .45` |

O esmaecimento dos vizinhos usa `:has()` no container do grupo (o motor
sabe qual elemento esta focado via a classe `.dpad-focused`). Onde o
navegador nao suportar `:has()`, o foco continua funcionando - so nao ha o
esmaecimento.

> **O toggle e a excecao:** o destaque dele e um halo no **botao deslizante**
> (o `::after`), nao um contorno no switch - e o switch em si nao escala.
> Escalar um interruptor pareceria "estragado".

### Detalhes que exigem cuidado

| Caso | Como foi resolvido |
|---|---|
| **Rolagem infinita** | A linha e uma janela virtual: o card vizinho pode nao estar montado. A linha recentraliza a janela e devolve `pending`; o motor espera o remount e o foco segue para o item recem-montado (`pendingIndexRef`). |
| **Alinhamento no snap** | O `revealElement` alinha o item no ponto de `scroll-snap` do container (e nao numa rolagem minima) e desliga o snap durante o ajuste - senao o navegador re-snapa e puxa o item para fora do foco. |
| **Teclado virtual** | Na TV (`pointer: coarse`) o teclado virtual e o metodo de entrada: as setas navegam entre as teclas e o foco do D-pad fica na tecla ativa. O campo de texto nao recebe foco (evita o teclado do SO). |
| **Clique do mouse** | Tambem move o foco do D-pad - senao o controle remoto "pularia" para outro lugar depois de navegar com o mouse. |
| **`outline` nativo** | Desligado (o anel branco do navegador). O destaque e desenhado com `box-shadow`, que nao e cortado pelo `overflow` dos carrosséis. |

### Tema (claro / escuro)

O tema **escuro** e o padrao. O toggle fica no modal de configuracoes e a
preferencia e salva em `localStorage` (`webtv:v2:theme`). As cores vem de
variaveis CSS (`html[data-theme]`), entao a troca e instantanea e nao ha
"flash" no carregamento (um script no `index.html` aplica o tema salvo
antes da primeira pintura).

O tema claro segue o estilo Apple TV: fundo off-white, contraste suave,
nenhum branco puro. Logos brancos com fundo transparente (Apple TV,
Discovery Channel, Adult Swim...) recebem um halo discreto via
`drop-shadow`, senao sumiriam no card claro.

## Cache local (localStorage)

O catalogo muda com pouca frequencia, entao a v2 guarda o ultimo resultado em
`localStorage` (chave `webtv:v2:catalog`) e **nao consulta a API a cada
abertura**. O padrao e *stale-while-revalidate*:

| Situacao | Comportamento |
|---|---|
| Cache dentro do TTL (30 min) | Renderiza do cache. **Zero requisicoes de rede.** |
| Cache expirado | Renderiza o dado velho e revalida em background. |
| Sem cache | Usa o snapshot do build e revalida em background. |
| Cache + rede fora | Mantem o dado velho em tela e avisa que nao conseguiu atualizar. |

Detalhes:

- **TTL:** 30 minutos, configuravel por `VITE_CACHE_TTL_MS` (ms). Ver
  `.env.example`.
- **Idade maxima de uso:** 7 dias. Passado isso, o cache e descartado (dado
  velho demais nao e confiavel).
- **O snapshot do build nao sobrescreve o cache.** Ele e um artefato antigo: a
  idade do dado e o `generatedAt` do arquivo, nao o momento da leitura.
- **Botoes na UI:** "Atualizar (ignora cache)" e "Limpar cache".
- O storage pode nao existir (modo privado) ou falhar (quota). Nesse caso o app
  funciona normalmente, so sem cache.

Modulos envolvidos:

| Arquivo | Papel |
|---|---|
| `src/lib/catalogCache.ts` | Leitura/escrita do localStorage, TTL, validacao do formato. |
| `src/lib/catalogLoader.ts` | Decide QUANDO tocar a rede (cache -> snapshot -> rede). |
| `src/lib/catalogSource.ts` | Decide COMO buscar (api -> live -> cors -> snapshot). |

## Scripts

```powershell
# Instalar
npm install

# Dev (porta 3001) - SEMPRE em background
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"E:\Dev Workspace\WebTV\frontend-v2`" && npm run dev > C:\Users\canal\AppData\Local\Temp\opencode\vite-v2.log 2>&1" -WindowStyle Hidden

# Build (inclui fetch do catalogo)
npm run build

# Build sem rede (usa o snapshot commitado)
npm run build:offline

# Testes (unitarios + live contra o site real)
npm test

# Testes do cache local (11 casos)
npm run test:cache

# E2E do cache no browser real (exige Edge com CDP + dev server no ar)
$env:CDP_URL = "http://127.0.0.1:9333"
npm run test:cache:e2e

# Lint
npm run lint
```

## Testes

- `tests/parseEmbedcanais.test.mjs` - unitarios do parser (11 casos).
- `tests/fetchChannels.test.mjs` - baixa o site real e valida a extracao.
  Se a rede falhar, o teste e *skipped* (nao reprova) para nao quebrar o build.
- `tests/catalogCache.test.mjs` - 11 casos do cache local (TTL, JSON corrompido,
  storage que lanca, versao do formato, etc.).
- `tests/storage.test.mjs` - 16 casos do storage unificado (IndexedDB +
  fallback, namespaces, migracao).
- `tests/theme.test.mjs` - 8 casos do tema (padrao, persistencia, fallback).
- `tests/usage.test.mjs` - 7 casos do historico de uso.
- `tests/ranking.test.mjs` - 14 casos do ranking inteligente.
- `tests/dpad.test.mjs` - 12 casos da heuristica espacial do D-pad (nucleo
  puro, roda em Node).
- `tests/cache.e2e.test.mjs` - E2E no browser real via CDP do Edge: 1a carga
  consulta a API, 2a carga usa o cache com **zero** requisicoes, cache expirado
  revalida. Precisa do dev server e do backend local no ar.
- `../backend/tests/server.test.mjs` - 4 casos do backend (CORS, preflight,
  404, 502 com upstream invalido).

### Verificacoes de D-pad no browser (via CDP do Edge)

```powershell
$env:CDP_URL = "http://127.0.0.1:9333"

node frontend-v2/tests/verify-dpad.mjs         # geral: barra, Top 10, linhas, modal
node frontend-v2/tests/verify-dpad-navbar.mjs  # ordem estrita na barra (regressao)
node frontend-v2/tests/verify-dpad-rows.mjs    # ordem estrita nos carrosseis
node frontend-v2/tests/verify-dpad-grid.mjs    # grid (4 direcoes) + busca
node frontend-v2/tests/verify-dpad-ok.mjs      # Enter/OK ativa o item em foco
```

Resultado atual contra o site real: **156 canais / 7 categorias**.

## Estrutura

```
frontend-v2/
├── src/
│   ├── App.tsx                  # UI + Provider do D-pad
│   ├── lib/
│   │   ├── parseEmbedcanais.ts  # re-export tipado do parser compartilhado
│   │   ├── catalogSource.ts     # COMO buscar: api / live / cors / snapshot
│   │   ├── catalogLoader.ts     # QUANDO buscar: cache -> snapshot -> rede
│   │   ├── catalogCache.ts      # cache local (IndexedDB) + TTL
│   │   ├── apiUrl.ts             # override da URL da API (local, sem rebuild)
│   │   ├── storage.ts           # storage unificado (IndexedDB + localStorage)
│   │   ├── ranking.ts           # ranking inteligente do Top 10
│   │   ├── usage.ts             # historico de uso dos canais
│   │   ├── theme.ts             # tema claro/escuro
│   │   ├── dpad.ts              # MOTOR do D-pad (nucleo puro, sem React)
│   │   ├── injectionScripts.ts  # script do banner VIP (injetado pelo Kotlin)
│   │   ├── simplePlayerScript.ts # script do player simples (EmbedDeCanais)
│   │   ├── embedcanais-simple-player.js # script do player simples (via ?raw)
│   │   ├── scripts.ts           # scripts do gist (fonte da v1)
│   │   └── useBridge.ts         # ponte com o app Kotlin (Events API)
│   ├── components/
│   │   ├── DpadContext.tsx      # provider do D-pad (foco, grupos, camadas)
│   │   ├── useDpad.ts           # hooks publicos (useDpad, useDpadGroup)
│   │   ├── Header.tsx           # barra superior + busca em tela cheia
│   │   ├── TopRow.tsx           # bloco "Top 10"
│   │   ├── Row.tsx              # linha de canais (rolagem infinita)
│   │   ├── ChannelCard.tsx      # card de canal
│   │   ├── ModalDialog.tsx      # modal dialog (camada do D-pad)
│   │   ├── SettingsPanel.tsx    # conteudo do modal de configuracoes
│   │   ├── ApiFallbackScreen.tsx # tela de fallback (API fora do ar, sem cache)
│   │   ├── ApiUrlField.tsx      # campo da URL da API (com teclado virtual)
│   │   └── VirtualKeyboard.tsx  # teclado virtual (on-screen)
│   ├── main.tsx
│   └── styles.css
├── scripts/
│   └── fetch-channels.mjs       # gera o snapshot no build (roda Node no CI)
├── public/data/embedcanais.json # snapshot versionado (fallback)
└── tests/
```

## Deploy

- **Frontend:** `.github/workflows/deploy-frontend.yml` - build no GitHub
  Actions (Node roda no CI, nunca no runtime), publica v1 na raiz e v2 em
  `/v2/` do **mesmo** Pages.
  URL: <https://hellfiveosborn.github.io/WebTV/v2/>
- **Backend:** Netlify Function em `netlify/functions/channels.mjs` (ver
  `../backend/README.md`). A URL publica entra no build via a var de
  repositorio **`VITE_API_URL`** (definida como
  `https://webtv-api.netlify.app/channels`). Sem essa var, o frontend cai para
  o snapshot do build.

> **A URL da API pode ser trocada em runtime.** A var do repositorio define o
> PADRAO do build; o usuario pode apontar para outra API na tela de fallback
> (ou no painel de configuracoes) sem nenhum deploy. Ver "Trocar a URL da API
> sem publicar nada".

> **Um workflow so.** `actions/upload-pages-artifact` envia o site inteiro, entao
> dois workflows publicando no mesmo Pages sobrescrevem um ao outro (o ultimo a
> terminar vence). A v1 e a v2 sao montadas em subpastas dentro de um unico
> artifact. Nao recrie um workflow separado para a v2.

## Pendencias conhecidas

- **Slug duplicado no site de origem:** `tnt` aparece em dois canais
  (id 69 em *Esportes* e id 97 em *Filmes e Series*) com a mesma URL. O parser
  reproduz o dado como no site; a chave de renderizacao usa `id`, nao `slug`.
- A via `live` em producao falha com CORS (o site nao envia o header). A API
  no Netlify e o snapshot cobrem esse caso. Se a CORS for liberada no site, a
  via `live` passa a valer.

## WebAssembly: nao resolve o problema de CORS

Foi verificado se WebAssembly resolveria o acesso ao site. **Nao resolve**, e o
motivo e architectural, nao de performance:

**WASM nao tem acesso a rede proprio.** O runtime `js/wasm` nao possui sockets.
O `net/http` do Go em WASM acaba chamando `fetch()` do browser:

```
src/net/http/roundtrip_js.go:129
    fetchPromise := js.Global().Call("fetch", req.URL.String(), opt)
```

Ou seja, o request do Go/WASM passa pela **mesma** verificacao de CORS do
browser. Confirmado empiricamente: com um harness que aplica a regra do browser
(sem `Access-Control-Allow-Origin` -> bloqueia), o fetch do Go/WASM falha
exatamente como o fetch JS.

**`mode: "no-cors"` nao salva.** O Go permite setar `mode` via header especial
`js.fetch:mode`, mas `no-cors` entrega resposta **opaca** (sem corpo legivel).
Nao da para extrair a listagem.

**E o parse em si ja e rapido em JS.** O HTML de ~100KB e parseado em ~1.5ms
pelo parser atual. Nao ha gargalo de performance a resolver, entao WASM nao
traria ganho pratico (um prototipo em Go chegou a ser ~3x mais lento que o JS,
 alem de custar ~1.7MB de binario e ~37ms de startup).

**Onde WASM faria sentido:** se o parser crescesse muito (ex.: processar
multiplos MB de HTML) ou se precisasse rodar fora da thread principal (Web
Worker). Para extrair uma listagem de 156 canais, nao.

O problema real nao e poder de processamento - e a **ausencia de headers CORS**
em `embedcanais.online`. Isso e uma politica do servidor, que nenhum codigo
client-side contorna. As saidas reais sao:

| Opcao | Custo |
|---|---|
| **Snapshot no build** (implementado) | Node no CI - zero runtime no browser |
| Backend/edge function proprio | Cloudflare Worker etc. - resolve CORS de vez |
| Pedir CORS ao dono do site | depende do willingness do site |
