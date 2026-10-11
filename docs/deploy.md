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

| Peça          | Como é publicada                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Front Angular | `@vercel/static-build` roda `npm run vercel-build` (`ng build` + registro do release) e publica `dist/web/browser` |
| API           | Uma única função Node: `api/index.mjs`, que reaproveita `makeServer()` de `api/src/server.ts`                      |

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
- `GET /recommendations` lê jogos, ajustes e configuração numa única query e calcula a fila
  em memória (~50 ms para ~500 jogos). Não há cache da fila no banco: ele poupava só esse
  cálculo e custava uma regravação a cada mudança. As tabelas `queue_snapshot*` e
  `user_queue_state` (migração 002) não são mais usadas pela API.
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

### Versões e rollback (`app_release`)

Cada deploy grava uma linha em `app_release` (migration `006_app_release` /
`20261011230000_app_release.sql`): `version` (package.json), `git_sha`, `git_ref`,
`commit_message`, `vercel_deployment_id`, `vercel_url`, `environment`,
`db_migration_version` (última de `supabase_migrations.schema_migrations`), `status`
(`deployed` / `rolled_back` / `superseded`), `rolled_back_to`, `created_at`, `notes`.
RLS ligada sem policies: só a API e os scripts (conexão direta) acessam.

- **Registro:** o `@vercel/static-build` executa o script `vercel-build` quando ele existe
  (prioridade sobre `build`). Ele roda `ng build` e depois `scripts/record-release.mjs`, que lê as
  variáveis de sistema (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`,
  `VERCEL_GIT_COMMIT_MESSAGE`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_DEPLOYMENT_ID`) e
  `DATABASE_URL`, grava o release e marca o anterior do mesmo environment como `superseded`.
  Sem `DATABASE_URL` ou com erro no banco, só loga: **o build nunca falha por isso**.
  Requer "Automatically expose System Environment Variables" ligado no projeto (já está:
  `vercel api /v9/projects/checkpoint` → `autoExposeSystemEnvs: true`).
- **Consulta:** `GET /api/v1/version` (público) → `{ version, gitSha, environment, deployedAt }`.

```powershell
npm run release:list                                   # últimos releases de produção
npm run release:list -- --env all --limit 50

# Rollback instantâneo na Vercel (sem build): re-aponta o domínio para o deploy alvo
npm run release:rollback -- <git_sha|version|dpl_...> --vercel          # dry-run (mostra o plano)
npm run release:rollback -- <git_sha|version|dpl_...> --vercel --yes    # executa `vercel rollback <url>`

# Rollback por git: `git revert --no-edit <alvo>..HEAD` + `git push` → novo deploy pela Vercel
npm run release:rollback -- <git_sha|version> --git          # dry-run
npm run release:rollback -- <git_sha|version> --git --yes    # exige working tree limpa

npm run release:tag     # cria a tag anotada v<version> e faz push
```

O script marca o release corrente como `rolled_back` (`rolled_back_to` = alvo) e, no modo
`--vercel`, o alvo volta a `deployed`. Comandos equivalentes à mão:

```powershell
vercel ls                                   # deploys recentes
vercel rollback https://<deploy>.vercel.app --yes
vercel rollback status
vercel promote https://<deploy>.vercel.app  # volta a promover (desfaz o rollback)
git revert --no-edit <sha>..HEAD; git push origin main
```

Cuidados:

- **Migrations não são revertidas.** O script mostra `db_migration_version` do alvo vs atual;
  se diferirem, avalie se o código antigo funciona com o schema novo (migrations aditivas
  costumam ser seguras) e reverta manualmente se necessário.
- Depois de `vercel rollback`, a Vercel **desliga a promoção automática**: pushes em `main`
  geram deploy (e linha `production` em `app_release`) mas não assumem o domínio até
  `vercel promote <url>`.
- O registro acontece no build: um deploy cujo build passou mas falhou depois fica como
  `deployed` (corrija com `UPDATE app_release SET status = ... WHERE id = ...`).

## 4. Domínio gps.dev.br — movido para `checkpoint`

O domínio `gps.dev.br` estava no projeto Vercel `clone-tabnews` (só o apex, sem `www` nem
redirects; o projeto antigo segue acessível em `clone-tabnews-chi-hazel.vercel.app`). Foi movido
para o projeto `checkpoint` com:

```powershell
vercel domains add gps.dev.br checkpoint --force
```

Produção: https://gps.dev.br (`/api/v1/health` → 200).

Rollback do domínio (devolve ao projeto antigo, sem tocar DNS):

```powershell
vercel domains add gps.dev.br clone-tabnews --force
```

Obs.: ao criar/alterar env vars da Vercel no Windows PowerShell 5.1, use
`vercel env add NOME <env> --value <valor>` — passar o valor por pipe insere BOM no conteúdo.
