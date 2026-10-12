import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { snapshot, git } from '../../../validation/git-state.mjs';
import { validateSnapshot } from '../../../validation/validate.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function repair(repo, plan) {
  if (
    !Array.isArray(plan.changes) ||
    !plan.changes.length ||
    plan.head !== git(repo, ['rev-parse', 'HEAD']).trim()
  )
    throw new Error('Repair plan must bind current HEAD and specify documentation changes');
  const committed = snapshot(repo, plan.head);
  const index = snapshot(repo, 'INDEX');
  const current = snapshot(repo, 'WORKTREE');
  const changes = [];
  const targets = new Set();
  for (const change of plan.changes) {
    if (
      !/^AI\/(Architecture|Deprecate)\/[a-zA-Z0-9/_.-]+\.md$/.test(change.path) ||
      change.path.split('/').includes('..') ||
      targets.has(change.path) ||
      typeof change.content !== 'string'
    )
      throw new Error('Repair may only change distinct architecture or archive Markdown documents');
    targets.add(change.path);
    const absolute = resolve(repo, change.path);
    if (relative(resolve(repo), absolute).startsWith('..'))
      throw new Error('Repair path escapes repository');
    let ancestor = absolute;
    while (ancestor !== resolve(repo)) {
      if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink())
        throw new Error('Repair targets cannot traverse symbolic links');
      ancestor = dirname(ancestor);
    }
    const before = existsSync(absolute) ? readFileSync(absolute) : Buffer.alloc(0);
    const tracked = committed.get(change.path) ?? Buffer.alloc(0);
    const staged = index.get(change.path) ?? Buffer.alloc(0);
    if (
      !before.equals(tracked) ||
      !staged.equals(tracked) ||
      digest(before) !== change.expectedSha256
    )
      throw new Error(`Repair would overwrite existing or concurrent changes: ${change.path}`);
    const after = Buffer.from(change.content, 'utf8');
    if (change.path.startsWith('AI/Deprecate/') && !after.subarray(0, before.length).equals(before))
      throw new Error('Repair cannot replace historical archive bytes');
    current.set(change.path, after);
    changes.push({ path: change.path, before, after, absolute });
  }
  const validation = validateSnapshot(current, {
    baseFiles: committed,
    changes: changes.map((change) => ({
      status: committed.has(change.path) ? 'M' : 'A',
      path: change.path,
    })),
    requireCoverage: false,
  });
  if (validation.status !== 'PASS') return { status: 'FAIL', validation, modified: [] };
  for (const change of changes) {
    const now = existsSync(change.absolute) ? readFileSync(change.absolute) : Buffer.alloc(0);
    if (!now.equals(change.before))
      throw new Error(`Concurrent modification prevented repair: ${change.path}`);
  }
  for (const change of changes) {
    mkdirSync(dirname(change.absolute), { recursive: true });
    writeFileSync(change.absolute, change.after);
  }
  return {
    status: 'PASS',
    modified: changes.map((change) => change.path),
    message:
      'Prepared working-tree documentation only. Stage and commit explicitly; inconsistent historical commits still block push.',
  };
}
