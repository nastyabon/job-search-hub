#!/usr/bin/env node
// Which companies career-ops' scan checks (portals.yml tracked_companies), from the project root.
//   node hub/scripts/scan-list.mjs --only-mine [--keep "A,B"]          preview: what would be switched off
//   node hub/scripts/scan-list.mjs --only-mine [--keep "A,B"] --write  switch off every company not in outreach.yml
//   node hub/scripts/scan-list.mjs --add "Acme, Globex" --write        find each company's job board (career-ops'
//        discover-ats, plus other board names when its guess misses); a board it isn't sure of is left out
// Same as the hub's `companies` action (server/actions.mjs scanCompanies). Comments in portals.yml survive.

import { scanCompanies } from '../server/actions.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? '' : args[i + 1] ?? ''; };
const write = args.includes('--write');
const list = (name) => opt(name).split(',').map((s) => s.trim()).filter(Boolean);
try {
  const r = await scanCompanies({ onlyMine: args.includes('--only-mine'), on: list('--keep'), off: list('--off'), add: list('--add'), preview: !write });
  if (write && r.placed.length) console.log(`Job board found: ${r.placed.join(', ')}`);
  for (const c of write ? r.check : []) console.log(`Left out ${c.name}: the only board found (${c.url}) has few postings, maybe another company's`);
  if (r.notPlaced.length) console.log(`${write ? 'No job board found' : 'Would look for a job board'}: ${r.notPlaced.join(', ')}${write ? ' (still scanned from outreach.yml)' : ''}`);
  if (r.off.length || args.includes('--only-mine')) console.log(`${write ? 'Switched off' : 'Would switch off'} ${r.off.length}: ${r.off.join(', ') || 'none'}`);
  if (r.on.length) console.log(`${write ? 'Switched on' : 'Would switch on'}: ${r.on.join(', ')}`);
  if (!write && (r.off.length || r.on.length || r.notPlaced.length)) console.log('Preview only. Run with --write to change portals.yml.');
} catch (e) { console.error(e.message); process.exit(1); }
