# Supabase: Checkpoint

| Item             | Valor                                                       |
| ---------------- | ----------------------------------------------------------- |
| Project ref      | `yvsipeicyboqaslyqwrt`                                      |
| URL da API       | `https://yvsipeicyboqaslyqwrt.supabase.co`                  |
| Dashboard        | https://supabase.com/dashboard/project/yvsipeicyboqaslyqwrt |
| Postgres         | 17 (`config.toml` → `major_version = 17`)                   |
| Região do pooler | `aws-1-us-west-2.pooler.supabase.com`                       |

As credenciais ficam só em `.env`, que está no `.gitignore`. Os nomes das variáveis estão em `.env.example`:

- `DATABASE_URL`: pooler em modo transação, porta 6543. É a conexão da API Node (serverless). Não use prepared statements nomeados.
- `DATABASE_URL_SESSION`: pooler em modo sessão, porta 5432, IPv4. Use para migrations, seed e scripts.
- `DIRECT_URL`: conexão direta `db.<ref>.supabase.co`, que só funciona em redes com IPv6.
- `SUPABASE_PUBLISHABLE_KEY`: pode ir para o front.
- `SUPABASE_SECRET_KEY`: só no servidor, porque ignora a RLS.

## Como foi configurado

1. Rodamos `npx supabase init`, que criou `supabase/config.toml`. O CLI usado foi `npx supabase@latest` (v2.120).
2. O projeto já existia e foi criado pelo usuário. A URL, a publishable key e a senha do banco vieram de `local-env.env`. O CLI **não** está autenticado nem vinculado (`supabase link`), porque não há access token. Por isso todos os comandos usam `--db-url`.
3. As migrations são cópias de `db/migrations/*.sql`, com prefixo de timestamp:

| Arquivo                                 | Origem                   | Ajustes                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261011120001_init.sql`               | `001_init.sql`           | `BEGIN;`/`COMMIT;` removidos: o CLI já aplica cada migration em transação                                                                                                                                                                                                                                         |
| `20261011120002_queue_snapshot.sql`     | `002_queue_snapshot.sql` | O mesmo ajuste                                                                                                                                                                                                                                                                                                    |
| `20261011120003_rls.sql`                | `003_rls.sql`            | O mesmo ajuste                                                                                                                                                                                                                                                                                                    |
| `20261011154854_supabase_hardening.sql` | Só existe aqui           | Fixa o `search_path` das funções que não tinham. Revoga os grants amplos que o Supabase dá por padrão a `anon`/`authenticated` e reconcede só o que a `003` declara. `apply_queue_move`/`reset_queue_adjustments` passam a valer só para `authenticated`, e `ensure_app_user` deixa de ser executável por `anon`. |

4. O seed `supabase/seed.sql` é gerado por `db/seed/import.mjs` e é idempotente (`ON CONFLICT`).

## Aplicar migrations

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$u = ((Get-Content .env | ? { $_ -like 'DATABASE_URL_SESSION=*' }) -replace '^DATABASE_URL_SESSION=','')
npx supabase@latest db push --db-url $u --dry-run   # confere o que falta
npx supabase@latest db push --db-url $u --yes
```

Para uma migration nova:

1. Crie o arquivo com `npx supabase@latest migration new <nome>`. Não invente o nome do arquivo.
2. Se a mudança também valer para Postgres puro, replique-a em `db/migrations/`.

Se o CLI for autenticado depois, os comandos acima também funcionam com `--linked`:

```powershell
npx supabase@latest login --token <TOKEN>
npx supabase@latest link --project-ref yvsipeicyboqaslyqwrt
```

## Popular / re-sincronizar dados (inclusive metadados)

O seed lê `api/src/seed.ts` e, se o arquivo existir, `data/metadata/game-metadata.json`. Os metadados sempre sofrem upsert. Os jogos e a biblioteca só são inseridos quando faltam, a menos que você use `--force`.

```powershell
node db/seed/import.mjs --out supabase/seed.sql            # adicione --force para sobrescrever edições no banco
npx supabase@latest db push --db-url $u --include-seed --yes
```

O CLI guarda o hash do seed em `supabase_migrations.seed_files` e reaplica o arquivo quando o conteúdo muda. Se precisar forçar, rode o arquivo com `psql "$u" -v ON_ERROR_STOP=1 -f supabase/seed.sql`. Não use `supabase db query -f`, porque ele não aceita vários comandos.

**Dados privados:** se existir `api/data/games.json`, que é o estado salvo pela API local, ele ainda não é importado pelo `import.mjs`. Na configuração inicial o arquivo não existia, então os dados vieram do seed.

## Verificar

```powershell
npx supabase@latest db lint --db-url $u -s public --level warning
npx supabase@latest db advisors --db-url $u --type all --level warn
npx supabase@latest db query --db-url $u "select count(*) from public.game"
```

Resultado da configuração inicial:

- `db lint` não encontrou erros.
- Os advisors só deram avisos de nível INFO: índices ainda não usados e `schema_migration` com RLS sem policy, que é intencional porque a tabela é interna.

## Usuário dono do seed

O seed cria `app_user` com `00000000-0000-4000-8000-000000000001`, sem vínculo com o Auth. Depois do primeiro login no Supabase Auth, reivindique esse usuário:

```sql
update public.app_user set auth_user_id = '<auth.users.id>'
 where id = '00000000-0000-4000-8000-000000000001';
```

## Migrations: canonical source

`apps/api/infra/supabase/migrations` is canonical for deploys (Supabase CLI). `apps/api/infra/db/migrations` is the plain-Postgres mirror for environments without Supabase; keep it in sync by hand when adding a migration here. Product roles need no schema change: they come from the verified JWT `app_metadata.role` (`admin` or `user`, default `user`). Set it for an administrator with the Auth admin API (`app_metadata` is not editable by the user, unlike `user_metadata`).
