# WebTV

Sistema de streaming de TV com frontend React e app Android nativo em Kotlin.

## Estrutura do Projeto

```
WebTV/
├── frontend/          # Aplicação React com Vite + TypeScript
├── kotlin-app/        # App Android WebView em Kotlin
├── scratch/          # Arquivos temporários e testes
├── docs/             # Documentação
└── .github/workflows # CI/CD pipelines
```

## Frontend

Aplicação web React para streaming de TV com interface moderna.

### Tecnologias

- React 18 + TypeScript
- Vite (bundler)
- Tailwind CSS
- React Router DOM
- Deploy automático no GitHub Pages

### Comandos

```bash
cd frontend

# Desenvolvimento
npm run dev          # Inicia servidor em http://localhost:3000/WebTV/

# Produção
npm run build        # Build para dist/
npm run preview      # Preview do build

# Qualidade
npm run lint         # ESLint
npm run type-check   # TypeScript check
```

### Deploy

- **Desenvolvimento**: `http://localhost:3000/WebTV/`
- **Produção**: `https://<username>.github.io/WebTV/`

O deploy é automatizado via GitHub Actions em pushes para `main`.

## Kotlin App

Aplicativo Android nativo que carrega o frontend em WebView.

### Funcionalidades

- WebView com suporte a múltiplas janelas
- Injeção de scripts JavaScript
- Sistema de eventos via JavaScript Interface
- Splash screen
- Controle de navegação (back button)

### Build

```bash
cd kotlin-app

# Debug
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Release (requer keystore)
./gradlew assembleRelease
```

### Estrutura

```
kotlin-app/
├── app/src/main/kotlin/com/webtv/
│   ├── SplashActivity.kt      # Tela inicial
│   ├── MainActivity.kt        # WebView principal
│   ├── ScriptInjector.kt      # Injeção de JS
│   ├── WebTVBridge.kt         # Interface JS↔Kotlin
│   └── WebTVLog.kt           # Sistema de logs
└── app/build.gradle.kts       # Configuração Android
```

## CI/CD

### Workflows

1. **deploy-frontend.yml**
   - Trigger: push para `main` com mudanças em `frontend/`
   - Build do React e deploy para GitHub Pages
   - Artefato: site publicado em `https://<username>.github.io/WebTV/`

2. **release-kotlin.yml**
   - Trigger: tags `v*`
   - Build release do APK assinado
   - Upload automático para GitHub Releases

### Secrets Necessários

Para releases Android, configure no GitHub:

```
ANDROID_KEYSTORE_BASE64    # Keystore codificado em base64
ANDROID_KEYSTORE_PASSWORD  # Senha do keystore
ANDROID_KEY_ALIAS          # Alias da chave
ANDROID_KEY_PASSWORD       # Senha da chave
```

## Configuração

### Base URL

O frontend usa `base: '/WebTV/'` no `vite.config.ts` para GitHub Pages.

Para domínio customizado:
1. Altere `base` em `frontend/vite.config.ts` para `'/'`
2. Configure CNAME no GitHub Pages
3. Ajuste `basename` no BrowserRouter se necessário

### Router

O app usa `BrowserRouter` com `basename` configurado para funcionar em subpaths:

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

## Desenvolvimento Local

1. Clone o repositório
2. Instale dependências do frontend: `cd frontend && npm install`
3. Inicie o servidor: `npm run dev`
4. Abra `http://localhost:3000/WebTV/`

Para Android, use Android Studio ou command-line tools.

## Licença

ISC
