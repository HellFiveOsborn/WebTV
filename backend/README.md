# Backend WebTV - proxy do catalogo (Suga)

Container Node que busca a listagem de canais em `https://embedcanais.online/`
e devolve **JSON limpo com CORS liberado**.

## Por que existe

`embedcanais.online` **nao envia headers CORS**. Testado em browser real, um
`fetch` direto do site e bloqueado pela Same-Origin Policy:

```
Access to fetch at 'https://embedcanais.online/' from origin '...'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

O frontend v2 e estatico (GitHub Pages, sem Node no runtime), entao nao ha proxy
proprio em producao. Este servico roda em Node **no servidor** (sem restricao
de CORS na saida) e resolve o problema de vez.

## API

| Rota | Descricao |
|---|---|
| `GET /channels` | Catalogo completo em JSON |
| `GET /channels?fresh=1` | Ignora o cache e re-busca o site |
| `GET /health` | Status (canais em cache, idade do cache) |
| `OPTIONS *` | Preflight -> 204 + headers CORS |

### Resposta de `/channels`

```json
{
  "generatedAt": "2026-11-03T20:10:00.000Z",
  "source": "https://embedcanais.online/",
  "cached": false,
  "count": 156,
  "categories": ["Canais Abertos", "Variedades", "..."],
  "categoryOrder": ["..."],
  "categoryLabels": { "Variedades": "Entretenimento" },
  "channels": [
    {
      "id": 1,
      "slug": "amazonprimevideo",
      "name": "Amazon Prime",
      "category": "Esportes",
      "href": "https://embedcanaisdetv.xyz/e/index.php?canal=amazonprimevideo/",
      "image": "https://1.embedcanaisdetv.com/images/amazonprimevideo.png",
      "iframe": "<iframe src=\"...\" ...></iframe>"
    }
  ]
}
```

## Comportamento

- **Cache em memoria** de 10 min (`CACHE_TTL_MS`). O catalogo muda pouco; isso
  evita martelar o site de origem.
- **Cache stale como fallback**: se a re-busca falhar mas existe cache, devolve
  o cache com `"stale": true` e um `warning`, em vez de erro.
- **Sem cache e com upstream fora do ar** -> 502 em JSON.

## Variaveis de ambiente

| Variavel | Padrao | Descricao |
|---|---|---|
| `PORT` | `8080` | Porta HTTP |
| `EMBEDCANAIS_SOURCE_URL` | `https://embedcanais.online/` | Origem a consultar |
| `CACHE_TTL_MS` | `600000` | TTL do cache (10 min) |
| `UPSTREAM_TIMEOUT_MS` | `15000` | Timeout da consulta ao site |

## Rodar local

```powershell
# Node puro
Set-Location ./backend; node server.mjs

# Docker
docker build -f backend/Dockerfile -t webtv-backend .
docker run -p 8080:8080 webtv-backend
```

## Testes

```powershell
Set-Location ./backend; node --test tests/server.test.mjs
```

Cobrem: `/health`, `/channels` com CORS, preflight `OPTIONS`, 404 e 502 com
upstream invalido.

## Deploy na Suga

> **Status: implantado.** Deno Function `backend` no ambiente `production` do
> projeto `international-warbler` (org `quaint-aardvark`, tier hobby).
> URL publica: `https://eje2jjyhdwfy-production-whwjs283.us-central1.suga.run`

### Por que Deno Function (e nao container)

O plano **hobby** (gratis) tem duas travas para build from source:
- **GitHub App**: precisa ser instalado pelo usuario na UI (o MCP nao pode
  iniciar esse fluxo).
- **Imagem de registry**: exige plano pago.

A Suga aceita **Deno Functions com codigo inline**, o que dispensa as duas.
O codigo e gerado por `scripts/build-suga-function.mjs`, que embute
`shared/parseEmbedcanais.mjs` - assim existe **uma unica implementacao** do
parser (frontend, backend container, function e script de build).

O container em `backend/` (com Dockerfile) continua valido e e a opcao
preferida se voce subir de plano (ou instalar o GitHub App): tem hot-rebuild via
push, enquanto o codigo inline da function precisa ser reenviado a cada
mudanca.

### Pelo dashboard (caminho geral)

1. **Install the Suga GitHub App** (dashboard -> Connect GitHub). Obrigatorio
   para build from source - o agente nao pode iniciar esse fluxo sozinho.
2. **New project -> Connect GitHub** -> repositorio `HellFiveOsborn/WebTV`.
   - Branch: `main`
   - Build method: `Dockerfile`
   - Dockerfile path: `backend/Dockerfile`
   - Root directory: `/` (raiz do repo - o parser compartilhado esta em `shared/`)
3. **Config -> Public Networking -> Generated URL -> Add**, target port `8080`.
4. **Apply** (canto superior direito). O agente **nao pode** aplicar - voce revisa
   o diff e clica.

### Pelo agente (MCP)

Depois de autenticar o MCP do Suga, o prompt equivalente e:

```markdown
Deploy o backend WebTV na Suga usando o MCP do Suga.
Repo: HellFiveOsborn/WebTV  Branch: main
Porta do servidor: 8080

Use a organizacao existente, crie um projeto novo "webtv-backend".
Adicione um container "backend" com Dockerfile em backend/Dockerfile,
contexto de build na raiz do repo, porta 8080, e um endpoint HTTPS publico
na mesma porta.
```

O agente devolve um **deeplink** para o ambiente. Voce abre, revisa o diff e
clica em **Apply**.

> O MCP **nao tem tool de deploy** - por design, o agente nunca aplica. Ele
> prepara o draft e devolve o deeplink.

### Variar o codigo da function

```powershell
# 1. edite shared/parseEmbedcanais.mjs
# 2. regenere o codigo da function
node scripts/build-suga-function.mjs
# 3. valide localmente (stub de Deno, sem precisar do runtime)
node scripts/test-suga-function.mjs
# 4. reenvie ao draft (replace_draft com type: "function")
```

### Limites do plano (hobby) — atendidos

- 0.1 CPU / 128 MiB por servico. Consumo medido: **~0.02 vCPU, ~12 MiB**.
- Ratio de memoria:CPU de 1 GiB a 6.5 GiB por core. Com 0.1 CPU, a memoria
  valida e entre 102 MiB e 665 MiB → 128 MiB esta correto.
- 1 projeto, 1 ambiente, 1 replica.
- Bandwidth de saida: 5 Mbit/s. O catalogo tem ~74 KB - irrelevante.
- Log retention: 1 dia.

## Notas

- O parser vive em `shared/parseEmbedcanais.mjs` (fonte unica de verdade,
  usada pelo frontend, pelo backend e pelo script de build do snapshot).
- O backend nao usa `eval()` nem `new Function()` - restricao do validador de
  scripts de injecao do WebTV.
- `Access-Control-Allow-Origin: *` e seguro aqui: o servico so devolve dados
  publicos de canais, sem credencial nem estado de sessao.
