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
| `api` | Producao (principal) | Backend Node na **Suga**. Busca o site no servidor (sem restricao de CORS) e devolve JSON limpo com `Access-Control-Allow-Origin: *`. **Resolve o CORS de vez.** |
| `live` | Dev local | `fetch` direto ao site, via proxy do Vite (mesma origem => sem CORS). Tambem funciona se o site liberar CORS no futuro. |
| `snapshot` | Build (fallback) | `npm run fetch:channels` baixa o site no build e gera `public/data/embedcanais.json`, servido como arquivo estatico. |

O app **renderiza o snapshot imediatamente** e **consulta as vias online em
paralelo**. Se a API (ou o site direto) responder, os dados frescos substituem
o snapshot. A UI sempre mostra qual via forneceu os dados + o log de tentativas.

> **Por que o backend na Suga:** `embedcanais.online` **nao envia headers CORS**.
> Testado em browser real, o `fetch` direto e bloqueado pela Same-Origin Policy.
> Como GitHub Pages e 100% estatico (sem Node/Bun no runtime), nao existe proxy
> proprio em producao. Os proxies publicos de CORS sao instaveis (522/520) e
> falham justamente quando o header `Origin` e enviado - ou seja, falham
> exatamente no caso do browser. O backend na Suga e a unica via confiavel em
> producao estatica.
>
> Detalhes do backend em [`../backend/README.md`](../backend/README.md).

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

# Lint
npm run lint
```

## Testes

- `tests/parseEmbedcanais.test.mjs` - unitarios do parser (11 casos).
- `tests/fetchChannels.test.mjs` - baixa o site real e valida a extracao.
  Se a rede falhar, o teste e *skipped* (nao reprova) para nao quebrar o build.
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
│   │   └── catalogSource.ts     # fontes: api / live / cors / snapshot
│   ├── main.tsx
│   └── styles.css
├── scripts/
│   └── fetch-channels.mjs       # gera o snapshot no build (roda Node no CI)
├── public/data/embedcanais.json # snapshot versionado (fallback)
└── tests/
```

## Deploy

- **Frontend:** `.github/workflows/deploy-frontend-v2.yml` - build no GitHub
  Actions (Node roda no CI, nunca no runtime), publica o `dist/` no GitHub Pages.
  URL: <https://hellfiveosborn.github.io/WebTV/>
- **Backend:** Deno Function na Suga (ver `../backend/README.md`). A URL publica
  entra no build via a var de repositorio **`VITE_API_URL`** (definida como
  `https://eje2jjyhdwfy-production-whwjs283.us-central1.suga.run/channels`).
  Sem essa var, o frontend cai para o snapshot do build.

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
