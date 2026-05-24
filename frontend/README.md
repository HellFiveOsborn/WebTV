# WebTV Frontend

Aplicação ReactJS para exibição de grade de canais de TV com navegação DPAD, tema escuro e persistência de dados.

## Stack Tecnológica

- **React 18.3** - Framework UI
- **TypeScript 5.5** - Tipagem estática
- **Vite 5.3** - Bundler e dev server
- **Tailwind CSS 3.4** - Estilização utilitária
- **localStorage** - Persistência de dados

## Instalação

```bash
cd frontend
npm install
```

## Scripts Disponíveis

### `npm run dev`

Inicia o servidor de desenvolvimento na porta 3000 com hot reload.

```bash
npm run dev
```

Acesse: http://localhost:3000

### `npm run build`

Gera build de produção otimizada em `dist/`.

```bash
npm run build
```

### `npm run preview`

Serve o build de produção localmente para testes.

```bash
npm run preview
```

### `npm run lint`

Executa linting com ESLint.

```bash
npm run lint
```

## Integração com Kotlin App

O APK Android (kotlin-app) carrega esta aplicação via WebView em `http://localhost:3000`.

### Para testar a integração:

1. Inicie o frontend:
   ```bash
   npm run dev
   ```

2. Inicie o APK no emulador/dispositivo Android

3. O WebView automaticamente carregará http://localhost:3000

4. Teste a navegação DPAD com o controle remoto do Android TV

## Navegação DPAD

O frontend suporta navegação via DPAD (controle remoto de TV):

- **Setas (↑↓←→)**: Navegar entre canais
- **Enter**: Selecionar canal
- **Escape**: Limpar seleção/voltar

No navegador, use as teclas de seta do teclado para simular o DPAD.

## Estrutura do Projeto

```
frontend/
├── src/
│   ├── components/       # Componentes React
│   │   ├── ChannelCard.tsx
│   │   ├── ChannelGrid.tsx
│   │   ├── SearchBar.tsx
│   │   └── FeedbackMessage.tsx
│   ├── data/            # Dados mock
│   │   └── mockChannels.ts
│   ├── hooks/           # Custom hooks
│   │   ├── useDpadNavigation.ts
│   │   └── useRecentChannels.ts
│   ├── lib/             # Utilitários
│   │   └── storage.ts
│   ├── types/           # Tipos TypeScript
│   │   └── channel.ts
│   ├── utils/           # Funções auxiliares
│   │   └── focus.ts
│   ├── App.tsx          # Componente principal
│   ├── main.tsx         # Entry point
│   └── index.css        # Estilos globais
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

## Temas e Cores

O tema escuro está configurado para projetores e AndroidTV:

- **Background**: `#121212`
- **Surface/Cards**: `#1e1e1e`
- **Borders**: `#2a2a2a`
- **Texto primário**: `#ffffff`
- **Texto secundário**: `#a0a0a0`
- **Accent (foco)**: `#3b82f6`

## Próximos Passos (TODO)

- [ ] Integrar com API real de canais
- [ ] Implementar visualização via iframe ao invés de window.open
- [ ] Adicionar suporte a favoritos
- [ ] Implementar categorias avançadas
- [ ] Adicionar legendas e descrições de canais
- [ ] Suporte a múltiplos idiomas

## Licença

Projeto interno WebTV.
