# Infrastructure documentation history

This append-only archive preserves exact superseded architectural content. Follow [the deprecation template](../deprecation-template.md) before replacing active facts. No deprecations are fabricated for previously undocumented behavior.


## DEP-20261012-release-integration-pending-15

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/infrastructure/deployment-and-release.md`
- Original document ID: `architecture.infrastructure.delivery`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/infrastructure/deployment-and-release.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.infrastructure.delivery
title: Deployment and release operations
type: integration
area: infrastructure
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - vercel.json
  - api/index.mjs
  - api/src/setup.ts
  - api/src/db.ts
  - api/src/version.ts
  - scripts/record-release.mjs
  - scripts/release-lib.mjs
  - scripts/rollback.mjs
  - package.json
  - .gitignore
  - .vercelignore
related_domains: []
tags: [deployment, rollback, configuration]
---

# Deployment and release operations

## 1. Purpose

Explain application packaging, release evidence and rollback limitations.

## 2. Scope and ownership

Owns source-controlled deployment behavior. Separate database documentation owns migrations; coordinator-owned harness documents describe the new review hooks.

## 3. Architecture map

| Responsibility          | Source                                            | Behavior                                          |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Static bundle           | `vercel.json`, `package.json`                     | Angular output `dist/web/browser`                 |
| API function            | `api/index.mjs`                                   | Reuses makeServer request listener                |
| Release recording       | `scripts/record-release.mjs`                      | Best-effort build-time database record            |
| Version endpoint        | `api/src/version.ts`                              | Database lookup with environment/package fallback |
| Rollback plan/execution | `scripts/rollback.mjs`, `scripts/release-lib.mjs` | Dry run by default                                |

## 4. Contracts and behavior

Vercel routes `/api/*` to a single `api/index.mjs` Node function, existing static files through filesystem handling and other paths to index.html. The function imports TypeScript implementation directly and forwards requests to the HTTP server listener. Included files cover API sources, shared sources, OpenAPI and package metadata. Config specifies pdx1; package engines require Node >=24.15.0.

`vercel-build` runs Angular build then record-release. The record script uses Vercel Git/deployment environment metadata and package version, obtains the maximum Supabase migration ledger version, writes app_release and supersedes prior deployed records in one transaction. Errors and its 30-second timeout do not fail the build. Build-time records do not prove successful deployment/promotion.

Rollback resolves a release by deployment, URL, SHA or version. Without --yes it prints a plan. With --yes it invokes Vercel rollback or creates Git revert commits followed by push; Git mode checks a clean working tree and target ancestry. Migration reversal is always manual. Release tags are separate operations.

## 5. Invariants

Do not infer current served traffic from app_release.status alone. Rollback must account for older code running on the current database schema. JSON fallback is temporary and per serverless instance. Credentials must not appear in committed source, architecture documents or archive entries.

### Release registration policy

MANDATORY: every push to `main` MUST publish a new release record with `POST /api/v1/releases` (Bearer `RELEASE_API_TOKEN`) or `npm run release:note -- "<description>" [--kind fix|feature|chore|release|rollback] [--bump minor|major]`. The record carries the pushed commit hash, SemVer version, optional name, `kind` and a short description of what the push delivers.

- Versioning: each push increments the patch automatically (0.0.1, 0.0.2, …). Use `--bump minor` or `--bump major` only when the user explicitly asks; 1.0.0 is reserved for a real product launch.
- The release table is append-only: only `GET /api/v1/releases`, `GET /api/v1/releases/latest` and `POST /api/v1/releases` exist. Never add PATCH/DELETE or UPDATE/DELETE statements against it.
- A rollback is a new record with `kind: rollback`; it never modifies earlier records.

UNKNOWN: the endpoint, the script and the append-only table are being implemented on a separate branch and are not yet on `main`. Until they land, the current `scripts/record-release.mjs` (supersedes prior records) and `scripts/rollback.mjs` (sets `status = 'rolled_back'`) still UPDATE `app_release`; this contradicts the policy above and must be removed by that change.

## 6. Dependencies

API storage selection depends on DATABASE_URL; identity depends on SUPABASE_URL and public key configuration. Direct SQL uses postgres.js with prepared statements disabled. Intended transaction-pooler topology is described by repository documentation, but actual endpoint/role is unknown. External Steam/Auth availability affects application operations.

## 7. Data and state

`currentVersion` prefers the current deployment database record, then package version/environment SHA or local Git; deployed database results are cached per instance. Vercel fallback results remain uncached so a delayed release record can later be found. app_release retains deployment metadata and rollback relationships.

Environment names consumed include DATABASE_URL, DATABASE_URL_SESSION, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY, SEED_OWNER_EMAIL, PG_POOL_MAX and Vercel system variables. Values were not read. Git/build ignore files exclude local environment files, deployment state and mutable API data. Initial Husky hooks run lint-staged and commitlint; initial discovery found no .github/workflows directory.

## 8. Source references

`vercel.json`; `api/index.mjs#handler`; `api/src/setup.ts#createService`; `api/src/db.ts#db`; `api/src/version.ts#currentVersion`; `scripts/record-release.mjs#main`; `scripts/release-lib.mjs#resolveTarget`, `gitRollbackCommands`, `migrationWarning`; `scripts/rollback.mjs#rollback`; `.gitignore`; `.vercelignore`.

## 9. Related documentation

[Infrastructure root](../infrastructure-architecture.md), [database migrations](../database/migrations.md), [persistence](../database/persistence.md), [security root](../security-architecture.md).

## 10. Evidence and uncertainties

VERIFIED source/configuration only; no releases were queried or deployed. UNKNOWN: remote project configuration, automatic Git deployment connection, successful served release, hosted monitoring/backups and rollback readiness. Existing docs/deploy.md describes apply_queue_move-based reordering, while current PgManualAdjustmentRepository.pin uses CTE statements. Do not treat supporting prose as proof of current executable behavior.
````

## DEP-20261012-release-integration-pending-17

- Date: 2026-10-12T12:00:00-03:00
- Source: `AI/Architecture/infrastructure-architecture.md`
- Original document ID: `architecture.infrastructure`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `AI/Architecture/infrastructure-architecture.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
---
id: architecture.infrastructure
title: Infrastructure architecture
type: architecture-root
area: infrastructure
status: active
owner: unknown
last_verified: 2026-10-11
source_paths:
  - vercel.json
  - api/index.mjs
  - package.json
  - supabase/config.toml
  - scripts/record-release.mjs
  - scripts/rollback.mjs
related_domains: []
tags: [vercel, operations]
---

# Infrastructure architecture

## 1. Purpose

Map repository-supported deployment and operational boundaries.

## 2. Scope and ownership

Owns runtime packaging, configuration sources and release operations. Hosted service state is not established by these files.

## 3. Architecture map

| Responsibility                          | Source                                               | Detail                                                                     |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Angular static output and Node function | `vercel.json`, `api/index.mjs`                       | [Deployment and release](infrastructure/deployment-and-release.md)         |
| Database/Auth configuration             | `supabase/config.toml`                               | [Database](database-architecture.md), [security](security-architecture.md) |
| Release catalogue and rollback          | `scripts/record-release.mjs`, `scripts/rollback.mjs` | [Deployment and release](infrastructure/deployment-and-release.md)         |

## 4. Contracts and behavior

VERIFIED: Vercel config declares pdx1, one Node API entry and Angular static output. package.json requires Node >=24.15.0. npm scripts provide local start/dev/check and Vercel build/release recording.

## 5. Invariants

Application rollback leaves migrations intact. Serverless JSON fallback uses temporary per-instance state. Production auth missing required configuration fails closed on protected routes.

## 6. Dependencies

Vercel serves static assets and the Node function. The API may depend on PostgreSQL/Supabase Auth and external Steam services. Local checks depend on TypeScript, ESLint, Prettier, Node tests and Angular build.

## 7. Data and state

No repository evidence establishes hosted backups, scaling limits or alerting. [Deployment and release](infrastructure/deployment-and-release.md) documents process state, database pool lifecycle and best-effort release recording.

## 8. Source references

`vercel.json`; `api/index.mjs#handler`; `package.json#scripts`; `supabase/config.toml`; `scripts/record-release.mjs#main`; `scripts/rollback.mjs#rollback`.

## 9. Related documentation

[Architecture index](architecture-index.md), [database root](database-architecture.md), [security root](security-architecture.md).

## 10. Evidence and uncertainties

VERIFIED local configuration. INFERRED intended hosted topology follows Vercel/Supabase documentation in the repository. UNKNOWN: deployment connections, currently served release, hosted settings, backups and remote CI/branch protection. Existing Husky hooks were lint-staged and commitlint during initial discovery; this bootstrap adds enforcement documented by the coordinator.
````

## DEP-20261012-release-integration-main-18

- Date: 2026-10-12T12:00:00-03:00
- Source: `docs/deploy.md`
- Original document ID: `legacy-supporting-document`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `docs/deploy.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
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

| Nome                                        | Uso                                                                   | Exposição                   |
| ------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| `SUPABASE_URL`                              | URL do projeto Supabase                                               | servidor (pode ir ao front) |
| `SUPABASE_ANON_KEY` (ou publishable key)    | cliente público, sujeito a RLS                                        | pode ir ao front            |
| `SUPABASE_SERVICE_ROLE_KEY` (ou secret key) | acesso administrativo na API                                          | **somente servidor**        |
| `DATABASE_URL`                              | Postgres via pooler em modo transação (6543); liga o repositório Pg   | **somente servidor**        |
| `SEED_OWNER_EMAIL`                          | e-mail que reivindica os dados do seed no primeiro login              | servidor                    |
| `AUTH_GITHUB_ENABLED`                       | `true` mostra o login com GitHub no front                             | servidor                    |
| `PG_POOL_MAX`                               | opcional, conexões por instância (padrão 5)                           | servidor                    |
| `DATA_DIR`                                  | opcional, diretório dos JSON locais (só sem `DATABASE_URL`)           | servidor                    |
| `STEAM_API_KEY`                             | só para resolver nome personalizado de perfil na importação           | **somente servidor**        |
| `STEAM_PROFILE`                             | perfil padrão da importação (SteamID64 ou URL; aceita `STEAM_DOMAIN`) | servidor                    |
| `STEAM_COUNTRY`                             | opcional, loja/moeda dos preços (padrão `BR` = BRL)                   | servidor                    |

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
````

## DEP-20261012-release-integration-pending-support-19

- Date: 2026-10-12T12:00:00-03:00
- Source: `docs/deploy.md`
- Original document ID: `legacy-supporting-document`
- Original section: `entire document`
- Reason: Synchronize the integrated application and append-only release contracts.
- Replacement: `docs/deploy.md`
- Related code: `api/src/releases.ts`, `web/src/finish-dialog.ts`, `AI/read-main-entry.mjs`
- Change reference: approved release integration

### Exact previous content

````markdown
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

| Nome                                        | Uso                                                                   | Exposição                   |
| ------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| `SUPABASE_URL`                              | URL do projeto Supabase                                               | servidor (pode ir ao front) |
| `SUPABASE_ANON_KEY` (ou publishable key)    | cliente público, sujeito a RLS                                        | pode ir ao front            |
| `SUPABASE_SERVICE_ROLE_KEY` (ou secret key) | acesso administrativo na API                                          | **somente servidor**        |
| `DATABASE_URL`                              | Postgres via pooler em modo transação (6543); liga o repositório Pg   | **somente servidor**        |
| `SEED_OWNER_EMAIL`                          | e-mail que reivindica os dados do seed no primeiro login              | servidor                    |
| `AUTH_GITHUB_ENABLED`                       | `true` mostra o login com GitHub no front                             | servidor                    |
| `PG_POOL_MAX`                               | opcional, conexões por instância (padrão 5)                           | servidor                    |
| `DATA_DIR`                                  | opcional, diretório dos JSON locais (só sem `DATABASE_URL`)           | servidor                    |
| `STEAM_API_KEY`                             | só para resolver nome personalizado de perfil na importação           | **somente servidor**        |
| `STEAM_PROFILE`                             | perfil padrão da importação (SteamID64 ou URL; aceita `STEAM_DOMAIN`) | servidor                    |
| `STEAM_COUNTRY`                             | opcional, loja/moeda dos preços (padrão `BR` = BRL)                   | servidor                    |

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

### Versões e rollback (`app_release`, append-only)

Migration `20261012050000_release_log.sql` (`db/migrations/015_release_log.sql`). Duas tabelas
**só de inserção** (triggers recusam UPDATE/DELETE/TRUNCATE; sem grants para anon/authenticated):

- `app_release`: uma linha por versão publicada em cada environment. `version` SemVer próprio
  (0.0.1, 0.0.2, ...; lançamento = 1.0.0), `name` opcional, `kind` (`feature`, `fix`,
  `refactor`, `chore`, `release`, `rollback`), `description` curta (3–500), `git_sha`, `git_ref`,
  `environment`, `rollback_to` (alvo do rollback), `created_by`, `created_at`. Únicos:
  `(environment, version)` e `(environment, git_sha)` exceto rollbacks.
- `app_release_deploy`: um build da Vercel ligado à versão do commit (`vercel_deployment_id`,
  `vercel_url`, `db_migration_version`).

A versão no ar é a última linha (maior id) do environment. As 4 linhas antigas viraram
0.0.1–0.0.4 (descrição = 1ª linha do commit). O `version` do package.json (0.0.0) não é usado.

**A cada push** (antes do `git push`), registre o que está subindo:

```powershell
npm run release:note -- "Corrige o arraste no celular" --kind fix          # 0.0.N+1
npm run release:note -- "Fila por listas" --kind feature --name "Listas" --bump minor
npm run release:note -- "Lançamento" --kind release --version 1.0.0          # lançamento
```

O script pega o commit (`HEAD`) e faz `POST https://gps.dev.br/api/v1/releases` com
`RELEASE_API_TOKEN` (ou `--db` para gravar direto com `DATABASE_URL_SESSION`). O mesmo commit
não gera duas versões (o POST devolve a existente).

- **Build:** `vercel-build` roda `ng build` + `scripts/record-release.mjs`. Ele liga o deploy à
  versão do commit; se ninguém registrou o commit, cria uma automática (patch+1, `chore`,
  descrição = 1ª linha do commit). Falhas só são logadas: **o build nunca falha por isso**.
  Requer "Automatically expose System Environment Variables" (já ligado).
- **API:** `GET /api/v1/releases` (público, `?environment=&limit=&before=`),
  `GET /api/v1/releases/latest`, `POST /api/v1/releases` (token). PATCH/PUT/DELETE = 405.
  `GET /api/v1/version` → `{ version, name, description, gitSha, environment, deployedAt }`.
- **Envs:** `RELEASE_API_TOKEN` (Vercel, production; e localmente para `release:note`),
  `RELEASE_API_URL` opcional (padrão `https://gps.dev.br`).

```powershell
npm run release:list                                   # últimas versões de produção
npm run release:list -- --env all --limit 50

# Rollback instantâneo na Vercel (sem build): re-aponta o domínio para o deploy alvo
npm run release:rollback -- <git_sha|version|dpl_...> --vercel          # dry-run (mostra o plano)
npm run release:rollback -- <git_sha|version|dpl_...> --vercel --yes    # executa `vercel rollback <url>`

# Rollback por git: `git revert --no-edit <alvo>..HEAD` + `git push` → novo deploy pela Vercel
npm run release:rollback -- <git_sha|version> --git          # dry-run
npm run release:rollback -- <git_sha|version> --git --yes    # exige working tree limpa

npm run release:tag     # tag anotada v<versão corrente> no commit dela + push
```

O rollback **não altera** linhas: registra uma versão nova `kind = 'rollback'` com
`rollback_to` = alvo (no `--vercel`, no commit do alvo; no `--git`, no commit do revert, antes
do push, e o build reaproveita). Comandos equivalentes à mão:

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
  geram deploy (e versão em `app_release`) mas não assumem o domínio até `vercel promote <url>`.
- Errou a descrição? Registre outra versão (não há edição): o histórico fica completo.

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
````
