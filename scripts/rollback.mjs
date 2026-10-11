// Releases e rollback (ver docs/deploy.md, seção "Versões e rollback").
//
//   npm run release:list [-- --env preview|all --limit 50]
//   npm run release:rollback -- <git_sha|version|deployment_id> --vercel [--yes]
//   npm run release:rollback -- <git_sha|version|deployment_id> --git [--yes]
//   npm run release:tag
//
// Sem --yes o rollback só mostra o plano (dry-run). Conexão: DATABASE_URL_SESSION
// (pooler em modo sessão) ou DATABASE_URL, lidas do ambiente/.env.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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
    shell: isWin && cmd === 'vercel', // vercel é vercel.cmd no Windows (args sem espaços)
  });
  if (r.status !== 0) throw new Error(`Falhou: ${formatCommand([cmd, args])}`);
  return capture ? r.stdout.trim() : '';
}

async function openDb() {
  const url = process.env.DATABASE_URL_SESSION || process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_SESSION ou DATABASE_URL (.env).');
  const { default: postgres } = await import('postgres');
  return postgres(url, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });
}

async function list(sql, opts) {
  const rows =
    opts.env === 'all'
      ? await sql`SELECT * FROM app_release ORDER BY created_at DESC LIMIT ${opts.limit}`
      : await sql`SELECT * FROM app_release WHERE environment = ${opts.env}
                   ORDER BY created_at DESC LIMIT ${opts.limit}`;
  console.log(rows.length ? formatTable(rows) : `Nenhum release em ${opts.env}.`);
}

async function rollback(sql, opts) {
  const rows = await sql`SELECT * FROM app_release ORDER BY created_at DESC LIMIT 500`;
  const current = currentRelease(rows, opts.env);
  let target = resolveTarget(rows, opts.target, opts.env);
  if (!target && opts.git) {
    // Alvo fora da tabela (ex.: commit anterior ao controle de versões): aceita qualquer commit.
    const sha = run('git', ['rev-parse', '--verify', `${opts.target}^{commit}`], { capture: true });
    target = { id: null, git_sha: sha, version: '?', db_migration_version: null };
  }
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

  if (opts.git) {
    if (run('git', ['status', '--porcelain'], { capture: true }))
      throw new Error('Working tree com alterações: faça commit/stash antes do rollback por git.');
    run('git', ['merge-base', '--is-ancestor', target.git_sha, 'HEAD']);
  }
  for (const [cmd, args] of commands) run(cmd, args);

  if (current) {
    await sql.begin(async (tx) => {
      await tx`UPDATE app_release SET status = 'rolled_back', rolled_back_to = ${target.id}
                WHERE id = ${current.id}`;
      // --vercel: o deploy alvo volta a servir; --git: o novo build gravará o seu próprio release.
      if (opts.vercel)
        await tx`UPDATE app_release SET status = 'deployed', rolled_back_to = NULL WHERE id = ${target.id}`;
    });
  }
  console.log('\nRollback concluído e registrado em app_release.');
}

async function tag() {
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const name = `v${version}`;
  run('git', ['tag', '-a', name, '-m', `release ${name}`]);
  run('git', ['push', 'origin', name]);
  console.log(`Tag ${name} criada e enviada.`);
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'tag') await tag();
  else if (opts.command === 'list' || opts.command === 'rollback') {
    const sql = await openDb();
    try {
      await (opts.command === 'list' ? list(sql, opts) : rollback(sql, opts));
    } finally {
      await sql.end({ timeout: 5 });
    }
  } else console.log(usage());
} catch (err) {
  console.error(`Erro: ${err.message}\n\n${usage()}`);
  process.exitCode = 1;
}
