import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NO_CLAUDE, NOT_SIGNED_IN } from './claude-bin.mjs';

const CHECK = path.join(import.meta.dirname, '..', 'scripts', 'claude-check.mjs');

// Runs claude-check.mjs with a made-up home folder and PATH, so the real `claude` isn't found.
function check(fakeClaude) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-claude-check-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  if (fakeClaude) fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\n${fakeClaude}\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8', env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` } });
  fs.rmSync(home, { recursive: true, force: true });
  return r.stdout.trim();
}

const elsewhere = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude'].some((p) => fs.existsSync(p));

test('claude-check: missing', { skip: elsewhere && 'claude is installed system-wide here' }, () => {
  assert.equal(check(''), 'CLAUDE_CODE_MISSING');
});

test('claude-check: installed but signed out', () => {
  assert.equal(check(`echo '{"loggedIn": false}'`), 'CLAUDE_CODE_SIGNED_OUT');
});

test('claude-check: signed in', () => {
  assert.match(check(`echo '{"loggedIn": true}'`), /^CLAUDE_CODE_OK \(/);
});

test('hub messages send the user to "continue the setup"', () => {
  for (const m of [NO_CLAUDE, NOT_SIGNED_IN]) assert.ok(m.endsWith("Open Claude in your job-search-hub folder and say 'continue the setup'."), m);
});
