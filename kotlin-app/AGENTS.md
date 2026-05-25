# WebTV - Android WebView App

## Project Overview

WebTV é um aplicativo Android nativo desenvolvido em Kotlin que carrega uma lista de canais e integra players de vídeo através de injeção de scripts JavaScript.

**URL de Produção**: `https://administrative-today-fix-seen.trycloudflare.com`

## Architecture

### Core Components

1. **SplashActivity** (`app/src/main/kotlin/com/webtv/SplashActivity.kt`)
   - Tela de splash inicial (2 segundos)
   - Transição automática para MainActivity

2. **MainActivity** (`app/src/main/kotlin/com/webtv/MainActivity.kt`)
   - WebView fullscreen com suporte a múltiplas janelas
   - Sistema de injeção de eventos
   - Duplo clique no botão voltar para sair com confirmação
   - Toast de confirmação ao injetar scripts
   - Gerenciamento de ciclo de vida completo

3. **ScriptInjector** (`app/src/main/kotlin/com/webtv/ScriptInjector.kt`)
   - Sistema central de injeção de scripts nos players
   - Suporta múltiplos scripts por URL
   - **Sistema de deduplicação** para evitar injeção múltipla
   - Gerenciamento de callbacks

4. **WebTVBridge** (`app/src/main/kotlin/com/webtv/WebTVBridge.kt`)
   - Interface `@JavascriptInterface` para comunicação JavaScript → Kotlin
   - Métodos expostos: onChannelClicked, onPlayerOpened, onScriptInjectionResult, etc.

### Key Features

- **WebView Fullscreen**: Imersão total com ocultação de barras do sistema
- **Suporte a Popups**: Janelas múltiplas para autenticação e navegação
- **Injeção de Scripts**: Controle programático dos players de vídeo
- **Events API Integration**: Comunicação bidirecional entre app e página web
- **Script Deduplication**: Evita injeção múltipla de scripts idênticos usando IDs únicos
- **Double Back Press Exit**: Confirmação com diálogo ao pressionar voltar duas vezes
- **Toast Notifications**: Feedback visual ao usuário quando scripts são injetados
- **Listener Deduplication**: Flag para evitar injeção dupla de listeners de eventos

## Events API Integration

### Event Flow
```
1. Usuário clica em um canal → canal:clicked
2. Modal player abre → player:opened
3. App captura evento e injeta script específico para o canal
4. Script controla autoplay, qualidade, fullscreen, etc.
```

### Supported Events
- `channel:clicked` - Canal selecionado
- `player:opened` - Player aberto com URL
- `player:closed` - Player fechado
- `app:loaded` - App carregado

## Script Injection System

### How It Works
1. ScriptInjector busca scripts via `WebTVScripts.getScriptsForUrl(url)`
2. Deserializa JSON de scripts disponíveis
3. Injeta cada script no WebView via `evaluateJavascript()`
4. Mostra toast de confirmação ao usuário

### Deduplication Strategy
- **injectedScriptIds**: Set<String> com IDs de scripts já injetados
- **listenersInjected**: Flag boolean para listeners de eventos
- **Limpeza automática**: Cache limpo ao trocar de URL base

## Build System

### Commands
```powershell
# Build automatizado (recomendado)
.\build-webtv.ps1
.\build-webtv.ps1 -Clean                    # Limpar antes
.\build-webtv.ps1 -Version "1.1.0"          # Versão específica
.\build-webtv.ps1 -VersionCode 2            # VersionCode específico

# Build manual
.\gradlew assembleDebug                     # APK debug
.\gradlew assembleRelease                   # APK release assinado
```

### Output
- **Debug**: `app/build/outputs/apk/debug/app-debug.apk`
- **Release**: `output/WebTV-v{version}-{build}-signed.apk`

### Signing
- Keystore: `keystore/webtv-release.jks`
- Credenciais: `keystore.properties` (NÃO versionar)
- Alias: `webtv`
- Algoritmo: RSA 2048-bit

## Project Structure

```
kotlin-app/
├── app/
│   ├── src/main/
│   │   ├── kotlin/com/webtv/
│   │   │   ├── MainActivity.kt
│   │   │   ├── SplashActivity.kt
│   │   │   ├── ScriptInjector.kt
│   │   │   └── WebTVBridge.kt
│   │   ├── res/
│   │   ├── AndroidManifest.xml
│   │   └── assets/
│   └── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
├── keystore.properties
├── keystore/
├── build-webtv.ps1
└── AGENTS.md
```

## Dependencies

- `androidx.webkit:webkit:1.8.0` - WebView extensions
- `org.json:json` - JSON parsing (built-in Android)
- `com.google.android.material:material:1.11.0` - Material Design
- `androidx.appcompat:appcompat:1.6.1` - Compatibilidade

## Important Notes

### onPageFinished Multiple Calls
- Pode ser chamado múltiplas vezes devido a redirecionamentos
- Usar flag `listenersInjected` para evitar injeção dupla

### evaluateJavascript Threading
- Callbacks rodam na UI thread (seguro para UI)
- Não bloquear a thread principal
- Usar coroutines para operações longas

### WebView Best Practices
- `WebView.setLayerType(LAYER_TYPE_HARDWARE)` para performance
- Cache habilitado para reduzir requisições
- DOM storage para dados da aplicação

### Script Security
- Scripts são baixados da própria aplicação web
- Validação de integridade via IDs únicos
- Não injetar scripts de fontes externas

## Debugging

### Canal de Logs Unificado

O WebTV usa um sistema de logging centralizado através do `WebTVLog.kt` que direciona todos os logs para a tag `WebTV`.

```powershell
# Capturar TODOS os logs do app
adb logcat -s WebTV:*

# Logs em tempo real com filtro adicional
adb logcat -s WebTV:* | findstr "Bridge"
adb logcat -s WebTV:* | findstr "Inject"
adb logcat -s WebTV:* | findstr "Main"

# Limpar buffer de logs
adb logcat -c
```

### Fontes de Origem dos Logs

Todos os logs seguem o formato `[Source] mensagem`, onde `Source` indica qual componente emitiu:

| Source | Componente | O que registra |
|--------|------------|----------------|
| `Bridge` | WebTVBridge | Eventos JS→Kotlin (channel:clicked, player:opened, scripts:preloaded) |
| `Main` | MainActivity | Ciclo de vida do WebView, inicialização, guards |
| `Inject` | ScriptInjector | Injeção de scripts, cache, deduplicação |

### Interpretando Logs Típicos

```
[Main] WebView ready - Carregamento iniciado
[Bridge] Channel clicked: Globo SP (redirect) - Usuário clicou no canal
[Main] Channel requires redirect - Canal tipo redirect/mixed
[Inject] Preloaded 1 scripts for URL - Scripts pré-carregados via EVENTS API
[Inject] Injecting preloaded scripts - Injeção na página externa
[Inject] Script 'EmbedCanais Exporta Eventos' injected successfully
```

### Common Issues

1. **Script não injeta**: Verificar logs `[Inject]` para ver se há erro de parsing ou se script já foi injetado (deduplicação)
2. **Channel não responde**: Verificar logs `[Bridge]` para confirmar se evento `channel:clicked` foi recebido
3. **Player não abre**: Verificar logs `[Bridge]` para evento `player:opened` e `[Inject]` para scripts do player
4. **App crash**: `adb logcat -s WebTV:*` não mostrará stack traces - usar `adb logcat` sem filtro

### Logs do Sistema Android (Fallback)

Para diagnósticos avançados que requerem logs do sistema:
```powershell
# WebView/Chromium
adb logcat chromium:* *:S

# Network
adb logcat NetworkMonitor:* WebTV:* *:S
```

## Code Conventions

### Kotlin Style
- **Nomenclatura**: camelCase para funções, PascalCase para classes
- **Indentação**: 4 espaços (sem tabs)
- **Comentários**: Em português, explicar "por que" não "o que"
- **Logs**: Sempre usar TAG da classe

## Testing

### Manual Testing
1. Instalar APK no dispositivo
2. Abrir app e verificar
3. Selecionar canal
4. Verificar toast "Script injetado com sucesso"
5. Testar autoplay e fullscreen
6. Pressionar voltar 2x para sair

### Automated Testing
```powershell
# Instalar e iniciar
adb install -r app-debug.apk
adb shell am start -n com.webtv/.SplashActivity

# Monitorar logs durante teste
adb logcat -s ScriptInjector:* WebTVBridge:*
```

## Version Control

### Gitignore
```
*.jks
*.apk
/local.properties
/build
/captures
.externalNativeBuild
.cxx
```

### Commit Messages
```
feat: adicionar sistema de deduplicação de scripts
fix: corrigir múltipla injeção de listeners
chore: atualizar URL de produção
```

## Deployment

### Production Build
```powershell
# Build release
.\build-webtv.ps1 -Clean -Version "1.0.0" -VersionCode 1

# Output: output/WebTV-v1.0.0-1-signed.apk
```

### Distribution
- **Google Play**: Requer keystore permanente (NÃO regenerar)
- **Direct Download**: APK assinado pronto para instalação
- **Firebase App Distribution**: Para testes beta

## Performance Tips

1. **Hardware Acceleration**: `WebView.LAYER_TYPE_HARDWARE`
2. **Caching**: Habilitar cache para reduzir requisições
3. **Lazy Loading**: Injetar scripts apenas quando player abre
4. **Memory Management**: Liberar WebView em onDestroy
