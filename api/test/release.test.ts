// Lógica pura do controle de versões/rollback (scripts/release-lib.mjs). Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentRelease,
  formatCommand,
  formatTable,
  gitRollbackCommands,
  migrationWarning,
  parseArgs,
  releaseFromEnv,
  resolveTarget,
  vercelRollbackCommands,
} from '../../scripts/release-lib.mjs';

const rows = [
  {
    id: 1,
    version: '1.0.0',
    git_sha: 'aaaaaaa1111111111111111111111111111111aa',
    environment: 'production',
    status: 'superseded',
    vercel_deployment_id: 'dpl_one',
    vercel_url: 'checkpoint-one.vercel.app',
    db_migration_version: '20261011190000',
    created_at: '2026-10-10T10:00:00Z',
  },
  {
    id: 2,
    version: '1.1.0',
    git_sha: 'bbbbbbb2222222222222222222222222222222bb',
    environment: 'production',
    status: 'deployed',
    vercel_deployment_id: 'dpl_two',
    vercel_url: 'checkpoint-two.vercel.app',
    db_migration_version: '20261011230000',
    created_at: '2026-10-11T10:00:00Z',
  },
  {
    id: 3,
    version: '1.1.0',
    git_sha: 'ccccccc3333333333333333333333333333333cc',
    environment: 'preview',
    status: 'deployed',
    vercel_deployment_id: 'dpl_three',
    vercel_url: 'checkpoint-three.vercel.app',
    db_migration_version: '20261011230000',
    created_at: '2026-10-11T11:00:00Z',
  },
];

test('releaseFromEnv usa as variáveis de sistema da Vercel', () => {
  const r = releaseFromEnv(
    {
      VERCEL_GIT_COMMIT_SHA: 'abc1234',
      VERCEL_GIT_COMMIT_REF: 'main',
      VERCEL_GIT_COMMIT_MESSAGE: 'feat: x',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'checkpoint-x.vercel.app',
      VERCEL_DEPLOYMENT_ID: 'dpl_x',
    },
    '1.2.3',
  );
  assert.deepEqual(r, {
    version: '1.2.3',
    git_sha: 'abc1234',
    git_ref: 'main',
    commit_message: 'feat: x',
    vercel_deployment_id: 'dpl_x',
    vercel_url: 'checkpoint-x.vercel.app',
    environment: 'production',
  });
  assert.equal(releaseFromEnv({}, '1.0.0'), null);
  assert.equal(
    releaseFromEnv({ VERCEL_GIT_COMMIT_SHA: 'abc1234', VERCEL_ENV: 'x' }, '1')?.environment,
    'development',
  );
});

test('resolveTarget por deployment id, url, sha, versão e environment', () => {
  assert.equal(resolveTarget(rows, 'dpl_one')?.id, 1);
  assert.equal(resolveTarget(rows, 'https://checkpoint-one.vercel.app/')?.id, 1);
  assert.equal(resolveTarget(rows, 'aaaaaaa')?.id, 1);
  assert.equal(resolveTarget(rows, 'v1.0.0')?.id, 1);
  assert.equal(resolveTarget(rows, '1.1.0')?.id, 2); // production por padrão
  assert.equal(resolveTarget(rows, '1.1.0', 'preview')?.id, 3);
  assert.equal(resolveTarget(rows, 'ccccccc'), null); // é preview
  assert.equal(resolveTarget(rows, 'ccccccc', 'all')?.id, 3);
  assert.equal(resolveTarget(rows, '9.9.9'), null);
  const dup = [...rows, { ...rows[0], id: 9, git_sha: 'aaaaaaa9999999999999999999999999999999aa' }];
  assert.throws(() => resolveTarget(dup, 'aaaaaaa'), /ambíguo/);
});

test('currentRelease pega o deployed mais recente do environment', () => {
  assert.equal(currentRelease(rows)?.id, 2);
  assert.equal(currentRelease(rows, 'preview')?.id, 3);
  assert.equal(currentRelease(rows, 'development'), null);
});

test('comandos de rollback (vercel e git)', () => {
  assert.deepEqual(vercelRollbackCommands(rows[0]).map(formatCommand), [
    'vercel rollback https://checkpoint-one.vercel.app --yes',
  ]);
  assert.throws(() => vercelRollbackCommands({ ...rows[0], vercel_url: null }), /--git/);
  assert.deepEqual(gitRollbackCommands('aaaaaaa', 'main').map(formatCommand), [
    'git revert --no-edit aaaaaaa..HEAD',
    'git push origin main',
  ]);
  assert.throws(() => gitRollbackCommands('main; rm -rf /'), /inválido/);
});

test('aviso de migrations e parseArgs', () => {
  assert.match(migrationWarning(rows[1], rows[0]), /alvo: 20261011190000 \| atual: 20261011230000/);
  assert.doesNotMatch(migrationWarning(rows[1], rows[1]), /alvo:/);
  const o = parseArgs(['rollback', 'v1.0.0', '--vercel']);
  assert.equal(o.target, 'v1.0.0');
  assert.equal(o.yes, false);
  assert.equal(o.env, 'production');
  assert.throws(() => parseArgs(['rollback', 'x']), /--vercel ou --git/);
  assert.throws(() => parseArgs(['rollback', 'x', '--vercel', '--git']), /exatamente/);
  assert.throws(() => parseArgs(['list', '--env', 'staging']), /--env/);
  assert.match(formatTable(rows), /dpl_two/);
});
