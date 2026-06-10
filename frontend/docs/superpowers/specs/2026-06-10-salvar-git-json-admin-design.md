# Salvar GIT-JSON — Painel Admin `/WebTV/own`

**Data:** 2026-06-10
**Status:** Aprovado
**Escopo:** Frontend React (painel admin). Não toca no app Android Kotlin.

## Contexto

O painel admin (`/WebTV/own`) atualmente faz autosave com debounce de 1s no Gist
GitHub (`channels.json`). Cada modificação em um canal dispara um PATCH. Editar
vários canais em sequência gera múltiplas requisições desnecessárias e
desgasta o rate limit da API do Gist.

## Objetivo

Substituir o autosave por **save manual via botão "Salvar GIT-JSON"** no dropdown
da sidebar. Edições ficam em memória e em rascunho `localStorage` até o usuário
clicar no botão. Indicador visual mostra o número de alterações pendentes.

## Decisões de Design

| Decisão | Escolha |
|---------|---------|
| Modo de salvamento | **Manual puro** (sem fallback automático) |
| Indicador visual | Contador `N alterações pendentes` no badge "Gist Sync" |
| Saída sem salvar | Dialog de confirmação (`beforeunload` + modal React em navegação interna) |
| Recarga do admin | Rascunho em `localStorage` (chave `webtv_channels_draft`) |
| Migração | Sem toggle — usuários existentes passam a usar modo manual direto |

## Arquitetura

### Componentes afetados

- `frontend/src/hooks/useChannelsData.ts` — substituir autosave por save manual + tracking de "dirty"
- `frontend/src/components/admin/OwnSidebar.tsx` — adicionar item "Salvar GIT-JSON" no dropdown + indicador de pendências
- `frontend/src/pages/OwnPage.tsx` — passar novas props/callbacks
- `frontend/src/lib/draftStorage.ts` (novo) — utilitário de localStorage para rascunho

### Estado novo no hook

- `baseline: ChannelsData | null` — último estado sincronizado com o Gist
- `pendingCount: number` — derivado: `0` se state atual === baseline; `>0` caso contrário

### Fluxo

1. **Load inicial**: `fetchGistData()` → define `baseline` e state atual
2. **Edição** (addChannel/updateChannel/etc.): atualiza state. **Nenhuma chamada de rede.**
3. **Rascunho local**: state atual é gravado em `localStorage['webtv_channels_draft']` (debounce 300ms)
4. **Save manual**: PATCH no Gist → `baseline = state` → limpa rascunho → `pendingCount = 0`
5. **beforeunload**: se `pendingCount > 0` → exibe `confirm()` nativo
6. **Recarregar página**: se `webtv_channels_draft` existe e diverge do Gist, modal:
   "Restaurar rascunho local (N alterações) / Usar versão do Gist"

### Contrato `draftStorage.ts`

```ts
saveDraft(data: ChannelsData): void    // debounce 300ms
loadDraft(): ChannelsData | null
clearDraft(): void
```

### UI — Sidebar

Dropdown existente ganha dois itens:
- **Salvar GIT-JSON** (novo, desabilitado se `pendingCount === 0`)
- **Descartar alterações** (novo, desabilitado se `pendingCount === 0`)
- Copiar JSON (existente)

Badge "Gist Sync" mostra estados:
- `saving` → spinner amarelo + "Salvando..."
- `saved` → ✓ verde + "Sincronizado"
- `pending` (novo) → ícone amarelo + "N alterações pendentes"
- `error` → ✗ vermelho + botão "Tentar novamente"
- `idle` → nuvem cinza + "Não configurado"

## Critérios de Aceitação

- [ ] Editar canal NÃO dispara PATCH no Gist
- [ ] Badge mostra "1 alteração pendente" após editar um canal
- [ ] Clicar em "Salvar GIT-JJSON" faz PATCH único e reseta o badge para "Sincronizado"
- [ ] Recarregar a página após editar restaura o rascunho via modal
- [ ] Tentar fechar a aba com alterações pendentes dispara `beforeunload`
- [ ] "Descartar alterações" reverte state para `baseline`
- [ ] Testes cobrem: dirty detection, save manual, persistência do rascunho, descarte

## Fora de Escopo

- App Android Kotlin (`kotlin-app/`)
- API `gistApi.ts` (já tem `saveGistData`)
- Toggle autosave/manual (YAGNI)
- Sincronização em tempo real entre abas