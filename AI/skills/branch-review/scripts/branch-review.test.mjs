import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { git } from '../../../validation/git-state.mjs';
import {
  buildManifest,
  review,
  specialistRoles,
  validateReviewResult,
  parsePushInput,
  runSession,
} from './branch-review.mjs';
import { repair } from './repair.mjs';

const source = 'api/src/service.ts';
const document = 'AI/Architecture/back-end-architecture.md';
const archive = 'AI/Deprecate/deprecate-back-end.md';
const originalSection = '## 4. Section\n\nVERIFIED value is one.\n\n';
const doc =
  '---\nid: architecture.backend\ntitle: Backend\ntype: architecture-root\narea: backend\nstatus: active\nowner: api\nlast_verified: 2026-10-11\nsource_paths: [api/src/service.ts]\nrelated_domains: []\ntags: []\n---\n# Backend\n\n' +
  Array.from(
    { length: 10 },
    (_, index) =>
      `## ${index + 1}. Section\n\n${index === 3 ? 'VERIFIED value is one.' : 'N/A'}\n\n`,
  ).join('');
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'branch-review-fixture-'));
  t.after(() => rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'review@example.invalid']);
  git(repo, ['config', 'user.name', 'Fixture Reviewer']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  const write = (path, content) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const commit = () => {
    git(repo, ['add', '.']);
    git(repo, ['commit', '-qm', 'Fixture state']);
    return git(repo, ['rev-parse', 'HEAD']).trim();
  };
  write('legacy.txt', 'Existing repository before harness bootstrap.\n');
  const legacy = commit();
  write('AI/main-entry.md', '[Architecture](Architecture/architecture-index.md)\n');
  write('AI/Architecture/architecture-index.md', '[Backend](back-end-architecture.md)\n');
  write(document, doc);
  write(source, 'export const value = 1;\n');
  write(archive, '# Backend history\n');
  write(
    'AI/validation/ownership.json',
    JSON.stringify({
      version: 1,
      rules: [{ pattern: 'api/src/**', areas: ['backend'], documents: [document], domains: [] }],
    }),
  );
  const base = commit();
  const manifest = (head = git(repo, ['rev-parse', 'HEAD']).trim(), from = base) =>
    buildManifest(repo, [
      {
        localRef: 'refs/heads/main',
        localHash: head,
        remoteRef: 'refs/heads/main',
        remoteHash: from,
      },
    ]);
  return { repo, write, commit, base, legacy, manifest };
}
function archiveEntry() {
  return (
    '# Backend history\n\n## DEP-20261011-fixture\n\n- Date: 2026-10-11T12:00:00-03:00\n- Source: `AI/Architecture/back-end-architecture.md`\n- Original document ID: `architecture.backend`\n- Original section: `4. Section`\n- Reason: Updated behavior\n- Replacement: `AI/Architecture/back-end-architecture.md`\n- Related code: `api/src/service.ts`\n- Change reference: fixture\n\n### Exact previous content\n\n```markdown\n' +
    originalSection +
    '```\n'
  );
}
function resultFor(prompt, status = 'PASS') {
  const encoded = prompt.split('Binding manifest: ')[1].split('. Return the schema result')[0];
  const manifest = JSON.parse(encoded);
  const role = prompt.match(/Return the schema result with role (.*), digest /)[1];
  return {
    status,
    digest: manifest.digest,
    role,
    uncertainties: [],
    units: manifest.units.map((unit) => ({
      id: unit.id,
      head: unit.head,
      base: unit.base,
      status,
      findings:
        status === 'FAIL'
          ? [
              {
                path: source,
                severity: 'blocking',
                explanation: 'Fixture semantic contradiction',
                correction: 'Correct documentation',
              },
            ]
          : [],
      assessments: unit.requiredPaths.map((path) => ({
        path,
        analysis:
          'Fixture-controlled evidence exercises exact binding and completeness validation only.',
        references: [`${unit.head}:${path}:fixture`],
      })),
    })),
  };
}
const session = async (_repo, _runtime, prompt) => resultFor(prompt);
const runtime = { command: 'fixture-independent-runtime' };
const options = { runtime, session };

test('1 valid documentation-only commit passes independent gate', async (t) => {
  const f = fixture(t);
  f.write(
    'AI/Architecture/architecture-index.md',
    '[Backend](back-end-architecture.md)\n\nNavigation verified.\n',
  );
  assert.equal((await review(f.repo, f.manifest(f.commit()), options)).status, 'PASS');
});
test('2 code with accurate documentation and 7 exact archive pass', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 2;\n');
  f.write(document, doc.replace('value is one', 'value is two'));
  f.write(archive, archiveEntry());
  assert.equal((await review(f.repo, f.manifest(f.commit()), options)).status, 'PASS');
});
test('3 missing documentation blocks after independent semantic finding', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 2;\n');
  assert.equal(
    (
      await review(f.repo, f.manifest(f.commit()), {
        runtime,
        session: async (_repo, _runtime, prompt) => resultFor(prompt, 'FAIL'),
      })
    ).status,
    'FAIL',
  );
});
test('4 inaccurate documentation blocks independent semantic review', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 3;\n');
  f.write(document, doc.replace('value is one', 'value is two'));
  f.write(archive, archiveEntry());
  assert.equal(
    (
      await review(f.repo, f.manifest(f.commit()), {
        runtime,
        session: async (_repo, _runtime, prompt) => resultFor(prompt, 'FAIL'),
      })
    ).status,
    'FAIL',
  );
});
test('5 missing obsolete archive fails before invoking runtime', async (t) => {
  const f = fixture(t);
  f.write(document, doc.replace('value is one', 'value is two'));
  const result = await review(f.repo, f.manifest(f.commit()), options);
  assert.equal(result.status, 'FAIL');
  assert.ok(
    result.units.some((unit) =>
      unit.validation.errors.some((error) => error.code === 'deprecation'),
    ),
  );
});
test('6 modified historical archive fails', async (t) => {
  const f = fixture(t);
  f.write(archive, '# Rewritten historical material\n');
  assert.equal((await review(f.repo, f.manifest(f.commit()), options)).status, 'FAIL');
});
test('8 cross-domain impact and 13 multiple independent specialists are selected', async (t) => {
  const f = fixture(t);
  f.write(
    'AI/validation/ownership.json',
    JSON.stringify({
      version: 1,
      rules: [
        {
          pattern: 'api/src/**',
          areas: ['backend', 'security', 'cache'],
          documents: [document],
          domains: [],
        },
      ],
    }),
  );
  f.write(source, 'export const value = 1; // behavior preserved\n');
  const roles = [];
  const result = await review(f.repo, f.manifest(f.commit()), {
    runtime,
    session: async (_repo, _runtime, prompt) => {
      const result = resultFor(prompt);
      roles.push(result.role);
      return result;
    },
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(roles, [
    'coordinator',
    'specialist:security',
    'specialist:backend',
    'specialist:cache',
  ]);
});
test('9 every outgoing commit receives a distinct review unit', (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // first\n');
  const first = f.commit();
  f.write(source, 'export const value = 1; // second\n');
  const second = f.commit();
  const units = f.manifest(second).units;
  assert.deepEqual(
    units.filter((unit) => unit.kind === 'commit').map((unit) => unit.head),
    [first, second],
  );
  assert.equal(units.filter((unit) => unit.kind === 'final').length, 1);
});
test('10 tip repair cannot excuse inconsistent earlier commit', async (t) => {
  const f = fixture(t);
  f.write(document, doc.replace('value is one', 'value is two'));
  const broken = f.commit();
  f.write(archive, archiveEntry());
  f.commit();
  const result = await review(f.repo, f.manifest(), options);
  assert.equal(result.status, 'FAIL');
  assert.ok(
    result.units
      .find((unit) => unit.head === broken)
      .validation.errors.some((error) => error.code === 'deprecation'),
  );
});
test('11 unavailable runtime and timeout remain inconclusive', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // unchanged\n');
  const manifest = f.manifest(f.commit());
  assert.equal((await review(f.repo, manifest)).status, 'INCONCLUSIVE');
  assert.equal(
    (
      await review(f.repo, manifest, {
        runtime,
        session: async () => {
          throw new Error('Independent review timed out');
        },
      })
    ).status,
    'INCONCLUSIVE',
  );
  await assert.rejects(
    runSession(
      f.repo,
      { command: process.execPath, args: ['-e', 'setTimeout(()=>{},1000)', '--'], timeoutMs: 10 },
      'fixture',
      'unused',
    ),
    /timed out|exited/,
  );
});
test('12 changed state invalidates prior bound approval', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // first\n');
  const before = f.manifest(f.commit());
  f.write(source, 'export const value = 1; // second\n');
  const after = f.manifest(f.commit());
  assert.notEqual(before.digest, after.digest);
  assert.throws(
    () =>
      validateReviewResult(
        {
          status: 'PASS',
          digest: before.digest,
          role: 'coordinator',
          units: [],
          uncertainties: [],
        },
        after,
        'coordinator',
      ),
    /Unbound/,
  );
});
test('14 unbound or incomplete approval blocks', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // unchanged\n');
  assert.equal(
    (
      await review(f.repo, f.manifest(f.commit()), {
        runtime,
        session: async () => ({ status: 'PASS' }),
      })
    ).status,
    'INCONCLUSIVE',
  );
});
test('15 dirty user worktree survives committed snapshot review', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // committed\n');
  f.commit();
  f.write(source, 'user work in progress\n');
  f.write('notes.txt', 'untracked user notes');
  assert.equal((await review(f.repo, f.manifest(), options)).status, 'PASS');
  assert.equal(readFileSync(join(f.repo, source), 'utf8'), 'user work in progress\n');
  assert.equal(readFileSync(join(f.repo, 'notes.txt'), 'utf8'), 'untracked user notes');
});
test('multiple references, deletion, new branch and malformed input', (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // commit\n');
  const head = f.commit();
  const zero = '0'.repeat(40);
  const refs = parsePushInput(
    `refs/heads/main ${head} refs/heads/main ${f.base}\nrefs/heads/new ${head} refs/heads/new ${zero}\n(delete) ${zero} refs/heads/deleted ${head}\n`,
  );
  const manifest = buildManifest(f.repo, refs);
  assert.equal(manifest.units.filter((unit) => unit.kind === 'final').length, 2);
  assert.ok(manifest.units.some((unit) => unit.base === null));
  assert.throws(() => parsePushInput('HEAD bad main bad'));
});
test('merge commits are validated against both parents', (t) => {
  const f = fixture(t);
  const initialBranch = git(f.repo, ['branch', '--show-current']).trim();
  git(f.repo, ['checkout', '-qb', 'side']);
  f.write('side.txt', 'side');
  const side = f.commit();
  git(f.repo, ['checkout', '-q', initialBranch]);
  f.write('main.txt', 'main');
  const main = f.commit();
  git(f.repo, ['merge', '--no-ff', '-qm', 'Fixture merge', 'side']);
  const merge = git(f.repo, ['rev-parse', 'HEAD']).trim();
  assert.deepEqual(
    f
      .manifest()
      .units.filter((unit) => unit.head === merge && unit.kind === 'commit')
      .map((unit) => unit.base)
      .sort(),
    [side, main].sort(),
  );
});
test('repair prepares only validated clean documentation and preserves unrelated dirty files', (t) => {
  const f = fixture(t);
  f.write('notes.txt', 'user notes');
  const original = readFileSync(join(f.repo, 'AI/Architecture/architecture-index.md'));
  const plan = {
    head: f.base,
    changes: [
      {
        path: 'AI/Architecture/architecture-index.md',
        expectedSha256: createHash('sha256').update(original).digest('hex'),
        content: original.toString() + '\nVerified navigation.\n',
      },
    ],
  };
  assert.equal(repair(f.repo, plan).status, 'PASS');
  assert.equal(readFileSync(join(f.repo, 'notes.txt'), 'utf8'), 'user notes');
  assert.equal(git(f.repo, ['rev-parse', 'HEAD']).trim(), f.base);
  assert.throws(() => repair(f.repo, plan), /overwrite/);
  assert.throws(
    () =>
      repair(f.repo, {
        head: f.base,
        changes: [{ path: source, content: 'malicious', expectedSha256: 'x' }],
      }),
    /only change/,
  );
});

test('review rejects an incomplete runtime PASS', async () => {
  const { validateReviewResult } = await import('./branch-review.mjs');
  assert.throws(() =>
    validateReviewResult({ status: 'PASS' }, { digest: 'bound', units: [] }, 'coordinator'),
  );
});

test('remote-known legacy baseline excludes prebootstrap history for a new branch', async (t) => {
  const f = fixture(t);
  const legacy = f.legacy;
  const head = f.base;
  const manifest = buildManifest(
    f.repo,
    [
      {
        localRef: 'refs/heads/new',
        localHash: head,
        remoteRef: 'refs/heads/new',
        remoteHash: '0'.repeat(40),
      },
    ],
    { remoteHeads: [legacy] },
  );
  assert.deepEqual(
    manifest.units.filter((unit) => unit.kind === 'commit').map((unit) => unit.head),
    [head],
  );
  assert.equal((await review(f.repo, manifest, options)).status, 'PASS');
});

test('reference changed while independent review runs blocks approval', async (t) => {
  const f = fixture(t);
  f.write(source, 'export const value = 1; // reviewed\n');
  const head = f.commit();
  git(f.repo, ['update-ref', 'refs/heads/main', head]);
  let changed = false;
  const result = await review(f.repo, f.manifest(head), {
    runtime,
    session: async (_repo, _runtime, prompt) => {
      if (!changed) {
        git(f.repo, ['update-ref', 'refs/heads/main', f.base]);
        changed = true;
      }
      return resultFor(prompt);
    },
  });
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.match(result.reason, /reference changed/);
});

test('small single-owner change uses one independent reviewer', () => {
  const units = [
    { changes: [{ path: source }], validation: { impact: { areas: ['backend'], domains: [] } } },
  ];
  assert.deepEqual(specialistRoles(units), ['coordinator']);
});

test('critical security and database owners are prioritized in broad review', () => {
  const units = [
    {
      changes: [{ path: source }],
      validation: {
        impact: {
          areas: ['frontend', 'backend', 'cache', 'security', 'database'],
          domains: ['domain.identity'],
        },
      },
    },
  ];
  const roles = specialistRoles(units);
  assert.ok(roles.includes('specialist:security'));
  assert.ok(roles.includes('specialist:database'));
  assert.ok(roles.includes('specialist:domain.identity'));
  assert.ok(roles.includes('cross-cutting'));
});

test('native sessions inherit recursion guard and nested pre-push fails closed', async (t) => {
  const f = fixture(t);
  const code =
    "const fs=require('node:fs');const p=process.argv[process.argv.indexOf('--output-last-message')+1];fs.writeFileSync(p,JSON.stringify({active:process.env.ARCHITECTURE_REVIEW_ACTIVE}));";
  const result = await runSession(
    f.repo,
    { command: process.execPath, args: ['-e', code, '--'], timeoutMs: 5000 },
    'fixture',
    'unused',
  );
  assert.equal(result.active, '1');
  const { spawnSync } = await import('node:child_process');
  const invocation = spawnSync(
    process.execPath,
    ['AI/skills/branch-review/scripts/branch-review.mjs', '--pre-push'],
    {
      cwd: process.cwd(),
      env: { ...process.env, ARCHITECTURE_REVIEW_ACTIVE: '1' },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  assert.equal(invocation.status, 1);
  assert.match(invocation.stderr, /Nested pre-push/);
});
