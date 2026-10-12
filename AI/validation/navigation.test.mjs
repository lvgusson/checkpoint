import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { snapshot } from './git-state.mjs';
import { archiveEntries, impactedOwners, links, validateSnapshot } from './validate.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = snapshot(repo, 'WORKTREE');
const document = (name, state = files) => state.get(name)?.toString('utf8') ?? '';
const graph = new Map(
  [...files.keys()]
    .filter((name) => name.endsWith('.md') && name.startsWith('AI/'))
    .map((name) => [name, links(document(name), name).map((link) => link.target)]),
);

// Keep only paths to selected responsibilities, rather than loading sibling branches.
function route(target) {
  const pending = [['AI/main-entry.md']];
  const visited = new Set();
  while (pending.length) {
    const current = pending.shift();
    const last = current.at(-1);
    if (last === target) return current;
    if (visited.has(last)) continue;
    visited.add(last);
    for (const child of graph.get(last) ?? []) pending.push([...current, child]);
  }
  assert.fail(`No navigation route to ${target}`);
}

function navigate(changes, expected, excluded = []) {
  const impact = impactedOwners(
    files,
    changes.map((name) => ({ path: name, status: 'M' })),
  );
  const validated = validateSnapshot(files);
  const domainPaths = impact.domains.map((id) => {
    const found = validated.documents.find((entry) => entry.metadata.id === id);
    assert.ok(found, `Domain context exists: ${id}`);
    return found.path;
  });
  const loaded = new Set([...impact.documents, ...domainPaths].flatMap(route));
  for (const target of expected)
    assert.ok(loaded.has(target), `Required context loaded: ${target}`);
  for (const target of excluded)
    assert.ok(!loaded.has(target), `Irrelevant sibling avoided: ${target}`);
  for (const target of loaded) {
    assert.ok(files.has(target), `Navigation reference exists: ${target}`);
    for (const link of links(document(target), target)) {
      assert.ok(
        files.has(link.target) ||
          [...files.keys()].some((name) => name.startsWith(link.target + '/')),
        `Reference resolves: ${target} -> ${link.target}`,
      );
    }
  }
  return { impact, loaded };
}

test('navigation 1: frontend presentation reaches shell leaf without loading unrelated game workflows', () => {
  navigate(
    ['web/src/logo.ts'],
    [
      'AI/Architecture/front-end-architecture.md',
      'AI/Architecture/front-end/shell-and-authentication.md',
    ],
    ['AI/Architecture/front-end/wishlist.md', 'AI/Architecture/front-end/queue-interactions.md'],
  );
});

test('navigation 2: API change reaches HTTP contract and affected identity/domain context', () => {
  navigate(
    ['api/src/server.ts'],
    [
      'AI/Architecture/back-end-architecture.md',
      'AI/Architecture/back-end/http-api.md',
      'AI/Architecture/domains/identity/domain.md',
    ],
  );
});

test('navigation 3: scoring invariant reaches deepest prioritization leaf', () => {
  const target = 'AI/Architecture/domains/prioritization/scoring-and-pins.md';
  const selected = navigate(
    ['api/src/scoring.ts'],
    [target, 'AI/Architecture/domains/prioritization/domain.md'],
  );
  assert.ok(selected.impact.domains.includes('domain.game-library'));
  assert.ok(route(target).includes('AI/Architecture/domains/prioritization/domain.md'));
});

test('navigation 4: schema change loads database, security and every mapped business context', () => {
  const selected = navigate(
    ['db/migrations/001_init.sql'],
    [
      'AI/Architecture/database/migrations.md',
      'AI/Architecture/database/persistence.md',
      'AI/Architecture/security/database-access.md',
    ],
  );
  assert.equal(selected.impact.domains.length, 4);
});

test('navigation 5: cross-cutting authentication includes frontend and security leaves', () => {
  navigate(
    ['api/src/auth.ts', 'web/src/auth/auth.interceptor.ts'],
    [
      'AI/Architecture/security/authentication-and-ownership.md',
      'AI/Architecture/front-end/shell-and-authentication.md',
      'AI/Architecture/domains/identity/domain.md',
    ],
    ['AI/Architecture/front-end/wishlist.md'],
  );
});

test('navigation 6: browser invalidation change loads cache leaf and dependent business contexts', () => {
  const selected = navigate(
    ['web/src/data-cache.ts'],
    ['AI/Architecture/cache/browser-data-cache.md', 'AI/Architecture/front-end-architecture.md'],
  );
  assert.deepEqual(selected.impact.domains, [
    'domain.game-library',
    'domain.identity',
    'domain.prioritization',
    'domain.wishlist',
  ]);
});

test('navigation 7: new module has area entry but requires inspection and new specific documentation', () => {
  const name = 'web/src/new-cohesive-module.ts';
  const impact = impactedOwners(files, [{ path: name, status: 'A' }]);
  assert.ok(impact.documents.includes('AI/Architecture/front-end-architecture.md'));
  const sources = validateSnapshot(files).documents.flatMap((entry) => entry.metadata.source_paths);
  assert.ok(!sources.includes(name));
  assert.match(
    document('AI/main-entry.md'),
    /Missing documentation requires source investigation first/,
  );
  assert.match(document('AI/main-entry.md'), /create a leaf/);
});

test('navigation 8: replaced domain rule is blocked without exact archive and accepted with preservation', () => {
  const name = 'AI/Architecture/domains/prioritization/scoring-and-pins.md';
  const previous = document(name);
  const block = /^## 5\.[^\n]*\n[\s\S]*?(?=^## 6\.)/m.exec(previous)?.[0];
  assert.ok(block);
  const state = new Map(files);
  state.set(
    name,
    Buffer.from(
      previous.replace(
        block,
        '## 5. Invariants\n\nChanged rule for isolated navigation validation.\n\n',
      ),
    ),
  );
  assert.ok(
    validateSnapshot(state, { baseFiles: files }).errors.some(
      (error) => error.code === 'deprecation' && error.path === name,
    ),
  );
  const archive = 'AI/Deprecate/domains/deprecate-prioritization.md';
  const entry =
    '\n## DEP-20261012-navigation-fixture\n\n- Date: 2026-10-12T00:00:00-03:00\n- Source: `' +
    name +
    '`\n- Original document ID: `domain.prioritization.scoring-and-pins`\n- Original section: `5. Invariants`\n- Reason: Isolated simulation\n- Replacement: `' +
    name +
    '`\n- Related code: `api/src/scoring.ts`\n- Change reference: navigation fixture\n\n### Exact previous content\n\n````markdown\n' +
    block +
    '````\n';
  state.set(archive, Buffer.from(document(archive) + entry));
  assert.equal(archiveEntries(entry)[0].content, block);
  assert.ok(
    !validateSnapshot(state, { baseFiles: files }).errors.some(
      (error) => error.code === 'deprecation' && error.path === name,
    ),
  );
});

test('navigation 9: acquisition feature spans frontend, backend, domain and cache leaves', () => {
  const selected = navigate(
    ['web/src/wishlist-api.ts', 'api/src/wishlist.ts'],
    [
      'AI/Architecture/front-end/wishlist.md',
      'AI/Architecture/back-end/wishlist-steam.md',
      'AI/Architecture/cache/steam-caches.md',
      'AI/Architecture/domains/wishlist/domain.md',
    ],
    ['AI/Architecture/front-end/queue-interactions.md'],
  );
  for (const area of ['frontend', 'backend', 'domain', 'cache'])
    assert.ok(selected.impact.areas.includes(area));
});

test('navigation 10: undocumented implementation cannot pass coverage through absent ownership', () => {
  const state = new Map(files);
  const name = 'web/src/undocumented-navigation-fixture.ts';
  state.set(name, Buffer.from('export const value = 1;\n'));
  const ownership = JSON.parse(document('AI/validation/ownership.json'));
  ownership.rules = ownership.rules.filter((rule) => !rule.pattern.startsWith('web/'));
  state.set('AI/validation/ownership.json', Buffer.from(JSON.stringify(ownership)));
  assert.deepEqual(impactedOwners(state, [{ path: name, status: 'A' }]).documents, []);
  assert.ok(
    validateSnapshot(state, {
      changes: [{ path: name, status: 'A' }],
      requireCoverage: true,
    }).errors.some((error) => error.code === 'coverage' && error.path === name),
  );
  assert.match(
    document('AI/main-entry.md'),
    /Missing documentation requires source investigation first/,
  );
});
