import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  [
    'AI/skills/branch-review/scripts/branch-review.mjs',
    '--pre-push',
    '--remote',
    process.argv[2] ?? '',
  ],
  { stdio: 'inherit', windowsHide: true },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
