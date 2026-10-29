#!/usr/bin/env node
// Which companies career-ops' scan checks (portals.yml tracked_companies), from the project root.
//   node hub/scripts/scan-list.mjs --only-mine [--keep "A,B"]          preview: what would be switched off
//   node hub/scripts/scan-list.mjs --only-mine [--keep "A,B"] --write  switch off every company not in outreach.yml
// Same as the hub's `companies` action (server/actions.mjs scanCompanies). Comments in portals.yml survive.

import { scanCompanies } from '../server/actions.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? '' : args[i + 1] ?? ''; };
const write = args.includes('--write');
const keep = opt('--keep').split(',').map((s) => s.trim()).filter(Boolean);
try {
  const r = await scanCompanies({ onlyMine: args.includes('--only-mine'), on: keep, off: opt('--off').split(',').map((s) => s.trim()).filter(Boolean), preview: !write });
  console.log(`${write ? 'Switched off' : 'Would switch off'} ${r.off.length}: ${r.off.join(', ') || 'none'}`);
  if (r.on.length) console.log(`${write ? 'Switched on' : 'Would switch on'}: ${r.on.join(', ')}`);
  if (!write && (r.off.length || r.on.length)) console.log('Preview only. Run with --write to change portals.yml.');
} catch (e) { console.error(e.message); process.exit(1); }
