// "Find ex-colleagues": you run LinkedIn's own people search (1st connections, past company = one
// of profile.yml's former_companies), copy the result pages and paste them here. Nothing on LinkedIn
// is opened: names in the pasted text are matched against your connections export (career-ops/data/Connections.csv),
// which supplies the profile link, current company, title and connection date.

import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { CAREER_OPS, HUB_DATA, ymd } from './data.mjs';
import { editOutreach } from './actions.mjs';
import { loadProfile } from './profile.mjs';

const CONNECTIONS = path.join(CAREER_OPS, 'data', 'Connections.csv');
const OUTREACH = path.join(HUB_DATA, 'outreach.yml');
// Past employers from profile.yml: {relation: 'ex-<key>', label, re: still works there}.
function former(k) {
  const f = loadProfile().former_companies.find((x) => x.key === k);
  if (!f) throw new Error('Add this company under former_companies in hub-data/profile.yml first');
  return { ...f, re: new RegExp(f.match, 'i') };
}

// Names compare on letters only: case, accents, emoji and punctuation don't matter.
export const key = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (url) => String(url ?? '').replace(/\/+$/, '').split('/in/').pop().toLowerCase();

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// LinkedIn puts a "Notes:" preamble above the real header row.
export function readConnections() {
  if (!fs.existsSync(CONNECTIONS)) throw new Error('No connections export at career-ops/data/Connections.csv');
  const rows = parseCsv(fs.readFileSync(CONNECTIONS, 'utf8'));
  const head = rows.findIndex((r) => r[0] === 'First Name');
  if (head === -1) throw new Error('Connections.csv: header row not found');
  const cols = rows[head];
  const at = (r, name) => (r[cols.indexOf(name)] ?? '').trim();
  return rows.slice(head + 1).filter((r) => r.length > 2).map((r) => {
    const name = `${at(r, 'First Name')} ${at(r, 'Last Name')}`.replace(/\s+/g, ' ').trim();
    const on = new Date(at(r, 'Connected On'));
    return { name, url: at(r, 'URL'), company: at(r, 'Company'), title: at(r, 'Position'), connected: Number.isNaN(on.getTime()) ? '' : ymd(on) };
  }).filter((c) => c.name);
}

function savedContacts() {
  const doc = parseDocument(fs.readFileSync(OUTREACH, 'utf8'));
  return (doc.toJS().contacts ?? []);
}

// Names in the paste: any connection's full name in the text, skipping "mutual connections" lines
// (they name people who aren't results). LinkedIn's "View <first name>'s profile" lines only give
// first names, so they're used to spot result cards nobody matched ("not in your export").
function namesIn(text, connections) {
  const lines = text.split('\n').filter((l) => !/mutual connection/i.test(l)).map(key).join(' \n ');
  const padded = ` ${lines} `;
  const names = [...new Set(connections.filter((c) => key(c.name).includes(' ') && padded.includes(` ${key(c.name)} `)).map((c) => c.name))];
  const firsts = new Set(names.map((n) => key(n).split(' ')[0]));
  const unknown = [...new Set([...text.matchAll(/View (.+?)[’']s\s+profile/g)].map((m) => m[1].trim()))]
    .filter((n) => !firsts.has(key(n).split(' ')[0]) && !names.some((x) => key(x) === key(n)));
  return { names, unknown };
}

export function alumniPreview({ text = '', former: k = '' }) {
  const f = former(k);
  if (!String(text).trim()) throw new Error('Paste a page of LinkedIn results first');
  const connections = readConnections();
  const saved = savedContacts();
  const savedUrls = new Set(saved.map((c) => slug(c.source)).filter(Boolean));
  const savedNames = new Set(saved.map((c) => key(c.name)));
  const byName = new Map();
  for (const c of connections) byName.set(key(c.name), [...(byName.get(key(c.name)) ?? []), c]);

  const out = { moved: [], stayed: [], saved: [] };
  const found = namesIn(text, connections);
  out.unknown = found.unknown.map((name) => ({ name }));
  for (const name of found.names) {
    const hits = byName.get(key(name)) ?? [];
    if (hits.some((c) => savedUrls.has(slug(c.url))) || savedNames.has(key(name))) { out.saved.push({ name }); continue; }
    // Two connections with the same name: both are listed and you pick.
    for (const c of hits) (f.re.test(c.company) ? out.stayed : out.moved).push({ ...c, ambiguous: hits.length > 1 });
  }
  // Counts only (no names) so a paste that finds nobody can be diagnosed from the server log.
  console.log(`[alumni] ${k}: ${String(text).length} chars, ${text.match(/View (.+?)[’']s\s+profile/g)?.length ?? 0} "View … profile" cards → moved ${out.moved.length}, still ${out.stayed.length}, saved ${out.saved.length}, not in export ${out.unknown.length}`);
  return { former: k, label: f.label, ...out };
}

export function alumniAdd({ people = [], former: k = '', today = ymd(new Date()) }) {
  const f = former(k);
  if (!people.length) throw new Error('Nobody ticked');
  const connections = new Map(readConnections().map((c) => [slug(c.url), c]));
  return editOutreach((doc) => {
    const contacts = doc.get('contacts');
    const have = new Set((contacts?.items ?? []).map((c) => slug(c.get('source'))).filter(Boolean));
    const added = [];
    for (const p of people) {
      const c = connections.get(slug(p.url)); // only people really in the export
      if (!c || have.has(slug(c.url))) continue;
      contacts.add(doc.createNode({
        name: c.name,
        company: f.re.test(c.company) ? f.label : c.company,
        relation: f.relation,
        title: c.title,
        channel: 'linkedin',
        connected: c.connected,
        last_contact: '',
        next_action: '',
        next_date: '',
        status: 'to-message',
        source: c.url,
        notes: `Found via LinkedIn past-company search (${f.label}), ${today}.`,
      }));
      have.add(slug(c.url));
      added.push(c.name);
    }
    if (!added.length) throw new Error('Everyone ticked is already saved');
    return { added };
  });
}
