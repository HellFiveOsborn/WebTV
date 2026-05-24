Crie um aplicativo em Kotlin, limpo e exclusivo, contendo apenas o básico: splash screen e uma tela inicial fullscreen (ocultar barra de status e barra de navegação). Ele deve abrir um site que exibirá uma grade de canais.

O motor de WebView deve ser o mais próximo possível de um navegador web, como o Google Chrome, para evitar bloqueios de conteúdo da Cloudflare, entre outros. Cookies, local storage, otimizações e injeção de scripts. (No aplicativo serão executados players de vídeo, comuns HLS,VideoJS,JWPlayer,Clapr etc...), não deve haver barras de navegação visíveis, area do website carregado pelo WebView deve ocupar toda a tela.

Permita a injeção de scripts nas páginas web carregadas pelo WebView. Não inclua um sistema de abas visíveis, mas não bloqueie, pois os sites podem não carregar corretamente.

O nome do app será 'WebTV', a versão inicial deve ser 1.0.0.

Deve ser desenvolvido dentro de kotlin-app/. Na pasta há o logotipo do aplicativo, que pode ser registrado como ícone, splash screen etc. Temos o Imagick instalado no PowerShell.

Planeje a estrutura do projeto, incluindo as dependências, arquitetura e design do app, use material design simples tema dark por default.

URL do site a ser carregado pelo WebView: http://localhost:3000
