#!/usr/bin/env node
// Who you know at your target companies, from the LinkedIn connections export
// (career-ops/data/Connections.csv) and the companies in hub-data/outreach.yml.
//   node hub/scripts/connections-match.mjs           preview: who would be added, per company
//   node hub/scripts/connections-match.mjs --write   add them to outreach.yml as people to message
// People already saved (same name or profile link) are skipped. Parked companies are left out.
// No Claude, no network. The hub does the same by itself for each company added later (server/connections.mjs).

import { matchConnections } from '../server/connections.mjs';

const write = process.argv.includes('--write');
let r;
try { r = matchConnections({ write }); } catch (e) { console.error(e.message); process.exit(1); }
console.log(`${r.connections} connections · ${r.targets} target companies · ${r.total} new people at ${r.matches.length} of them`);
for (const m of r.matches) console.log(`- ${m.company}: ${m.people.map((p) => `${p.name}${p.title ? ` (${p.title})` : ''}`).join('; ')}`);
if (write && r.total) console.log(`Added ${r.total} people to hub-data/outreach.yml as "to message".`);
else if (!write && r.total) console.log('Preview only. Run with --write to add them.');
