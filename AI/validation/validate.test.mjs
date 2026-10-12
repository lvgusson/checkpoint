import assert from 'node:assert/strict';
import { test } from 'node:test';

const metadata = `---\nid: architecture.backend\ntitle: Backend\ntype: architecture-root\narea: backend\nstatus: active\nowner: api\nlast_verified: 2026-10-11\nsource_paths: [api/src/service.ts]\nrelated_domains: []\ntags: []\n---\n`;
const sections = Array.from(
  { length: 10 },
  (_, i) => `## ${i + 1}. Section\n\nVERIFIED example.\n`,
).join('\n');
const doc = metadata + '# Backend\n\n' + sections;
function fixture() {
  return new Map(
    Object.entries({
      'AI/main-entry.md': Buffer.from('[Architecture](Architecture/architecture-index.md)\n'),
      'AI/Architecture/architecture-index.md': Buffer.from('[Backend](back-end-architecture.md)\n'),
      'AI/Architecture/back-end-architecture.md': Buffer.from(doc),
      'api/src/service.ts': Buffer.from('export const value = 1;\n'),
      'AI/validation/ownership.json': Buffer.from(
        JSON.stringify({
          version: 1,
          rules: [
            {
              pattern: 'api/src/**',
              areas: ['backend'],
              documents: ['AI/Architecture/back-end-architecture.md'],
              domains: [],
            },
          ],
        }),
      ),
      'AI/Deprecate/deprecate-back-end.md': Buffer.from('# Backend history\n'),
    }),
  );
}
async function validate(files, options) {
  const module = await import('./validate.mjs');
  return module.validateSnapshot(files, options);
}
test('valid linked architecture passes parsed metadata and reachability checks', async () => {
  assert.equal((await validate(fixture())).status, 'PASS');
});
test('malformed YAML and duplicate identifiers fail', async () => {
  const files = fixture();
  files.set(
    'AI/Architecture/back-end-architecture.md',
    Buffer.from(doc.replace('tags: []', 'tags: [')),
  );
  assert.ok((await validate(files)).errors.some((e) => e.code === 'metadata'));
});
test('broken relative links and missing source references fail', async () => {
  const files = fixture();
  files.set(
    'AI/Architecture/back-end-architecture.md',
    Buffer.from(doc + '\n[Missing](missing.md)\n'),
  );
  files.delete('api/src/service.ts');
  const result = await validate(files);
  assert.ok(result.errors.some((e) => e.code === 'link'));
  assert.ok(result.errors.some((e) => e.code === 'source'));
});
test('orphan architecture document is rejected', async () => {
  const files = fixture();
  files.set(
    'AI/Architecture/orphan.md',
    Buffer.from(doc.replace('architecture.backend', 'architecture.orphan')),
  );
  assert.ok((await validate(files)).errors.some((e) => e.code === 'orphan'));
});
test('unmapped changed implementation cannot pass coverage', async () => {
  const files = fixture();
  files.set('api/unknown.ts', Buffer.from('export const unknown = true;\n'));
  assert.ok(
    (await validate(files, { changes: [{ status: 'A', path: 'api/unknown.ts' }] })).errors.some(
      (e) => e.code === 'coverage',
    ),
  );
});
test('archive modification and deletion fail append-only integrity', async () => {
  const baseFiles = fixture();
  const files = fixture();
  files.set('AI/Deprecate/deprecate-back-end.md', Buffer.from('# Rewritten\n'));
  assert.ok((await validate(files, { baseFiles })).errors.some((e) => e.code === 'archive'));
  files.delete('AI/Deprecate/deprecate-back-end.md');
  assert.ok((await validate(files, { baseFiles })).errors.some((e) => e.code === 'archive'));
});
test('replaced section must be archived exactly and append only', async () => {
  const baseFiles = fixture();
  const files = fixture();
  const old = '## 4. Section\n\nVERIFIED example.\n\n';
  files.set(
    'AI/Architecture/back-end-architecture.md',
    Buffer.from(
      doc.replace('## 4. Section\n\nVERIFIED example.', '## 4. Section\n\nVERIFIED replacement.'),
    ),
  );
  assert.ok((await validate(files, { baseFiles })).errors.some((e) => e.code === 'deprecation'));
  files.set(
    'AI/Deprecate/deprecate-back-end.md',
    Buffer.from(
      '# Backend history\n\n## DEP-20261011-example\n\n- Date: 2026-10-11T12:00:00-03:00\n- Source: `AI/Architecture/back-end-architecture.md`\n- Original document ID: `architecture.backend`\n- Original section: `4. Section`\n- Reason: Updated behavior\n- Replacement: `AI/Architecture/back-end-architecture.md`\n- Related code: `api/src/service.ts`\n- Change reference: test\n\n### Exact previous content\n\n```markdown\n' +
        old +
        '```\n',
    ),
  );
  assert.equal((await validate(files, { baseFiles })).status, 'PASS');
});
test('unstructured obsolete text cannot masquerade as a complete deprecation entry', async () => {
  const baseFiles = fixture();
  const files = fixture();
  files.set(
    'AI/Architecture/back-end-architecture.md',
    Buffer.from(doc.replace('VERIFIED example.', 'VERIFIED changed.')),
  );
  files.set(
    'AI/Deprecate/deprecate-back-end.md',
    Buffer.from(
      '# Backend history\n\n- Source: `AI/Architecture/back-end-architecture.md`\n### Exact previous content\n' +
        '## 1. Section\n\nVERIFIED example.\n\n',
    ),
  );
  assert.ok((await validate(files, { baseFiles })).errors.some((e) => e.code === 'deprecation'));
});
test('removed ownership mappings retain parent architectural impact', async () => {
  const baseFiles = fixture();
  const files = fixture();
  files.set('AI/validation/ownership.json', Buffer.from(JSON.stringify({ version: 1, rules: [] })));
  const result = await validate(files, {
    baseFiles,
    changes: [{ status: 'M', path: 'api/src/service.ts' }],
  });
  assert.ok(result.impact.areas.includes('backend'));
  assert.ok(result.impact.documents.includes('AI/Architecture/back-end-architecture.md'));
});
test('metadata rejects empty or nonstring scalar fields and impossible dates', async () => {
  for (const [before, after] of [
    ['title: Backend', 'title: null'],
    ['owner: api', 'owner: []'],
    ['area: backend', 'area: {}'],
    ['2026-10-11', '2026-02-30'],
  ]) {
    const files = fixture();
    files.set('AI/Architecture/back-end-architecture.md', Buffer.from(doc.replace(before, after)));
    assert.ok(
      (await validate(files)).errors.some((e) => e.code === 'metadata'),
      after,
    );
  }
});
test('related domain identifiers must reference domain documents', async () => {
  const files = fixture();
  files.set(
    'AI/Architecture/back-end-architecture.md',
    Buffer.from(doc.replace('related_domains: []', 'related_domains: [architecture.backend]')),
  );
  assert.ok((await validate(files)).errors.some((e) => e.code === 'domain'));
});
test('historical fenced metadata is opaque to archive entry parsing', async () => {
  const { archiveEntries } = await import('./validate.mjs');
  const entries = archiveEntries(
    '## DEP-20261012-opaque\n\n- Source: `real.md`\n- Date: 2026-10-12T00:00:00-03:00\n\n### Exact previous content\n\n```markdown\n- Source: `old.md`\n- Date: old timestamp\n```\n',
  );
  assert.equal(entries[0].fields.Source, 'real.md');
  assert.equal(entries[0].fields.Date, '2026-10-12T00:00:00-03:00');
});
