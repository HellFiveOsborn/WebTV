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
| `api` | Producao (principal) | Backend Node na **Suga**. Busca o site no servidor (sem restricao de CORS) e devolve JSON limpo com `Access-Control-Allow-Origin: *`. **Resolve o CORS de vez.** |
| `live` | Dev local | `fetch` direto ao site, via proxy do Vite (mesma origem => sem CORS). Tambem funciona se o site liberar CORS no futuro. |
| `snapshot` | Build (fallback) | `npm run fetch:channels` baixa o site no build e gera `public/data/embedcanais.json`, servido como arquivo estatico. |

O app le o **cache local** e o **snapshot do build** primeiro (instantaneo, sem
rede) e so entao consulta as vias online. A UI sempre mostra qual via forneceu
os dados + o log de tentativas.

> **Por que o backend na Suga:** `embedcanais.online` **nao envia headers CORS**.
> Testado em browser real, o `fetch` direto e bloqueado pela Same-Origin Policy.
> Como GitHub Pages e 100% estatico (sem Node/Bun no runtime), nao existe proxy
> proprio em producao. Os proxies publicos de CORS sao instaveis (522/520) e
> falham justamente quando o header `Origin` e enviado - ou seja, falham
> exatamente no caso do browser. O backend na Suga e a unica via confiavel em
> producao estatica.
>
> Detalhes do backend em [`../backend/README.md`](../backend/README.md).

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
- `tests/cache.e2e.test.mjs` - E2E no browser real via CDP do Edge: 1a carga
  consulta a API, 2a carga usa o cache com **zero** requisicoes, cache expirado
  revalida. Precisa do dev server e do backend local no ar.
- `../backend/tests/server.test.mjs` - 4 casos do backend (CORS, preflight,
  404, 502 com upstream invalido).

Resultado atual contra o site real: **156 canais / 7 categorias**.

## Estrutura

```
frontend-v2/
├── src/
│   ├── App.tsx                  # UI minimalista de validacao
│   ├── lib/
│   │   ├── parseEmbedcanais.ts  # re-export tipado do parser compartilhado
│   │   ├── catalogSource.ts     # COMO buscar: api / live / cors / snapshot
│   │   ├── catalogLoader.ts     # QUANDO buscar: cache -> snapshot -> rede
│   │   └── catalogCache.ts      # cache local (localStorage) + TTL
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
- **Backend:** Deno Function na Suga (ver `../backend/README.md`). A URL publica
  entra no build via a var de repositorio **`VITE_API_URL`** (definida como
  `https://eje2jjyhdwfy-production-whwjs283.us-central1.suga.run/channels`).
  Sem essa var, o frontend cai para o snapshot do build.

> **Um workflow so.** `actions/upload-pages-artifact` envia o site inteiro, entao
> dois workflows publicando no mesmo Pages sobrescrevem um ao outro (o ultimo a
> terminar vence). A v1 e a v2 sao montadas em subpastas dentro de um unico
> artifact. Nao recrie um workflow separado para a v2.

## Pendencias conhecidas

- **Slug duplicado no site de origem:** `tnt` aparece em dois canais
  (id 69 em *Esportes* e id 97 em *Filmes e Series*) com a mesma URL. O parser
  reproduz o dado como no site; a chave de renderizacao usa `id`, nao `slug`.
- A via `live` em producao falha com CORS (o site nao envia o header). A API
  na Suga e o snapshot cobrem esse caso. Se a CORS for liberada no site, a via
  `live` passa a valer.

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
