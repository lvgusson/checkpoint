import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function git(repo, args) {
  return execFileSync(process.env.ARCHITECTURE_GIT || 'git', args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function objects(repo, entries) {
  const files = new Map();
  if (!entries.length) return files;
  const buffer = execFileSync(process.env.ARCHITECTURE_GIT || 'git', ['cat-file', '--batch'], {
    cwd: repo,
    input: entries.map((entry) => entry.oid).join('\n') + '\n',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let offset = 0;
  for (const entry of entries) {
    const end = buffer.indexOf(10, offset);
    const header = buffer.subarray(offset, end).toString('utf8').split(' ');
    if (header[1] !== 'blob') throw new Error(`Expected Git blob for ${entry.path}`);
    const size = Number(header[2]);
    offset = end + 1;
    files.set(entry.path, Buffer.from(buffer.subarray(offset, offset + size)));
    offset += size + 1;
  }
  return files;
}

export function snapshot(repo, ref = 'WORKTREE') {
  if (ref === 'WORKTREE') {
    const files = new Map();
    for (const name of git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean)) {
      const absolute = path.resolve(repo, name);
      if (!absolute.startsWith(path.resolve(repo) + path.sep))
        throw new Error(`Path outside repository: ${name}`);
      if (existsSync(absolute)) files.set(name, readFileSync(absolute));
    }
    return files;
  }
  if (ref === 'INDEX') {
    const entries = git(repo, ['ls-files', '--stage', '-z'])
      .split('\0')
      .filter(Boolean)
      .map((record) => {
        const [fields, name] = record.split('\t');
        const [, oid, stage] = fields.split(' ');
        if (stage !== '0') throw new Error(`Unmerged index entry: ${name}`);
        return { path: name, oid };
      });
    return objects(repo, entries);
  }
  if (!ref || /^0+$/.test(ref)) return new Map();
  const entries = git(repo, ['ls-tree', '-r', '-z', ref])
    .split('\0')
    .filter(Boolean)
    .flatMap((record) => {
      const [fields, name] = record.split('\t');
      const [, type, oid] = fields.split(' ');
      return type === 'blob' ? [{ path: name, oid }] : [];
    });
  return objects(repo, entries);
}

export function changedPaths(repo, base, head) {
  const args = ['diff', '--name-status', '-z', '--find-renames'];
  if (head === 'INDEX') args.push('--cached', base);
  else if (head === 'WORKTREE') args.push(base);
  else if (!base || /^0+$/.test(base))
    args.splice(
      0,
      args.length,
      'diff-tree',
      '--root',
      '--no-commit-id',
      '-r',
      '--name-status',
      '-z',
      '--find-renames',
      head,
    );
  else args.push(base, head);
  const records = git(repo, args).split('\0').filter(Boolean);
  const changes = [];
  while (records.length) {
    const status = records.shift();
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = records.shift();
      changes.push({ status, oldPath, path: records.shift() });
    } else changes.push({ status, path: records.shift() });
  }
  return changes;
}
