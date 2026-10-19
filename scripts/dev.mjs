import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const node = process.execPath;
const children = [
  spawn(node, ['node_modules/tsx/dist/cli.mjs', 'server/gym-app.ts'], { cwd: projectRoot, stdio: 'inherit' }),
  spawn(node, ['node_modules/vite/bin/vite.js', '--port=3000', '--host=0.0.0.0'], { cwd: projectRoot, stdio: 'inherit' }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  process.exitCode = code;
};

for (const child of children) {
  child.on('error', (error) => {
    console.error('Unable to start the local app process:', error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
