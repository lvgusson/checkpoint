import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['AI/validation/validate.mjs', '--staged'], {
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
