// Finds the `claude` command (Claude Code) for the hub's background Claude: chat, CV tailoring,
// reading LinkedIn pastes and scoring openings. The Claude desktop app keeps its own copy out of
// reach, so setup installs the command (to ~/.local/bin by Anthropic's installer). A hub started
// from a launcher or a fresh session may not have that folder on PATH, so look there too.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CANDIDATES = [
  path.join(os.homedir(), '.local', 'bin', 'claude'),
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
];

export const NO_CLAUDE = "Claude isn't set up for the hub yet. Ask Claude to finish the setup (it installs the Claude Code command and signs you in).";
export const NOT_SIGNED_IN = "Claude isn't signed in for the hub. Ask Claude to finish the setup, or to sign the hub in.";

let cached = '';

// Absolute path to `claude`, or '' when it isn't installed.
export function claudeBin() {
  if (cached && fs.existsSync(cached)) return cached;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  const onPath = which.status === 0 ? which.stdout.split(/\r?\n/)[0].trim() : '';
  cached = onPath || CANDIDATES.find((p) => fs.existsSync(p)) || '';
  return cached;
}

// Background runs never open LinkedIn pages: a PreToolUse hook refuses WebFetch on linkedin.com,
// every subdomain (de., uk., …), lnkd.in and licdn.com. A domain permission rule isn't enough: it
// matches the exact host only. Passed with --settings, so it applies with --setting-sources ''.
const HOOK = path.join(import.meta.dirname, 'no-linkedin-hook.mjs');
export const noLinkedInArgs = () => ['--settings', JSON.stringify({
  hooks: { PreToolUse: [{ matcher: 'WebFetch', hooks: [{ type: 'command', command: `"${process.execPath}" "${HOOK}"` }] }] },
})];

// Environment for career-ops scripts that call `claude` themselves (rank-pipeline.mjs): `claude`
// resolves to bin/claude, which runs the real one with the no-LinkedIn hook.
export function claudeEnv() {
  const bin = claudeBin();
  if (!bin) return process.env;
  return { ...process.env, HUB_REAL_CLAUDE: bin, PATH: `${path.join(import.meta.dirname, 'bin')}${path.delimiter}${path.dirname(bin)}${path.delimiter}${process.env.PATH ?? ''}` };
}

// A login problem in Claude's error output → the plain-words message.
export const friendlyClaudeError = (text) => (/not logged in|please run \/login|invalid api key|authenticat|oauth/i.test(String(text)) ? NOT_SIGNED_IN : '');

// {installed, loggedIn} for setup checks.
export function claudeStatus() {
  const bin = claudeBin();
  if (!bin) return { installed: false, loggedIn: false };
  const r = spawnSync(bin, ['auth', 'status', '--json'], { encoding: 'utf8', timeout: 20000 });
  try { return { installed: true, loggedIn: Boolean(JSON.parse(r.stdout).loggedIn), bin }; } catch { return { installed: true, loggedIn: false, bin }; }
}
