#!/usr/bin/env node
// Signs the hub's own Claude in, with no Terminal for the user. Claude runs this in the background
// during setup (SETUP.md step 1.3). It starts `claude auth login --claudeai`, which opens a Claude
// page in the browser. If the browser doesn't open, the link is printed below for Claude to show
// the user. If the Claude page then shows a code, the user pastes it into the chat and Claude runs
// `node hub/scripts/sign-in.mjs --code "<code>"`, which hands it to the sign-in that's waiting here.
// Usage: node hub/scripts/sign-in.mjs                 (waits up to 15 minutes)
//        node hub/scripts/sign-in.mjs --code "<code>"
// Last line printed: SIGNED_IN, SIGN_IN_FAILED, SIGN_IN_TIMED_OUT, CLAUDE_CODE_MISSING,
// CODE_SENT or NO_SIGN_IN_WAITING.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { claudeBin, claudeStatus } from '../server/claude-bin.mjs';

const DIR = path.join(import.meta.dirname, '..', '..', 'hub-data');
const CODE_FILE = path.join(DIR, '.sign-in-code');
const WAITING = path.join(DIR, '.sign-in-waiting');
const TIMEOUT_MS = 15 * 60 * 1000;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const i = process.argv.indexOf('--code');
if (i !== -1) {
  // The code from the Claude page goes to the sign-in that's waiting (a file only it reads).
  const code = String(process.argv[i + 1] ?? '').trim();
  const pid = Number(fs.existsSync(WAITING) ? fs.readFileSync(WAITING, 'utf8') : 0);
  if (!code || !pid || !alive(pid)) {
    console.log('NO_SIGN_IN_WAITING: start the sign-in first with node hub/scripts/sign-in.mjs');
    process.exit(1);
  }
  fs.writeFileSync(CODE_FILE, code, { mode: 0o600 });
  console.log('CODE_SENT');
  process.exit(0);
}

const bin = claudeBin();
if (!bin) { console.log('CLAUDE_CODE_MISSING'); process.exit(1); }
if (claudeStatus().loggedIn) { console.log('SIGNED_IN'); process.exit(0); }

fs.mkdirSync(DIR, { recursive: true });
fs.rmSync(CODE_FILE, { force: true });
fs.writeFileSync(WAITING, String(process.pid));

const child = spawn(bin, ['auth', 'login', '--claudeai'], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stdout);
console.log('Waiting for the sign-in. If the Claude page shows a code, pass it on with: node hub/scripts/sign-in.mjs --code "<code>"');

const poll = setInterval(() => {
  if (!fs.existsSync(CODE_FILE)) return;
  const code = fs.readFileSync(CODE_FILE, 'utf8').trim();
  fs.rmSync(CODE_FILE, { force: true });
  child.stdin.write(`${code}\n`);
}, 500);
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill(); }, TIMEOUT_MS);

child.on('exit', () => {
  clearInterval(poll);
  clearTimeout(timer);
  fs.rmSync(WAITING, { force: true });
  fs.rmSync(CODE_FILE, { force: true });
  const ok = claudeStatus().loggedIn;
  console.log(ok ? '\nSIGNED_IN' : timedOut ? '\nSIGN_IN_TIMED_OUT' : '\nSIGN_IN_FAILED');
  process.exit(ok ? 0 : 1);
});
