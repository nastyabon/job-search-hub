#!/usr/bin/env node
// PreToolUse hook for the chats the user talks to (side-panel chat, Tailor CV). It enforces the
// LinkedIn rules in code:
//   - a LinkedIn job posting (/jobs/view/<id>) or profile (/in/<name>) opens only if the user sent
//     that exact link in this conversation, once per link (a redirect to another country subdomain
//     of the same link is allowed once more);
//   - every other LinkedIn page (search, feed, company pages, /in/x/details, posts…), lnkd.in short
//     links and licdn.com are refused;
//   - LinkedIn fetches are spaced out (a few seconds apart) and capped per reply.
// Usage (set up by chat.mjs): node linkedin-guard-hook.mjs <state.json>, where state.json is
// {allowed: [keys], fetched: {key: [hosts]}, last: ms}. Other sites pass through untouched.

import fs from 'node:fs';
import { LINKEDIN_HOST, LINKEDIN_OTHER, linkedinKey } from './linkedin.mjs';

const GAP_MS = 4000;
const MAX_PER_REPLY = 20;
const stateFile = process.argv[2];

const deny = (reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
};

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let url = '';
  let host = '';
  try { url = JSON.parse(input).tool_input?.url ?? ''; host = new URL(url).hostname.replace(/\.$/, ''); } catch { process.exit(0); }
  if (LINKEDIN_OTHER.test(host)) deny(`${host} links are never opened. Ask the user for the full linkedin.com/jobs/view/… or /in/… link, or to paste the page.`);
  if (!LINKEDIN_HOST.test(host)) process.exit(0); // not LinkedIn: normal rules apply

  const key = linkedinKey(url);
  if (!key) deny('Only a LinkedIn job posting (/jobs/view/…) or profile (/in/…) link that the user sent can be opened. Search, feed, company pages, posts and profile sub-pages never are.');
  let state = { allowed: [], fetched: {}, last: 0 };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch { deny('LinkedIn links can only be opened from the hub chat.'); }
  if (!state.allowed.includes(key)) deny(`The user didn't send this link (${key}) in this conversation, so it isn't opened. Ask them to send it if they want it read.`);
  const hosts = state.fetched[key] ?? [];
  if (hosts.length >= 2 || hosts.includes(host)) deny(`Already opened ${key} once in this reply. Use what it returned; if it was a login page or empty, ask the user to paste the text.`);
  const total = Object.values(state.fetched).reduce((n, h) => n + h.length, 0);
  if (total >= MAX_PER_REPLY) deny(`That's ${MAX_PER_REPLY} LinkedIn pages in one reply. Report what you have and ask before opening more.`);

  // Space LinkedIn fetches out, then record this one and let it through.
  const wait = state.last + GAP_MS - Date.now();
  if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
  state.fetched[key] = [...hosts, host];
  state.last = Date.now();
  fs.writeFileSync(stateFile, JSON.stringify(state));
  process.exit(0);
});
