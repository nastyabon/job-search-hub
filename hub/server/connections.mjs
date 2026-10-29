// Who you know at your target companies, from the LinkedIn connections export
// (career-ops/data/Connections.csv) and the companies in hub-data/outreach.yml. No Claude, no network.
//   matchConnections(): every target company (scripts/connections-match.mjs, CLAUDE.md §6b).
//   matchNewCompanies(): only companies added since the last match, run by the hub whenever
//     outreach.yml changes, so a company added in the chat or by hand gets its people right away.
//     hub-data/connections-matched.json remembers which companies were matched, so someone the
//     user removed by hand isn't added back.
// People already saved (same name or profile link) are skipped. Parked companies are left out.

import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { HUB_DATA, CAREER_OPS, ymd } from './data.mjs';
import { readConnections, key } from './alumni.mjs';
import { editOutreach } from './actions.mjs';
import { relationFor } from './find.mjs';

const MATCHED = path.join(HUB_DATA, 'connections-matched.json');
const slug = (url) => String(url ?? '').replace(/\/+$/, '').split('/in/').pop().toLowerCase();
// "Acme" matches "Acme" and "Acme GmbH", never "Acmes" or "Big Acme".
const atCompany = (conn, name) => { const a = key(conn.company); const b = key(name); return Boolean(b) && (a === b || a.startsWith(`${b} `)); };

const readOutreach = () => parseDocument(fs.readFileSync(path.join(HUB_DATA, 'outreach.yml'), 'utf8')).toJS() ?? {};
const readMatched = () => { try { return new Set(JSON.parse(fs.readFileSync(MATCHED, 'utf8'))); } catch { return null; } };
const writeMatched = (set) => fs.writeFileSync(MATCHED, `${JSON.stringify([...set].sort(), null, 2)}\n`);

// only: company names to match (default: every target company). write: add them to outreach.yml.
export function matchConnections({ only = null, write = false } = {}) {
  const connections = readConnections();
  const { companies = [], contacts = [] } = readOutreach();
  const savedNames = new Set(contacts.map((c) => key(c.name)));
  const savedLinks = new Set(contacts.map((c) => slug(c.source)).filter(Boolean));
  const wanted = only && new Set(only.map(key));
  const targets = companies.filter((c) => c.name && c.status !== 'parked' && (!wanted || wanted.has(key(c.name))));
  const matches = targets.map((t) => ({
    company: t.name,
    people: connections.filter((c) => atCompany(c, t.name) && !savedNames.has(key(c.name)) && !savedLinks.has(slug(c.url))),
  })).filter((m) => m.people.length);
  const total = matches.reduce((n, m) => n + m.people.length, 0);
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
  }
  if (write) {
    const done = readMatched() ?? new Set();
    for (const t of targets) done.add(key(t.name));
    writeMatched(done);
  }
  return { connections: connections.length, targets: targets.length, matches, total };
}

// The first time (no connections-matched.json yet), it only notes the current companies:
// whoever matched them was handled by setup or §6b, and people removed since stay removed.
export function matchNewCompanies() {
  if (!fs.existsSync(path.join(CAREER_OPS, 'data', 'Connections.csv'))) return null;
  let companies;
  try { companies = (readOutreach().companies ?? []).filter((c) => c?.name && c.status !== 'parked'); } catch { return null; }
  const done = readMatched();
  if (!done) { writeMatched(new Set(companies.map((c) => key(c.name)))); return null; }
  const fresh = companies.filter((c) => !done.has(key(c.name))).map((c) => c.name);
  if (!fresh.length) return null;
  const r = matchConnections({ only: fresh, write: true });
  if (r.total) console.log(`[connections] ${r.matches.map((m) => `${m.company}: ${m.people.length}`).join(', ')} added from your LinkedIn connections`);
  return r;
}
