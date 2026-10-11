# Deploy — Checkpoint

## 1. Rodar localmente

Requisitos: Node 24.15+ (a API roda `.ts` direto com type stripping nativo).

```bash
npm ci
npm run dev      # Angular em http://localhost:4200 + API em http://localhost:3000
npm start        # só a API servindo o build em dist/web/browser (rode `npm run build` antes)
npm run check    # typecheck + testes + build
```

Variáveis locais ficam em `.env` / `.env.local` / `local-env.env` — **todos ignorados pelo git**. Nunca commite valores.

## 2. Fluxo git

- Branch principal: `main`. Commits no estilo Conventional Commits (`feat:`, `fix:`, `chore:`...).
- Remoto: `origin` → repositório GitHub privado `checkpoint` (ou `checkpoint-games`, se o nome já existir).
- Antes de cada commit confira `git status` e garanta que nenhum `.env*`, `local-env.env`, `.claude/settings.local.json`, `.vercel/` ou `api/data/*.json` (dados privados gravados por `LocalGameRepository`/`LocalManualAdjustmentRepository`) entrou no índice.
- Push em `main` dispara deploy de produção na Vercel; outras branches/PRs geram previews (após `vercel git connect`).

Configuração inicial (uma vez, após login):

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth login --web --git-protocol https
& "C:\Program Files\GitHub CLI\gh.exe" auth setup-git
git config user.name "<nome do perfil GitHub>"
git config user.email lucasgusson99@gmail.com
gh repo create checkpoint --private --source . --remote origin
git add -A; git commit -m "chore: initial commit"; git push -u origin main
```

## 3. Vercel

### Estrutura

| Peça          | Como é publicada                                                                              |
| ------------- | --------------------------------------------------------------------------------------------- |
| Front Angular | `@vercel/static-build` roda `npm run build` (`ng build`) e publica `dist/web/browser`         |
| API           | Uma única função Node: `api/index.mjs`, que reaproveita `makeServer()` de `api/src/server.ts` |

`vercel.json` usa o bloco `builds` de propósito: a Vercel trata todo arquivo em `api/` como função
serverless, e `api/src/**` / `api/test/**` virariam funções. Com `builds`, só `api/index.mjs` é
função; `api/src/**`, `shared/**` e `docs/openapi.json` entram como `includeFiles`. `api/test` e
`api/data` estão em `.vercelignore`.

Rotas: `/api/*` → função; arquivos estáticos existentes → servidos; demais → `index.html` (SPA).

`api/index.mjs` é JS puro e importa os `.ts` de `api/src` diretamente — o runtime Node 24 da
Vercel os executa via type stripping (não há transpilação do `@vercel/node` reescrevendo imports `.ts`).
O handler é `server.emit("request", req, res)` sobre o `http.Server` devolvido por `makeServer`,
então **não foi necessário alterar `api/src/server.ts`**.

Alternativa futura (mais limpa): mover `api/src` → `server/` e deixar em `api/` só o entry; aí
`builds` pode ser trocado por `buildCommand`/`outputDirectory`/`rewrites` modernos.

### Persistência

`api/src/setup.ts` escolhe o armazenamento (usado por `api/index.mjs` e `npm start`):

- **`DATABASE_URL` definida → Postgres do Supabase** (`api/src/pg-repository.ts`). Driver
  `postgres` (porsager), singleton em `api/src/db.ts`, pooler Supavisor em modo transação
  (porta 6543) com `prepare: false` e pool de 5 conexões por instância (`PG_POOL_MAX`).
  A conexão é direta (RLS não se aplica): toda query filtra pelo `app_user` do usuário do
  JWT (`api/src/app-user.ts`; no primeiro login o app_user do seed é vinculado se o e-mail
  bater com o do seed ou com `SEED_OWNER_EMAIL`, senão é criado um vazio).
- **Sem `DATABASE_URL` → JSON locais** (`api/data/*.json`, ou `/tmp/checkpoint`/`DATA_DIR`
  na Vercel — efêmero, só para previews sem banco). Os testes usam este modo.

Decisões de performance (Postgres):

- Cada leitura é **um round trip**: os jogos do usuário vêm num `json_agg` já no formato da
  API (sem N+1); o algoritmo continua em TypeScript sobre essa lista.
- `GET /recommendations` usa o snapshot da fila (`queue_snapshot*`): uma única query lê a
  versão das entradas (`user_queue_state.inputs_version`), os jogos, os ajustes e o snapshot
  (só se fresco). Fresco → nada é recalculado; velho → recalcula e regrava numa transação com
  advisory lock. Os cards vêm sempre da leitura atual (notas/capa nunca ficam velhas).
- Reordenação grava só o **delta** via `apply_queue_move` (atômica e idempotente por
  `client_request_id`); zerar usa um único statement (delete + evento `reset`).
- As colunas materializadas `library_entry.planned_hours/affinity/base_score` **não** são
  gravadas (a listagem ordena em memória e o trigger de `library_entry` mexeria em
  `updated_at` de todas as linhas).
- Edições de campos da obra (`name`, gênero, ritmo, horas...) gravam no catálogo global
  `game` — correto para um único dono; com vários usuários precisa de curadoria/overrides.

### Variáveis de ambiente (nomes apenas — configure em Project Settings → Environment Variables ou `vercel env add`)

| Nome                                        | Uso                                                                 | Exposição                   |
| ------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| `SUPABASE_URL`                              | URL do projeto Supabase                                             | servidor (pode ir ao front) |
| `SUPABASE_ANON_KEY` (ou publishable key)    | cliente público, sujeito a RLS                                      | pode ir ao front            |
| `SUPABASE_SERVICE_ROLE_KEY` (ou secret key) | acesso administrativo na API                                        | **somente servidor**        |
| `DATABASE_URL`                              | Postgres via pooler em modo transação (6543); liga o repositório Pg | **somente servidor**        |
| `SEED_OWNER_EMAIL`                          | e-mail que reivindica os dados do seed no primeiro login            | servidor                    |
| `AUTH_GITHUB_ENABLED`                       | `true` mostra o login com GitHub no front                           | servidor                    |
| `PG_POOL_MAX`                               | opcional, conexões por instância (padrão 5)                         | servidor                    |
| `DATA_DIR`                                  | opcional, diretório dos JSON locais (só sem `DATABASE_URL`)         | servidor                    |

Obs.: o arquivo local `local-env.env` usa nomes diferentes (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATA-BASE_KEY`, `DATA_BASE_CONECTION_STRING`). Padronize
para os nomes acima ao cadastrar na Vercel (`DATA-BASE_KEY` com hífen nem é um nome válido de env var POSIX).

### Comandos

```powershell
& "$env:APPDATA\npm\vercel.cmd" login
vercel project add checkpoint          # projeto NOVO; não mexer nos existentes
vercel link --project checkpoint --yes
vercel git connect                     # liga ao repositório GitHub
vercel deploy                          # preview
vercel deploy --prod                   # produção
```

## 4. Domínio gps.dev.br — pendente

Decisão do usuário: mover `gps.dev.br` (e `www.gps.dev.br`, se existir) do projeto atual para o
projeto novo `checkpoint`, **somente após um deploy de produção em que o front carregue**.

Antes de mover, registrar aqui para rollback:

- Projeto/repositório que usa o domínio hoje: _(preencher — `vercel domains inspect gps.dev.br`, `vercel project ls`)_
- Redirects (ex.: `www` → apex) e aliases: _(preencher)_

Procedimento (sem tocar DNS fora da Vercel, sem apagar projeto antigo nem o domínio da conta):

1. `vercel deploy --prod` no projeto `checkpoint` e validar que `index.html` é servido.
2. No projeto antigo: Settings → Domains → remover `gps.dev.br` / `www.gps.dev.br` (só a associação).
3. No projeto `checkpoint`: `vercel domains add gps.dev.br` (e `www.gps.dev.br`, recriando o redirect).
4. Rollback: inverter os passos 2–3.
