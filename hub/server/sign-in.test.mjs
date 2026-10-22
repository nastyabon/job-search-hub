import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// sign-in.mjs against a stand-in `claude` that asks for a code like the real one does. The
// script and claude-bin.mjs are copied into a temporary hub so nothing lands in this repo.
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-sign-in-'));
  for (const f of ['scripts/sign-in.mjs', 'server/claude-bin.mjs']) {
    fs.mkdirSync(path.join(root, 'hub', path.dirname(f)), { recursive: true });
    fs.copyFileSync(path.join(import.meta.dirname, '..', f), path.join(root, 'hub', f));
  }
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const state = path.join(root, 'signed-in');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh
if [ "$1 $2" = "auth status" ]; then
  if [ -f "${state}" ]; then echo '{"loggedIn": true}'; else echo '{"loggedIn": false}'; fi; exit 0
fi
echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?test"
printf 'Paste code here if prompted > '
read code
if [ "$code" = "good-code#state" ]; then touch "${state}"; exit 0; fi
echo "Login failed"; exit 1
`, { mode: 0o755 });
  const env = { HOME: root, PATH: `${bin}:/usr/bin:/bin` };
  const script = path.join(root, 'hub', 'scripts', 'sign-in.mjs');
  return { root, env, script };
}

async function signIn(code) {
  const { root, env, script } = setup();
  const waiting = spawn(process.execPath, [script], { env });
  let out = '';
  waiting.stdout.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => waiting.on('exit', resolve));
  while (!out.includes('Paste code here')) await new Promise((r) => setTimeout(r, 50));
  const sent = spawnSync(process.execPath, [script, '--code', code], { env, encoding: 'utf8' }).stdout.trim();
  const exit = await done;
  const leftovers = fs.readdirSync(path.join(root, 'hub-data'));
  fs.rmSync(root, { recursive: true, force: true });
  return { out, sent, exit, leftovers };
}

test('sign-in: shows the link, and a pasted code finishes it', async () => {
  const r = await signIn('good-code#state');
  assert.match(r.out, /visit: https:\/\/claude\.com\/cai\/oauth\/authorize/);
  assert.equal(r.sent, 'CODE_SENT');
  assert.equal(r.exit, 0);
  assert.match(r.out.trim(), /SIGNED_IN$/);
  assert.deepEqual(r.leftovers, []); // the code isn't left on disk
});

test('sign-in: a wrong code fails cleanly', async () => {
  const r = await signIn('wrong');
  assert.equal(r.exit, 1);
  assert.match(r.out.trim(), /SIGN_IN_FAILED$/);
  assert.deepEqual(r.leftovers, []);
});

test('sign-in: --code with nothing waiting says so', () => {
  const { root, env, script } = setup();
  const r = spawnSync(process.execPath, [script, '--code', 'x'], { env, encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^NO_SIGN_IN_WAITING/);
});
