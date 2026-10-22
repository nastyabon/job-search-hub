// The job seeker's profile (hub-data/profile.yml): who they are, where they'll work, their
// past employers (the warm network) and portfolio pieces. Everything personal in the hub
// reads from here, so the code itself stays the same for everyone.

import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

const HUB_DATA = path.resolve(import.meta.dirname, '..', '..', 'hub-data');

const DEFAULTS = {
  name: '',
  role: 'Senior Product Designer',
  focus: '',
  base: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  location_rules: '',
  former_companies: [],
  lead_with: [],
  tiers: { 1: 'Dream companies', 2: 'Strong fit', 3: 'Local companies' },
};

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function loadProfile() {
  let raw = {};
  try { raw = loadYaml(fs.readFileSync(path.join(HUB_DATA, 'profile.yml'), 'utf8')) ?? {}; } catch { /* missing → defaults */ }
  // Blank fields in the starter file mean "not set yet", so they keep the defaults.
  raw = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v != null));
  const p = { ...DEFAULTS, ...raw, tiers: { ...DEFAULTS.tiers, ...(raw.tiers ?? {}) } };
  p.first_name = p.first_name || String(p.name).split(/\s+/)[0] || 'you';
  // Each past employer becomes a warm relation `ex-<key>`. `match` is a regex for "still works there".
  p.former_companies = (Array.isArray(p.former_companies) ? p.former_companies : []).map((f) => {
    const key = slug(f.key || f.label || f.name);
    const label = f.label || f.name || key;
    return { key, label, relation: `ex-${key}`, linkedin: f.linkedin || label, match: f.match || escapeRe(label) };
  }).filter((f) => f.key);
  p.lead_with = (Array.isArray(p.lead_with) ? p.lead_with : []).map((l) => (typeof l === 'string' ? { key: slug(l), label: l } : { key: l.key || slug(l.label), label: l.label || l.key }));
  return p;
}

export const isWarm = (relation) => /^ex-/.test(String(relation ?? ''));
export const warmNote = (p) => p.former_companies.map((f) => `ex-${f.label}`).join(' / ') || 'past colleagues';

// "Wednesday 22 October 2026 (Europe/Lisbon)", in the profile's time zone.
export function todayLine(p = loadProfile()) {
  const tz = p.timezone || 'UTC';
  let day;
  try { day = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }); } catch { day = new Date().toDateString(); }
  return `Today is ${day} (${tz}).`;
}
