// Preview rollback by default; --yes executes it and registers a new release against an existing target.
import { spawnSync } from 'node:child_process';
import {
  currentRelease,
  formatCommand,
  formatTable,
  gitRollbackCommands,
  migrationWarning,
  parseArgs,
  resolveTarget,
  usage,
  vercelRollbackCommands,
} from './release-lib.mjs';

const isWin = process.platform === 'win32';

function run(cmd, args, { capture = false } = {}) {
  const r = spawnSync(cmd, args, {
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    shell: isWin && cmd === 'vercel', // Resolve the Windows vercel.cmd launcher.
  });
  if (r.status !== 0) throw new Error(`Falhou: ${formatCommand([cmd, args])}`);
  return capture ? r.stdout.trim() : '';
}

async function openDb() {
  const url = process.env.DATABASE_URL_SESSION || process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_SESSION ou DATABASE_URL (.env).');
  const { default: postgres } = await import('postgres');
  return postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    transform: { undefined: null },
    onnotice: () => {},
  });
}

/** Select registrations with their newest build evidence. */
function selectReleases(sql, env, limit) {
  return sql`
    SELECT r.*, d.vercel_deployment_id, d.vercel_url, d.db_migration_version
      FROM app_release r
      LEFT JOIN LATERAL (SELECT * FROM app_release_deploy x WHERE x.release_id = r.id
                          ORDER BY x.id DESC LIMIT 1) d ON true
     ${env === 'all' ? sql`` : sql`WHERE r.environment = ${env}`}
     ORDER BY r.id DESC LIMIT ${limit}`;
}

async function list(sql, opts) {
  const rows = await selectReleases(sql, opts.env, opts.limit);
  console.log(rows.length ? formatTable(rows) : `Nenhum release em ${opts.env}.`);
}

/** Append a patch release referencing the rollback target. */
async function recordRollback(sql, target, gitSha, environment) {
  const [{ createRelease }, { ReleaseRepository }, { PgReleaseDriver }] = await Promise.all([
    import('../src/services/releases.ts'),
    import('../src/data/repositories/releases.ts'),
    import('../src/data/drivers/pg/releases.ts'),
  ]);
  const { release } = await createRelease(new ReleaseRepository(new PgReleaseDriver(sql)), {
    description: `Rollback para v${target.version} (${target.git_sha.slice(0, 7)})`,
    kind: 'rollback',
    name: null,
    gitSha,
    gitRef: null,
    environment,
    bump: 'patch',
    version: null,
    rollbackTo: Number(target.id),
    createdBy: 'release:rollback',
  });
  console.log(`Registrado em app_release: v${release.version} (rollback para #${target.id}).`);
}

async function rollback(sql, opts) {
  const rows = await selectReleases(sql, 'all', 500);
  const current = currentRelease(rows, opts.env);
  let target = resolveTarget(rows, opts.target, opts.env);
  if (!target) throw new Error(`Release não encontrado em ${opts.env}: ${opts.target}`);

  console.log(
    `Atual: ${current ? `#${current.id} v${current.version} ${current.git_sha.slice(0, 7)} ${current.vercel_url ?? ''}` : '(nenhum)'}`,
  );
  console.log(
    `Alvo:  ${target.id ? `#${target.id} ` : ''}v${target.version} ${target.git_sha.slice(0, 7)} ${target.vercel_url ?? ''}`,
  );
  if (current && target.id && current.id === target.id)
    throw new Error('O alvo já é o release corrente.');

  let commands;
  if (opts.vercel) {
    commands = vercelRollbackCommands(target);
  } else {
    const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true });
    commands = gitRollbackCommands(target.git_sha, branch);
  }
  console.log('\nPlano:');
  for (const c of commands) console.log(`  ${formatCommand(c)}`);
  console.log(`\n${migrationWarning(current, target)}`);
  if (opts.vercel)
    console.log(
      'Obs.: após `vercel rollback` a Vercel desliga a promoção automática; novos pushes em main não\n' +
        'vão para produção até `vercel promote <url>` (ou `vercel rollback` desfeito no dashboard).',
    );

  if (!opts.yes) return console.log('\nDry-run: nada executado. Repita com --yes para executar.');

  const env = opts.env === 'all' ? (target.environment ?? 'production') : opts.env;
  if (opts.vercel) {
    for (const [cmd, args] of commands) run(cmd, args);
    // Register a new rollback event for the target deployment commit.
    await recordRollback(sql, target, target.git_sha, env);
  } else {
    if (run('git', ['status', '--porcelain'], { capture: true }))
      throw new Error('Working tree com alterações: faça commit/stash antes do rollback por git.');
    run('git', ['merge-base', '--is-ancestor', target.git_sha, 'HEAD']);
    // Register the revert commit before push; its build reuses this rollback.
    const [revert, push] = commands;
    run(...revert);
    const head = run('git', ['rev-parse', 'HEAD'], { capture: true });
    await recordRollback(sql, target, head, env);
    run(...push);
  }
  console.log('\nRollback concluído.');
}

/** Tag the latest registration and push the annotated tag. */
async function tag(sql, opts) {
  const [current] = await selectReleases(sql, opts.env === 'all' ? 'production' : opts.env, 1);
  if (!current) throw new Error('Nenhuma versão registrada.');
  const name = `v${current.version}`;
  run('git', ['tag', '-a', name, current.git_sha, '-m', `${name}: ${current.description}`]);
  run('git', ['push', 'origin', name]);
  console.log(`Tag ${name} criada em ${current.git_sha.slice(0, 7)} e enviada.`);
}

try {
  const opts = parseArgs(process.argv.slice(2));
  const commands = { list, rollback, tag };
  if (commands[opts.command]) {
    const sql = await openDb();
    try {
      await commands[opts.command](sql, opts);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } else console.log(usage());
} catch (err) {
  console.error(`Erro: ${err.message}\n\n${usage()}`);
  process.exitCode = 1;
}
