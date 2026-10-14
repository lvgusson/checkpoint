# Checkpoint — biblioteca de jogos

Aplicação local com API Node e React, sem login, com **481 jogos reais importados da sua planilha**. Três telas: lista de jogos, ordem recomendada e detalhes/avaliação. O visual usa componentes próprios inspirados no shadcn, com tags coloridas e layout responsivo.

## Abrir o app

Instale **Node 24.15 ou mais recente**. Compile o front uma vez e inicie a API, que serve o build em `apps/web/dist`:

```bash
pnpm install
pnpm build
pnpm start
```

Abra **http://localhost:3000**. Mantenha o terminal aberto durante o uso.

## Desenvolvimento

```bash
pnpm install
pnpm dev
```

Front (Vite): http://localhost:5173; API: http://localhost:3000. Para validar e recompilar:

```bash
pnpm check
```

`pnpm dev` recarrega a API com `node --watch` e o front com o dev server do Vite (HMR). Qualidade: `pnpm lint` / `lint:fix` (ESLint), `pnpm format` / `format:check` (Prettier).

## Autenticação (Supabase Auth)

A API lê `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do `.env` (`--env-file-if-exists`). O front busca essas duas informações públicas em `GET /api/v1/config` ao iniciar e cria o client `supabase-js`, que persiste a sessão e renova o token sozinho. Todas as rotas `/api/*` exigem `Authorization: Bearer <access_token>`, exceto `health`, `openapi.json` e `config`; a API valida o JWT localmente com o JWKS do projeto (`jose`, com cache). Sem `SUPABASE_URL`, a API roda sem autenticação em desenvolvimento e responde 503 em produção. `AUTH_GITHUB_ENABLED=true` mostra o botão "Continuar com GitHub". O usuário da requisição fica disponível em `getContext()` (`apps/api/src/context.ts`).

## Dados e persistência

`apps/api/src/seed.ts` contém todos os jogos e os campos da aba Jogos, incluindo Steam App ID, horas Steam, notas, comentários, classificações e valores originais das fórmulas. Valores calculados atuais vêm do algoritmo; os anteriores ficam em `imported`. Células vazias viram `null` ou texto vazio, e a antiga nota zero significa ausência de avaliação. Datas são ISO. O snapshot foi lido em 10/10/2026; não há sincronização automática com a planilha ou lojas.

Ao salvar, o adaptador grava `apps/api/data/games.json`, que é carregado no próximo início. Copie esse arquivo para fazer backup das alterações. Excluí-lo restaura o snapshot original. `DATA_FILE`, `PORT` e `HOST` podem configurar caminho, porta e interface. Por padrão o servidor usa 127.0.0.1. A aplicação não contém suas chaves de API nem suas credenciais.

Capas vêm do CDN da Steam quando há App ID. Jogos sem esse identificador usam uma capa gráfica com inicial; não foram inventados identificadores. As capas e fontes externas precisam de internet, mas o app funciona sem elas.

## API first e troca para SQL

Contrato OpenAPI: `apps/api/openapi.json`, também servido em `/api/v1/openapi.json`. Modelos compartilhados em `packages/core/src/models.ts`. Rotas principais:

- `GET /api/v1/games`: pesquisa, filtros, ordenação e paginação.
- `GET /api/v1/games/{id}`: todos os metadados e pontuação.
- `PATCH /api/v1/games/{id}`: edição parcial validada.
- `GET /api/v1/catalog`: opções de filtros e contagens.
- `GET /api/v1/recommendations`: fila completa, fatores e motivos.
- `POST /api/v1/queue/reorder` `{ gameId, toPosition }`: valida e responde 200 na hora (`{ accepted: true, … }`); o jogo é fixado em `toPosition` e a gravação segue em background.
- `GET /api/v1/queue/adjustments`: posições fixas e histórico de movimentos.
- `DELETE /api/v1/queue/adjustments/{gameId}`: solta a posição fixa do jogo.

### Posições fixas na fila

Na tela **Ordem de jogos**, arraste um jogo pelo puxador ⠿ (mouse, toque com long-press na linha, ou teclado: espaço pega, setas movem, espaço solta, Esc cancela). O front deixa o jogo onde foi solto sem esperar e envia os movimentos em sequência; a API só valida e responde 200, e o recálculo e a gravação continuam depois da resposta (`waitUntil` na Vercel), com até 5 tentativas e espera exponencial de 200, 400, 800 e 1600 ms (`apps/api/src/retry.ts`).

A fila exibida é calculada na leitura, em memória, juntando dois modelos: (a) a fila por pontuação, sem os jogos fixados (eles saem do cálculo, inclusive do contexto dos vizinhos), e (b) as posições fixas, inseridas em X crescente, empurrando o resto para baixo. Empate na mesma X: o movimento mais recente fica em X. X além do fim vai para o fim. Fixos que o arraste deslocou na tela têm o X reindexado, então a fila fica exatamente igual à tela. Pré-requisito não bloqueia: o item aparece com aviso ⚠ (`pinnedBeforePrerequisite`). Finalizar um jogo remove a posição fixa dele. Jogos com vontade **Imediata** vão para o topo da fila por pontuação, entre si pelo score; os fixos entram depois. Os pins ficam separados do registro importado (`ManualAdjustmentRepository`, arquivo `apps/api/data/manual-adjustments.json`, configurável por `MANUAL_FILE`) e podem ser soltos no × do chip “Fixado”.

`GameService` recebe a interface `GameRepository` (`list`, `get`, `save`). Para migrar, implemente um `SqlGameRepository`, mantendo o ID estável, e injete-o no lugar de `LocalGameRepository` em `server.ts`. Nenhuma tela precisa mudar. O adaptador atual grava atomicamente e serializa as gravações.

## Pontuação e ordem

A base combina **50% vontade, 35% afinidade e 15% duração**. Vontade: Muito Alta 100, Alta 75, Média 50, Baixa 25, Muito Baixa 0. Afinidade usa notas de 1–5 transformadas em 0–100, por gênero principal, mecânica e ritmo, com dois votos neutros para evitar exageros em poucos dados. O tempo usa campanha + extras, depois campanha principal, depois estimativa anterior; sem dado, permanece desconhecido. O fator pessoal de duração aprende com a mediana das razões entre horas reais e estimadas dos finalizados, suavizada e limitada a 0,5–2.

A fila é construída posição a posição. Penalidades: mesmo gênero −18; gênero há duas posições −8; mesma mecânica −10; subgêneros até −8 e até −4 há duas posições, proporcionalmente à sobreposição. Campanhas de 40h ou mais seguidas recebem −24; carga de 90h nos últimos três jogos dá −12 a outro longo. Mesmo ritmo −6. Bônus: contraste calmo/frenético +8; até 12h após longo +6; em andamento +8. Os últimos três finalizados com data iniciam o contexto. Pesos ficam em `apps/api/src/scoring.ts`.

Predecessores cadastrados vêm antes das continuações, mas **não há obrigação de jogá-las todas seguidas**. ID ausente não bloqueia; ciclos aparecem no diagnóstico. Finalizados, abandonados e títulos com estrutura “Sem fim definido” ficam fora. Pontuações contextuais podem ultrapassar 100: são prioridades, não notas de qualidade.

Uma nova nota pode finalizar o jogo automaticamente; desmarque a opção se estiver avaliando antecipadamente. Só alterar vontade ou horas preserva o status. Notas já existentes no snapshot não finalizam retroativamente. A ordem é calculada de novo em cada leitura, usando os dados salvos, sem cron ou recarga manual de banco. Navegar de volta à fila busca a versão atual.

Não há cadastro/exclusão de jogos nesta primeira versão de três telas, nem importações de lojas em tempo real. O conjunto inicial pode ser ampliado pelo seed ou por um adaptador futuro.
