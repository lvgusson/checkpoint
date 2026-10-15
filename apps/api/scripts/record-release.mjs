// Reuse or create a registration after build and append build evidence; errors do not fail the build.
import { releaseFromEnv } from './release-lib.mjs';

const log = (msg) => console.log(`[record-release] ${msg}`);

async function main() {
  if (!process.env.VERCEL) return log('fora da Vercel (VERCEL não definida): nada a gravar.');
  const url = process.env.DATABASE_URL;
  if (!url) return log('DATABASE_URL ausente: release não gravado.');
  const info = releaseFromEnv(process.env);
  if (!info) return log('VERCEL_GIT_COMMIT_SHA ausente: release não gravado.');

  const [{ default: postgres }, { ensureRelease }, { ReleaseRepository }, { PgReleaseDriver }] =
    await Promise.all([
      import('postgres'),
      import('../src/services/releases.ts'),
      import('../src/data/repositories/releases.ts'),
      import('../src/data/drivers/pg/releases.ts'),
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
    const [{ exists }] = await sql`
      SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS exists`;
    let v = null;
    if (exists) {
      const [row] = await sql`SELECT max(version) AS v FROM supabase_migrations.schema_migrations`;
      v = row?.v ?? null;
    }
    const { release, created } = await ensureRelease(
      new ReleaseRepository(new PgReleaseDriver(sql)),
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
