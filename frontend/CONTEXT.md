Crie uma aplicação ReactJS exclusivamente e @frontend/ com tela inicial que exiba uma grade de canais na porta 3000. 

Utilize a stack mais simples e fácil, como Vite ou outra tecnologia mais moderna, com tema escuro, Material UI ou outro framework de UI.

Preencha‑a temporariamente com dados de exemplo, incluindo título do canal e logotipo. Implemente um fluxo de canais recentes (últimos canais acessados) e permita a ordenação desses canais. Persista os dados da forma mais adequada, usando localStorage ou cookies. Utilize um tema escuro adequado para projetores e AndroidTV, com tipografia e tamanho de fonte apropriados.

Habilite a navegação por controle DPAD, mapeie os botões para navegar entre os canais, avançando e retrocedendo, e configure os botões entrar e sair para voltar.

Ao clicar em um canal, o link correspondente deve ser aberto. Por enquanto, ele é um placeholder. No futuro, os canais serão links diretos ou links interno acompanhados de um iframe que exiba o canal em questão. O comportamento de abertura será conforme necessário: redirecionamento externo ou interno com iframe.

Não inclua nada ao redor da grade de canais, exceto um campo de busca e um contêiner principal. Mapeie os botões DPAD para navegação, barra de busca e clique em um canal para abrir o link correspondente.

Defina mensagens de feedback para o usuário, como "Carregando..." ou "Canal não encontrado", em casos de carregamento ou não encontrado de canais.

Planeje a estrutura do projeto, incluindo as dependências, arquitetura e design, tema dark por default.

## Microfone (WebView)

A permissão `RECORD_AUDIO` está declarada no `AndroidManifest.xml` e o `MainActivity.kt` já contém o fluxo completo de runtime permission sob demanda: o `WebChromeClient.onPermissionRequest()` verifica se `RECORD_AUDIO` foi concedida; caso já esteja, concede automaticamente ao WebView; caso contrário, solicita ao usuário via dialog e então concede ou nega o `PermissionRequest` pendente. O frontend pode usar qualquer API padrão do navegador (`navigator.mediaDevices.getUserMedia({ audio: true })` ou `<input type="file" accept="audio/*" capture>`) e o WebView irá propagar corretamente. Ideal para futura implementação de busca por voz, reconhecimento de fala, ou outros recursos que dependam de áudio.
