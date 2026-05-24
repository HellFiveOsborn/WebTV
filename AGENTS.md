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
├── frontend/        # Aplicação React (Vite + TypeScript + Tailwind)
├── kotlin-app/      # App Android nativo em Kotlin
├── frontend/docs/   # Documentação (Events API)
└── AGENTS.md        # Este arquivo
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

## Fluxo de Trabalho Git

### Estrutura do Repositório

Este é um **monorepo** (não usa submodules). Toda a base de código (frontend + Android) vive no mesmo repositório para facilitar sincronização entre mudanças que afetam ambos os lados.

### Critérios de Commit

**Quando fazer commits:**
- Completar uma feature autocontida (mesmo que pequena)
- Corrigir um bug específico
- Aplicar uma refatoração isolada
- Adicionar/atualizar documentação
- Após testes passarem e lint/typecheck estiver limpo

**Princípios:**
- **Commits atômicos**: cada commit deve representar uma mudança coesa e logicamente completa
- **Escopo reduzido**: não misture mudanças não relacionadas (ex: não combine fix de bug com refactor não relacionado)
- **Trabalho primeiro, commit depois**: faça commits locais sem push enquanto estiver no meio de uma feature; só commite o trabalho finalizado
- **Nunca commite mudanças que quebrem build ou testes**

**Não faça commits:**
- Mudanças temporárias ou experimentais (use `git stash` ou branch separado)
- Arquivos gerados (build outputs, node_modules, .gradle, etc.)
- Credenciais, tokens ou informações sensíveis

### Convenções de Commit Message

Use **Conventional Commits** (seguindo o padrão do projeto):

```
<type>(<scope>): <description>
```

**Tipos comuns:**
- `feat`: nova feature
- `fix`: correção de bug
- `refactor`: refatoração sem mudança de comportamento
- `docs`: documentação
- `chore`: manutenção geral (dependências, configurações, limpezas)
- `style`: formatação, espaços, ponto-e-vírgula (sem mudança de lógica)
- `test`: adição ou correção de testes

**Escopos usados neste projeto:**
- `frontend`: mudanças no app React
- `kotlin-app`: mudanças no app Android
- `docs`: documentação
- `ci`: workflows e pipelines

**Exemplos:**
```
feat(kotlin-app): adicionar suporte a múltiplas janelas no WebView
fix(frontend): corrigir cache de scripts ao recarregar página
refactor(kotlin-app): extrair lógica de injeção de scripts
docs: documentar fluxo de versionamento no AGENTS.md
chore(ci): atualizar workflow de deploy do GitHub Pages
```

**Regras:**
- Descrição em português (seguindo o padrão do projeto)
- Descrição concisa que explain **o que** e **por quê** (não o como)
- Não coloque ponto final no fim da descrição
- Use verbos no infinitivo ("adicionar" em vez de "adiciona" ou "adicionei")

### Versionamento (SemVer)

O projeto segue **Semantic Versioning** (`MAJOR.MINOR.PATCH`):

- **MAJOR** (`1.0.0` → `2.0.0`): mudanças incompatíveis na Events API, reestruturação completa que quebra compatibilidade
- **MINOR** (`1.0.0` → `1.1.0`): novas features compatíveis (novos endpoints de API, novos componentes reutilizáveis, novas funcionalidades que não quebram código existente)
- **PATCH** (`1.0.0` → `1.0.1`): correções de bug compatíveis, melhorias de performance, atualizações de documentação

**Quando subir de versão:**
- Após completar uma feature significativa (MINOR)
- Após corrigir bug crítico que afeta usuários (PATCH)
- Após mudança breaking na API ou reestruturação (MAJOR)
- **Nunca** automaticamente — versionamento é decisão consciente

**Onde atualizar a versão:**
- Frontend: `frontend/package.json` (`version` field)
- Android: `kotlin-app/app/build.gradle.kts` (`versionName` para SemVer, `versionCode` para inteiro incrementado)

**Fluxo de release Android:**
```bash
# Atualizar versão no build.gradle.kts (ou passar via script)
./kotlin-app/build-webtv.ps1 -Version "1.0.0" --version-code 3

# Gerar APK assinado
./kotlin-app/build-webtv.ps1 -Version "1.0.0"

# Output: kotlin-app/output/WebTV-v1.0.0-v3-universal.apk
```

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
