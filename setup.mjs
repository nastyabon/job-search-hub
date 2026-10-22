#!/usr/bin/env node
// One-time setup, safe to run again: checks the tools, gets career-ops, copies the starter data
// into hub-data/ (never overwriting anything), and installs the hub's packages.
// Usage: node setup.mjs        (Claude runs this for you during setup; see SETUP.md)

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const ROOT = import.meta.dirname;
const CAREER_OPS = path.join(ROOT, 'career-ops');
const CAREER_OPS_REPO = 'https://github.com/career-ops-hq/career-ops.git';
const ok = (s) => console.log(`✓ ${s}`);
const todo = [];

function has(cmd) {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}
function run(cmd, cwd = ROOT) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}
function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// 1. Tools. career-ops needs Node 22.13+ (node:sqlite without a flag).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) fail(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org, then run this again.`);
ok(`Node.js ${process.versions.node}`);
if (!has('git')) fail('git is missing. On a Mac, run `xcode-select --install` and click Install in the window that opens, then run this again.');
ok('git');
if (has('claude')) ok('Claude Code');
else todo.push('The `claude` command was not found. The hub uses it for chat, CV tailoring and reading LinkedIn pastes. Install Claude Code (https://claude.com/claude-code) and sign in.');

// 2. career-ops: a plain clone, never modified, so its own updater keeps working.
if (fs.existsSync(path.join(CAREER_OPS, 'package.json'))) ok('career-ops is already here');
else {
  console.log('Getting career-ops…');
  run(`git clone ${CAREER_OPS_REPO} career-ops`);
}
if (!fs.existsSync(path.join(CAREER_OPS, 'node_modules'))) run('npm install', CAREER_OPS);
ok('career-ops packages');

// 3. Your data: copy each starter file only if it isn't there yet.
const copied = [];
function copyMissing(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copyMissing(src, dst); }
    else if (e.name !== '.gitkeep' && !fs.existsSync(dst)) { fs.copyFileSync(src, dst); copied.push(path.relative(ROOT, dst)); }
  }
}
fs.mkdirSync(path.join(ROOT, 'hub-data'), { recursive: true });
copyMissing(path.join(ROOT, 'hub-data-example'), path.join(ROOT, 'hub-data'));
ok(copied.length ? `hub-data: added ${copied.join(', ')}` : 'hub-data is already set up');

// 4. The hub's packages.
run('npm install', path.join(ROOT, 'hub'));
ok('hub packages');

// 5. What's left: the personal part (Claude does this with you; see SETUP.md).
let profile = '';
try { profile = fs.readFileSync(path.join(ROOT, 'hub-data', 'profile.yml'), 'utf8'); } catch { /* checked below */ }
if (!/^name:\s*"?[^"\s#]/m.test(profile)) todo.push('Your profile is empty: hub-data/profile.yml (Claude fills it in with you).');
if (!fs.existsSync(path.join(CAREER_OPS, 'cv.md'))) todo.push('No CV yet: career-ops/cv.md (Claude sets it up from your CV).');

console.log(todo.length ? `\nStill to do:\n${todo.map((t) => `- ${t}`).join('\n')}` : '\nAll set. Start the hub with: npm run hub');
