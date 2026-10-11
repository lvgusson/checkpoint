// Grava o deploy corrente em app_release. Roda no build da Vercel (script "vercel-build",
// depois do `ng build`) com as variáveis de sistema da Vercel (VERCEL_GIT_COMMIT_SHA,
// VERCEL_ENV, VERCEL_DEPLOYMENT_ID...). NUNCA quebra o build: qualquer falha só é logada.
// Também marca como 'superseded' o release anterior ainda 'deployed' do mesmo environment.
import { readFile } from 'node:fs/promises';
import { releaseFromEnv } from './release-lib.mjs';

const log = (msg) => console.log(`[record-release] ${msg}`);

async function main() {
  if (!process.env.VERCEL) return log('fora da Vercel (VERCEL não definida): nada a gravar.');
  const url = process.env.DATABASE_URL;
  if (!url) return log('DATABASE_URL ausente: release não gravado.');

  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const release = releaseFromEnv(process.env, pkg.version);
  if (!release) return log('VERCEL_GIT_COMMIT_SHA ausente: release não gravado.');

  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    prepare: false, // pooler em modo transação
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    connection: { application_name: 'checkpoint-record-release' },
    onnotice: () => {},
  });
  try {
    const [{ v }] = await sql`
      SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
             ELSE (SELECT max(version) FROM supabase_migrations.schema_migrations) END AS v`;
    const row = { ...release, db_migration_version: v ?? null };
    const [saved] = await sql.begin(async (tx) => {
      const ins = await tx`
        INSERT INTO app_release ${tx(row)}
        ON CONFLICT (vercel_deployment_id) DO UPDATE
           SET version = EXCLUDED.version, git_sha = EXCLUDED.git_sha, git_ref = EXCLUDED.git_ref,
               commit_message = EXCLUDED.commit_message, vercel_url = EXCLUDED.vercel_url,
               environment = EXCLUDED.environment,
               db_migration_version = EXCLUDED.db_migration_version
        RETURNING id`;
      await tx`
        UPDATE app_release SET status = 'superseded'
         WHERE environment = ${row.environment} AND status = 'deployed' AND id <> ${ins[0].id}`;
      return ins;
    });
    log(
      `release #${saved.id} gravado: v${row.version} ${row.git_sha.slice(0, 7)} ` +
        `(${row.environment}, ${row.vercel_deployment_id ?? 'sem deployment id'}, migration ${row.db_migration_version ?? '-'})`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Teto de tempo: o build nunca fica preso esperando o banco.
const timeout = new Promise((resolve) =>
  setTimeout(() => resolve(log('timeout (30s): release não gravado.')), 30_000).unref(),
);
try {
  await Promise.race([main(), timeout]);
} catch (err) {
  log(`falha ao gravar release (build segue): ${err?.message ?? err}`);
}
process.exit(0);
