#!/usr/bin/env node
// Starts the hub, or opens it if it's already running. Used by `npm start`, the Mac launcher
// and Claude ("open my job hub"). Port 5199 first; if another program has it, the next free one.
// Prints the address either way.

import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PORTS = [5199, 5299, 5399, 5499];

// 'ours' (this hub is running there), 'free', or 'taken' (something else answers).
async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/whoami`, { signal: AbortSignal.timeout(1500) });
    const who = await res.json().catch(() => null);
    return who?.app === 'job-search-hub' && path.resolve(who.root) === ROOT ? 'ours' : 'taken';
  } catch (err) {
    return err?.cause?.code === 'ECONNREFUSED' ? 'free' : 'taken';
  }
}

function openBrowser(url) {
  if (process.env.BROWSER === 'none') return; // same switch Vite uses
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

for (const port of PORTS) {
  const state = await probe(port);
  const url = `http://127.0.0.1:${port}/`;
  if (state === 'ours') {
    console.log(`Your Job Search Hub is already running: ${url}`);
    openBrowser(url);
    process.exit(0);
  }
  if (state === 'free') {
    if (port !== PORTS[0]) console.log(`Port ${PORTS[0]} is used by another program, so the hub uses ${port} this time.`);
    console.log(`Starting your Job Search Hub: ${url}  (it opens in your browser; keep this running while you use it)`);
    // Vite opens the browser itself once the server is up.
    const child = spawn('npm', ['run', 'hub'], { cwd: path.join(ROOT, 'hub'), stdio: 'inherit', env: { ...process.env, HUB_PORT: String(port) }, shell: process.platform === 'win32' });
    child.on('exit', (code) => process.exit(code ?? 0));
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
    break;
  }
  if (port === PORTS.at(-1)) {
    console.error(`Ports ${PORTS.join(', ')} are all used by other programs. Restart the computer, or ask Claude to help.`);
    process.exit(1);
  }
}
