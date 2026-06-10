# WebTV - Diretrizes de Desenvolvimento

## Visão Geral do Projeto

WebTV é um sistema de streaming de TV que integra um frontend React (WebView) com um app Android nativo em Kotlin. O app carrega o frontend, gerencia canais e injeta scripts JavaScript para controlar players de vídeo.

**URL de Produção**: `https://representation-aggregate-auction-patio.trycloudflare.com`

## Ambiente de Trabalho

- **Sistema Operacional**: Windows 11
- **Shell**: PowerShell (7+)
- **Workspace**: `/` (raiz do projeto)

```
/
├── frontend/                       # Aplicação React (Vite + TypeScript + Tailwind)
│   └── docs/scripts/               # Scripts de injeção para WebView (dev + .min.js)
├── kotlin-app/                     # App Android nativo em Kotlin
├── frontend/docs/                  # Documentação (Events API)
└── AGENTS.md                       # Este arquivo
```

## Diretrizes Globais

1. Esta sessão trabalha em **`/frontend/`** ou **`/kotlin-app/`** — leia o `AGENTS.md` do subprojeto antes de fazer qualquer alteração
2. Frontend e app Android se comunicam **apenas via Events API** (documentada em `docs/EVENTS_API.md`)

### TODOs (Obrigatório)

- Sempre que criar TODOS via `todowrite`, **siga estritamente cada item na ordem definida**
- Atualize o status de cada item em tempo real com a tool_call `todowrite` (`in_progress` antes de começar, `completed` ao terminar)
- **Nunca abandone um TODO pendente** — se bloquear, registre o bloqueio como follow-up; se não for mais relevante, marque como `cancelled`

### Retomada de Contexto

Quando o usuário escrever **"Continue"**, **"Try Again"** ou **"Tente Novamente"**, considere que o loop agêntico foi interrompido. Nesse caso:

1. Analise os últimos tool_calls, edits e comandos executados antes da interrupção
2. Identifique o último TODO marcado como `in_progress` ou `completed`
3. Retome **exatamente do ponto em que parou** — sem reexecutar etapas já concluídas

## Arquitetura da Comunicação (Events API)

### Fluxo

1. **Frontend (React)** → Emite eventos via `CustomEvent` (`webtv:event`) e `window.postMessage`
2. **Kotlin (Android WebView)** → Recebe via `@JavascriptInterface` (`WebTVBridge.kt`) em `activity.runOnUiThread { ... }`
3. **Kotlin** → Injeta scripts na WebView após `onPageFinished`

### Eventos Principais

| Evento | Emissor | Descrição |
|--------|---------|-----------|
| `app:loaded` | Frontend | App carregado, cache de scripts limpo |
| `channel:clicked` | Frontend | Canal selecionado (`{id, name, type}`) |
| `player:opened` | Frontend | Player aberto (`{channelId, channelName, url}`) |
| `scripts:preloaded` | Frontend | Scripts prontos para injeção |

### Comportamento por Tipo de Canal

- **`iframe`** → Carregado em `PlayerModal` dentro do frontend; `onPlayerOpened` dispara injeção
- **`redirect`** → WebView navega para URL externa; scripts são injetados em `onPageFinished` após `channel:clicked` marcar o canal como ativo
- **`mixed`** → Combina iframe + redirecionamento

## Comandos Rápidos

### Frontend
```powershell
# Dev server (em background, nunca síncrono)
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$(Get-Location)\frontend`" && npm run dev > $env:TEMP\opencode\vite-dev.log 2>&1" -WindowStyle Hidden

# Build
Set-Location ./frontend; npm run build

# Lint
Set-Location ./frontend; npm run lint
```

### Kotlin App
```powershell
# Build APK
Set-Location ./kotlin-app; .\gradlew assembleDebug

# Instalar via ADB
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Shell - Referencia de Comandos (PowerShell 7+)

**PROIBIDO usar**: `grep`, `sed`, `awk`, `cat`, `head`, `tail`, `wc`, `find`, `which`, `ls` (alias OK mas prefira cmdlets)

| Tarefa | Comando PowerShell |
|--------|-------------------|
| Buscar texto em arquivos | `Select-String -Path ".\**\*.ts" -Pattern "texto"` |
| Buscar arquivos por nome | `Get-ChildItem -Recurse -Filter "*.tsx"` |
| Listar diretorio | `Get-ChildItem -LiteralPath ".\dir"` |
| Ler arquivo | `Get-Content -LiteralPath ".\file.ts"` |
| Contar linhas | `(Get-Content ".\file").Count` |
| Verificar se arquivo existe | `Test-Path -LiteralPath ".\file"` |
| Criar diretorio | `New-Item -ItemType Directory -Path ".\dir"` |
| Remover arquivo/diretorio | `Remove-Item -LiteralPath ".\file" -Recurse` |
| Copiar arquivo | `Copy-Item -LiteralPath ".\src" -Destination ".\dst"` |
| Mover/renomear | `Move-Item -LiteralPath ".\old" -Destination ".\new"` |
| Variavel de ambiente | `$env:NOME = "valor"` |
| Executar .exe com espacos | `& ".caminho\com nome\exe" arg1 arg2` |

### Dicas

- **NUNCA** use `cd` dentro de comandos bash — use o parametro `workdir`
- Para rodar processos em background: `Start-Process -FilePath "cmd.exe" -ArgumentList "..." -WindowStyle Hidden`
- Pipe entre cmdlets funciona normalmente: `Get-ChildItem -Recurse -Filter "*.ts" | Select-String "padrao"`
- Executaveis locais: prefixe com `.\` (ex: `.\gradlew`, `.\node_modules\.bin\vitest`)

## ADB - Android Debug Bridge

### Dispositivos
```powershell
adb devices                                  # Lista dispositivos conectados
adb connect <IP>:<PORT>                      # Conecta via TCP/Wi-Fi
adb disconnect                               # Desconecta todos TCP
adb -s <serial> <comando>                    # Executa em dispositivo específico
```

### Instalação e Lifecycle do App
```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk   # Instala/atualiza APK
adb install -r -d app.apk                                  # Força downgrade
adb uninstall com.webtv                                     # Desinstala

adb shell am start -n com.webtv/.SplashActivity            # Abre o app
adb shell am force-stop com.webtv                          # Força fechamento
```

### Dados e Arquivos
```powershell
adb shell pm clear com.webtv              # Limpa cache/data (reseta app)
adb push local.txt /sdcard/               # Envia arquivo p/ device
adb pull /sdcard/arquivo.txt .\local\     # Baixa arquivo do device
```

### Logs (Logcat)
- Tag unificada: `WebTV` (via `WebTVLog.kt`) — formato `I/WebTV(Main): mensagem`

```powershell
adb logcat -s WebTV:*                     # Filtra apenas logs do WebTV
adb logcat -s WebTV:* -v time             # Com timestamp
adb logcat -s WebTV:* -T 200              # Últimas 200 linhas
adb logcat -c                             # Limpa buffer de logs
adb logcat -s WebTV:* > webtv.log         # Salva em arquivo (bloqueia o arquivo!)
```

**ATENÇÃO:** Logcat redirecionado para arquivo mantém o processo aberto e bloqueia exclusão. Se travar, mate o processo:
```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'logcat' } |
  Select-Object ProcessId, Name, CommandLine
Stop-Process -Id <pid> -Force
```

### Shell no Dispositivo
```powershell
adb shell                                 # Shell interativo
adb shell dumpsys activity activities     # Activities em execução
adb shell dumpsys meminfo                 # Uso de memória
adb shell input keyevent KEYCODE_BACK     # Pressiona tecla (útil p/ testar back-press duplo)
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png .
                                          # Screenshot
```

### Troubleshooting
- Se `adb devices` não mostrar o dispositivo: reinicie o servidor com `adb kill-server && adb start-server`
- Logcat sem logs do WebTV: app pode estar em processo diferente ou `WebTVLog` não foi inicializado
- Para forçar nova build: `.\gradlew clean assembleDebug` antes de `adb install -r`

## Regras de Estilo

- **Frontend**: TypeScript strict, ESLint + Prettier configurados, componentes funcionais com hooks, Tailwind CSS para estilos
- **Kotlin**: Kotlin idiomático, operações na WebView sempre em `runOnUiThread`, logs via `WebTVLog` (não `android.util.Log` diretamente)

## Scripts de Injeção (WebTV)

Scripts em `frontend/docs/scripts/` são minificados e enviados via `ScriptInjector.kt` para a WebView Android. **Cada script passa por um validador automático no admin (`/WebTV/own:scripts`) que rejeita**:

1. **Colchetes não balanceados** — sintaxe inválida (use `node --check file.js` antes de commitar)
2. **Uso de `eval()`** — vetado por segurança
3. **Uso de `new Function()`** — vetado pelo validador (substitua por parser manual)

### Padrão de nomenclatura e estrutura

Cada canal/servidor de stream tem um script dev + min:

```
frontend/docs/scripts/
├── embeddecanais-replace-content.js         # versão dev (legível, comentada)
├── embeddecanais-replace-content.min.js     # versão prod (terser, 1 linha)
├── rdcanais-replace-content.js              # versão dev
└── rdcanais-replace-content.min.js          # versão prod
```

**Convenção**: `<canal>-replace-content.js` para dev, `.min.js` para prod.

### Padrão de código (template)

```js
/**
 * WebTV — Injeção para <servidor>
 *
 * Substitui o player pesado por Hls.js puro, preserva window.WebTV.*
 * (appBridge intacto) e descobre a URL do stream em runtime.
 *
 * Funciona em qualquer página do domínio sem hardcodar URL.
 */
(function() {
  'use strict';

  // 1. Idempotência — nunca rodar duas vezes
  if (window['__webtv_<canal>_replace']) return;
  window['__webtv_<canal>_replace'] = true;

  // 2. Hooks de áudio (padronizados em EVENTS_API.md)
  // ... Object.defineProperty(HTMLMediaElement.prototype, 'muted', ...)

  // 3. Constantes — NUNCA hardcode domínios/CDNs rotativos
  // var HLSJS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
  // var IFRAME_HOST_PATTERN = /^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}\//i;

  // 4. Discovery — múltiplas estratégias (NEQ decode, query redirect, inline, Turnstile POST)
  // function discoverStreamUrl() { ... }

  // 5. Player — Hls.js com config otimizada para Android TV 1.5GB RAM
  // var cfg = { enableWorker: true, maxBufferLength: 20, ... };

  // 6. postEvent — emite via WebTV.events (contrato EVENTS_API.md)
  // function postEvent(type, data) { ... }

  // 7. DOM replacement — <video> fullscreen, controls=false
  // function replaceDOM() { ... }

  // 8. Player API — window.WebTV.player.{play,pause,stop,reload,getStatus}
  // var playerAPI = { ... };

  // 9. Cleanup — beforeunload, pagehide, destroy
  // window.addEventListener('beforeunload', function() { ... });

  // 10. Bootstrap — espera iframe, FAZ DISCOVERY ANTES de remover
  // function bootstrap() { waitForIframe(); }
  // if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  // else bootstrap();
})();
```

### Padrões de discovery de URL

Sites rotativos usam padrões diferentes. **Não hardcode nomes de variáveis ou offsets** — descubra via regex:

| Padrão | iframe path | Source discovery | Exemplo |
|--------|-------------|------------------|---------|
| NEQ decode | `rdcplayer.online/hls/<slug>.html` | `neq-decode` | Array obfuscado base64 |
| Multi redirect | `rdcplayer.online/multi/<slug>.html?m3u8=...` | `multi-redirect` | Segue redirect até m3u8 |
| Inline streamUrl | `pescaplay.store/multtv/player.php?id=...` | `inline-stream-url` | `const streamUrl = "..."` |
| Turnstile POST | `streamrdc.xyz/embed/player.php?id=...` | `turnstile-post` | POST com cf_token |

### ⚠️ Armadilhas comuns

**1. Parser manual em vez de `new Function()`**
O validador bloqueia `new Function()`. Para parsear o array NEQ obfuscado:
```js
// ❌ ERRADO — bloqueado pelo validador
var arr = (new Function('return ' + m[1] + ';'))();

// ✅ CERTO — regex + loop manual
var arr = [];
var strRe = /['"]([A-Za-z0-9+\/=]+)['"]/g;
var mm;
while ((mm = strRe.exec(m[1])) !== null) arr.push(mm[1]);
```

**2. Site rotaciona nomes de variáveis E offsets**
O site rdcplayer.online rotaciona a cada request: nome do acumulador (`zgg`, `iew`, `XgC`), nome do array (`NEQ`, `nyz`, `hOo`), e o offset numérico (`17009184`, `99317169`, outros). Descubra dinamicamente:
```js
// Aceitar maiúsculas/minúsculas
var accMatch = html.match(/var\s+([a-zA-Z]{2,4})\s*=\s*["']["']\s*;/);
var arrMatch = html.match(/var\s+([a-zA-Z]{2,4})\s*=\s*(\[[^\]]+\])/s);
// Extrair offset do forEach
var offsetMatch = html.match(/-\s*(\d{6,12})\s*\)\s*;/);
```

**3. Iframe removido antes do discovery**
O bootstrap chama `replaceDOM()` que **remove o iframe** do DOM. Salve o `iframe.src` ANTES:
```js
window.__webtv_iframe_src = iframe.src; // ANTES de replaceDOM()
discoverStreamUrl().then(function(url) {
  replaceDOM(); // remove iframe
  initPlayer();
});
```
E dentro de `discoverStreamUrl`, **use o `__webtv_iframe_src` salvo**, não `document.querySelector('iframe')` (que vai retornar null).

**4. CORS não se aplica no Android WebView**
- Testes em browser (Playwright/Edge) podem falhar por CORS — isso é esperado, não é bug
- Em produção (Android WebView), CORS não se aplica, então o script funciona sem proxy
- **Nunca adicione proxy HTTP ao script** — não existirá em produção

**5. Referer do iframe, não do parent**
CDNs Cloudflare-gated (ex: `agropesca.live`) rejeitam requests com `Referer: https://rdcanais.com/` (parent). Exigem o `Referer: https://rdcplayer.online/...` (iframe):
```js
// Setar Referer do iframe no Hls.js
var iframeOrigin = new URL(window.__webtv_iframe_src).origin;
hls.config.xhrSetup = function(xhr, url) {
  try { xhr.setRequestHeader('Referer', iframeOrigin + '/'); } catch (e) {}
};
hls.config.fetchSetup = function(input, init) {
  init = init || {};
  init.referrer = iframeOrigin + '/';
  return origFs ? origFs(input, init) : init;
};
```

**6. TDD com Edge CDP + Node Playwright**
```bash
# 1. Iniciar Edge com remote debugging (em background)
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9333 about:blank

# 2. Rodar teste
$env:CDP_URL = "http://127.0.0.1:9333"
node frontend/tests/rdcanais.test.mjs

# 3. Validar dois critérios separados:
#    - Discovery OK (testável em browser)
#    - Playback OK (só testável em Android — CORS bloqueia em browser)
```

### Workflow completo ao criar um script novo

1. **Investigar o site** com Playwright MCP:
   - Capturar `iframe.src` (URL do player)
   - Capturar HTML do iframe (curl com Referer correto)
   - Identificar padrão de obfuscation
2. **Escrever dev script** em `frontend/docs/scripts/<canal>-replace-content.js`:
   - Comentários descritivos
   - Padrão IIFE + idempotência
   - Discovery chain (múltiplas estratégias)
   - Hls.js config Android TV 1.5GB
3. **Validar sintaxe**: `node --check file.js`
4. **Validar sem padrões bloqueados**: `grep -E 'eval|new Function|Function\(' file.js`
5. **Criar teste Playwright** em `frontend/tests/<canal>.test.mjs`
6. **Rodar teste** — RED (não existe) → implementar → GREEN
7. **Minificar**:
   ```bash
   .\node_modules\.bin\terser.cmd src.js --compress --mangle --output src.min.js --comments false
   ```
8. **Validar minificado**: rodar o mesmo teste contra o `.min.js`
9. **Commit** ambos os arquivos (dev + min)

### Config Hls.js otimizada para Android TV 1.5GB RAM

```js
var cfg = {
  enableWorker: true,           // off-load do parser/demuxer
  lowLatencyMode: false,        // LL-HLS usa mais memória
  backBufferLength: 30,         // limpa segmentos antigos rápido
  maxBufferLength: 20,          // buffer reduzido (default 30)
  maxMaxBufferLength: 60,       // hard cap
  maxBufferSize: 30 * 1000 * 1000, // 30MB hard limit
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 6,
  capLevelToPlayerSize: true,   // evita upscaling
  startLevel: -1,               // ABR automático
  fragLoadingMaxRetry: 3,
  levelLoadingMaxRetry: 3,
  manifestLoadingMaxRetry: 3,
  abrEwmaDefaultEstimate: 5000000,  // 5Mbps default
  abrBandwidthFactor: 0.7,
  enableSoftwareAES: false
};
```

### Validador `frontend/AGENTS.md`

Em desenvolvimento, antes de commitar scripts:
```bash
# Verificar sintaxe
node --check "frontend/docs/scripts/<canal>-replace-content.js"

# Verificar padrões bloqueados
Select-String -Path "frontend/docs/scripts/<canal>-replace-content.js" -Pattern "eval|new Function|Function\("

# Verificar balanço de chaves
(Get-Content "frontend/docs/scripts/<canal>-replace-content.js" | Select-String "{" | Measure-Object).Count
(Get-Content "frontend/docs/scripts/<canal>-replace-content.js" | Select-String "}" | Measure-Object).Count
```

Se algum desses falhar, **NÃO commite** — o admin vai rejeitar o upload.
