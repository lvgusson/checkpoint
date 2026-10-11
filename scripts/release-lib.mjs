// Lógica pura dos scripts de release (record-release.mjs / rollback.mjs).
// Sem rede nem processos: tudo aqui é testável (api/test/release.test.ts).

export const ENVIRONMENTS = ['production', 'preview', 'development'];

export function normalizeEnv(value) {
  return ENVIRONMENTS.includes(value) ? value : 'development';
}

/**
 * Linha de app_release a partir das variáveis de sistema da Vercel
 * (VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_REF, VERCEL_GIT_COMMIT_MESSAGE,
 * VERCEL_ENV, VERCEL_URL, VERCEL_DEPLOYMENT_ID). null se não houver SHA.
 */
export function releaseFromEnv(env, version) {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!sha) return null;
  return {
    version: version || '0.0.0',
    git_sha: sha,
    git_ref: env.VERCEL_GIT_COMMIT_REF || null,
    commit_message: env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 2048) || null,
    vercel_deployment_id: env.VERCEL_DEPLOYMENT_ID || null,
    vercel_url: env.VERCEL_URL || null,
    environment: normalizeEnv(env.VERCEL_ENV),
  };
}

const USAGE = `Uso:
  node scripts/rollback.mjs list [--env production|preview|development|all] [--limit N]
  node scripts/rollback.mjs rollback <git_sha|version|deployment_id|url> (--vercel | --git) [--yes] [--env production]
  node scripts/rollback.mjs tag`;

export function usage() {
  return USAGE;
}

export function parseArgs(argv) {
  const opts = {
    command: argv[0] ?? 'help',
    target: null,
    vercel: false,
    git: false,
    yes: false,
    env: 'production',
    limit: 20,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vercel') opts.vercel = true;
    else if (a === '--git') opts.git = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--env') opts.env = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]) || 20;
    else if (a.startsWith('-')) throw new Error(`Opção desconhecida: ${a}`);
    else if (opts.target === null) opts.target = a;
    else throw new Error(`Argumento extra: ${a}`);
  }
  if (opts.env !== 'all' && !ENVIRONMENTS.includes(opts.env))
    throw new Error(`--env inválido: ${opts.env}`);
  if (opts.command === 'rollback') {
    if (!opts.target) throw new Error('Informe o alvo (git_sha, version ou deployment_id).');
    if (opts.vercel === opts.git) throw new Error('Escolha exatamente um modo: --vercel ou --git.');
  }
  return opts;
}

const stripProtocol = (u) =>
  String(u ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

/**
 * Resolve o alvo do rollback entre as linhas de app_release (mais recentes primeiro).
 * Aceita deployment id (dpl_...), URL do deploy, SHA (prefixo >= 7) ou versão (v1.2.3 / 1.2.3).
 * Filtra pelo environment (exceto 'all'). Lança erro se o prefixo de SHA for ambíguo.
 */
export function resolveTarget(rows, query, environment = 'production') {
  const q = String(query ?? '').trim();
  if (!q) return null;
  const pool = environment === 'all' ? rows : rows.filter((r) => r.environment === environment);
  const sorted = [...pool].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (q.startsWith('dpl_')) return sorted.find((r) => r.vercel_deployment_id === q) ?? null;
  if (/\.vercel\.app/.test(q)) {
    const host = stripProtocol(q);
    return sorted.find((r) => stripProtocol(r.vercel_url) === host) ?? null;
  }
  if (/^[0-9a-f]{7,40}$/i.test(q)) {
    const hits = sorted.filter((r) => r.git_sha?.toLowerCase().startsWith(q.toLowerCase()));
    const shas = new Set(hits.map((r) => r.git_sha));
    if (shas.size > 1) throw new Error(`SHA ambíguo: ${q} (${[...shas].join(', ')})`);
    if (hits.length) return hits[0];
  }
  const version = q.replace(/^v/, '');
  return sorted.find((r) => r.version === version) ?? null;
}

/** Release corrente do environment: o mais recente com status 'deployed'. */
export function currentRelease(rows, environment = 'production') {
  return (
    [...rows]
      .filter(
        (r) => (environment === 'all' || r.environment === environment) && r.status === 'deployed',
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null
  );
}

/** Comandos do rollback instantâneo na Vercel (sem build: re-aponta os domínios). */
export function vercelRollbackCommands(target) {
  if (!target?.vercel_url) throw new Error('Release alvo sem vercel_url: use --git.');
  return [['vercel', ['rollback', `https://${stripProtocol(target.vercel_url)}`, '--yes']]];
}

/** Comandos do rollback por git: reverte alvo..HEAD (commits novos) e faz push (novo deploy). */
export function gitRollbackCommands(targetSha, branch = 'main') {
  if (!/^[0-9a-f]{7,40}$/i.test(String(targetSha ?? '')))
    throw new Error(`SHA inválido: ${targetSha}`);
  return [
    ['git', ['revert', '--no-edit', `${targetSha}..HEAD`]],
    ['git', ['push', 'origin', branch]],
  ];
}

/** Aviso sobre migrations (nunca revertidas automaticamente). */
export function migrationWarning(current, target) {
  const base = 'Atenção: migrations de banco NÃO são revertidas automaticamente.';
  const a = current?.db_migration_version ?? null;
  const b = target?.db_migration_version ?? null;
  if (a && b && a !== b)
    return `${base}\n  migration no alvo: ${b} | atual: ${a} -> o código antigo rodará sobre o schema atual; reverta manualmente se for incompatível.`;
  return base;
}

export function formatCommand([cmd, args]) {
  return [cmd, ...args].join(' ');
}

/** Tabela em texto para `release:list`. */
export function formatTable(rows) {
  const cols = [
    ['id', (r) => r.id],
    ['created_at', (r) => new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ')],
    ['env', (r) => r.environment],
    ['version', (r) => r.version],
    ['sha', (r) => r.git_sha?.slice(0, 7)],
    ['ref', (r) => r.git_ref],
    ['status', (r) => r.status + (r.rolled_back_to ? `->${r.rolled_back_to}` : '')],
    ['db_mig', (r) => r.db_migration_version],
    ['deployment', (r) => r.vercel_deployment_id],
    ['message', (r) => (r.commit_message ?? '').split('\n')[0].slice(0, 50)],
  ];
  const cells = rows.map((r) => cols.map(([, f]) => String(f(r) ?? '')));
  const widths = cols.map(([h], i) => Math.max(h.length, ...cells.map((c) => c[i].length)));
  const line = (vals) =>
    vals
      .map((v, i) => v.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [
    line(cols.map(([h]) => h)),
    line(widths.map((w) => '-'.repeat(w))),
    ...cells.map(line),
  ].join('\n');
}
