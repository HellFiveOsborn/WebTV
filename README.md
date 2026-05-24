# WebTV

Sistema de streaming de TV multiplataforma com frontend React e app Android nativo em Kotlin.

## Estrutura

```
WebTV/
├── frontend/          # Aplicação React (Vite + TypeScript + Tailwind CSS)
├── kotlin-app/        # App Android nativo em Kotlin (WebView + injeção JS)
├── .github/workflows/ # CI/CD automatizado
└── AGENTS.md          # Diretrizes de desenvolvimento
```

## Frontend

Aplicação web React com TypeScript, usando Vite para desenvolvimento e Tailwind CSS para estilização.

### Desenvolvimento

```bash
cd frontend

# Instalar dependências
npm install

# Servidor de desenvolvimento (http://localhost:3000)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

### Deploy no GitHub Pages

O frontend está configurado para deploy no GitHub Pages com o caminho base `/WebTV/`.

**Deploy automático**: Push para a branch `main` dispara o workflow `.github/workflows/deploy-frontend.yml`.

**Habilitar GitHub Pages**:
1. Vá para Repo Settings → Pages
2. Em "Source", selecione **GitHub Actions**
3. O primeiro push irá construir e publicar automaticamente

### Scripts Importantes

- `npm run dev` - Inicia servidor de desenvolvimento Vite
- `npm run build` - Compila TypeScript e gera build otimizado
- `npm run preview` - Preview local do build de produção
- `npm run lint` - Verificação de código com ESLint

## Kotlin App

Aplicativo Android nativo escrito em Kotlin que carrega o frontend em uma WebView e injeta scripts JavaScript.

### Desenvolvimento

```bash
cd kotlin-app

# Build de debug
./gradlew assembleDebug

# Install no dispositivo conectado
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Limpar build
./gradlew clean
```

### Requisitos

- Android SDK (API 24+)
- JDK 17+
- Gradle 8.0+

### Permissões

O app requer as seguintes permissões Android:
- `INTERNET` - Acesso à internet para carregar streams
- `ACCESS_NETWORK_STATE` - Verificar conectividade
- `WAKE_LOCK` - Manter tela ativa durante reprodução

### Build de Release com CI/CD

Releases são gerados automaticamente quando uma tag `v*` é criada:

```bash
# Criar tag de release
git tag v1.0.0
git push origin v1.0.0
```

**Configuração de Secrets no GitHub**:

Para builds de release assinados, adicione estes secrets no GitHub:

- `KEYSTORE_BASE64` - Keystore codificado em base64:
  ```bash
  base64 -w 0 keystore/release.jks > keystore.b64
  # Copie o conteúdo para o secret
  ```

- `KEYSTORE_PASSWORD` - Senha do keystore
- `KEY_ALIAS` - Nome do alias do keystore
- `KEY_PASSWORD` - Senha da chave

O APK assinado será anexado automaticamente ao GitHub Release.

## Arquitetura

### Comunicação Frontend ↔ Kotlin

A comunicação entre o app Kotlin e o frontend React usa o padrão WebView JavaScript Bridge:

1. **Frontend expõe API**: `window.WebTV` com métodos JavaScript
2. **Kotlin injeta scripts**: Após `onPageFinished`, o Kotlin injeta os scripts necessários
3. **Eventos bidirecionais**: Sistema de eventos customizado permite comunicação em ambas direções

### Estrutura de Canais

Os canais são definidos em `frontend/src/data/*.ts` com a seguinte estrutura:

```typescript
interface Channel {
  id: string
  name: string
  url: string
  category: string
  type: 'iframe' | 'redirect' | 'mixed'
}
```

## Contribuindo

1. Clone o repositório:
   ```bash
   git clone https://github.com/HellFiveOsborn/WebTV.git
   cd WebTV
   ```

2. Configure o frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Configure o app Android:
   ```bash
   cd ../kotlin-app
   ./gradlew assembleDebug
   ```

4. Teste em dispositivo real ou emulador Android

## Licença

ISC

## Links

- **Frontend Live**: https://hellfiveosborn.github.io/WebTV/
- **Repositório**: https://github.com/HellFiveOsborn/WebTV
- **Issues**: https://github.com/HellFiveOsborn/WebTV/issues
