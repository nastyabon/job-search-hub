// The only writes the dashboard can make. Kept apart from data.mjs (which stays read-only).
//   - outreach.yml: edited through the `yaml` Document API so comments and order survive.
//   - career-ops: never edited directly, only through its own CLIs (set-status.mjs, scan.mjs);
//     the exceptions are adding job links to pipeline.md's ## Pending, the inbox career-ops asks you to paste into,
//     and adding job titles to portals.yml's title_filter (its user layer) when the user asks.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { parseDocument, Scalar, parse as parseYaml, stringify as toYaml } from 'yaml';
import { HUB_DATA, CAREER_OPS, LIVENESS_FILE, ymd, reportUrl, noteSlug, isoWeek } from './data.mjs';
import { claudeEnv } from './claude-bin.mjs';
import { webScan } from './web-scan.mjs';

const OUTREACH = path.join(HUB_DATA, 'outreach.yml');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Contact statuses that already mean "past a first message": ticking doesn't downgrade them.
const PAST_MESSAGED = new Set(['replied', 'intro-made', 'reference-yes']);

export const APP_STATES = ['Evaluated', 'Applied', 'Responded', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP', 'Hired'];

// A fresh plain scalar: drops stale quoting and any "# CONFIRM" comment on the old value.
const plain = (v) => Object.assign(new Scalar(v), { type: Scalar.PLAIN });
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };

// Undo keeps the file text from before each tick or week entry (in memory, last 50). It only restores
// when the file is still exactly as the tick left it, so it never clobbers a later edit.
const undoLog = new Map();
let undoSeq = 0;

function remember(file, before, after) {
  const undo = String(++undoSeq);
  undoLog.set(undo, { file, before, after });
  if (undoLog.size > 50) undoLog.delete(undoLog.keys().next().value);
  return undo;
}

export function editOutreach(fn) {
  const before = fs.readFileSync(OUTREACH, 'utf8');
  const doc = parseDocument(before);
  if (doc.errors.length) throw new Error(`outreach.yml: ${doc.errors[0].message}`);
  // A fresh copy starts with `contacts: []`: keep both lists, and write new entries block-style.
  for (const k of ['companies', 'contacts']) {
    if (!doc.get(k)) doc.set(k, doc.createNode([]));
    doc.get(k).flow = false;
  }
  const result = fn(doc);
  const after = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  fs.writeFileSync(OUTREACH, after);
  return { ...result, undo: remember(OUTREACH, before, after) };
}

export function undo({ id }) {
  const entry = undoLog.get(String(id));
  if (!entry) throw new Error('Nothing to undo (the hub was restarted). Ask Claude to fix it.');
  if (fs.readFileSync(entry.file, 'utf8') !== entry.after) {
    throw new Error(`${path.basename(entry.file)} changed since, so it can't be undone automatically. Ask Claude to fix it.`);
  }
  fs.writeFileSync(entry.file, entry.before);
  undoLog.delete(String(id));
  return {};
}

// "I posted on LinkedIn" / "did 2h of prep" from the panel (CLAUDE.md §12): tick the first
// unticked box(es) in this week's section, adding lines when there aren't enough.
export function weekTick({ kind, hours = 1, now = new Date() }) {
  const week = isoWeek(now);
  const file = path.join(HUB_DATA, 'weeks', `${week.id}.md`);
  if (!fs.existsSync(file)) throw new Error(`No file for ${week.id} yet: ask Claude to "start a new week".`);
  const before = fs.readFileSync(file, 'utf8');
  const lines = before.split('\n');
  const match = kind === 'post' ? (h) => h.includes('post') : (h) => h.includes('prep');
  const start = lines.findIndex((l) => /^##\s/.test(l) && match(l.toLowerCase()));
  if (start === -1) throw new Error(`No ${kind === 'post' ? 'LinkedIn posts' : 'Interview prep'} section in ${week.id}.md`);
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end === -1) end = lines.length;
  let units = kind === 'post' ? 1 : Math.max(0.5, Math.round(Number(hours) * 2) / 2);
  for (let i = start + 1; i < end && units > 0; i += 1) {
    if (kind === 'post' && /^\s*[-*]\s+\[ \]/.test(lines[i])) { lines[i] = lines[i].replace('[ ]', '[x]'); units = 0; }
    if (kind === 'prep' && units >= 1 && /^\s*[-*]\s+\[ \]\s*1h/.test(lines[i])) { lines[i] = lines[i].replace('[ ]', '[x]'); units -= 1; }
  }
  if (units > 0) {
    let at = end;
    while (at > start + 1 && lines[at - 1].trim() === '') at -= 1;
    const posted = lines.slice(start + 1, end).filter((l) => /^\s*[-*]\s+\[x\]/i.test(l)).length;
    const add = kind === 'post' ? [`- [x] Post ${posted + 1}`]
      : [...Array(Math.floor(units)).fill('- [x] 1h'), ...(units % 1 ? ['- [x] 0.5h'] : [])];
    lines.splice(at, 0, ...add);
  }
  const after = lines.join('\n');
  fs.writeFileSync(file, after);
  return { week: week.id, undo: remember(file, before, after) };
}

function findContact(doc, name, company) {
  const contacts = doc.get('contacts');
  const hits = (contacts?.items ?? []).filter((c) => norm(c.get('name')) === norm(name) && norm(c.get('company')) === norm(company));
  if (hits.length !== 1) throw new Error(hits.length ? `More than one contact named ${name}` : `No contact named ${name}`);
  return hits[0];
}

// Ticking a follow-up = "I messaged them today": log the date, follow up again in 7 days.
export function markContacted({ name, company = '', today = ymd(new Date()) }) {
  return editOutreach((doc) => {
    const c = findContact(doc, name, company);
    const contacted = c.get('contacted');
    if (contacted?.items) {
      if (!contacted.items.some((d) => String(d.value ?? d) === today)) contacted.add(plain(today));
    } else {
      c.set('contacted', doc.createNode([plain(today)], { flow: true }));
    }
    c.set('last_contact', plain(today));
    c.set('next_date', plain(addDays(today, 7)));
    c.set('next_action', plain('follow up if no reply'));
    if (!PAST_MESSAGED.has(String(c.get('status')))) c.set('status', plain('messaged'));
    // A first message at a target company moves it out of research.
    const co = (doc.get('companies')?.items ?? []).find((x) => norm(x.get('name')) === norm(company));
    if (co && ['researching', 'to-contact', undefined].includes(co.get('status'))) co.set('status', plain('contacted'));
    return { name, next_date: addDays(today, 7) };
  });
}

// "Won't help" from the panel (× on a person) = CLAUDE.md §12 "drop X": status cold, no follow-up.
// The contact stays in outreach.yml (history kept, and a re-import skips them); Undo restores it.
const empty = () => Object.assign(new Scalar(''), { type: Scalar.QUOTE_DOUBLE });
export function dropContact({ name, company = '', today = ymd(new Date()) }) {
  return editOutreach((doc) => {
    const c = findContact(doc, name, company);
    c.set('status', plain('cold'));
    c.set('next_date', empty());
    c.set('next_action', empty());
    const note = `Removed by you ${today}: won't help.`;
    const old = String(c.get('notes') ?? '');
    if (!old.includes(note)) c.set('notes', `${old ? `${old} ` : ''}${note}`);
    return { name };
  });
}

// Items you remove from the dashboard by hand: a Needs-attention row (×) or a shelved opening.
// hub-data/hidden.yml holds {key, label, reason, at}; deleting an entry brings the item back.
const HIDDEN = path.join(HUB_DATA, 'hidden.yml');
const HIDDEN_HEAD = '# Items you removed from the dashboard by hand (× in Needs attention, or Shelve on an opening).\n'
  + '# Delete an entry to bring it back. Keys: opening:<url> · due:<who>|<company>|<date> · undated:<who>|<company>\n'
  + '#   · nohuman:<company>|<role> · tier1:<companies>. A follow-up with a new date shows again.\n';

function editHidden(fn) {
  const before = fs.existsSync(HIDDEN) ? fs.readFileSync(HIDDEN, 'utf8') : '';
  const list = (before ? parseYaml(before) : null) ?? [];
  const next = fn(Array.isArray(list) ? list : []);
  const after = HIDDEN_HEAD + (next.length ? toYaml(next, { lineWidth: 0 }) : '[]\n');
  fs.writeFileSync(HIDDEN, after);
  return { count: next.length, undo: remember(HIDDEN, before, after) };
}

export function hideItem({ key, label = '', reason = 'hidden', today = ymd(new Date()) }) {
  if (!key) throw new Error('Nothing to hide');
  return editHidden((list) => (list.some((h) => h.key === key) ? list : [...list, { key: String(key), label: String(label), reason: String(reason), at: today }]));
}

export function unhideItem({ key, keys }) {
  const drop = new Set([key, ...(keys ?? [])].filter(Boolean).map(String));
  if (!drop.size) throw new Error('Nothing to restore');
  return editHidden((list) => list.filter((h) => !drop.has(h.key)));
}

// Quick note from the side panel (no AI): appends "- YYYY-MM-DD: text" to hub-data/notes/<slug>.md.
export function addNote({ company, text, today = ymd(new Date()) }) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('Empty note');
  const dir = path.join(HUB_DATA, 'notes');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${noteSlug(company)}.md`);
  const head = fs.existsSync(file) ? '' : `# ${company || 'General'}\n\n`;
  fs.appendFileSync(file, `${head}- ${today}: ${clean}\n`);
  return { date: today };
}

// career-ops' tracker, created empty (its own onboarding header) on a fresh install: merge-tracker.mjs
// won't create it, so the first evaluation or "track" would otherwise have nowhere to land.
export function ensureTracker() {
  const file = path.join(CAREER_OPS, 'data', 'applications.md');
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n');
}

export const runCareerOps = (args, timeout) => run(args, timeout);

const run = (args, timeout) => new Promise((resolve, reject) => {
  // claudeEnv: rank-pipeline.mjs runs `claude` itself, which may live outside PATH (~/.local/bin).
  execFile(process.execPath, args, { cwd: CAREER_OPS, timeout, maxBuffer: 4 << 20, env: claudeEnv() }, (err, stdout, stderr) => {
    if (err && err.code !== 0 && !stdout) reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' ')));
    else resolve({ ok: !err, output: `${stdout}${stderr}`.trim() });
  });
});

// Status changes go through career-ops' own CLI, never a hand edit of applications.md.
export async function setAppStatus({ num, status }) {
  if (!/^\d+$/.test(String(num))) throw new Error('Bad tracker row');
  if (!APP_STATES.includes(status)) throw new Error(`Unknown status ${status}`);
  const r = await run(['set-status.mjs', '--row', String(num), status], 30_000);
  if (!r.ok) throw new Error(r.output.split('\n').slice(-2).join(' '));
  return r;
}

// "Check all": career-ops check-liveness.mjs on every tracker row's posting URL (from its report).
// API check first (no browser); headless Playwright only when the API can't tell.
export async function checkLive() {
  const tracker = fs.readFileSync(path.join(CAREER_OPS, 'data', 'applications.md'), 'utf8');
  const urls = [...new Set(tracker.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map(reportUrl).filter(Boolean))];
  if (!urls.length) throw new Error('No posting URLs in the evaluation reports yet');
  const r = await run(['check-liveness.mjs', '--no-fallback', ...urls], 5 * 60_000);
  const lines = r.output.split('\n');
  let all = {};
  try { all = JSON.parse(fs.readFileSync(LIVENESS_FILE, 'utf8')); } catch { /* first check */ }
  const at = new Date().toISOString();
  const counts = { active: 0, expired: 0, uncertain: 0 };
  for (const url of urls) {
    const i = lines.findIndex((l) => l.trim().endsWith(url) && /\b(active|expired|uncertain)\b/.test(l));
    const result = i === -1 ? 'uncertain' : lines[i].match(/\b(active|expired|uncertain)\b/)[1];
    const reason = result === 'active' || i === -1 ? (i === -1 ? 'no verdict returned' : '') : (lines[i + 1] ?? '').trim();
    all[url] = { result, reason, at };
    counts[result] += 1;
  }
  fs.writeFileSync(LIVENESS_FILE, `${JSON.stringify(all, null, 2)}\n`);
  return counts;
}

// Scan (career-ops' job boards, then web-scan.mjs for the companies without one), then give each
// new opening a quick 0-5 fit score against cv.md with career-ops rank-pipeline.mjs (runs `claude -p`; costs Claude usage, max 20 per run).
// "I applied to X" without a full evaluation: career-ops' own tracker-addition path.
// 1. reserve a number (reserve-report-num.mjs, same allocator the evaluators use)
// 2. write a headed TSV to batch/tracker-additions/ (score N/A, no report: a backfill row)
// 3. merge-tracker.mjs merges it into data/applications.md
// 4. set-status.mjs --on <date> moves it to the real status, so the status log records a
//    genuine transition with the real date (career-ops never invents history for a row
//    that was merged straight in as Applied)
// 5. application-meta.yml gets the row's channel / contact / posting URL
export async function trackApplication({ company, role, date = ymd(new Date()), status = 'Applied', url = '', channel = '', contact = '', notes = '' }) {
  ensureTracker();
  const clean = (v) => String(v ?? '').replace(/[\t\r\n|]+/g, ' ').trim();
  company = clean(company); role = clean(role); url = clean(url); notes = clean(notes);
  if (!company || !role) throw new Error('Need the company and the role');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > ymd(new Date())) throw new Error('Date must be YYYY-MM-DD and not in the future');
  if (!APP_STATES.includes(status)) throw new Error(`Unknown status ${status}`);
  if (url && !/^https?:\/\//.test(url)) throw new Error('The posting link must start with http');
  const tracker = fs.readFileSync(path.join(CAREER_OPS, 'data', 'applications.md'), 'utf8');
  const dup = tracker.split('\n').find((l) => l.toLowerCase().includes(`| ${company.toLowerCase()} |`) && l.toLowerCase().includes(role.toLowerCase()));
  if (dup) throw new Error(`${company} · ${role} is already in the tracker`);

  const reserved = (await run(['reserve-report-num.mjs'], 30_000)).output.match(/\b\d{3,}\b/)?.[0];
  if (!reserved) throw new Error('Could not reserve a tracker number');
  const num = String(Number(reserved));
  try {
    const slug = noteSlug(company);
    const file = path.join(CAREER_OPS, 'batch', 'tracker-additions', `${reserved}-${slug}.tsv`);
    const head = ['num', 'date', 'company', 'role', 'status', 'score', 'pdf', 'report', 'notes', 'url'];
    const row = [num, date, company, role, 'Evaluated', 'N/A', '❌', '—', notes || 'Added from the hub (no evaluation yet)', url];
    fs.writeFileSync(file, `${head.join('\t')}\n${row.join('\t')}\n`);
    const merge = await run(['merge-tracker.mjs'], 60_000);
    if (!merge.ok) throw new Error(merge.output.split('\n').slice(-3).join(' '));
    if (status !== 'Evaluated') {
      const log = await run(['set-status.mjs', '--row', num, status, '--on', date], 30_000);
      if (!log.ok) throw new Error(`Added #${num}, but recording the ${status} date failed: ${log.output.split('\n').slice(-2).join(' ')}`);
    }
  } finally {
    await run(['reserve-report-num.mjs', '--release', reserved], 30_000).catch(() => {});
  }

  // application-meta.yml: the hub's own fields for the new row (comments and order kept).
  const metaFile = path.join(HUB_DATA, 'application-meta.yml');
  const doc = parseDocument(fs.readFileSync(metaFile, 'utf8'));
  const entry = doc.createNode({ company, role, channel: channel || '', contact: contact || '', ...(url ? { url } : {}) });
  if (doc.contents?.items) doc.contents.add(entry); else doc.contents = doc.createNode([entry.toJSON()]);
  doc.contents.flow = false; // a fresh copy starts as `[]`
  fs.writeFileSync(metaFile, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  return { num, company, role, status, date };
}

// "Also scan for X roles": adds keywords to title_filter.positive in career-ops' portals.yml (its user
// layer, the scan settings the user owns). Comments and order kept; skips ones already there. Undo.
export function scanTitles({ add = [] }) {
  const file = path.join(CAREER_OPS, 'portals.yml');
  const before = fs.readFileSync(file, 'utf8');
  const doc = parseDocument(before);
  if (doc.errors.length) throw new Error(`portals.yml: ${doc.errors[0].message}`);
  const want = [...new Set((Array.isArray(add) ? add : [add]).map((k) => String(k ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  if (!want.length) throw new Error('Which job titles?');
  if (!doc.hasIn(['title_filter', 'positive'])) doc.setIn(['title_filter', 'positive'], doc.createNode([]));
  const list = doc.getIn(['title_filter', 'positive']);
  const have = new Set((list.items ?? []).map((i) => String(i?.value ?? i).toLowerCase()));
  const added = want.filter((k) => !have.has(k.toLowerCase()));
  if (!added.length) throw new Error('Those titles are already in your scan');
  for (const k of added) list.add(k);
  list.flow = false;
  const after = doc.toString({ lineWidth: 0 });
  fs.writeFileSync(file, after);
  return { added, undo: remember(file, before, after) };
}

// "Add these to New openings" (chat proposal, e.g. the jobs on a LinkedIn search page you sent):
// one `- [ ] {url} | {company} | {title} | {location} | posted: {date}` line per job under
// ## Pending in career-ops data/pipeline.md, the inbox its header asks you to paste job URLs into.
// Jobs already in the pipeline (pending or processed) or the tracker are skipped. Undo restores it.
export function addOpenings({ jobs = [] }) {
  const file = path.join(CAREER_OPS, 'data', 'pipeline.md');
  const before = fs.readFileSync(file, 'utf8');
  if (!/^## Pending/m.test(before)) throw new Error('pipeline.md has no "## Pending" section');
  let tracker = '';
  try { tracker = fs.readFileSync(path.join(CAREER_OPS, 'data', 'applications.md'), 'utf8'); } catch { /* no tracker yet */ }
  const known = `${before}\n${tracker}`;
  const jobId = (url) => url.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i)?.[1];
  const clean = (v) => String(v ?? '').replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = [];
  const skipped = [];
  for (const j of Array.isArray(jobs) ? jobs : []) {
    let url = clean(j?.url);
    if (!/^https?:\/\/\S+$/.test(url)) { skipped.push(clean(j?.title) || url || '?'); continue; }
    const id = jobId(url);
    if (id) url = `https://www.linkedin.com/jobs/view/${id}/`; // drop tracking and the country subdomain
    const seen = id ? new RegExp(`jobs/view/(?:[^/?#\\s|]*-)?${id}\\b`).test(known) : known.includes(url);
    if (seen || lines.some((l) => l.includes(url))) { skipped.push(clean(j.title) || url); continue; }
    const posted = /^\d{4}-\d{2}-\d{2}$/.test(String(j.posted ?? '')) ? `posted: ${j.posted}` : '';
    lines.push(`- [ ] ${[url, clean(j.company), clean(j.title), clean(j.location), posted].filter(Boolean).join(' | ')}`);
  }
  if (!lines.length) throw new Error(skipped.length ? 'All of these are already in New openings or the tracker' : 'No job links to add');
  // Insert after the last line of ## Pending (before the next section), keeping its blank line.
  const all = before.split('\n');
  const start = all.findIndex((l) => /^## Pending/.test(l));
  let end = all.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) end = all.length;
  while (end > start + 1 && all[end - 1].trim() === '') end -= 1;
  all.splice(end, 0, ...(end === start + 1 ? ['', ...lines] : lines));
  const after = all.join('\n');
  fs.writeFileSync(file, after);
  return { added: lines.length, skipped, undo: remember(file, before, after) };
}

let scanning = null;
export function runScan() {
  scanning ??= (async () => {
    const scan = await run(['scan.mjs'], 10 * 60_000);
    // Then the companies scan.mjs can't read (no public job board): their careers pages, else a web search.
    const web = await webScan().catch((e) => ({ error: e.message }));
    const rank = await rankOpenings().catch((e) => ({ ok: false, output: e.message }));
    return { scan: scan.ok, web: { added: web.added ?? 0, error: web.error ?? '' }, ranked: rank.ok, rankNote: rank.ok ? '' : rank.output.split('\n').slice(-2).join(' ') };
  })().finally(() => { scanning = null; });
  return scanning;
}

export function rankOpenings() {
  return run(['rank-pipeline.mjs', '--limit', '20'], 10 * 60_000);
}
export const isScanning = () => Boolean(scanning);
