// Reads hub-data/ and career-ops files and builds the one payload the dashboard renders.
// Read-only: nothing here writes to disk. Every source fails soft into `errors`.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { loadProfile, isWarm, warmNote } from './profile.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const HUB_DATA = path.join(ROOT, 'hub-data');
export const CAREER_OPS = path.join(ROOT, 'career-ops');
export const WATCH_DIRS = [HUB_DATA, path.join(CAREER_OPS, 'data')];

// career-ops states at or past "Applied" (templates/states.yml).
const APPLIED_OR_LATER = new Set(['applied', 'responded', 'assessment', 'interview', 'offer', 'rejected', 'hired']);
export const STATUS_ORDER = ['Interview', 'Offer', 'Assessment', 'Responded', 'Applied', 'Evaluated', 'Hired', 'Rejected', 'Discarded', 'SKIP'];

// ── dates (local time, YYYY-MM-DD strings) ────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function toYmd(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10); // js-yaml parses bare dates as UTC
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export function isoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  // Week 1 is the week containing 4 January. Math.round absorbs DST hour shifts.
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = 1 + Math.round((monday - week1Monday) / 604800000);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { id: `${thursday.getFullYear()}-W${pad(week)}`, start: ymd(monday), end: ymd(sunday) };
}

const inRange = (day, week) => Boolean(day) && day >= week.start && day <= week.end;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Company names compare without spaces or punctuation: "BlueSky Labs" and "Blue Sky Labs" are one company.
const coKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ── sources ───────────────────────────────────────────────────────────

function readYaml(file, errors) {
  try {
    return loadYaml(fs.readFileSync(path.join(HUB_DATA, file), 'utf8')) ?? null;
  } catch (err) {
    errors.push(`${file}: ${err.code === 'ENOENT' ? 'missing' : err.message.split('\n')[0]}`);
    return null;
  }
}

// Map columns by header name, never by position: career-ops updates can change the format.
export function parseTracker(md) {
  const lines = md.split('\n');
  const headerIdx = lines.findIndex((l) => l.trim().startsWith('|') && /\bcompany\b/i.test(l) && /\bstatus\b/i.test(l));
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  if (headerIdx === -1) return { ok: false, reason: 'no header row with Company and Status', raw: md };

  const columns = cells(lines[headerIdx]);
  const rows = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim().startsWith('|')) break;
    const values = cells(line);
    if (values.every((v) => /^:?-+:?$/.test(v) || v === '')) continue; // separator row
    const row = {};
    columns.forEach((col, i) => { row[col.toLowerCase()] = values[i] ?? ''; });
    rows.push(row);
  }
  return { ok: true, columns, rows };
}

function readTracker(errors) {
  const file = path.join(CAREER_OPS, 'data', 'applications.md');
  let md;
  try {
    md = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: true, columns: [], rows: [] }; // no applications yet
  }
  try {
    const parsed = parseTracker(md);
    if (!parsed.ok) errors.push(`applications.md: ${parsed.reason}; showing raw table`);
    return parsed;
  } catch (err) {
    errors.push(`applications.md: ${err.message}; showing raw table`);
    return { ok: false, raw: md };
  }
}

function readStatusLog() {
  try {
    return fs.readFileSync(path.join(CAREER_OPS, 'data', 'status-log.tsv'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => {
        const [num, date, from, to] = l.split('\t');
        return { num: num?.trim(), date: toYmd(date), from, to: String(to ?? '').trim().toLowerCase() };
      });
  } catch {
    return null;
  }
}

function readCareerOpsFollowups(errors) {
  return new Promise((resolve) => {
    execFile('node', ['followup-cadence.mjs'], { cwd: CAREER_OPS, timeout: 20000, maxBuffer: 8 << 20 }, (err, stdout) => {
      if (err) {
        errors.push(`career-ops follow-up cadence: ${err.message.split('\n')[0]}`);
        return resolve([]);
      }
      try {
        resolve(JSON.parse(stdout).entries ?? []);
      } catch {
        errors.push('career-ops follow-up cadence: output was not JSON');
        resolve([]);
      }
    });
  });
}

function readWeekFile(weekId) {
  const file = path.join(HUB_DATA, 'weeks', `${weekId}.md`);
  let md;
  try {
    md = fs.readFileSync(file, 'utf8');
  } catch {
    return { exists: false, posts: 0, prepHours: 0 };
  }
  // Count ticked boxes per "## " section; the heading text decides what they count towards.
  let section = '';
  let posts = 0;
  let prepHours = 0;
  for (const line of md.split('\n')) {
    const heading = line.match(/^##\s+(.*)/);
    if (heading) { section = heading[1].toLowerCase(); continue; }
    const box = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)/);
    if (!box || box[1] === ' ') continue;
    if (section.includes('post')) posts += 1;
    else if (section.includes('prep')) prepHours += parseFloat(box[2]) || 1;
  }
  return { exists: true, posts, prepHours };
}

// The posting URL lives in the evaluation report (`**URL:** https://…`), linked from the tracker's Report cell.
export function reportUrl(reportCell) {
  const rel = String(reportCell ?? '').match(/\]\(([^)]+\.md)\)/)?.[1];
  if (!rel) return '';
  try {
    const md = fs.readFileSync(path.resolve(CAREER_OPS, 'data', rel), 'utf8');
    return md.match(/^\*\*URL:\*\*\s*(https?:\/\/\S+)/m)?.[1] ?? '';
  } catch {
    return '';
  }
}

// Per-company notes: hub-data/notes/<slug>.md, one "- YYYY-MM-DD: text" line each.
export const noteSlug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
function readNotes() {
  const out = {};
  const dir = path.join(HUB_DATA, 'notes');
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    out[f.slice(0, -3)] = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
      .map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}):?\s*(.*)$/)).filter(Boolean)
      .map(([, date, text]) => ({ date, text }));
  }
  return out;
}

// Results of "Check if live", written by actions.mjs: { [url]: { result, reason, at } }.
export const LIVENESS_FILE = path.join(HUB_DATA, 'liveness.json');
function readLiveness() {
  try { return JSON.parse(fs.readFileSync(LIVENESS_FILE, 'utf8')); } catch { return {}; }
}

// Tailored CVs in career-ops/output (newest first). The panel matches them to a company by slug.
// Background evaluations (server/evaluate.mjs): [{id, url, company, role, status, step, …}].
function readEvaluationsFile() {
  try { return JSON.parse(fs.readFileSync(path.join(HUB_DATA, 'evaluations.json'), 'utf8')); } catch { return []; }
}

function readCvFiles() {
  try {
    const dir = path.join(CAREER_OPS, 'output');
    return fs.readdirSync(dir).filter((n) => n.endsWith('.pdf'))
      .map((name) => ({ name, at: fs.statSync(path.join(dir, name)).mtime.toISOString() }))
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch { return []; }
}

// What career-ops' interview modes have written, for the Interview prep steps: role files
// (interview-prep/<company>-<role>.md: the prep doc starts `# Interview Intel:`, plan and debrief append `## Prep Plan` / `## Round N Debrief`
// sections to them) and session transcripts (sessions/<company>-<role>-<round>-<date>.md, `source:`
// practice | debrief in their front matter). The shared banks aren't per company.
const PREP_SHARED = new Set(['story-bank.md', 'question-bank.md', 'retracted-claims.md', 'interview-prep-guide.md', 'README.md']);
function readPrepFiles() {
  const dir = path.join(CAREER_OPS, 'interview-prep');
  const list = (sub) => {
    try {
      return fs.readdirSync(path.join(dir, sub)).filter((n) => n.endsWith('.md') && !PREP_SHARED.has(n)).map((n) => {
        const file = path.join(dir, sub, n);
        return { name: sub ? `${sub}/${n}` : n, at: fs.statSync(file).mtime.toISOString(), text: fs.readFileSync(file, 'utf8') };
      });
    } catch { return []; }
  };
  const files = list('').map(({ name, at, text }) => ({
    name, at, redflags: name.endsWith('-redflags.md'),
    doc: /^# Interview Intel:/m.test(text), plan: /^## Prep Plan/m.test(text), debriefs: (text.match(/^## Round \S+ Debrief/gm) ?? []).length,
  }));
  const sessions = list('sessions').map(({ name, at, text }) => ({ name, at, source: text.match(/^source:\s*(\S+)/m)?.[1] ?? '' }));
  return [...files, ...sessions].sort((a, b) => b.at.localeCompare(a.at));
}

// Items hidden by hand (actions.mjs hideItem): [{key, label, reason, at}].
function readHidden(errors) {
  if (!fs.existsSync(path.join(HUB_DATA, 'hidden.yml'))) return [];
  const list = readYaml('hidden.yml', errors);
  return Array.isArray(list) ? list.filter((h) => h?.key) : [];
}

// New openings: scan.mjs appends `- [ ] {url} | {company} | {title} | {location} | posted: {date}`
// under ## Pending (location and posted are optional; rank-pipeline.mjs may add `| rank: …`).
export function parsePipeline(md) {
  const pending = md.split(/^## Processed/m)[0].split(/^## Pending/m)[1] ?? '';
  return pending.split('\n')
    .map((line) => line.match(/^- \[ \] (\S+)(.*)$/))
    .filter(Boolean)
    .map(([, url, rest]) => {
      const parts = rest.split(' | ').map((p) => p.trim()).filter((p, i) => i > 0 || p);
      const posted = parts.find((p) => p.startsWith('posted:'))?.slice(7).trim() ?? '';
      // rank-pipeline.mjs appends `rank: {score}/5 — {reason}`.
      const rank = parts.find((p) => p.startsWith('rank:'))?.match(/^rank:\s*([\d.]+)\/5\s*—\s*(.*)$/);
      const [company = '', title = '', location = ''] = parts.filter((p) => !/^(posted|rank):/.test(p));
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* bad URL */ }
      return { url, company, title, location, posted, host, score: rank ? Number(rank[1]) : null, reason: rank?.[2] ?? '' };
    });
}

// The same role under two links with the same location: shown once, the better-scored one. Without a
// location it may be one role per office, so both stay.
export function dedupeOpenings(openings) {
  const k = (o) => (o.location ? [o.company, o.title, o.location].map((s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).join('|') : o.url);
  const best = new Map();
  for (const o of openings) { const prev = best.get(k(o)); if (!prev || (o.score ?? -1) > (prev.score ?? -1)) best.set(k(o), o); }
  return openings.filter((o) => best.get(k(o)) === o);
}

function readPipeline(errors) {
  let openings = [];
  try {
    openings = parsePipeline(fs.readFileSync(path.join(CAREER_OPS, 'data', 'pipeline.md'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') errors.push(`pipeline.md: ${err.message}`);
  }
  openings = dedupeOpenings(openings);
  let lastScan = null;
  try {
    const lines = fs.readFileSync(path.join(CAREER_OPS, 'data', 'scan-runs.tsv'), 'utf8').trim().split('\n');
    const head = lines[0].split('\t');
    const last = lines.at(-1).split('\t');
    if (lines.length > 1) {
      const row = Object.fromEntries(head.map((h, i) => [h, last[i]]));
      const n = (k) => Number(row[k] || 0);
      lastScan = { at: row.timestamp, status: row.status, companies: n('companies'), boards: n('boards'), found: n('found'), added: n('new_added'),
        // Where the rest went (scan.mjs counts each cut; see SCAN_RUNS_HEADER there).
        dupes: n('dupes'), title: n('filtered_title'), location: n('filtered_location'),
        age: n('filtered_posting_age') + n('filtered_posted_date'),
        other: n('filtered_tier') + n('filtered_salary') + n('filtered_content') + n('filtered_cooldown') + n('filtered_blacklist') + n('filtered_visa') + n('filtered_country_eligibility') };
    }
  } catch { /* never scanned */ }
  // The companies without a job board (server/web-scan.mjs, run right after scan.mjs).
  let web = null;
  try { web = JSON.parse(fs.readFileSync(path.join(HUB_DATA, 'web-scan', 'last.json'), 'utf8')); } catch { /* not run yet */ }
  let webSeen = {};
  try { webSeen = JSON.parse(fs.readFileSync(path.join(HUB_DATA, 'web-scan', 'seen.json'), 'utf8')); } catch { /* not run yet */ }
  // "New" = first seen on the day of the latest scan. scan-history.tsv is append-only with
  // url, first_seen, portal, title, company, status as its first columns (local dates); the
  // titles a filter dropped are kept there too (status skipped_title / _location / _age).
  const filtered = [];
  if (lastScan) {
    const scanDay = new Date(lastScan.at).toLocaleDateString('en-CA');
    const firstSeen = new Map();
    const REASON = { skipped_title: 'title', skipped_location: 'location', skipped_age: 'age' };
    try {
      for (const line of fs.readFileSync(path.join(CAREER_OPS, 'data', 'scan-history.tsv'), 'utf8').split('\n')) {
        const [url, seen, , title, company, status] = line.split('\t');
        if (!url || url === 'url') continue;
        if (!firstSeen.has(url)) firstSeen.set(url, seen);
        if (seen === scanDay && REASON[status]) filtered.push({ url, company, title, reason: REASON[status] });
      }
    } catch { /* no history */ }
    for (const o of openings) o.isNew = firstSeen.get(o.url) === scanDay || webSeen[o.url]?.first_seen === scanDay;
  }
  if (web) filtered.push(...(web.filtered ?? []).map((j) => ({ ...j, reason: j.reason ?? 'title' })));
  return { openings, lastScan, web, filtered };
}

// What the filters dropped, narrowed to what's close to the user's own job titles (portals.yml
// title_filter), so the list shows lost options rather than every open role:
//   - blocked: a title that matches a positive keyword but a negative one removed it ("Product
//     Design Manager" by "Manager"). Hidden when that negative is itself a design-family title
//     ("Brand Designer") or a level (junior, intern, Werkstudent…): those exclusions are deliberate.
//   - close: no positive match, but it shares the role word of the positives (designer, design,
//     ux, ui: each positive's last word, minus seniority words) and no negative removed it.
//   - location / age: these passed the title filter, so they're all relevant.
// Everything else is counted, not listed. `fold` and `compile` are career-ops' own (title-keywords.mjs).
const LEVEL = /junior|intern|werkstudent|praktik|thesis|arbeit|studium|ausbildung|trainee|apprentice|student|graduate/;
const SENIORITY = new Set(['senior', 'staff', 'principal', 'lead', 'head', 'founding', 'director', 'sr', 'jr', 'junior', 'chief', 'of', 'and', '&']);
export function sortFiltered(filtered, titleFilter, { fold, compile, compilePositive = compile }) {
  const kws = (list) => (Array.isArray(list) ? list : []).filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim().toLowerCase());
  const positive = kws(titleFilter?.positive).map(compilePositive);
  const negative = kws(titleFilter?.negative).map((k) => ({ k, match: compile(k) }));
  const roleWords = new Set(kws(titleFilter?.positive).map((k) => k.replace(/^(word|stem):/, '').split(/\s+/).filter((w) => !SENIORITY.has(w)).at(-1)).filter(Boolean)
    .flatMap((w) => w.split('/')).map((w) => (w.startsWith('design') ? 'design' : w)));
  const roleRe = roleWords.size ? new RegExp(`(^|[^a-z])(${[...roleWords].map((w) => (w === 'design' ? 'design[a-z]*' : w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('|')})($|[^a-z])`) : null;
  const isRoleFamily = (text) => Boolean(roleRe?.test(text));
  const out = { blocked: [], close: [], location: [], age: [], hidden: 0 };
  for (const j of filtered) {
    if (j.reason === 'location' || j.reason === 'age') { out[j.reason].push(j); continue; }
    const t = fold(j.title);
    const blocker = negative.find((n) => n.match(t));
    if (positive.some((m) => m(t))) {
      if (blocker && !isRoleFamily(blocker.k) && !LEVEL.test(blocker.k)) out.blocked.push({ ...j, blocker: blocker.k.replace(/^(word|stem):/, '').trim() });
      else out.hidden += 1;
    } else if (!blocker && isRoleFamily(t)) out.close.push(j);
    else out.hidden += 1;
  }
  return out;
}

// Titles the scan keeps dropping that look close to the user's (sortFiltered's `close` group),
// grouped so "Senior Account Director, EMEA" and "Account Director - London" count as one:
// what follows a comma, dash, bar, slash or bracket (team, place) and a leading level word go.
// Only titles seen at least twice, most common first, so the hub can offer "also scan for these".
const LEVEL_PREFIX = /^((senior|sr\.?|junior|jr\.?|principal|staff|associate|lead|global|regional)\s+)+/i;
export function titleOf(title) {
  return String(title ?? '').split(/\s+[-–—|\/]\s+|,|\(|\||\//)[0].replace(LEVEL_PREFIX, '').replace(/\s+(i{1,3}|iv|\d+)$/i, '').replace(/\s+/g, ' ').trim();
}
export function suggestTitles(close, { max = 8 } = {}) {
  const groups = new Map();
  for (const j of close) {
    const name = titleOf(j.title);
    if (name.split(' ').length < 2 || name.length > 60) continue; // "Manager" alone says nothing
    const k = name.toLowerCase();
    const g = groups.get(k) ?? { title: name, count: 0, companies: [], roles: [] };
    g.count += 1;
    if (!g.companies.includes(j.company)) g.companies.push(j.company);
    g.roles.push({ title: j.title, company: j.company, url: j.url });
    groups.set(k, g);
  }
  return [...groups.values()].filter((g) => g.count >= 2).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, max);
}

// career-ops' matcher when it's there; a plain substring match otherwise.
let keywordLib = null;
async function titleKeywords() {
  keywordLib ??= import(pathToFileURL(path.join(CAREER_OPS, 'title-keywords.mjs')).href).then((m) => ({ fold: m.foldTitle, compile: m.compileKeyword, compilePositive: m.compilePositiveKeyword }))
    .catch(() => ({ fold: (s) => String(s ?? '').toLowerCase(), compile: (k) => { const w = k.replace(/^(word|stem):/, ''); return (t) => t.includes(w); } }));
  return keywordLib;
}

async function readFilterView(filtered) {
  let titleFilter = null;
  try { titleFilter = loadYaml(fs.readFileSync(path.join(CAREER_OPS, 'portals.yml'), 'utf8'))?.title_filter ?? null; } catch { /* no scan settings */ }
  const view = sortFiltered(filtered, titleFilter, await titleKeywords());
  return { ...view, suggest: suggestTitles(view.close) };
}

// ── assembly ──────────────────────────────────────────────────────────

const range = (target) => (typeof target === 'object' && target
  ? { min: Number(target.min ?? 0), max: Number(target.max ?? target.min ?? 0) }
  : { min: Number(target ?? 0), max: Number(target ?? 0) });

// Names in the connections export, compared like alumni.mjs does. Imported lazily: alumni.mjs
// imports this file. No export → nobody counts as connected.
const nameKey = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
async function connectionNames() {
  try {
    const { readConnections } = await import('./alumni.mjs');
    return new Set(readConnections().map((c) => nameKey(c.name)));
  } catch { return new Set(); }
}

export async function buildPayload(now = new Date(), { followups = true } = {}) {
  const errors = [];
  const profile = loadProfile();
  const today = ymd(now);
  const week = isoWeek(now);

  const outreach = readYaml('outreach.yml', errors) ?? {};
  const routine = readYaml('routine.yml', errors) ?? {};
  const meta = readYaml('application-meta.yml', errors) ?? [];
  const tracker = readTracker(errors);
  const statusLog = readStatusLog();
  const coFollowups = followups ? await readCareerOpsFollowups(errors) : [];
  const weekFile = readWeekFile(week.id);
  const pipeline = readPipeline(errors);
  pipeline.filtered = await readFilterView(pipeline.filtered);
  const hidden = readHidden(errors);
  const shelved = new Set(hidden.filter((h) => String(h.key).startsWith('opening:')).map((h) => String(h.key).slice(8)));
  for (const o of pipeline.openings) o.shelved = shelved.has(o.url);

  const companies = Array.isArray(outreach.companies) ? outreach.companies : [];
  // known = someone the user already knows: an ex-colleague or a 1st-degree LinkedIn connection
  // (Connections.csv). Next up lets them through a company hold.
  const connected = await connectionNames();
  const contacts = (Array.isArray(outreach.contacts) ? outreach.contacts : []).map((c) => ({
    ...c,
    last_contact: toYmd(c.last_contact),
    next_date: toYmd(c.next_date),
    known: isWarm(c.relation) || connected.has(nameKey(c.name)),
  }));
  const metaRows = Array.isArray(meta) ? meta : [];

  // 1. Today
  const due = [];
  for (const c of contacts) {
    if (!c.next_date || c.next_date > today || c.status === 'cold') continue;
    due.push({ source: 'outreach', date: c.next_date, overdue: c.next_date < today, who: c.name, company: c.company, action: c.next_action, relation: c.relation, channel: c.channel, status: c.status });
  }
  for (const e of coFollowups) {
    const date = toYmd(e.nextFollowupDate);
    if (!['overdue', 'urgent'].includes(e.urgency) && !(date && date <= today)) continue;
    due.push({ source: 'career-ops', date: date || today, overdue: e.urgency === 'overdue' || (date && date < today), who: e.contacts?.[0]?.name ?? '', company: e.company, action: `Follow up on application (${e.status}${e.followupCount ? `, ${e.followupCount} sent` : ''})`, relation: 'application', channel: e.via ?? '' });
  }
  due.sort((a, b) => a.date.localeCompare(b.date));
  // Undated follow-ups are for people already messaged. Someone not messaged yet (to-message, e.g.
  // "ask X for an intro" from a people search) goes through Next up, with its daily pace and company hold.
  const undated = contacts
    .filter((c) => c.next_action && !c.next_date && c.status !== 'cold' && c.status !== 'to-message')
    .map((c) => ({ who: c.name, company: c.company, action: c.next_action }));

  // 2. This week
  const rows = tracker.ok ? tracker.rows : [];
  let applicationsThisWeek;
  if (statusLog) {
    const logged = new Set(statusLog.map((r) => r.num));
    const counted = new Set(statusLog.filter((r) => r.to === 'applied' && inRange(r.date, week)).map((r) => r.num));
    // A row with no status history at all (merged straight in as Applied) counts by its tracker date.
    for (const r of rows) {
      const num = String(r['#'] ?? '').trim();
      if (!logged.has(num) && APPLIED_OR_LATER.has(norm(r.status)) && inRange(toYmd(r.date), week)) counted.add(num);
    }
    applicationsThisWeek = counted.size;
  } else {
    applicationsThisWeek = rows.filter((r) => APPLIED_OR_LATER.has(norm(r.status)) && inRange(toYmd(r.date), week)).length;
  }
  const targets = routine.weekly_targets ?? {};
  // One message per date in `contacted` (falls back to last_contact), so a later
  // follow-up doesn't erase an earlier week's count.
  const messagesThisWeek = (relationOk) => contacts
    .filter((c) => relationOk(c.relation))
    .reduce((n, c) => n + [...new Set([...(c.contacted ?? []).map(toYmd), c.last_contact])].filter((d) => inRange(d, week)).length, 0);
  const progress = [
    { key: 'warm_messages', label: 'Warm messages', note: warmNote(profile), count: messagesThisWeek(isWarm), ...range(targets.warm_messages) },
    { key: 'hiring_manager_messages', label: 'Hiring manager messages', count: messagesThisWeek((r) => r === 'hiring-manager'), ...range(targets.hiring_manager_messages) },
    { key: 'applications', label: 'Applications sent', note: 'marked Applied in career-ops', count: applicationsThisWeek, ...range(targets.applications) },
    { key: 'linkedin_posts', label: 'LinkedIn posts', note: 'manual', count: weekFile.posts, ...range(targets.linkedin_posts) },
    { key: 'interview_prep_hours', label: 'Interview prep', unit: 'h', note: 'manual', count: weekFile.prepHours, ...range(targets.interview_prep_hours) },
  ];

  // 3. Applications: join tracker rows with application-meta by company + role.
  const used = new Set();
  const findMeta = (company, role) => {
    const sameCompany = metaRows.filter((m) => norm(m.company) === norm(company));
    const hit = sameCompany.find((m) => norm(m.role) === norm(role)) ?? (sameCompany.length === 1 ? sameCompany[0] : null);
    if (hit) used.add(hit);
    return hit;
  };
  const liveness = readLiveness();
  const applications = rows.map((r) => {
    const m = findMeta(r.company, r.role);
    // Posting link: the evaluation report's URL, else the tracker's URL column, else application-meta.
    const url = reportUrl(r.report) || (String(r.url ?? '').match(/https?:\/\/[^)\s]+/)?.[0] ?? '') || m?.url || '';
    return {
      url, live: liveness[url] ?? null,
      num: r['#'] ?? '', date: toYmd(r.date), company: r.company, role: r.role, score: r.score ?? '',
      status: r.status || 'Unknown', report: (r.report ?? '').match(/\[(\d+)\]/)?.[1] ?? '', notes: r.notes ?? '',
      reportFile: String(r.report ?? '').match(/reports\/([\w.-]+\.md)/)?.[1] ?? '',
      channel: m?.channel ?? '', contact: m?.contact ?? '', hasMeta: Boolean(m),
    };
  });
  const untracked = metaRows.filter((m) => !used.has(m)).map((m) => ({
    company: m.company, role: m.role, channel: m.channel ?? '', contact: m.contact ?? '', url: m.url ?? '',
  }));

  // 4. Outreach: companies by tier, with their contacts; everyone else is "network".
  const byCompany = new Map(companies.map((c) => [coKey(c.name), []]));
  const network = [];
  for (const c of contacts) (byCompany.get(coKey(c.company)) ?? network).push(c);
  const tiers = [1, 2, 3].map((tier) => ({
    tier,
    companies: companies.filter((c) => Number(c.tier) === tier).map((c) => ({ ...c, contacts: byCompany.get(coKey(c.name)) })),
  }));

  return {
    generatedAt: now.toISOString(),
    profile,
    today,
    week: { ...week, fileExists: weekFile.exists },
    errors,
    due,
    undated,
    progress,
    applications: tracker.ok ? { ok: true, rows: applications, untracked, statusOrder: STATUS_ORDER } : { ok: false, raw: tracker.raw, untracked },
    outreach: { tiers, network },
    pipeline,
    hidden,
    cvFiles: readCvFiles(),
    prepFiles: readPrepFiles(),
    evaluations: readEvaluationsFile(),
    notes: readNotes(),
  };
}
