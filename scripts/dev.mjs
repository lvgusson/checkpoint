import { spawn } from 'node:child_process';
const processes = [
  spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'apps/api/src/server.ts'], {
    stdio: 'inherit',
  }),
  spawn('pnpm', ['--filter', '@checkpoint/web', 'start', '--host', '127.0.0.1'], {
    stdio: 'inherit',
  }),
];
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    for (const p of processes) p.kill(sig);
    process.exit();
  });
