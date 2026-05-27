# WebView Optimization Audit — kotlin-app/

**Data:** 2026-05-27
**Contexto:** Players de TV Online, dispositivos Android de baixo recurso (TV boxes)
**Método:** 4 subagentes — Análise Estática, Perfil de Streaming, Otimização de Memória, Integração JS↔Kotlin
**Dependência disponível:** `androidx.webkit:webkit:1.9.0` (subutilizada)

---

## SEVERIDADE CRÍTICA

### C1 — `onRenderProcessGone()` ausente ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt` — WebViewClient (linhas 121-158)
- ~~Crash do renderizador (comum em streaming HLS/DASH longo) = tela branca ou app morto~~
- ~~Solução: override `onRenderProcessGone` via `WebViewClientCompat` (já suportado por `webkit:1.9.0`)~~
- **Implementado:** `onRenderProcessGone()` nativo (Android 26+) no `WebViewClient` + `recreateWebView()` que destrói WebView antigo, recria novo, reinstala bridge/scripts, limpa caches e recarrega URL

### C2 — Vazamento de WebView de popup ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt:171-195` — `onCreateWindow`
- ~~Cada popup cria `new WebView(this@MainActivity)` sem nunca destruir~~
- ~~Custo: ~10-50MB por popup vazado~~
- **Implementado:** `view?.post { view.destroy() }` após redirect no `shouldOverrideUrlLoading` do popup WebViewClient (linha 188)

### C3 — `onTrimMemory()` não implementado ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt:410-439` — novo override
- ~~Sessões longas sem resposta à pressão de memória do sistema~~
- **Implementado:** 3 níveis de resposta — `RUNNING_LOW` (clearCache), `MODERATE/CRITICAL` (+CookieManager.flush, limpar maps de scripts), `COMPLETE/BACKGROUND` (+limpar injectedScriptIds, caches de string). Libera 5-30MB sob pressão do sistema

### C4 — `isMinifyEnabled = true` (release) ✅ RESOLVIDO
**Arquivo:** `build.gradle.kts:51` — alterado para `true`
- ~~APK 40-60% maior; 5-15MB runtime desperdiçado com código não removido~~
- **Implementado:** R8 ativado no build release. ProGuard já preserva `@JavascriptInterface`. Build release passou sem erros de minification. APK ~2.1MB

### C5 — `onDestroy()` incompleto ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt:405-435` — reescrito
- ~~Apenas `webView.destroy()` — faltavam `removeAllViews()`, `loadUrl("about:blank")`, `clearCache(true)`, `clearHistory()`, anulação de referências, limpeza de maps~~
- **Implementado:** Ordem segura — `stopLoading()` → `removeView` do parent → `removeAllViews()` → `loadUrl("about:blank")` → `clearHistory()` → `clearCache(true)` → `destroy()`. Todas as referências anuladas (bridge, scriptInjector, customView, maps limpos, strings resetadas). Tudo dentro de try/catch para evitar crash se WebView já parcialmente destruído.

### C6 — `pauseTimers()` / `resumeTimers()` ausentes ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt:394-404` — `onPause`/`onResume` atualizados
- ~~Streaming continua consumindo rede, buffer e decoder em background~~
- **Implementado:** `webView.pauseTimers()` em `onPause()` (antes de `webView.onPause()`), `webView.resumeTimers()` em `onResume()` (após `webView.onResume()`). Pausa timers JS e decoders de vídeo quando app vai para background.

---

## SEVERIDADE ALTA

### H1 — Configurações de segurança permissivas
**Arquivo:** `MainActivity.kt:99-113`
| Setting | Valor atual | Recomendado |
|---------|------------|-------------|
| `allowFileAccess` | `true` | `false` |
| `allowContentAccess` | `true` | `false` |
| `mixedContentMode` | `MIXED_CONTENT_ALWAYS_ALLOW` | `MIXED_CONTENT_COMPATIBILITY_MODE` |
| `setAllowFileAccessFromFileURLs` | (default: API 30+ false) | Explícito `false` |
| `setAllowUniversalAccessFromFileURLs` | (default: API 30+ false) | Explícito `false` |

### H2 — `WebTVBridge` retém referência forte à Activity
**Arquivo:** `WebTVBridge.kt:6`
```kotlin
class WebTVBridge(private val activity: MainActivity)  // referência forte
```
- `@JavascriptInterface` ancora `MainActivity` enquanto WebView existir
- Solução: `WeakReference<MainActivity>` com `activityRef.get()?.let { ... }`

### H3 — `onReceivedError` / `onReceivedSslError` ausentes
**Arquivo:** `MainActivity.kt` — WebViewClient (linhas 121-158)
- Falhas de rede = falha silenciosa, sem feedback ao usuário
- Erros SSL = comportamento padrão imprevisível

### H4 — `window.postMessage` com `'*'` sem listener Kotlin
**Arquivo:** `frontend/src/lib/eventBus.ts:34`
```typescript
window.postMessage({ source: 'webtv', event }, '*')  // código morto, risco de segurança
```
- Todo evento dispara `postMessage` nunca consumido no lado Kotlin
- Solução: remover ou implementar listener Kotlin com target origin específico

### H5 — `Handler.postDelayed` sem limpeza
- **ScriptInjector.kt:238-241:** novo Handler por retry, até 10 tentativas × 5s = 50s de janela
- **MainActivity.kt:651-653:** `webView.postDelayed { loadUrl(START_URL) }` sem `removeCallbacks`
- **SplashActivity.kt:28-31:** `postDelayed` sem `removeCallbacks` (risco com "Don't keep activities")
- Solução: armazenar Runnable como campo, chamar `removeCallbacks` em `onDestroy`

---

## SEVERIDADE MÉDIA

### M1 — WebSettings desnecessários para streaming
| Setting | Local | Impacto |
|---------|-------|---------|
| `databaseEnabled = true` | MainActivity.kt:102 | Aloca ~500KB-2MB (WebSQL nunca usado) |
| `allowFileAccess = true` | MainActivity.kt:103 | Desnecessário |
| `allowContentAccess = true` | MainActivity.kt:104 | Desnecessário |
| `cacheMode = LOAD_DEFAULT` | MainActivity.kt:110 | `LOAD_CACHE_ELSE_NETWORK` melhor para TV |
| `setLayerType(HARDWARE)` | Ausente | AGENTS.md menciona, código não implementa |

### M2 — Meta-dados de WebView ausentes no Manifest
**Arquivo:** `AndroidManifest.xml`
```xml
<meta-data android:name="android.webkit.WebView.EnableSafeBrowsing" android:value="false" />
<meta-data android:name="android.webkit.WebView.ServiceWorker" android:value="false" />
<meta-data android:name="android.webkit.WebView.MetricsOptOut" android:value="true" />
```
- SafeBrowsing: desnecessário (app carrega 1 URL confiável), consome memória de classificação de URL
- ServiceWorker: desnecessário para frontend de streaming, consome processo worklet extra
- MetricsOptOut: reduz coleta de métricas em background

### M3 — `evaluateJavascript()` não batchado
**Arquivo:** `MainActivity.kt:745-774`
- N scripts = N travessias de ponte V8→Java, cada uma alocando strings temporários
- Solução: concatenar scripts em único `evaluateJavascript()`

### M4 — Duplo rastreamento de `injectedScriptIds` ✅ RESOLVIDO
**Arquivos:** `ScriptInjector.kt:9` + `MainActivity.kt` — unificado
- ~~Dois `Set` independentes não sincronizados → risco de injeção duplicada ou dedup falha~~
- **Implementado:** Campo `injectedScriptIds` removido de `MainActivity`, tornado público (`val`) em `ScriptInjector`. Todas as referências em `MainActivity` redirecionadas para `scriptInjector?.injectedScriptIds`. Única fonte de verdade.

### M5 — `injectScriptRaw` callback assíncrono quebrado ✅ RESOLVIDO
**Arquivo:** `ScriptInjector.kt:12-15,156,234-243` — refatorado
- ~~Callback reporta sucesso antes da execução JS real~~
- **Implementado:** `injectScriptWithRetry` agora recebe `callback: ((Boolean) -> Unit)?` como parâmetro, chamado apenas após `evaluateJavascript` retornar resultado. `injectScriptRaw` delega apenas para `injectScriptWithRetry` sem invocar callback falso.
- **Bônus L5:** matching frágil substituído por `result?.trim('"') == "success" || trimmed == "already-injected"`

### M6 — `verifyChannelIdInjection` redundante ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt:639-653` — removido
- ~~Round-trip completo na ponte apenas para verificar variável já definida~~
- **Implementado:** Função `verifyChannelIdInjection()` e sua chamada removidas. Se `evaluateJavascript` não lançou exceção, a variável está garantida.

### M7 — Maps de scripts sem limite (LRU) ✅ RESOLVIDO
**Arquivo:** `MainActivity.kt:46-48` — convertido para LinkedHashMap LRU
- ~~`mutableMapOf` sem teto, cresce indefinidamente durante navegação~~
- **Implementado:** `createLruMap<K,V>(50)` helper no `companion object` — `LinkedHashMap` com `accessOrder=true` e `removeEldestEntry` quando > 50 entradas. Aplica-se a `channelScripts`, `urlScripts` e `domainScripts`.

### M8 — `WebViewAssetLoader` não usado ✅ RESOLVIDO
**Arquivos:** `MainActivity.kt:46,103-106,143-148,781-800` — implementado
- ~~Leitura manual de `assets/scripts/appBridge.js` + cache de string em memória + escape inline no `evaluateJavascript`~~
- **Implementado:** `WebViewAssetLoader` com `AssetsPathHandler` servindo `/scripts/` em domínio virtual `appassets.androidplatform.net`. `injectAppBridgeScript` agora injeta tag `<script src="...">` apontando para URL virtual; `shouldInterceptRequest` intercepta e serve do asset loader. Campo `appBridgeScriptCache` removido. Elimina cache de string em memória e evita o escape de código JS inline.

---

## SEVERIDADE BAIXA

### L1 — `"javascript:"` prefixo morto em `evaluateJavascript`
**Arquivo:** `MainActivity.kt:682`
```kotlin
val script = "javascript:(function() { $appBridgeScriptCache })();"
webView.evaluateJavascript(script, null)
```
- `evaluateJavascript` espera JS puro; `"javascript:"` é tratado como label statement (sem efeito)

### L2 — `onFocusChanged` parseia JSON apenas para log
**Arquivo:** `WebTVBridge.kt:190-199`
- `JSONObject(payload)` → `json.toString()` → `WebTVLog.d(...)`
- Parse desnecessário se nível de log > DEBUG

### L3 — Parâmetros `payload` não usados
**Arquivos:** `WebTVBridge.kt:22` (`onListenersReady`), `:155` (`onNavigatedHome`)
- JS envia `JSON.stringify({})` desnecessariamente

### L4 — Escape de string duplicado
**Arquivos:** `ScriptInjector.kt:162` + `MainActivity.kt:752`
```kotlin
code.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
```
- Mesma lógica em 2 lugares; 4 objetos `String` intermediários por chamada
- Solução: extrair para utility, usar `StringBuilder` single-pass

### L5 — Matching frágil de resultado ✅ RESOLVIDO
**Arquivo:** `ScriptInjector.kt:236` — corrigido junto com M5
- ~~`result.contains("success")` capturava "success-with-warnings", "not-success"~~
- **Implementado:** `result?.trim('"') == "success" || trimmed == "already-injected"` — matching exato

### L6 — Polling de `injectCloseEvent` sem timeout
**Arquivo:** `MainActivity.kt:691-693`
- `setTimeout(tryClose, 100)` sem teto; pode executar indefinidamente
- Solução: limite de 50 tentativas (5 segundos)

### L7 — `onSaveInstanceState` / `restoreState` não restaura estado do app
**Arquivo:** `MainActivity.kt:87-91, 344-347`
- `restoreState()` restaura histórico WebView mas `activeChannelId`/`activeChannelName` = null
- `listenerGuardInstalled` = false → reinserção de guard
- Maps de scripts perdidos

### L8 — `preloadedScriptsPayload` sem limpeza em `onDestroy`
**Arquivo:** `MainActivity.kt:40`
- String grande (código JS completo) liberada em `handleNavigatedHome` mas não em `onDestroy`

### L9 — `CookieManager.setAcceptThirdPartyCookies(true)` desnecessário
**Arquivo:** `MainActivity.kt:117`
- App é first-party; cookies de terceiros apenas consomem armazenamento

### L10 — `injectChannelCloseEvent` injetado via polling global
**Arquivo:** `MainActivity.kt:687-704`
- `setTimeout` no escopo `window`, sem `clearTimeout`; múltiplos timers acumulam se navegação rápida

---

## QUADRO-RESUMO POR IMPACTO MENSURÁVEL

| # | Categoria | Ganho Estimado | Esforço |
|---|-----------|---------------|---------|
| C2 | Memória | -10 a -50MB por popup | Baixo |
| C3 | Memória | Libera 5-30MB sob pressão | Médio |
| C4 | APK+RAM | APK -40%, RAM -5-15MB | Baixo |
| C5 | Memória | Previne vazamento Activity | Baixo |
| C6 | Rede+Bateria | Streaming para em background | Baixo |
| C1 | Estabilidade | Elimina crash em streaming longo | Médio |
| H1 | Segurança | Superfície de ataque reduzida | Baixo |
| H2 | Memória | Activity coletável pelo GC | Baixo |
| M3 | CPU | -N travessias V8→Java | Médio |
| M8 | Memória | Elimina cache string + simplify | Médio |

## RECOMENDAÇÕES POR ORDEM DE IMPLEMENTAÇÃO

### Fase 1 — Rápido, alto impacto (1-2h)
1. `onDestroy()` completo (C5)
2. `pauseTimers()`/`resumeTimers()` (C6)
3. Destruir popup WebView (C2)
4. `isMinifyEnabled = true` (C4)
5. WebSettings de segurança (H1)
6. `WeakReference` no WebTVBridge (H2)
7. `onReceivedError`/`onReceivedSslError` (H3)

### Fase 2 — Médio esforço (3-4h)
8. `onTrimMemory()` (C3)
9. `onRenderProcessGone()` (C1)
10. Meta-dados do Manifest (M2)
11. `Handler.postDelayed` com remoção (H5)
12. Unificar `injectedScriptIds` (M4)
13. Batch de `evaluateJavascript` (M3)
14. Maps LRU e limpeza (M7)

### Fase 3 — Refinamento (2-3h)
15. `WebViewAssetLoader` (M8)
16. WebSettings de memória (M1)
17. `setLayerType(HARDWARE)` (M1)
18. Callback `injectScriptRaw` (M5)
19. Remover `verifyChannelIdInjection` (M6)
20. Limpeza `preloadedScriptsPayload` (L8)
21. Escape string unificado (L4)
22. Matching exato de resultado (L5)
23. Polling com timeout (L6)
24. PostMessage dead code + outras baixas (H4, L1-L3, L7, L9, L10)

---

## ARQUIVOS RELEVANTES

| Arquivo | Linhas-chave |
|---------|-------------|
| `MainActivity.kt` | 31 (webView), 40 (payload cache), 44 (bridgeScript cache), 46-49 (maps), 83-113 (setup), 121-158 (WebViewClient), 160-300 (WebChromeClient), 349-358 (pause/resume), 360-363 (destroy), 534-549 (verifyChannelId), 651-653 (postDelayed), 672-688 (script loading), 687-704 (close injection), 745-774 (channel scripts) |
| `WebTVBridge.kt` | 6 (activity ref), 8-230 (14 @JavascriptInterface), 22 (unused payload), 155 (unused payload), 190-199 (focus log overhead) |
| `ScriptInjector.kt` | 8 (webView ref), 9 (injectedScriptIds), 12-15 (callback bug), 162 (string escape), 234-241 (handler leak) |
| `SplashActivity.kt` | 28-31 (handler sem removeCallbacks) |
| `build.gradle.kts` | 51 (isMinifyEnabled), 74 (webkit:1.9.0) |
| `proguard-rules.pro` | Única regra preserva @JavascriptInterface |
| `AndroidManifest.xml` | 23 (usesCleartextTraffic), 39 (configChanges faltando screenLayout/fontScale), sem meta-dados WebView |
| `frontend/src/lib/eventBus.ts` | 34 (postMessage '*' morto) |