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

### Pelo dashboard

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

### Limites do plano (Free)

- 0.1 CPU / 256 MiB por servico - suficiente para este proxy (so fetch + parse).
- Ratio de memoria:CPU de 1 GiB a 6.5 GiB por core. Com 0.1 CPU, a memoria
  valida e entre 102 MiB e 665 MiB. Use **128 MiB**.
- 1 projeto, 1 ambiente, 1 replica.
- Bandwidth de saida: 5 Mbit/s. O catalogo tem ~74 KB - irrelevante.
- Log retention: 1 dia.
- **Imagens arbitrarias de registry exigem plano pago**, mas build a partir do
  GitHub funciona no Free.

## Notas

- O parser vive em `shared/parseEmbedcanais.mjs` (fonte unica de verdade,
  usada pelo frontend, pelo backend e pelo script de build do snapshot).
- O backend nao usa `eval()` nem `new Function()` - restricao do validador de
  scripts de injecao do WebTV.
- `Access-Control-Allow-Origin: *` e seguro aqui: o servico so devolve dados
  publicos de canais, sem credencial nem estado de sessao.
