// Reuse or create a registration after build and append build evidence; errors do not fail the build.
import { releaseFromEnv } from './release-lib.mjs';

const log = (msg) => console.log(`[record-release] ${msg}`);

async function main() {
  if (!process.env.VERCEL) return log('fora da Vercel (VERCEL não definida): nada a gravar.');
  const url = process.env.DATABASE_URL;
  if (!url) return log('DATABASE_URL ausente: release não gravado.');
  const info = releaseFromEnv(process.env);
  if (!info) return log('VERCEL_GIT_COMMIT_SHA ausente: release não gravado.');

  const [{ default: postgres }, { PgReleaseStore, ensureRelease }] = await Promise.all([
    import('postgres'),
    import('../api/src/releases.ts'),
  ]);
  const sql = postgres(url, {
    prepare: false, // Transaction pooler.
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    transform: { undefined: null },
    connection: { application_name: 'checkpoint-record-release' },
    onnotice: () => {},
  });
  try {
    const [{ v }] = await sql`
      SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN NULL
             ELSE (SELECT max(version) FROM supabase_migrations.schema_migrations) END AS v`;
    const { release, created } = await ensureRelease(
      new PgReleaseStore(sql),
      {
        gitSha: info.git_sha,
        gitRef: info.git_ref,
        environment: info.environment,
        commitMessage: info.commit_message,
      },
      {
        vercelDeploymentId: info.vercel_deployment_id,
        vercelUrl: info.vercel_url,
        dbMigrationVersion: v ?? null,
      },
    );
    log(
      `v${release.version} ${created ? 'criada' : 'já registrada'} (#${release.id}, ` +
        `${info.git_sha.slice(0, 7)}, ${info.environment}); deploy ` +
        `${info.vercel_deployment_id ?? 'sem id'} ligado (migration ${v ?? '-'}).`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Bound recording time so database availability cannot block the build.
const timeout = new Promise((resolve) =>
  setTimeout(() => resolve(log('timeout (30s): release não gravado.')), 30_000).unref(),
);
try {
  await Promise.race([main(), timeout]);
} catch (err) {
  log(`falha ao gravar release (build segue): ${err?.message ?? err}`);
}
process.exit(0);
