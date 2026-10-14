// Register before push; resolve --sha to a full local commit before API or SQL registration.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opts = { description: null, db: false };
const body = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => {
    const v = args[++i];
    if (v === undefined) throw new Error(`Faltou o valor de ${a}`);
    return v;
  };
  if (a === '--kind') body.kind = value();
  else if (a === '--name') body.name = value();
  else if (a === '--bump') body.bump = value();
  else if (a === '--version') body.version = value().replace(/^v/, '');
  else if (a === '--sha') body.gitSha = value();
  else if (a === '--env') body.environment = value();
  else if (a === '--db') opts.db = true;
  else if (a.startsWith('--')) throw new Error(`Opção desconhecida: ${a}`);
  else if (opts.description === null) opts.description = a;
  else throw new Error(`Argumento extra: ${a}`);
}
if (!opts.description) {
  console.error(
    'Uso: npm run release:note -- "descrição" [--kind fix] [--bump minor | --version 1.0.0]',
  );
  process.exit(1);
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
body.description = opts.description;
body.gitSha = git(
  'rev-parse',
  '--verify',
  '--end-of-options',
  `${body.gitSha ?? 'HEAD'}^{commit}`,
).toLowerCase();
try {
  body.gitRef = git('rev-parse', '--abbrev-ref', 'HEAD');
} catch {
  /* Branch unavailable. */
}

let release, created;
if (opts.db) {
  const url = process.env.DATABASE_URL_SESSION || process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_SESSION ou DATABASE_URL para --db.');
  const [{ default: postgres }, lib] = await Promise.all([
    import('postgres'),
    import('../src/releases.ts'),
  ]);
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    transform: { undefined: null },
    onnotice: () => {},
  });
  try {
    const input = { ...lib.parseReleaseInput(body), createdBy: 'release:note' };
    ({ release, created } = await lib.createRelease(new lib.PgReleaseStore(sql), input));
  } finally {
    await sql.end({ timeout: 5 });
  }
} else {
  const base = (process.env.RELEASE_API_URL || 'https://gps.dev.br').replace(/\/+$/, '');
  const token = process.env.RELEASE_API_TOKEN;
  if (!token) throw new Error('Defina RELEASE_API_TOKEN (ou use --db).');
  const res = await fetch(base + '/api/v1/releases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`API respondeu ${res.status}: ${data?.error?.message ?? ''}`);
  ({ created, ...release } = data);
}
console.log(
  `${created ? 'Registrada' : 'Já registrada'}: v${release.version} (${release.kind}) ` +
    `${release.gitSha.slice(0, 7)} ${release.environment}: ${release.description}`,
);
