#!/usr/bin/env node
// Who you know at your target companies, from the LinkedIn connections export
// (career-ops/data/Connections.csv) and the companies in hub-data/outreach.yml.
//   node hub/scripts/connections-match.mjs           preview: who would be added, per company
//   node hub/scripts/connections-match.mjs --write   add them to outreach.yml as people to message
// People already saved (same name or profile link) are skipped. Parked companies are left out.
// No Claude, no network.

import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { HUB_DATA, ymd } from '../server/data.mjs';
import { readConnections, key } from '../server/alumni.mjs';
import { editOutreach } from '../server/actions.mjs';
import { relationFor } from '../server/find.mjs';

const write = process.argv.includes('--write');
const slug = (url) => String(url ?? '').replace(/\/+$/, '').split('/in/').pop().toLowerCase();

let connections;
try { connections = readConnections(); } catch (e) { console.error(e.message); process.exit(1); }
const { companies = [], contacts = [] } = parseDocument(fs.readFileSync(path.join(HUB_DATA, 'outreach.yml'), 'utf8')).toJS() ?? {};
const savedNames = new Set(contacts.map((c) => key(c.name)));
const savedLinks = new Set(contacts.map((c) => slug(c.source)).filter(Boolean));
const targets = companies.filter((c) => c.name && c.status !== 'parked');

// "Acme" matches "Acme" and "Acme GmbH", never "Acmes" or "Big Acme".
const atCompany = (conn, name) => { const a = key(conn.company); const b = key(name); return Boolean(b) && (a === b || a.startsWith(`${b} `)); };

const matches = targets.map((t) => ({
  company: t.name,
  people: connections.filter((c) => atCompany(c, t.name) && !savedNames.has(key(c.name)) && !savedLinks.has(slug(c.url))),
})).filter((m) => m.people.length);

const total = matches.reduce((n, m) => n + m.people.length, 0);
console.log(`${connections.length} connections · ${targets.length} target companies · ${total} new people at ${matches.length} of them`);
for (const m of matches) console.log(`- ${m.company}: ${m.people.map((p) => `${p.name}${p.title ? ` (${p.title})` : ''}`).join('; ')}`);

if (write && total) {
  const today = ymd(new Date());
  editOutreach((doc) => {
    const list = doc.get('contacts');
    for (const m of matches) {
      for (const p of m.people) {
        list.add(doc.createNode({
          name: p.name, company: m.company, relation: relationFor(p.title), title: p.title, channel: 'linkedin',
          ...(p.connected ? { connected: p.connected } : {}),
          last_contact: '', next_action: '', next_date: '', status: 'to-message', source: p.url,
          why: 'Already a connection', notes: `From your LinkedIn connections export, ${today}.`,
        }));
      }
      const co = (doc.get('companies')?.items ?? []).find((c) => key(c.get('name')) === key(m.company));
      if (co && ['researching', ''].includes(String(co.get('status') ?? ''))) co.set('status', 'to-contact');
    }
    return {};
  });
  console.log(`Added ${total} people to hub-data/outreach.yml as "to message".`);
} else if (!write && total) console.log('Preview only. Run with --write to add them.');
