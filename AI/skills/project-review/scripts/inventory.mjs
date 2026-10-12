import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = process.argv[2];
if (!output || !/^AI\/project-review\/\d{4}-\d{2}-\d{2}\/[^/]+\.json$/.test(output)) {
  throw new Error('Provide a repository-relative dated review manifest path.');
}
if (existsSync(output))
  throw new Error('Preserve earlier manifests; choose a distinct output filename.');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const files = [
  ...new Set(
    git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean),
  ),
].sort();
const assign = (file) => {
  if (file.startsWith('api/') || file === 'shared/models.ts') return 'application-services';
  if (file.startsWith('web/')) return 'browser-application';
  if (
    file.startsWith('AI/') ||
    file.startsWith('.agents/') ||
    file.startsWith('.claude/') ||
    file.startsWith('.codex/') ||
    file.startsWith('.github/') ||
    file.startsWith('.husky/') ||
    file.startsWith('docs/superpowers/')
  )
    return 'engineering-harness';
  return 'principal';
};
const manifest = {
  generatedAt: new Date().toISOString(),
  head: git('rev-parse', 'HEAD').trim(),
  workingTree: git('status', '--short'),
  workload: { simultaneousUsers: 1000000, requestsPerSecond: 1000000, measured: false },
  exclusions: [
    "Ignored dependencies, build outputs, Git internals, and local credentials are outside line-by-line text review. Generate the manifest before creating this run's reports; existing review artifacts remain in scope.",
  ],
  files: files.map((file) => {
    try {
      const bytes = readFileSync(file);
      const binary = bytes.includes(0) || /\.(png|jpg|jpeg|gif|ico|woff2?|pdf|zip)$/i.test(file);
      return {
        path: file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
        lines: binary ? null : bytes.toString('utf8').split('\n').length,
        kind: binary ? 'binary' : 'text',
        reviewer: assign(file),
        status: 'pending',
      };
    } catch (error) {
      return { path: file, reviewer: assign(file), status: 'inaccessible', error: error.code };
    }
  }),
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      output,
      head: manifest.head,
      files: manifest.files.length,
      assignments: Object.fromEntries(
        [...new Set(manifest.files.map((file) => file.reviewer))].map((reviewer) => [
          reviewer,
          manifest.files.filter((file) => file.reviewer === reviewer).length,
        ]),
      ),
    },
    null,
    2,
  ),
);
