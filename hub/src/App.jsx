import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Briefcase01, Calendar, Check, ChevronDown, ChevronLeft, ChevronLeftDouble, ChevronRightDouble, Home02, SearchMd, Send01, XClose } from '@untitledui/icons';
import { motion, animate, useMotionValue, useDragControls, useTransform } from 'motion/react';

// Filled from hub-data/profile.yml each time data loads (applyProfile below).
const PROFILE = { name: '', first_name: '', base: '', former_companies: [] };
const LEAD_WITH = {};
// One hue per meaning, used everywhere that thing appears (see DESIGN.md).
const CHANNEL_HUE = { referral: 'green', 'hiring-manager': 'violet', 'recruiter-inbound': 'teal', recruiter: 'teal', cold: 'grey' };
const TIER_HUE = { 1: 'violet', 2: 'teal', 3: 'green' };
const METRIC_HUE = { warm_messages: 'amber', hiring_manager_messages: 'violet', applications: 'blue', linkedin_posts: 'pink', interview_prep_hours: 'teal' };
const PERSON_HUES = ['violet', 'teal', 'green', 'amber', 'blue', 'pink'];
const personHue = (name) => PERSON_HUES[[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % PERSON_HUES.length];
// Data codes → words on screen (status, channel, relation). Unknown codes show as they are.
const LABEL = {
  'to-message': 'To message', messaged: 'Messaged', replied: 'Replied', 'intro-made': 'Intro made', 'reference-yes': 'Will be a reference', cold: 'Cold',
  researching: 'Researching', 'to-contact': 'To contact', contacted: 'Contacted', 'in-conversation': 'In conversation', applied: 'Applied', parked: 'Parked',
  referral: 'Referral', 'hiring-manager': 'Hiring manager', 'recruiter-inbound': 'Recruiter came to me', recruiter: 'Recruiter',
  other: 'Other',
};
const label = (v) => LABEL[String(v ?? '').toLowerCase()] ?? v;
// Thread colour for a person: the same hue as their channel / target.
const REL_HUE = { 'hiring-manager': 'violet', recruiter: 'teal', 'recruiter-inbound': 'teal', referral: 'green' };
// Warm = an ex-colleague: relation `ex-<company>` from profile.yml's former_companies.
const isWarm = (r) => /^ex-/.test(String(r ?? ''));
const relHue = (r) => REL_HUE[r] ?? (isWarm(r) ? 'amber' : 'grey');
const dedupeList = (s) => [...new Set(String(s ?? '').split(/,\s*/).filter(Boolean))].join(', ');
const TIER_NAMES = {};
// Where a warm contact works now vs. the company you share (profile.yml `match`).
const OLD_CO = {};

function applyProfile(p) {
  if (!p) return;
  Object.assign(PROFILE, p);
  for (const k of Object.keys(LEAD_WITH)) delete LEAD_WITH[k];
  for (const l of p.lead_with ?? []) LEAD_WITH[l.key] = l.label;
  Object.assign(TIER_NAMES, p.tiers ?? {});
  for (const k of Object.keys(OLD_CO)) delete OLD_CO[k];
  for (const f of p.former_companies ?? []) {
    LABEL[f.relation] = `Ex-${f.label}`;
    try { OLD_CO[f.relation] = new RegExp(f.match, 'i'); } catch { OLD_CO[f.relation] = new RegExp(f.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  }
}
const formerLabels = () => PROFILE.former_companies.map((f) => f.label).join(' or ') || 'your past companies';

// Linear-style status icon per status: how full the circle is, and its tone.
const STATUS_ICON = {
  // applications (career-ops states)
  evaluated: ['open', 'muted'], applied: [0.5, 'info'], responded: [0.5, 'info'], assessment: [0.75, 'warn'],
  interview: [0.75, 'ok'], offer: ['done', 'ok'], hired: ['done', 'ok'],
  rejected: ['x', 'bad'], discarded: ['x', 'muted'], skip: ['x', 'muted'], untracked: ['dashed', 'muted'],
  // companies
  researching: ['dashed', 'muted'], 'to-contact': ['open', 'warn'], contacted: [0.5, 'info'],
  'in-conversation': [0.75, 'ok'], parked: ['x', 'muted'],
  // contacts
  'to-message': ['open', 'warn'], messaged: [0.5, 'info'], replied: [0.75, 'ok'],
  'intro-made': ['done', 'ok'], 'reference-yes': ['done', 'ok'], cold: ['x', 'muted'],
};

// Design preview: ?preview=no-person shows every application without its person, in this
// browser only (nothing is written), so the "attach a person" state can be seen.
function previewNoPerson(d) {
  if (!new URLSearchParams(window.location.search).has('preview') || !d.applications) return d;
  const strip = (r) => ({ ...r, contact: '' });
  return { ...d, applications: { ...d.applications, rows: (d.applications.rows ?? []).map(strip), untracked: (d.applications.untracked ?? []).map(strip) } };
}

function useHubData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false); // server stopped: keep the last data on screen

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/data')
      .then((r) => r.json())
      .then((d) => { if (!alive) return; if (d.error) setError(d.error); else { applyProfile(d.profile); setData(previewNoPerson(d)); setError(''); setStale(false); } })
      .catch((e) => { if (alive) { setError(e.message); setStale(true); } });
    load();
    const events = new EventSource('/api/events');
    events.onmessage = load;
    events.onerror = () => alive && setStale(true);
    events.onopen = () => { if (alive) { setStale(false); load(); } };
    const tick = setInterval(load, 10 * 60 * 1000); // keeps "today" right across midnight
    return () => { alive = false; events.close(); clearInterval(tick); };
  }, []);

  return { data, error, stale };
}

// Writes go to /api/action/* (see vite.config.js); the page then reloads via /api/events.
async function post(action, body = {}) {
  const r = await fetch(`/api/action/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Failed');
  return d.result;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let showToast = () => {};

// Remove an item from a list by hand (hub-data/hidden.yml), with Undo in the toast.
// Openings use reason "shelved". Keys match main's: due:<who>|<company>|<date> · undated:<who>|<company>
// · nohuman:<company>|<role> · opening:<url>, plus person:<name>|<company> and find:<company> for Today.
async function hideItem(key, label, reason = 'hidden') {
  try {
    const r = await post('hide', { key, label, reason });
    showToast(reason === 'shelved' ? `${label}: shelved` : `${label}: removed from your list`, 'ok', () => post('undo', { id: r.undo }));
  } catch (e) { showToast(e.message, 'bad'); }
}

async function unhideItems(keys, text) {
  try { await post('unhide', { keys }); showToast(text); } catch (e) { showToast(e.message, 'bad'); }
}

function HideButton({ onClick, label }) {
  return (
    <button type="button" className="row-x" onClick={onClick} title={label} aria-label={label}>
      <XClose size={12} strokeWidth={2.5} />
    </button>
  );
}

// × on a person: "won't help" → cold (kept in outreach.yml, off every to-message list).
function DropButton({ c }) {
  if (c.status === 'cold') return null;
  const drop = async () => {
    try {
      const r = await post('drop', { name: c.name, company: c.company });
      showToast(`${c.name}: removed (marked cold)`, 'ok', () => post('undo', { id: r.undo }));
    } catch (e) {
      showToast(e.message, 'bad');
    }
  };
  return <HideButton onClick={drop} label={`Remove ${c.name}: won't help (marks them cold)`} />;
}

function Toast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    // `undo` (optional): an async function; the toast then shows an Undo button and stays longer.
    // Or {label, run}: a button that does something else (Open); that toast stays until used or closed.
    showToast = (text, kind = 'ok', undo = null) => {
      const action = undo && typeof undo === 'object' ? undo : null;
      setMsg({ text, kind, undo: action ? null : undo, action });
      clearTimeout(t);
      if (action) return;
      // fade out (120ms) before it goes
      t = setTimeout(() => { setMsg((m) => m && { ...m, out: true }); t = setTimeout(() => setMsg(null), 120); }, undo ? 10000 : 4000);
    };
    return () => clearTimeout(t);
  }, []);
  if (!msg) return null;
  const doUndo = async () => {
    setMsg(null);
    try { await msg.undo(); showToast('Undone'); } catch (e) { showToast(e.message, 'bad'); }
  };
  return (
    <div className={`toast toast-${msg.kind}${msg.out ? ' out' : ''}`} role="status">
      <span>{msg.text}</span>
      {msg.undo && <button type="button" className="toast-btn" onClick={doUndo}>Undo</button>}
      {msg.action && <button type="button" className="toast-btn" onClick={() => { setMsg(null); msg.action.run(); }}>{msg.action.label}</button>}
      {msg.action && <button type="button" className="toast-x" onClick={() => setMsg(null)} aria-label="Dismiss"><XClose size={14} /></button>}
    </div>
  );
}

// The side panel: what it's open on. {company, focus: 'company'|'app'|'opening', ref} or {global: true}.
const PanelContext = createContext({ open: () => {}, item: null });
const usePanel = () => useContext(PanelContext);
// Row click → open the panel, unless the click was on a control inside the row.
const rowClick = (open, item) => (e) => {
  if (e.target.closest('button, a, select, label, input, textarea')) return;
  open(item);
};

// Ticks a contact as "messaged today". Disabled while the write is in flight.
function TickButton({ name, company, done, onStart, onFail }) {
  const [busy, setBusy] = useState(false);
  const tick = async () => {
    setBusy(true);
    try {
      if (onStart) await onStart();
      const r = await post('contacted', { name, company });
      showToast(`${name}: messaged today, follow up ${fmtDay(r.next_date)}`, 'ok', () => post('undo', { id: r.undo }));
    } catch (e) {
      onFail?.();
      showToast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={done ? 'check done' : 'check'} disabled={busy}
      onClick={tick} title="Mark as messaged today (follow up again in 7 days)" aria-label={`Mark ${name} as messaged today`}>
      <Check size={10} strokeWidth={3.5} />
    </button>
  );
}

const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDay = (s) => (s ? parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const fmtShort = (s) => (s ? parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const noteSlug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
const PLURALS = { company: 'companies', person: 'people' };
const plural = (n, word) => {
  if (n === 1) return `${n} ${word}`;
  const last = word.split(' ').at(-1);
  return `${n} ${word.slice(0, word.length - last.length)}${PLURALS[last] ?? `${last}s`}`;
};

function StatusIcon({ status, size = 14 }) {
  const [fill, tone] = STATUS_ICON[slug(status)] ?? ['open', 'muted'];
  const r = 6;
  return (
    <svg className={`sicon tone-${tone}`} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      {fill === 'done' || fill === 'x' ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d={fill === 'done' ? 'M4.3 7.2l1.8 1.8 3.6-3.8' : 'M4.8 4.8l4.4 4.4M9.2 4.8l-4.4 4.4'} stroke="var(--surface)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={fill === 'dashed' ? '2 2.1' : undefined} />
          {typeof fill === 'number' && (
            <circle cx="7" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="4"
              strokeDasharray={`${fill * 2 * Math.PI * 2} ${2 * Math.PI * 2}`} transform="rotate(-90 7 7)" />
          )}
        </>
      )}
    </svg>
  );
}

function Chip({ kind, icon, children, title }) {
  return <span className={`chip chip-${slug(kind)}`} title={title}>{icon}{children}</span>;
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function Avatar({ name, large = false, hue }) {
  return <span className={`avatar hue-${hue ?? personHue(name)}${large ? ' avatar-lg' : ''}`} title={name}>{initials(name)}</span>;
}

// The thread: a line from the application to the person attached to it. No person → a dashed
// stub that opens Claude to find one: amber for the first 2 days, vermilion after (the guardrail).
// The line draws in when a person gets attached.
function Thread({ contact, channel, age = null, onAttach }) {
  const prev = useRef(contact);
  const draw = Boolean(contact) && !prev.current;
  useEffect(() => { prev.current = contact; });
  if (!contact) {
    return (
      <button type="button" className={age != null && age <= 2 ? 'thread missing fresh' : 'thread missing'} onClick={onAttach} title="No person attached yet: paste their LinkedIn link in the chat">
        <span className="thread-line" /><span className="thread-end" /><span className="thread-cta">attach a person{age > 2 ? ` · ${age}d` : ''}</span>
      </button>
    );
  }
  return (
    <span className={`thread hue-${CHANNEL_HUE[channel] ?? 'grey'}${draw ? ' draw' : ''}`} title={`${contact} is attached to this application${channel ? ` (${label(channel)})` : ''}`}>
      <span className="thread-line" /><Avatar name={contact} hue={CHANNEL_HUE[channel] ?? 'grey'} /><span className="thread-name">{contact}</span>
    </span>
  );
}

// Days an application has gone without a person (from its tracker date).
const appAge = (r, today) => (r.date ? Math.max(0, daysBetween(r.date, today)) : null);

const attachItem = (r) => ({ company: r.company, focus: 'app', ref: r.num ?? `u:${r.role}`, draft: `Attach to the ${r.company} application: ` });

function DueChip({ date, today }) {
  if (!date) return <Chip kind="undated">No date</Chip>;
  const d = daysBetween(today, date);
  if (d < 0) return <Chip kind="late">{-d}d late</Chip>;
  if (d === 0) return <Chip kind="today">Today</Chip>;
  if (d === 1) return <Chip kind="soon">Tomorrow</Chip>;
  return <Chip kind="later">{fmtDay(date)}</Chip>;
}

const NoHuman = () => <Chip kind="warn" title="Add a contact in hub-data/application-meta.yml">No person yet</Chip>;

// Week targets as segmented ticks: one segment per unit, the ones above the minimum outlined.
function Segments({ p }) {
  const prev = useRef(p.count);
  const from = prev.current; // count at the last render: first render = no animation
  useEffect(() => { prev.current = p.count; });
  const n = Math.min(12, Math.ceil(Math.max(p.max, p.min, p.count, 1)));
  return (
    <span className={`segs hue-${METRIC_HUE[p.key] ?? 'grey'}`} role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={p.count} aria-label={p.label}>
      {Array.from({ length: n }, (_, i) => {
        const fill = p.count - i;
        return <i key={i} className={`seg${fill >= 1 ? ' on' : fill > 0 ? ' half' : ''}${i >= p.min ? ' extra' : ''}${fill >= 1 && i >= Math.floor(from) ? ' grow' : ''}`} />;
      })}
    </span>
  );
}

const targetText = (p) => (p.min === p.max ? `${p.max}` : `${p.min}–${p.max}`);

// Open/closed state per section, remembered in this browser only (a convenience, so storage
// failures are ignored). Following a sidebar link to a closed section opens it.
function useCollapsed(key) {
  const storageKey = `hub:collapsed:${key}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== `#${key}`) return;
      try { localStorage.setItem(storageKey, '0'); } catch { /* private mode */ }
      setCollapsed(false);
    };
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [key]);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(storageKey, c ? '0' : '1'); } catch { /* private mode */ }
    return !c;
  });
  return [collapsed, toggle];
}

function Toggle({ collapsed, onClick, label, children }) {
  return (
    <button type="button" className="toggle" onClick={onClick} aria-expanded={!collapsed} title={collapsed ? `Show ${label}` : `Hide ${label}`}>
      <ChevronDown className={collapsed ? 'chev closed' : 'chev'} size={12} strokeWidth={2.5} />
      {children}
    </button>
  );
}

function Card({ id, title, count, aside, children, className = '' }) {
  const [collapsed, toggle] = useCollapsed(id ?? slug(title));
  return (
    <section className={`card ${className}${collapsed ? ' collapsed' : ''}`}>
      <header className="card-head">
        <h2><Toggle collapsed={collapsed} onClick={toggle} label={title}>{title}{count != null && <span className="count">{count}</span>}</Toggle></h2>
        {aside && !collapsed && <span className="muted small">{aside}</span>}
      </header>
      {!collapsed && <div className="card-body">{children}</div>}
    </section>
  );
}

function Group({ id, icon, title, count, aside, children }) {
  const [collapsed, toggle] = useCollapsed(`group-${id ?? slug(title)}`);
  return (
    <div id={`group-${id ?? slug(title)}`} className={collapsed ? 'group collapsed' : 'group'}>
      <div className="group-head">
        <Toggle collapsed={collapsed} onClick={toggle} label={title}>
          {icon}
          <span className="group-title">{title}</span>
          <span className="count">{count}</span>
        </Toggle>
        {aside && <span className="group-aside">{aside}</span>}
      </div>
      {!collapsed && <ul className="list">{children}</ul>}
    </div>
  );
}

// ── Today: follow-ups due now, plus what's coming in the next 7 days ─────

function allContacts(data) {
  return [...data.outreach.tiers.flatMap((t) => t.companies.flatMap((c) => c.contacts.map((p) => ({ ...p, company: p.company || c.name })))), ...data.outreach.network];
}

function FollowUps({ data }) {
  const { open } = usePanel();
  const { due, undated, today } = data;
  const upcoming = allContacts(data)
    .filter((c) => c.next_date && c.status !== 'cold' && daysBetween(today, c.next_date) > 0 && daysBetween(today, c.next_date) <= 7)
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
  const nowCount = due.length + undated.length;
  const [tab, setTab] = useState('now');
  const show = tab === 'now' ? 'now' : 'upcoming';

  return (
    <Card title="Follow-ups" className="area-followups" aside={<Tabs value={show} onChange={setTab} items={[['now', `Due ${nowCount}`], ['upcoming', `Next 7 days ${upcoming.length}`]]} />}>
      <ul className="list">
        {show === 'now' && nowCount === 0 && <Empty>Nothing due. Good time to send a warm message.</Empty>}
        {show === 'now' && due.map((d, i) => (
          <li key={i} className="row clickable" onClick={rowClick(open, { company: d.company || d.who, focus: 'company' })}>
            {d.source === 'outreach' ? <TickButton name={d.who} company={d.company} /> : <span className="check static" title="Application follow-up: tell Claude when it's sent" />}
            <span className="row-main">
              <span className="row-title">{d.who || d.company}</span>
              {d.who && d.company && <span className="row-sub"> · {d.company}</span>}
              <span className="row-note">{d.action}</span>
            </span>
            <DueChip date={d.date} today={today} />
          </li>
        ))}
        {show === 'now' && undated.map((u, i) => (
          <li key={`u${i}`} className="row clickable" onClick={rowClick(open, { company: u.company || u.who, focus: 'company' })}>
            <TickButton name={u.who} company={u.company} />
            <span className="row-main">
              <span className="row-title">{u.who}</span>
              {u.company && <span className="row-sub"> · {u.company}</span>}
              <span className="row-note">{u.action}</span>
            </span>
            <DueChip date="" today={today} />
          </li>
        ))}
        {show === 'upcoming' && upcoming.length === 0 && <Empty>No follow-ups in the next week.</Empty>}
        {show === 'upcoming' && upcoming.map((c) => (
          <li key={`${c.name}-${c.company}`} className="row clickable" onClick={rowClick(open, { company: c.company || c.name, focus: 'company' })}>
            <TickButton name={c.name} company={c.company} />
            <span className="row-main">
              <span className="row-title">{c.name}</span>
              {c.company && <span className="row-sub"> · {c.company}</span>}
              <span className="row-note">{c.next_action}</span>
            </span>
            <DueChip date={c.next_date} today={today} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Tabs({ value, onChange, items }) {
  return (
    <span className="tabs" role="tablist">
      {items.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'tab on' : 'tab'} onClick={() => onChange(key)}>{label}</button>
      ))}
    </span>
  );
}

const Empty = ({ children }) => <li className="empty">{children}</li>;

// ── This week ────────────────────────────────────────────────────────────

function weekStats(progress) {
  const hit = progress.filter((p) => p.count >= p.min).length;
  const pct = progress.length ? progress.reduce((s, p) => s + Math.min(1, p.count / Math.max(p.min, 1)), 0) / progress.length : 0;
  return { hit, pct };
}

function ThisWeek({ data }) {
  const { week, progress } = data;
  const { open } = usePanel();
  const { hit } = weekStats(progress);
  return (
    <section className="home-block">
      <h2 className="home-h">Targets <span className="count">{hit}/{progress.length} hit</span></h2>
      {!week.fileExists && <p className="notice">No file for {week.id}: say "start a new week".</p>}
      <WeekBars data={data} onOpen={(p) => open({ kind: 'metric', key: p.key })} />
    </section>
  );
}

// ── Applications: grouped by status, Linear-style ────────────────────────

// Changes a tracker row through career-ops' set-status.mjs (server side).
function StatusSelect({ row, states = [] }) {
  const [busy, setBusy] = useState(false);
  const current = states.find((s) => s.toLowerCase() === String(row.status).toLowerCase()) ?? row.status;
  const change = async (e) => {
    const status = e.target.value;
    setBusy(true);
    try {
      await post('status', { num: row.num, status });
      showToast(`${row.company}: ${current} → ${status}`, 'ok', () => post('status', { num: row.num, status: current }));
    } catch (err) {
      showToast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={busy ? 'status-select busy' : 'status-select'} title="Change status (runs career-ops set-status)">
      <StatusIcon status={current} />
      <span className="status-text">{current}</span>
      <ChevronDown size={11} strokeWidth={2.5} />
      <select value={current} onChange={change} disabled={busy} aria-label={`Status of ${row.company}`}>
        {!states.includes(current) && <option value={current}>{current}</option>}
        {states.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}

const LIVE = { active: ['Live', 'reached'], expired: ['Closed', 'late'], uncertain: ['Unclear', 'soon'] };

// One status chip per row; the check itself runs for the whole list ("Check all").
function LiveChip({ live }) {
  const [label, kind] = LIVE[live?.result] ?? [];
  if (!label) return null;
  const checked = new Date(live.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return <Chip kind={kind} title={`${live.reason || 'Posting is open'} · checked ${checked}`}>{label} · {checked}</Chip>;
}

function CheckAll({ rows }) {
  const [busy, setBusy] = useState(false);
  if (!rows.some((r) => r.url)) return null;
  const check = async () => {
    setBusy(true);
    try {
      const c = await post('live');
      showToast(`Postings: ${c.active} live, ${c.expired} closed, ${c.uncertain} unclear`, c.expired ? 'bad' : 'ok');
    } catch (e) {
      showToast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const last = rows.map((r) => r.live?.at).filter(Boolean).sort().at(-1);
  return (
    <span className="check-all">
      {last && <span className="muted small">Checked {new Date(last).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      <button type="button" className="btn" onClick={check} disabled={busy} title="Is each posting still open? (career-ops check-liveness)">{busy ? 'Checking…' : 'Check if live'}</button>
    </span>
  );
}

function Applications({ data }) {
  const { open } = usePanel();
  const apps = data.applications;
  if (!apps.ok) {
    return (
      <Section id="applications" title="Applications" aside="Couldn't parse the tracker, showing it raw">
        <pre className="raw">{apps.raw}</pre>
      </Section>
    );
  }
  const rank = (s) => {
    const i = apps.statusOrder.findIndex((x) => x.toLowerCase() === String(s).toLowerCase());
    return i === -1 ? 99 : i;
  };
  const rows = [...apps.rows].sort((a, b) => rank(a.status) - rank(b.status) || b.date.localeCompare(a.date));
  const groups = [];
  rows.forEach((r) => {
    const g = groups.find((x) => x.status.toLowerCase() === String(r.status).toLowerCase());
    if (g) g.rows.push(r); else groups.push({ status: r.status, rows: [r] });
  });
  const missing = [...rows, ...apps.untracked].filter((r) => !r.contact).length;

  return (
    <Section id="applications" title="Applications" count={rows.length + apps.untracked.length}
      aside={missing ? `${plural(missing, 'application')} without a person` : null} warnAside
      action={<CheckAll rows={rows} />}>
      {rows.length === 0 && apps.untracked.length === 0 && <p className="empty">No applications yet. Send a job link to Claude to track one.</p>}
      {groups.map((g) => (
        <Group key={g.status} icon={<StatusIcon status={g.status} />} title={g.status} count={g.rows.length}>
          {g.rows.map((r) => (
            <li key={`${r.num}-${r.company}`} className="row row-app clickable" title={r.notes} onClick={rowClick(open, { company: r.company, focus: 'app', ref: r.num })}>
              <span className="row-id">#{r.num}</span>
              <span className="row-main">
                <span className="row-title">{r.company}</span>
                <span className="row-sub"> {r.role}</span>
                <EvalNote data={data} target={{ url: r.url, num: r.num, company: r.company, role: r.role }} />
              </span>
              <span className="row-meta">
                {r.reportFile
                  ? <a className="src" href={reportHref(r)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>Report <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></a>
                  : <EvaluateButton data={data} target={{ url: r.url, num: r.num, company: r.company, role: r.role }} />}
                {/\d/.test(r.score) && <Chip kind="score">{r.score}</Chip>}
                {r.channel ? <Chip kind={r.channel}>{label(r.channel)}</Chip> : null}
                <LiveChip live={r.live} />
              </span>
              <Thread contact={r.contact} channel={r.channel} age={appAge(r, data.today)} onAttach={() => open(attachItem(r))} />
              <span className="row-tail">
                <span className="date">{fmtShort(r.date)}</span>
              </span>
            </li>
          ))}
        </Group>
      ))}
      {apps.untracked.length > 0 && (
        <Group icon={<StatusIcon status="untracked" />} title="Not in tracker yet" count={apps.untracked.length} aside="press Evaluate to add it with a fit report">
          {apps.untracked.map((u) => (
            <li key={`${u.company}-${u.role}`} className="row row-app untracked clickable" onClick={rowClick(open, { company: u.company, focus: 'app', ref: `u:${u.role}` })}>
              <span className="row-id">—</span>
              <StatusIcon status="untracked" />
              <span className="row-main">
                <span className="row-title">{u.company}</span>
                <span className="row-sub"> {u.role}</span>
                <EvalNote data={data} target={{ url: u.url, company: u.company, role: u.role }} />
              </span>
              <span className="row-meta">
                {(u.url || u.company) && <EvaluateButton data={data} target={{ url: u.url, company: u.company, role: u.role }} />}
                {u.channel && <Chip kind={u.channel}>{label(u.channel)}</Chip>}
              </span>
              <Thread contact={u.contact} channel={u.channel} onAttach={() => open(attachItem(u))} />
              <span className="row-tail">
                <span className="date" />
              </span>
            </li>
          ))}
        </Group>
      )}
    </Section>
  );
}

// ── Outreach: grouped by tier, then the network outside targets ──────────

const lastContacted = (c) => [...(c.contacted ?? []), c.last_contact].map((d) => String(d ?? '').slice(0, 10)).filter(Boolean).sort().at(-1) ?? '';
const isSuggested = (c) => Boolean(c.source || c.why) && c.status === 'to-message' && !lastContacted(c);

function OutreachState({ contacts }) {
  const last = contacts.map(lastContacted).filter(Boolean).sort().at(-1);
  if (last) return <Chip kind="reached" title="Latest message to anyone here">Reached out {fmtShort(last)}</Chip>;
  return <Chip kind="not-reached">Not reached out</Chip>;
}

// A person on their company's thread: the line is their channel colour, its end is the tick
// (filled = messaged, open = to message, ✕ = cold), dotted while only suggested by research.
const DONE_STATUS = new Set(['messaged', 'replied', 'intro-made', 'reference-yes']);

function ContactRow({ c, today, inPanel = false }) {
  const suggested = isSuggested(c);
  const cold = c.status === 'cold';
  return (
    <li className={`person-row threaded hue-${relHue(c.relation)}${suggested ? ' suggested' : ''}${cold ? ' is-cold' : ''}`} title={`${label(c.status)}${suggested ? ' · suggested by research, check before writing' : ''}`}>
      {cold
        ? <span className="check static thread-cold" aria-label="Cold"><XClose size={10} strokeWidth={3} /></span>
        : <TickButton name={c.name} company={c.company} done={DONE_STATUS.has(c.status)} />}
      <Avatar name={c.name} />
      <span className="row-main">
        <span className="row-title">{c.name}</span>
        <span className="row-sub"> · {c.title || label(c.relation)}</span>
        {c.why && <span className="row-note">{c.why}</span>}
      </span>
      <span className="row-meta">
        {inPanel && c.source && <a className="src" href={c.source} target="_blank" rel="noreferrer noopener" title={c.source}>source <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></a>}
        {c.next_date && !cold && <DueChip date={c.next_date} today={today} />}
      </span>
      <DropButton c={c} />
    </li>
  );
}

function CompanyRow({ company, today }) {
  const { open } = usePanel();
  const lonely = company.tier === 1 && company.contacts.length === 0;
  return (
    <li className={lonely ? 'row row-co clickable lonely' : 'row row-co clickable'} onClick={rowClick(open, { company: company.name, focus: 'company' })}>
      <div className="row-line">
        <StatusIcon status={company.status} />
        <span className="row-main" title={company.why || undefined}>
          <span className="row-title">{company.name}</span>
          {company.why && <span className="row-sub"> {company.why}</span>}
        </span>
        <span className="row-meta">
          {lonely && <Chip kind="warn">Nobody here yet</Chip>}
          {company.lead_with && <span className="base">lead with {LEAD_WITH[company.lead_with] ?? company.lead_with}</span>}
          <OutreachState contacts={company.contacts} />
        </span>
      </div>
      {company.contacts.length > 0 && (
        <ul className="people">
          {company.contacts.map((c) => <ContactRow key={c.name} c={c} today={today} />)}
        </ul>
      )}
    </li>
  );
}

function Outreach({ data }) {
  const { tiers } = data.outreach;
  const total = tiers.reduce((n, t) => n + t.companies.length, 0);
  const lonely = tiers.find((t) => t.tier === 1)?.companies.filter((c) => c.contacts.length === 0).length ?? 0;
  return (
    <Section id="outreach" title="Outreach" count={total} aside={lonely ? `${lonely} tier-1 ${lonely === 1 ? 'company' : 'companies'} with no contact` : null} warnAside>
      {tiers.map((t) => (
        <Group key={t.tier} id={`tier-${t.tier}`} icon={<span className={`tier-badge hue-${TIER_HUE[t.tier] ?? 'grey'}`}>T{t.tier}</span>} title={`Tier ${t.tier}`} count={t.companies.length} aside={TIER_NAMES[t.tier]}>
          {t.companies.map((c) => <CompanyRow key={c.name} company={c} today={data.today} />)}
        </Group>
      ))}
    </Section>
  );
}

function Network({ data }) {
  const { open } = usePanel();
  const { network } = data.outreach;
  return (
    <Section id="network" title="Network" count={network.length} aside="people outside the target list">
      <div className="group">
        <ul className="list">
          {network.length === 0 && <Empty>No one yet.</Empty>}
          {network.map((c) => (
            <li key={c.name} className="row person-row clickable" onClick={rowClick(open, { company: c.company || c.name, focus: 'person', ref: c.name })}>
              <TickButton name={c.name} company={c.company} done={Boolean(lastContacted(c)) && c.next_date > data.today} />
              <Avatar name={c.name} />
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub"> · {[c.company, label(c.relation)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="row-meta">
                <span className="status-label"><StatusIcon status={c.status} size={12} />{label(c.status)}</span>
                {c.next_date && <DueChip date={c.next_date} today={data.today} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

// Employer-run applicant systems; anything else is an aggregator listing to confirm at the employer.
const ATS_HOSTS = /(ashbyhq|greenhouse|lever|workable|smartrecruiters|recruitee|teamtailor|personio|myworkdayjobs|bamboohr|join)\.(com|co|io|de)$/;

// ── New openings: career-ops scan results waiting in data/pipeline.md ────

// Quick fit score from career-ops rank-pipeline.mjs (title + CV only; the full
// evaluation is /career-ops pipeline).
function FitScore({ score, reason }) {
  if (score == null) return <Chip kind="unscored" title="Not scored yet">–/5</Chip>;
  const kind = score >= 4 ? 'fit-high' : score >= 3 ? 'fit-mid' : 'fit-low';
  return <Chip kind={kind} title={reason}>{score.toFixed(1)}/5</Chip>;
}

function Openings({ data }) {
  const { open, item } = usePanel();
  const openUrl = item?.focus === 'opening' ? item.ref : null;
  const { lastScan } = data.pipeline;
  // Best match first; unscored roles after scored ones, newest posting first.
  const openings = [...data.pipeline.openings].sort((a, b) => a.shelved - b.shelved || (b.score ?? -1) - (a.score ?? -1) || b.posted.localeCompare(a.posted));
  const unscored = openings.filter((o) => o.score == null).length;
  const [busy, setBusy] = useState('');
  const scanning = busy === 'scan' || data.scanning;
  const act = (action) => async () => {
    setBusy(action);
    try {
      const r = await post(action);
      if (action === 'scan' && !r.ranked) showToast(`Scan finished, but scoring failed: ${r.rankNote}`, 'bad');
      else showToast(action === 'scan' ? 'Scan finished and new roles scored' : 'Roles scored');
    } catch (e) {
      showToast(e.message, 'bad');
    } finally {
      setBusy('');
    }
  };
  const when = lastScan && new Date(lastScan.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Section id="openings" title="New openings" count={openings.length}
      aside={lastScan ? `Last scan ${when} · ${lastScan.found} jobs from ${lastScan.companies} companies + ${lastScan.boards} job boards · ${lastScan.added} new` : 'Not scanned yet'}
      action={(
        <span className="check-all">
          {unscored > 0 && !scanning && (
            <button type="button" className="btn" onClick={act('rank')} disabled={Boolean(busy)} title="Quick 0–5 fit score against your CV (uses Claude, up to 20 roles per run)">
              {busy === 'rank' ? 'Scoring…' : `Score ${unscored}`}
            </button>
          )}
          <button type="button" className="btn" onClick={() => open({ kind: 'posts' })} title="Paste a LinkedIn post search: find people hiring">Hiring posts</button>
          <button type="button" className="btn" onClick={act('scan')} disabled={Boolean(busy) || scanning} title="Scan job boards, then score the new roles">{scanning ? 'Scanning…' : 'Scan now'}</button>
        </span>
      )}>
      <div className="group">
        <ul className="list">
          {openings.length === 0 && (
            <Empty>No new matches waiting. Companies without a public job board need a web search: ask Claude to "run the career-ops scan".</Empty>
          )}
          {openings.map((o) => (
            <li key={o.url} className={`row clickable${o.shelved ? ' shelved' : ''}${o.url === openUrl ? ' on' : ''}`} aria-current={o.url === openUrl || undefined} onClick={rowClick(open, { company: o.company, focus: 'opening', ref: o.url })}>
              <FitScore score={o.score} reason={o.reason} />
              <span className="row-main">
                <span className="row-title">{o.company}</span>
                <span className="row-sub"> {o.title}</span>
                {(o.location || o.reason) && <span className="row-note">{[dedupeList(o.location), o.reason].filter(Boolean).join(' · ')}</span>}
                <EvalNote data={data} target={{ url: o.url, opening: true }} />
              </span>
              <span className="row-meta">
                <EvaluateButton data={data} target={{ url: o.url, company: o.company, role: o.title }} />
                {o.shelved && <Chip kind="undated">Shelved</Chip>}
                {!ATS_HOSTS.test(o.host) && <Chip kind="via" title="Found on a job board, not the company's own site: confirm it at the employer before applying">via {o.host.split('.').slice(-2, -1)[0] || o.host}</Chip>}
                {o.posted && <span className="date" title="Posted">{fmtShort(o.posted)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {openings.length > 0 && <p className="muted small hint">Scores are a quick read of the title against your CV. For a full evaluation of a good one (job description, location rules, tailored CV), press Evaluate.</p>}
    </Section>
  );
}

// A page's main section. Each section has its own page now, so the title doesn't fold;
// the groups inside it do.
function Section({ id, title, count, aside, warnAside, action, children }) {
  return (
    <section id={id} className="section">
      <header className="section-head">
        <h2>{title}{count != null && <span className="count">{count}</span>}</h2>
        {aside && <span className={warnAside ? 'section-aside warn' : 'section-aside'}>{aside}</span>}
        {action && <span className="section-action">{action}</span>}
      </header>
      {children}
    </section>
  );
}


// ── Routing: #/home (default), #/applications, #/openings, #/outreach[/tier-N], #/week ──

const PAGES = ['home', 'applications', 'openings', 'outreach', 'week'];

function useRoute() {
  const read = () => {
    const [page = 'home', sub = ''] = window.location.hash.replace(/^#\/?/, '').split('/');
    return { page: PAGES.includes(page) ? page : 'home', sub };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // A tier link (#/outreach/tier-2) scrolls to that tier's group once the page renders.
  useEffect(() => {
    if (!route.sub) return;
    const t = setTimeout(() => document.getElementById(`group-${route.sub}`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [route]);
  return route;
}

// ── Icon rail (Fabric) ───────────────────────────────────────────────────

const NAV_ICONS = { home: Home02, applications: Briefcase01, openings: SearchMd, outreach: Send01, week: Calendar };
const NavIcon = ({ id }) => {
  const Icon = NAV_ICONS[id];
  return <Icon size={18} strokeWidth={1.75} />;
};

function Rail({ data, page, stale = false }) {
  const apps = data?.applications;
  const counts = {
    home: data ? data.due.length + data.undated.length : 0,
    applications: apps?.ok ? apps.rows.length + apps.untracked.length : 0,
    openings: data?.pipeline.openings.length ?? 0,
    outreach: data ? data.outreach.tiers.reduce((n, t) => n + t.companies.length, 0) : 0,
  };
  const labels = { home: 'Home', applications: 'Applications', openings: 'New openings', outreach: 'Outreach', week: 'This week' };
  return (
    <nav className="rail" aria-label="Pages">
      <a href="#/home" className="rail-logo" title="Home" aria-label="Home">
        <WeekMark />
      </a>
      {PAGES.map((id) => (
        <a key={id} href={`#/${id}`} className={page === id ? 'rail-item on' : 'rail-item'} aria-label={labels[id]} aria-current={page === id ? 'page' : undefined}>
          <NavIcon id={id} />
          <span className="rail-label">{labels[id]}</span>
          {counts[id] > 0 && <span className={id === 'home' ? 'rail-count due' : 'rail-count'}>{counts[id]}</span>}
          {id === 'home' && counts.home > 0 && <span className="rail-badge due">{counts.home}</span>}
          {id !== 'home' && counts[id] > 0 && <span className="rail-badge">{counts[id]}</span>}
        </a>
      ))}
      <span className="rail-spacer" />
      {stale && <span className="live off" title="Hub server stopped: showing the last data" role="status" aria-label="Hub server stopped" />}
    </nav>
  );
}

// ── Command bar (⌘K): search everything, or send the text to Claude ─────────

function searchIndex(data) {
  const out = [];
  for (const t of data.outreach.tiers) {
    for (const c of t.companies) {
      out.push({ kind: 'Company', label: c.name, sub: `Tier ${t.tier}${c.base ? ` · ${c.base}` : ''}`, item: { company: c.name, focus: 'company' } });
      for (const p of c.contacts) out.push({ kind: 'Person', label: p.name, sub: [p.title || label(p.relation), c.name].filter(Boolean).join(' · '), item: { company: c.name, focus: 'person', ref: p.name } });
    }
  }
  for (const p of data.outreach.network) out.push({ kind: 'Person', label: p.name, sub: [p.company, label(p.relation)].filter(Boolean).join(' · '), item: { company: p.company || p.name, focus: 'person', ref: p.name } });
  if (data.applications.ok) for (const r of data.applications.rows) out.push({ kind: 'Application', label: `${r.company} · ${r.role}`, sub: r.status, item: { company: r.company, focus: 'app', ref: r.num } });
  for (const o of data.pipeline.openings) out.push({ kind: 'Opening', label: `${o.company} · ${o.title}`, sub: [o.score != null ? `${o.score.toFixed(1)}/5` : '', o.location].filter(Boolean).join(' · '), item: { company: o.company, focus: 'opening', ref: o.url } });
  return out;
}

let focusCommand = () => {};

function CommandBar({ data, compact = false }) {
  const { open } = usePanel();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef(null);
  const index = useMemo(() => searchIndex(data), [data]);
  useEffect(() => {
    focusCommand = () => input.current?.focus();
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const term = q.trim().toLowerCase();
  const hits = term ? index.filter((x) => `${x.label} ${x.sub}`.toLowerCase().includes(term)).slice(0, 7) : [];
  const options = term ? [...hits, { kind: 'Ask', label: `Ask Claude: “${q.trim()}”`, sub: 'Research, update or draft', ask: true }] : [];
  const choose = (o) => {
    if (!o) return;
    if (o.ask) open({ global: true, send: q.trim() }); else open(o.item);
    setQ('');
    input.current?.blur();
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(options[Math.min(sel, options.length - 1)]); }
    if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
  };
  return (
    <div className={compact ? 'cmd compact' : 'cmd'}>
      <div className="cmd-box">
        <SearchMd size={15} />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={compact ? 'Search or ask Claude…' : 'Search companies, people, roles… or tell Claude an update (“Messaged Sam today”)'}
          aria-label="Search or ask Claude" role="combobox" aria-expanded={focused && options.length > 0} aria-controls="cmd-list" />
        <kbd>⌘K</kbd>
      </div>
      {focused && options.length > 0 && (
        <ul className="cmd-list" id="cmd-list" role="listbox">
          {options.map((o, i) => (
            <li key={`${o.kind}-${o.label}`} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setSel(i)}>
              <span className={`cmd-kind kind-${slug(o.kind)}`}>{o.kind}</span>
              <span className="cmd-label">{o.label}</span>
              {o.sub && <span className="cmd-sub">{o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Home: one sentence, then people first ────────────────────────────────

const ACTIVE_APP = (r) => !['rejected', 'discarded', 'skip'].includes(String(r.status).toLowerCase());
const PACE_KEYS = ['warm_messages', 'hiring_manager_messages'];
const countsToPace = (c) => isWarm(c.relation) || c.relation === 'hiring-manager';
const relRank = (c) => (c.relation === 'hiring-manager' ? 0 : isWarm(c.relation) ? 1 : 2);

function HomeHead({ title, count, href, action }) {
  return (
    <h2 className="home-h">
      {href ? <a href={href}>{title} <span className="chev-r">›</span></a> : title}
      {count != null && <span className="count">{count}</span>}
      {action}
    </h2>
  );
}

// What today asks for: follow-ups due, then enough new people to stay on the weekly pace
// (warm + hiring-manager minimum left ÷ days left, today included), then what's already done.
function todayPlan(data) {
  const { today } = data;
  const contacts = [
    ...data.outreach.tiers.flatMap((t) => t.companies.flatMap((c) => c.contacts.map((p) => ({ ...p, company: p.company || c.name, tier: t.tier })))),
    ...data.outreach.network.map((p) => ({ ...p, tier: 9 })),
  ];
  const goal = data.progress.filter((p) => PACE_KEYS.includes(p.key));
  const min = goal.reduce((n, p) => n + p.min, 0);
  const sent = goal.reduce((n, p) => n + p.count, 0);
  const sentToday = contacts.filter((c) => countsToPace(c) && contactDates(c).includes(today)).length;
  const daysLeft = Math.max(1, daysBetween(today, data.week.end) + 1);
  const need = Math.max(0, Math.ceil(Math.max(0, min - sent + sentToday) / daysLeft) - sentToday);

  const hidden = new Set((data.hidden ?? []).map((h) => h.key));
  const due = [
    ...data.due.map((d, i) => ({ key: `d${i}`, hide: `due:${d.who}|${d.company}|${d.date}`, kind: 'due', tick: d.source === 'outreach', first: d.status === 'to-message', name: d.who || d.company, company: d.who ? d.company : '', note: d.action, date: d.date, item: { company: d.company || d.who, focus: d.who ? 'person' : 'company', ref: d.who || undefined } })),
    ...data.undated.map((u, i) => ({ key: `u${i}`, hide: `undated:${u.who}|${u.company}`, kind: 'due', tick: true, name: u.who, company: u.company, note: u.action, date: '', item: { company: u.company || u.who, focus: 'person', ref: u.who } })),
  ];
  const dueNames = new Set(due.map((d) => d.name));
  // Someone pushed to a later day waits until then, and so does everyone not yet messaged
  // at their company: moving one Acme note to the 28th moves all of Acme.
  const held = new Set(contacts.filter((c) => c.status === 'to-message' && c.next_date > today).map((c) => c.company));
  const waiting = contacts
    .filter((c) => c.status === 'to-message' && !lastContacted(c) && !dueNames.has(c.name) && !held.has(c.company))
    .sort((a, b) => a.tier - b.tier || relRank(a) - relRank(b));
  const lonely = (data.outreach.tiers.find((t) => t.tier === 1)?.companies ?? []).filter((c) => c.contacts.length === 0);
  const next = [
    ...waiting.map((c) => ({ key: `n-${c.name}`, hide: `person:${c.name}|${c.company}`, kind: 'next', tick: true, name: c.name, company: c.company, sub: c.title || label(c.relation), note: c.why || c.next_action, hue: TIER_HUE[c.tier], item: { company: c.company || c.name, focus: 'person', ref: c.name } })),
    ...lonely.map((c) => ({ key: `f-${c.name}`, hide: `find:${c.name}`, kind: 'find', name: c.name, company: '', sub: 'nobody here yet', note: c.why, item: { company: c.name, focus: 'company' } })),
  ];
  const done = contacts
    .filter((c) => contactDates(c).includes(today))
    .map((c) => ({ key: `x-${c.name}`, kind: 'done', name: c.name, company: c.company, note: 'messaged today', item: { company: c.company || c.name, focus: 'person', ref: c.name } }));
  const shown = (x) => !hidden.has(x.hide);
  const nextShown = next.filter(shown);
  const removed = [...due, ...next].filter((x) => !shown(x)).map((x) => x.hide);
  return { due: due.filter(shown), next: nextShown.slice(0, need), rest: nextShown.slice(need), done, need, min, sent, removed };
}

function TodayRow({ x, today }) {
  const { open } = usePanel();
  const [leaving, setLeaving] = useState(false);
  // The one orchestrated moment: strike through and fold away (~280ms), then log the message.
  const startLeave = () => new Promise((resolve) => { setLeaving(true); setTimeout(resolve, reducedMotion() ? 0 : 280); });
  const draft = x.kind === 'find' ? `Who should I reach at ${x.name}?`
    : x.kind === 'due' && !x.first ? `Draft a follow-up to ${x.name}${x.company ? ` at ${x.company}` : ''}`
      : `Draft a first message to ${x.name}${x.company ? ` at ${x.company}` : ''}`;
  return (
    <li className={`todo-row clickable${x.kind === 'done' ? ' done' : ''}${leaving ? ' leaving' : ''}`} onClick={rowClick(open, x.item)}>
      {x.kind === 'done'
        ? <span className="check done static" aria-label="Messaged today"><Check size={10} strokeWidth={3.5} /></span>
        : x.tick ? <TickButton name={x.name} company={x.company} onStart={startLeave} onFail={() => setLeaving(false)} /> : <span className="check static" title={x.kind === 'find' ? 'Find a person first' : "Application follow-up: tell Claude when it's sent"} />}
      <Avatar name={x.name} large hue={x.kind === 'find' ? 'grey' : undefined} />
      <span className="row-main">
        <span className="row-title">{x.kind === 'find' ? `Find someone at ${x.name}` : x.name}</span>
        {x.kind !== 'find' && (x.sub || x.company) && <span className="row-sub"> · {[x.sub, x.company].filter(Boolean).join(' · ')}</span>}
        {x.note && <span className="row-note">{x.note}</span>}
      </span>
      {x.kind === 'due' && <DueChip date={x.date} today={today} />}
      {x.kind !== 'done' && (
        <button type="button" className="btn btn-sm row-draft" onClick={() => open(x.kind === 'find' ? { kind: 'find', company: x.name } : { ...x.item, send: draft })}>
          {x.kind === 'find' ? 'Find' : 'Draft'}
        </button>
      )}
      {x.hide && <HideButton label={`Remove ${x.kind === 'find' ? `“Find someone at ${x.name}”` : x.name} from your list`} onClick={() => hideItem(x.hide, x.kind === 'find' ? `Find someone at ${x.name}` : x.name)} />}
    </li>
  );
}

function TodayList({ data, plan }) {
  const { open } = usePanel();
  const { due, next, done, rest, removed } = plan;
  const [ahead, setAhead] = useState(0); // extra people shown on request, 3 at a time
  const [showDone, setShowDone] = useState(false);
  const extra = rest.slice(0, ahead);
  const empty = due.length + next.length === 0;
  // Done for the day: Today stays first but shrinks to one line (get ahead · done today).
  const compact = empty && extra.length === 0;
  const doneToggle = done.length > 0 && (
    <button type="button" className="linkish done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
      Done today <span>{plural(done.length, 'person')} · {showDone ? 'hide' : 'show'}</span>
    </button>
  );
  return (
    <section className="home-block">
      <HomeHead title="Today" count={due.length + next.length} />
      <ul className="todo">
        {due.length > 0 && <li className="todo-sub">Follow-ups</li>}
        {due.map((x) => <TodayRow key={x.key} x={x} today={data.today} />)}
        {next.length > 0 && <li className="todo-sub">Next up <span>to stay on pace this week</span></li>}
        {next.map((x) => <TodayRow key={x.key} x={x} today={data.today} />)}
        {extra.length > 0 && <li className="todo-sub">Getting ahead</li>}
        {extra.map((x) => <TodayRow key={x.key} x={x} today={data.today} />)}
        {compact && (rest.length > 0 || done.length > 0) && (
          <li className="today-line">
            {rest.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => setAhead(3)}>
                Get ahead: show {Math.min(3, rest.length)} {rest.length === 1 ? 'person' : 'people'} to message
              </button>
            )}
            {rest.length > 0 && <span className="muted small">{plural(rest.length, 'person')} you haven't messaged yet</span>}
            <span className="grow" />
            {doneToggle}
          </li>
        )}
        {!compact && rest.length > ahead && (
          <li className="todo-more">
            <button type="button" className="btn btn-sm" onClick={() => setAhead((n) => n + 3)}>
              {ahead === 0 && empty ? 'Get ahead: ' : ''}show {Math.min(3, rest.length - ahead)} more {rest.length - ahead === 1 ? 'person' : 'people'} to message
            </button>
            <span className="muted small">{plural(rest.length - ahead, 'person')} you haven't messaged yet</span>
          </li>
        )}
        {removed.length > 0 && (
          <li className="todo-hidden muted small">
            {plural(removed.length, 'item')} removed by hand · <button type="button" className="linkish" onClick={() => unhideItems(removed, `${plural(removed.length, 'item')} back in Today`)}>Show {removed.length === 1 ? 'it' : 'them'} again</button>
          </li>
        )}
        {!compact && done.length > 0 && <li className="todo-sub">{doneToggle}</li>}
        {done.length > 0 && showDone && (
          <li className="done-strip">
            {done.map((x) => (
              <button key={x.key} type="button" className="done-chip" onClick={() => open(x.item)} title={`${x.name}${x.company ? ` · ${x.company}` : ''}: messaged today`}>
                <Avatar name={x.name} /><span>{x.name}</span>
              </button>
            ))}
          </li>
        )}
      </ul>
    </section>
  );
}

// The headline says what matters today in one sentence.
function Headline({ plan }) {
  const n = plan.due.length + plan.next.length;
  const week = <p className="lede">{plan.sent} of {plan.min} messages this week.</p>;
  if (n > 0) return <><h1 className="headline"><em>{plural(n, 'person')}</em> to reach today.</h1>{week}</>;
  return <><h1 className="headline is-done">Done for today.</h1>{week}</>;
}

// Applications with nobody attached: the thread is broken until a person is added.
function NoPersonList({ apps: all, today, hidden }) {
  const { open } = usePanel();
  const apps = all.filter((r) => !hidden.has(`nohuman:${r.company}|${r.role}`));
  if (apps.length === 0) return null;
  return (
    <section className="home-block">
      <HomeHead title="No person yet" count={apps.length} href="#/applications" />
      <ul className="list">
        {apps.map((r) => (
          <li key={`${r.num ?? 'u'}-${r.company}-${r.role}`} className="row row-app clickable" onClick={rowClick(open, { company: r.company, focus: 'app', ref: r.num ?? `u:${r.role}` })}>
            <span className="row-main"><span className="row-title">{r.company}</span><span className="row-sub"> {r.role}</span></span>
            <span className="row-meta">{r.channel && <Chip kind={r.channel}>{label(r.channel)}</Chip>}</span>
            <Thread contact={r.contact} channel={r.channel} age={appAge(r, today)} onAttach={() => open(attachItem(r))} />
            <HideButton label={`Remove ${r.company} from this list`} onClick={() => hideItem(`nohuman:${r.company}|${r.role}`, r.company)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeekBars({ data, onOpen }) {
  return (
    <div className="wk-list">
      {data.progress.map((p) => {
        const hit = p.count >= p.min;
        const body = (
          <>
            <span className="wk-label">{p.label}</span>
            <span className="wk-count"><b>{p.count}{p.unit ?? ''}</b> / {targetText(p)}{p.unit ?? ''}{hit && <span className="wk-done" title="Target hit"> <Check size={13} strokeWidth={2.5} className="ico-inline" /></span>}</span>
            <Segments p={p} />
          </>
        );
        return onOpen
          ? <button key={p.key} type="button" className={`wk hue-${METRIC_HUE[p.key] ?? 'grey'}`} title={p.note} onClick={() => onOpen(p)}>{body}</button>
          : <div key={p.key} className={`wk hue-${METRIC_HUE[p.key] ?? 'grey'}`} style={{ cursor: 'default' }} title={p.note}>{body}</div>;
      })}
    </div>
  );
}

function WeekSide({ data }) {
  const { open } = usePanel();
  const { hit } = weekStats(data.progress);
  return (
    <section className="home-block">
      <HomeHead title={`Week ${data.week.id.slice(-2)}`} count={`${hit}/${data.progress.length}`} href="#/week" />
      <WeekBars data={data} onOpen={(p) => open({ kind: 'metric', key: p.key })} />
    </section>
  );
}

function BestOpenings({ data }) {
  const { open } = usePanel();
  const [busy, run] = useScan();
  const scanning = busy || data.scanning;
  const top = data.pipeline.openings.filter((o) => !o.shelved).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 3);
  return (
    <section className="home-block">
      <HomeHead title="Best new openings" href="#/openings" count={data.pipeline.openings.length} />
      {top.length === 0 && <p className="home-empty">Nothing new waiting. <button type="button" className="linkish" onClick={run} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan now'}</button></p>}
      <ul className="list">
        {top.map((o) => (
          <li key={o.url} className="row clickable" onClick={rowClick(open, { company: o.company, focus: 'opening', ref: o.url })}>
            <FitScore score={o.score} reason={o.reason} />
            <span className="row-main">
              <span className="row-title">{o.company}</span><span className="row-sub"> {o.title}</span>
              {o.location && <span className="row-note">{dedupeList(o.location)}</span>}
              <EvalNote data={data} target={{ url: o.url, opening: true }} />
            </span>
            <span className="row-meta"><EvaluateButton data={data} target={{ url: o.url, company: o.company, role: o.title }} /></span>
            {o.posted && <span className="date">{fmtShort(o.posted)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OutreachTiers({ data }) {
  const { open } = usePanel();
  const { network } = data.outreach;
  const nextNet = network.map((p) => p.next_date).filter(Boolean).sort()[0];
  return (
    <section className="home-block tiles-block">
      <HomeHead title="Outreach" href="#/outreach" />
      <div className="spaces">
        {data.outreach.tiers.map((t) => {
          const notReached = t.companies.filter((c) => !c.contacts.some((p) => lastContacted(p))).length;
          const talking = t.companies.filter((c) => c.status === 'in-conversation').length;
          return (
            <button key={t.tier} type="button" className={`space hue-${TIER_HUE[t.tier] ?? 'grey'}${t.tier === 1 ? ' solid' : ''}`} onClick={() => open({ kind: 'tier', tier: t.tier })}>
              <span className="space-k">Tier {t.tier} · {plural(t.companies.length, 'company')}</span>
              <b>{TIER_SHORT[t.tier]}</b>
              <span className="space-n">
                {talking > 0 && <><strong>{talking}</strong> in conversation · </>}
                {notReached > 0 ? <><strong>{notReached}</strong> not reached</> : 'all reached'}
              </span>
            </button>
          );
        })}
        <button type="button" className="space hue-amber" onClick={() => open({ kind: 'network' })}>
          <span className="space-k">Network</span>
          <b>{plural(network.length, 'person')}</b>
          <span className="space-n">{nextNet ? <>next follow-up <strong>{fmtDay(nextNet)}</strong></> : 'no follow-ups set'}</span>
        </button>
      </div>
    </section>
  );
}

function useScan() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    showToast('Scanning job boards… this takes a minute or two');
    try {
      const r = await post('scan');
      showToast(r.ranked ? 'Scan finished and new roles scored' : `Scan finished, but scoring failed: ${r.rankNote}`, r.ranked ? 'ok' : 'bad');
    } catch (e) {
      showToast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

const TIER_SHORT = TIER_NAMES;

// No file for this week yet (CLAUDE.md §7): one tap sends "start a new week" to Claude, which
// sums up last week and sets up this week's checkboxes.
function NewWeekNotice() {
  const { open } = usePanel();
  return (
    <div className="notice new-week" role="status">
      <span>New week: say “start a new week”.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => open({ global: true, send: 'Start a new week' })}>Start a new week</button>
    </div>
  );
}

function Home({ data }) {
  const apps = data.applications;
  const noPerson = [...(apps.ok ? apps.rows.filter(ACTIVE_APP) : []), ...apps.untracked].filter((r) => !r.contact);
  const plan = todayPlan(data);
  return (
    <div className="home">
      <header className="hello">
        <p className="eyebrow">{fmtDay(data.today)} · Week {data.week.id.slice(-2)} · {plural(Math.max(0, daysBetween(data.today, data.week.end)), 'day')} left</p>
        <Headline plan={plan} />
      </header>
      {!data.week.fileExists && <NewWeekNotice />}
      <div className="home-grid">
        <div className="home-main">
          <TodayList data={data} plan={plan} />
          <NoPersonList apps={noPerson} today={data.today} hidden={new Set((data.hidden ?? []).map((h) => h.key))} />
          <BestOpenings data={data} />
          <OutreachTiers data={data} />
        </div>
        <aside className="home-side" aria-label="This week">
          <WeekSide data={data} />
        </aside>
      </div>
    </div>
  );
}

// ── This week: progress + insights (Todoist) ─────────────────────────────

// Health, at risk, messages by day, funnel by channel. Shown on Home (right column) and This week.
function Insights({ data, compact = false }) {
  const { open } = usePanel();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = parseDay(data.week.start);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }) };
  });
  const contacts = allContacts(data);
  const perDay = days.map((d) => contacts.reduce((n, c) => n + contactDates(c).includes(d.iso), 0));
  const max = Math.max(1, ...perDay);
  const apps = data.applications;
  const all = apps.ok ? [...apps.rows, ...apps.untracked.map((u) => ({ ...u, status: 'untracked' }))] : apps.untracked;
  const channels = ['referral', 'hiring-manager', 'recruiter-inbound', 'cold'].map((ch) => ({
    ch,
    n: all.filter((r) => r.channel === ch).length,
    moving: all.filter((r) => r.channel === ch && ['responded', 'assessment', 'interview', 'offer', 'hired'].includes(String(r.status).toLowerCase())).length,
  }));
  const chMax = Math.max(1, ...channels.map((c) => c.n));
  const noHuman = all.filter((r) => !r.contact);
  const oldest = Math.max(0, ...noHuman.map((r) => appAge(r, data.today) ?? 0));
  const tier1 = data.outreach.tiers.find((t) => t.tier === 1)?.companies ?? [];
  const notReached = tier1.filter((c) => !c.contacts.some((p) => lastContacted(p))).length;
  const { hit } = weekStats(data.progress);
  const daysLeft = Math.max(0, daysBetween(data.today, data.week.end));
  const health = hit >= 3 ? ['ok', 'On track'] : daysLeft <= 2 ? ['bad', 'Behind, week nearly over'] : ['warn', 'Behind on messages and applications'];
  const openNoHuman = () => (noHuman.length === 1 && noHuman[0].num
    ? open({ company: noHuman[0].company, focus: 'app', ref: noHuman[0].num })
    : open({ kind: 'metric', key: 'applications' }));
  return (
    <div className="insights">
      {!compact && <button type="button" className="ins-card" onClick={() => { window.location.hash = '#/week'; }}>
        <span className="ins-k">Health <span className="muted small">· {plural(daysLeft, 'day')} left</span></span>
        <span className="ins-v"><span className={`dot dot-${health[0]}`} />{health[1]}</span>
        <span className="muted small">{hit} of {data.progress.length} weekly targets hit</span>
      </button>}
      {!compact && <div className="ins-card"><span className="ins-k">At risk</span>
        {noHuman.length > 0 && <button type="button" className="ins-v warn linkish" onClick={openNoHuman}>{plural(noHuman.length, 'application')} with no person{oldest > 0 ? `, oldest ${plural(oldest, 'day')}` : ''}</button>}
        {notReached > 0 && <button type="button" className="ins-v muted small linkish" onClick={() => open({ kind: 'tier', tier: 1 })}>{plural(notReached, 'tier-1 company')} not reached out</button>}
        {!noHuman.length && !notReached && <span className="ins-v muted">Nothing at risk</span>}
      </div>}
      <div className="ins-card"><span className="ins-k">Messages by day</span>
        <div className="days">{days.map((d, i) => (
          <div key={d.iso} className={d.iso === data.today ? 'today' : ''} title={`${fmtDay(d.iso)}: ${perDay[i]}`}>
            <i style={{ height: `${(perDay[i] / max) * 100}%` }} />{d.label}
          </div>
        ))}</div>
      </div>
      <div className="ins-card"><span className="ins-k">Funnel by channel</span>
        <div className="funnel">{channels.map((c) => (
          <div key={c.ch} title={`${c.n} applications, ${c.moving} past "Applied"`}>
            <span>{label(c.ch)}</span>
            <span className={`bar hue-${CHANNEL_HUE[c.ch] ?? 'grey'}`}><span className="bar-fill" style={{ width: `${(c.n / chMax) * 100}%` }} /></span>
            <span className="tabnum">{c.n}</span>
          </div>
        ))}</div>
        <span className="muted small">Replies → screens → onsites per channel comes in after ~2 weeks of data.</span>
      </div>
    </div>
  );
}

function WeekPage({ data }) {
  const daysLeft = Math.max(0, daysBetween(data.today, data.week.end));
  return (
    <div className="week-page">
      <header className="page-head"><h1>This week</h1><span className="muted">{data.week.id.replace(/^\d{4}-/, '')} · {fmtShort(data.week.start)} – {fmtShort(data.week.end)} · {plural(daysLeft, 'day')} left</span></header>
      <div className="week-grid">
        <ThisWeek data={data} />
        <Insights data={data} />
      </div>
    </div>
  );
}

// ── Side panel: the item, its people and notes, and a chat with Claude ──────

// Company names match without case, spaces or punctuation: a job board's "Blue Sky Labs" is the
// "BlueSky Labs" people were saved under.
const coKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const sameCo = (a, b) => coKey(a) !== '' && coKey(a) === coKey(b);

function findCompany(data, name) {
  for (const t of data.outreach.tiers) {
    const c = t.companies.find((x) => sameCo(x.name, name));
    if (c) return c;
  }
  return null;
}

function panelContext(data, item) {
  if (!item || item.global) return null;
  const name = item.company;
  const company = findCompany(data, name);
  const apps = data.applications.ok ? data.applications.rows.filter((r) => sameCo(r.company, name)) : [];
  const untracked = data.applications.untracked.filter((u) => sameCo(u.company, name));
  const openings = data.pipeline.openings.filter((o) => sameCo(o.company, name));
  // Everyone saved at this company, also when it isn't on the outreach list (they sit under Network).
  const people = allContacts(data).filter((p) => sameCo(p.company, name));
  const person = item.focus === 'person' ? allContacts(data).find((c) => c.name === item.ref) : null;
  const notes = data.notes?.[noteSlug(name)] ?? [];
  return { company, apps, untracked, openings, people, person, notes, focus: item.focus, ref: item.ref, name };
}

// A short name for a panel view, used on the Back button.
// One chat per job: General (questions), Log (what you did), one per company (people share
// their company's chat), Tailor CV per company, one per week target, tiers and network.
const LOG_CONTEXT = { chat: 'log', note: 'The user is logging what they did (messages sent, replies, intros, drops). Apply the update rules in CLAUDE.md §12 and confirm each change in one short line. No research, no drafts unless they ask.' };

function chatFor(item) {
  if (item.thread) return item.thread;
  if (item.log) return 'log';
  if (item.global) return 'global';
  return `co-${noteSlug(item.company)}`;
}

// A chat id (its file name) → a name to show and the panel item that reopens it.
function describeChat(data, id) {
  const week = data.week.id;
  const names = [
    ...data.outreach.tiers.flatMap((t) => t.companies.map((c) => c.name)),
    ...data.outreach.network.map((p) => p.company || p.name),
    ...(data.applications.ok ? data.applications.rows.map((r) => r.company) : []),
    ...data.applications.untracked.map((u) => u.company),
    ...data.pipeline.openings.map((o) => o.company),
  ];
  const company = (slugPart) => names.find((n) => noteSlug(n) === slugPart) ?? slugPart.replace(/-/g, ' ');
  if (id === 'global') return { name: 'General', item: { global: true } };
  if (id === 'log') return { name: 'Log', item: { global: true, log: true } };
  if (id.startsWith('co-')) { const c = company(id.slice(3)); return { name: c, item: { company: c, focus: 'company' } }; }
  if (id.startsWith('cv-')) { const c = company(id.slice(3)); return { name: `Tailor CV · ${c}`, item: { company: c, focus: 'cv' } }; }
  if (id.startsWith('tier-')) return { name: `Tier ${id.slice(5)}`, item: { kind: 'tier', tier: Number(id.slice(5)) } };
  if (id === 'network') return { name: 'Network', item: { kind: 'network' } };
  const m = id.match(/^week-(\d{4}-W\d{2})(?:-(.+))?$/);
  if (m) {
    const label = `Week ${m[1].slice(-2)}`;
    const metric = m[2] && data.progress.find((p) => p.key === m[2]);
    if (metric && m[1] === week) return { name: `${label} · ${metric.label}`, item: { kind: 'metric', key: metric.key } };
    const name = m[2] ? `${label} · ${m[2].replace(/_/g, ' ')}` : `${label}, before the split`;
    return { name, item: { global: true, thread: id, title: name } };
  }
  return { name: id, item: { global: true, thread: id, title: id } };
}

function panelLabel(data, item) {
  if (!item) return '';
  if (item.global) return item.title ?? (item.log ? 'Log' : 'General');
  if (item.kind === 'metric') return data.progress.find((p) => p.key === item.key)?.label ?? 'This week';
  if (item.kind === 'tier') return `Tier ${item.tier}`;
  if (item.kind === 'network') return 'Network';
  if (item.kind === 'alumni') return 'Find ex-colleagues';
  if (item.kind === 'people') return `Find people at ${item.company}`;
  if (item.kind === 'find') return `Who to contact at ${item.company}`;
  if (item.kind === 'posts') return 'Hiring posts';
  if (item.focus === 'person') return item.ref;
  return item.company;
}

const sameItem = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Inside the panel, opening something pushes it onto the panel's history (so Back works);
// on the main page, opening something starts a fresh history (see App).
function SidePanel({ data, stack, setStack, onClose }) {
  const item = stack.at(-1);
  const prev = stack.length > 1 ? stack.at(-2) : null;
  const inner = useMemo(() => ({
    item,
    open: (next) => setStack((st) => (!next ? [] : sameItem(st.at(-1), next) ? st : [...st, next])),
  }), [item, setStack]);
  const back = prev ? { label: panelLabel(data, prev), go: () => setStack((st) => st.slice(0, -1)) } : null;
  const key = item.kind ? `k-${item.kind}-${item.key ?? item.tier ?? ''}` : item.global ? `g-${chatFor(item)}-${item.send ?? ''}-${item.draft ?? ''}` : `${item.company}-${item.focus}-${item.ref ?? ''}`;
  return (
    <PanelContext.Provider value={inner}>
      {item.kind === 'alumni'
        ? <AlumniPanel key={key} onClose={onClose} back={back} />
        : item.kind === 'posts'
        ? <PostsPanel key={key} onClose={onClose} back={back} />
        : item.kind === 'people'
        ? <PeoplePanel key={key} data={data} company={item.company} onClose={onClose} back={back} />
        : item.kind === 'find'
        ? <FindPanel key={key} company={item.company} onClose={onClose} back={back} />
        : item.kind
        ? <OverviewPanel key={key} data={data} item={item} onClose={onClose} back={back} />
        : item.global
          ? <ChatHubPanel key={key} data={data} item={item} onClose={onClose} back={back} />
          : <ItemPanel key={key} data={data} item={item} onClose={onClose} back={back} />}
    </PanelContext.Provider>
  );
}

function BackButton({ back }) {
  if (!back) return null;
  return (
    <button type="button" className="back-btn" onClick={back.go} title={`Back to ${back.label}`}>
      <ChevronLeft size={14} strokeWidth={2.25} />
      <span>{back.label}</span>
    </button>
  );
}

// The context a chat runs with, from its id (same as when it's opened from its own panel).
function chatContext(data, id, item) {
  if (id === 'log') return LOG_CONTEXT;
  if (item.kind === 'metric') return { metric: data.progress.find((p) => p.key === item.key), week: data.week };
  if (item.kind === 'tier') {
    const t = data.outreach.tiers.find((x) => x.tier === item.tier);
    return t ? { tier: t.tier, companies: t.companies.map((c) => ({ name: c.name, status: c.status, people: c.contacts.map((p) => `${p.name} (${p.status})`) })) } : null;
  }
  if (item.kind === 'network') return { network: data.outreach.network };
  if (item.company) return panelContext(data, { company: item.company, focus: 'company' });
  return null;
}

// "19 min ago", "3 h ago", "yesterday", else the date.
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return h < 48 ? 'yesterday' : fmtShort(String(iso).slice(0, 10));
}

// General / Log / older chats, ElevenLabs-style: one conversation at a time; the history
// button swaps it for the list of all chats (General and Log first), and picking one
// opens it here with the right context. Company / week chats offer their own panel.
const agoShort = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'now' : min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
};
// Two letters that tell chats apart when the list is folded: An(thropic) vs Ad(yen), W43, CV.
const chatMark = (name) => {
  if (name.startsWith('Tailor CV')) return 'CV';
  const week = name.match(/^Week (\d+)/);
  if (week) return `W${week[1]}`;
  const w = name.replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return (w.slice(0, 1).toUpperCase() + w.slice(1, 2).toLowerCase()) || '·';
};
// Sidebar logo: the week as seven dots around a disc (Monday at the top, clockwise),
// today's dot in the accent colour. The other dots are cut out of the disc.
function weekDots() {
  const today = (new Date().getDay() + 6) % 7;
  const dots = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * 2 * Math.PI - Math.PI / 2;
    return { i, x: +(12 + 6.3 * Math.cos(a)).toFixed(2), y: +(12 + 6.3 * Math.sin(a)).toFixed(2) };
  });
  return { today, dots, t: dots[today] };
}

function WeekMark() {
  const { today, dots, t } = weekDots();
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <mask id="week-mark-cut">
        <rect width="24" height="24" fill="#fff" />
        {dots.map((d) => <circle key={d.i} cx={d.x} cy={d.y} r={d.i === today ? 2.6 : 1.5} fill="#000" />)}
      </mask>
      <circle cx="12" cy="12" r="11" fill="currentColor" mask="url(#week-mark-cut)" />
      <circle cx={t.x} cy={t.y} r="1.9" fill="var(--signal)" />
    </svg>
  );
}

// The same mark as the tab icon. A favicon can't read the page's CSS variables, so the ink and
// accent colours are written in, with a dark-mode pair. The dots are a little bigger so they
// still show at 16px. Redrawn every few minutes so today's dot moves at midnight.
function useWeekFavicon() {
  useEffect(() => {
    const link = document.querySelector('link[rel="icon"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/svg+xml' }));
    const draw = () => {
      const { today, dots, t } = weekDots();
      const cuts = dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.i === today ? 3 : 1.8}" fill="#000"/>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.ink{fill:#191918}.sig{fill:#e32d14}@media (prefers-color-scheme:dark){.ink{fill:#d4d4d4}.sig{fill:#ff6b55}}</style><mask id="m"><rect width="24" height="24" fill="#fff"/>${cuts}</mask><circle class="ink" cx="12" cy="12" r="12" mask="url(#m)"/><circle class="sig" cx="${t.x}" cy="${t.y}" r="2.2"/></svg>`;
      link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };
    draw();
    const id = setInterval(draw, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
}

// A company chat shows the company's logo (served from hub-data/logos); anything else, or a
// company without one, shows the two-letter mark.
// Favicons come with different amounts of empty margin (some brands' icons are tiny, others fill their box).
// Crop each to the square around its visible pixels so they all read at the same size. Icons the
// browser loads from another site can't be read back (canvas security), so those stay as they are.
const trimmed = new Map();
function trimLogo(src) {
  if (!trimmed.has(src)) {
    trimmed.set(src, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || 64;
          const h = img.naturalHeight || 64;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0, w, h);
          const px = g.getImageData(0, 0, w, h).data;
          let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
          for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
              const i = (y * w + x) * 4;
              const blank = px[i + 3] < 24 || (px[i] > 246 && px[i + 1] > 246 && px[i + 2] > 246);
              if (!blank) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            }
          }
          if (x1 < 0) { resolve(src); return; }
          const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
          const out = document.createElement('canvas');
          out.width = side; out.height = side;
          // shift the source so the visible box lands centred in the square
          out.getContext('2d').drawImage(c, (side - (x1 - x0 + 1)) / 2 - x0, (side - (y1 - y0 + 1)) / 2 - y0);
          resolve(out.toDataURL('image/png'));
        } catch { resolve(src); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    }));
  }
  return trimmed.get(src);
}

function ChatMark({ name, company }) {
  const src = company ? `/api/logo?company=${encodeURIComponent(company)}` : '';
  const [logo, setLogo] = useState(undefined); // undefined = loading, null = none
  useEffect(() => {
    let alive = true;
    if (src) trimLogo(src).then((u) => alive && setLogo(u));
    return () => { alive = false; };
  }, [src]);
  const mark = chatMark(name);
  if (src && logo !== null) {
    return <span className="chat-side-mark logo">{logo && <img src={logo} alt="" />}</span>;
  }
  return <span className={mark.length > 2 ? 'chat-side-mark long' : 'chat-side-mark'}>{mark}</span>;
}
const stored = (k, fallback) => { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

function ChatHubPanel({ data, item, onClose, back }) {
  const { open } = usePanel();
  usePanelEscape(onClose);
  const first = chatFor(item);
  const [active, setActive] = useState(first);
  const [threads, setThreads] = useState([]);
  // Other chats down the left: a narrow list that folds to two-letter marks; hovering the
  // folded list slides it open over the chat (like the rail).
  const [folded, setFoldedState] = useState(() => stored('hub:chat-side-folded', '') === '1');
  const setFolded = (v) => { setFoldedState(v); store('hub:chat-side-folded', v ? '1' : ''); };
  const { unseen } = useReplies();
  const fresh = new Set(unseen.map((u) => u.thread));
  const pick = setActive;
  useEffect(() => {
    let alive = true;
    fetch('/api/chats').then((r) => r.json()).then((d) => alive && setThreads(d.threads ?? [])).catch(() => {});
    return () => { alive = false; };
  }, [data.generatedAt, active]);
  const byId = Object.fromEntries(threads.map((t) => [t.thread, t]));
  const cur = describeChat(data, active);
  const linked = !cur.item.global; // a company / week / tier chat: offer its own panel
  const sub = active === 'log' ? 'What you did, in plain words'
      : active === 'global' ? 'Questions about your whole search'
        : linked ? 'Chat' : 'Older chat, kept for reference';
  // General and Log first, then every other chat, latest message first.
  const recent = [
    { thread: 'global', ...byId.global },
    { thread: 'log', ...byId.log },
    ...threads.filter((t) => t.thread !== 'global' && t.thread !== 'log').sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? ''))),
  ];
  const conversation = (
    <>
      {linked && (
        <div className="hub-ctx">
          <span>Chat about <b>{cur.name}</b></span>
          <button type="button" className="linkish" onClick={() => open(cur.item)}>Open {cur.item.kind === 'metric' ? 'the target' : cur.name} <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></button>
        </div>
      )}
      <Chat key={active} thread={active} context={chatContext(data, active, cur.item)}
        initial={active === first ? item.send : undefined} initialDraft={active === first ? item.draft : ''} title=""
        hints={active === 'log' ? [] : null}
        intro={active === 'log' ? 'For example: “Messaged Sam today, follow up Monday”, “Alex replied”, “Sam introduced me to Priya at Acme”, “drop Jordan”.' : ''}
        placeholder={active === 'log' ? 'What did you do? e.g. “Messaged Priya at Acme today”' : ''} />
    </>
  );
  return (
    <aside className="panel" aria-label={cur.name}>
      <PanelHeader onClose={onClose} back={back} title={cur.name} sub={sub} />
      {(
        <div className={folded ? 'chat-split folded' : 'chat-split'}>
          <nav className="chat-side" aria-label="Chats">
            <button type="button" className="chat-fold" onClick={() => setFolded(!folded)} title={folded ? 'Keep the list open' : 'Fold the list'} aria-label={folded ? 'Show chat names' : 'Fold the chat list'}>{folded ? <ChevronRightDouble size={16} /> : <ChevronLeftDouble size={16} />}</button>
            <ul>
              {recent.map((t) => {
                const { name } = describeChat(data, t.thread);
                return (
                  <li key={t.thread}>
                    <button type="button" className={t.thread === active ? 'chat-side-item on' : 'chat-side-item'} onClick={() => pick(t.thread)} title={t.last ?? ''}>
                      <ChatMark name={name} company={/^(co|cv)-/.test(t.thread) ? name.replace(/^Tailor CV · /, '') : ''} />
                      <span className="chat-side-name">{name}</span><span className="chat-side-at">{t.at ? agoShort(t.at) : ''}</span>
                      {fresh.has(t.thread) && <span className="chat-new" aria-label="New answer" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="chat-main">{conversation}</div>
        </div>
      )}
    </aside>
  );
}

function usePanelEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !e.target.closest('input, textarea')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

// Tabs along the top of the drawer; each tab gets the full height below.
function PanelTabs({ tab, setTab, items }) {
  return (
    <nav className="panel-tabs" role="tablist">
      {items.map(([key, label, count]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'panel-tab on' : 'panel-tab'} onClick={() => setTab(key)}>
          {label}{count ? <span className="count">{count}</span> : null}
        </button>
      ))}
    </nav>
  );
}

// The drawer header: close, back, what this is (name + one line), tier.
function PanelHeader({ onClose, back, title, sub, tier, lead = null, trail = null }) {
  const grab = useHeaderDrag();
  return (
    <header className="panel-top" onPointerDown={grab}>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel"><XClose size={18} /></button>
      {lead}
      <BackButton back={back} />
      <div className="panel-title">
        <h2>{title}</h2>
        {sub && <span className="panel-sub">{sub}</span>}
      </div>
      {tier && <span className={`tier-badge hue-${TIER_HUE[tier] ?? 'grey'}`}>T{tier}</span>}
      {trail}
    </header>
  );
}

function ItemPanel({ data, item, onClose, back }) {
  const panel = usePanel();
  const ctx = panelContext(data, item);
  const thread = chatFor(item);
  const focusedApp = ctx && item.focus === 'app' ? (ctx.apps.find((r) => r.num === item.ref) ?? ctx.untracked.find((u) => `u:${u.role}` === item.ref)) : null;
  const focusedOpening = ctx && item.focus === 'opening' ? ctx.openings.find((o) => o.url === item.ref) : null;
  usePanelEscape(onClose);
  const c = ctx?.company;
  const person = item.focus === 'person' ? ctx?.person : null;
  // Details first; straight to Chat when the panel was opened to say something (Draft, attach,
  // Ask Claude), and to Tailor CV when asked for.
  const startTab = item.tab ?? (item.focus === 'cv' ? 'cv' : item.global || item.send || item.draft ? 'chat' : 'details');
  const [tab, setTab] = useState(startTab);
  useEffect(() => { setTab(startTab); }, [thread, item.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = item.global ? (item.title ?? (item.log ? 'Log' : 'General')) : person ? person.name : item.company;
  const sub = item.global
    ? (item.log ? 'What you did, in plain words' : item.thread ? 'Older chat, kept for reference' : 'Questions about your whole search')
    : focusedApp ? focusedApp.role
      : focusedOpening ? focusedOpening.title
        : person ? [person.title || label(person.relation), person.company].filter(Boolean).join(' · ')
          : c?.why;
  const detailCount = ctx ? (c?.contacts.length ?? 0) + ctx.notes.length + ctx.apps.length + ctx.untracked.length : 0;
  const tabs = item.global
    ? null
    : [['details', 'Details', detailCount], ['chat', 'Chat'], ['cv', 'Tailor CV']];

  return (
    <aside className="panel" aria-label={item.global ? title : `${item.company} details`}>
      <PanelHeader onClose={onClose} back={back} title={title} sub={sub} tier={c?.tier} />

      {ctx && (
        <div className="panel-facts">
          {focusedApp && (focusedApp.num ? <StatusSelect row={focusedApp} states={data.appStates} /> : <Chip kind="untracked">Not in tracker yet</Chip>)}
          {focusedApp?.channel && <Chip kind={focusedApp.channel}>{label(focusedApp.channel)}</Chip>}
          {focusedApp && (focusedApp.contact
            ? <span className={`thread hue-${CHANNEL_HUE[focusedApp.channel] ?? 'grey'}`}><Avatar name={focusedApp.contact} hue={CHANNEL_HUE[focusedApp.channel] ?? 'grey'} /><span className="thread-name">{focusedApp.contact}</span></span>
            : <span className="fact-missing"><span className="thread-end" />no person yet</span>)}
          {focusedApp && <LiveChip live={focusedApp.live} />}
          {focusedOpening && <FitScore score={focusedOpening.score} reason={focusedOpening.reason} />}
          {focusedOpening?.location && <span className="fact">{focusedOpening.location}</span>}
          {focusedOpening?.shelved && <Chip kind="undated">Shelved</Chip>}
          {!focusedApp && !focusedOpening && c?.status && <span className="status-label"><StatusIcon status={c.status} size={12} />{label(c.status)}</span>}
          {!focusedApp && !focusedOpening && c?.base && <span className="fact">{c.base}</span>}
          {person?.status && <span className="status-label"><StatusIcon status={person.status} size={12} />{label(person.status)}</span>}
          {c && <OutreachState contacts={c.contacts} />}
          {!c && !person && <span className="fact">Not on your outreach list</span>}
          <span className="grow" />
          {(focusedApp?.url || focusedOpening?.url) && <a className="src" href={focusedApp?.url || focusedOpening?.url} target="_blank" rel="noreferrer noopener">Posting <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></a>}
        </div>
      )}

      {tabs && <PanelTabs tab={tab} setTab={setTab} items={tabs} />}

      {tab === 'details' && ctx && (
        <div className="panel-body">
          {focusedApp && (
            <div className="panel-sec">
              <span className="panel-k">Application</span>
              <p><b>{focusedApp.role}</b></p>
              {focusedApp.notes && <p className="muted small">{focusedApp.notes}</p>}
              <div className="panel-line chips">
                {focusedApp.reportFile
                  ? <a className="btn btn-sm" href={reportHref(focusedApp)} target="_blank" rel="noreferrer noopener">Open report <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></a>
                  : <EvaluateButton data={data} target={{ url: focusedApp.url, num: focusedApp.num, company: focusedApp.company, role: focusedApp.role }} />}
              </div>
              <EvalNote data={data} target={{ url: focusedApp.url, num: focusedApp.num, company: focusedApp.company, role: focusedApp.role }} />
              {!focusedApp.contact && <p className="small signal-text">No person attached yet. Paste their LinkedIn link in the chat, or ask who to reach.</p>}
            </div>
          )}
          {focusedOpening && (
            <div className="panel-sec">
              <span className="panel-k">New opening</span>
              <p><b>{focusedOpening.title}</b></p>
              <p className="muted small">{[focusedOpening.location, focusedOpening.posted && `posted ${fmtShort(focusedOpening.posted)}`].filter(Boolean).join(' · ')}</p>
              {focusedOpening.reason && <p className="small">{focusedOpening.reason}</p>}
              <EvalNote data={data} target={{ url: focusedOpening.url, opening: true }} />
              <div className="panel-line chips">
                <EvaluateButton data={data} target={{ url: focusedOpening.url, company: focusedOpening.company, role: focusedOpening.title }} />
                {focusedOpening.shelved
                  ? <button type="button" className="btn btn-sm" onClick={() => unhideItems([`opening:${focusedOpening.url}`], `${focusedOpening.company}: back in openings`)}>Unshelve</button>
                  : <button type="button" className="btn btn-sm" onClick={() => hideItem(`opening:${focusedOpening.url}`, `${focusedOpening.company} · ${focusedOpening.title}`, 'shelved')} title="Hide from Best openings (kept at the bottom of New openings)">Shelve</button>}
              </div>
            </div>
          )}
          {c && (
            <div className="panel-sec">
              <span className="panel-k">{c.name}</span>
              {c.why && <p>{c.why}</p>}
              <p className="muted small">{[c.base, c.lead_with && `lead with ${LEAD_WITH[c.lead_with] ?? c.lead_with}`, label(c.status)].filter(Boolean).join(' · ')}</p>
            </div>
          )}
          <div className="panel-sec">
            <span className="panel-k">People</span>
            {ctx.people.length > 0
              ? <ul className="people">{ctx.people.map((p) => <ContactRow key={p.name} c={p} today={data.today} inPanel />)}</ul>
              : <p className="muted small">Nobody at {item.company} yet. Paste a LinkedIn link in the chat to add someone.</p>}
            <p className="find-alumni"><button type="button" className="linkish small" onClick={() => panel.open({ kind: 'find', company: item.company })}>Who should I contact at {item.company}? <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></button></p>
            <p className="find-alumni"><button type="button" className="linkish small" onClick={() => panel.open({ kind: 'people', company: item.company })}>Find people at {item.company} on LinkedIn <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></button></p>
          </div>
          {!focusedApp && (ctx.apps.length > 0 || ctx.untracked.length > 0) && (
            <div className="panel-sec">
              <span className="panel-k">Applications</span>
              {ctx.apps.map((r) => <div key={r.num} className="panel-line chips"><StatusSelect row={r} states={data.appStates} /><span>{r.role}</span></div>)}
              {ctx.untracked.map((u) => <div key={u.role} className="panel-line chips"><Chip kind="untracked">Not in tracker</Chip><span>{u.role}</span></div>)}
            </div>
          )}
          <Notes company={item.company} notes={ctx.notes} />
        </div>
      )}

      {tab === 'cv' && ctx && <CvTab key={`cv-${thread}`} data={data} ctx={ctx} />}

      {tab === 'chat' && (
        <Chat key={thread} thread={thread} context={item.log ? LOG_CONTEXT : ctx} initial={item.send} initialDraft={item.draft}
          title=""
          hints={item.log ? [] : null}
          intro={item.log ? 'For example: “Messaged Sam today, follow up Monday”, “Alex replied”, “Sam introduced me to Priya at Acme”, “drop Jordan”.' : ''}
          placeholder={item.log ? 'What did you do? e.g. “Messaged Priya at Acme today”' : ''} />
      )}
    </aside>
  );
}

// ── Overview panels: a week metric, a tier, or the network ───────────────

const inWeek = (d, week) => Boolean(d) && d >= week.start && d <= week.end;
const contactDates = (c) => [...new Set([...(c.contacted ?? []), c.last_contact].map((d) => String(d ?? '').slice(0, 10)).filter(Boolean))];
// A warm contact's `company` comes from the LinkedIn connections export (or a later update),
// so anyone no longer at the company you share has moved on.
const movedOn = (c) => Boolean(OLD_CO[c.relation] && c.company && !OLD_CO[c.relation].test(c.company));
const byMovedFirst = (a, b) => movedOn(b) - movedOn(a);
// "Who to message next": people you already talk to first, then designers, then leads/managers,
// recruiters, everyone else; longest-standing connection first within each.
const titleRank = (t = '') => (/engineer|developer|scientist/i.test(t) && !/design/i.test(t) ? 4 : /design|ux|\bui\b|creative|research/i.test(t) ? 0 : /head|director|\bvp\b|manager|lead|product/i.test(t) ? 1 : /recruit|talent|sourc/i.test(t) ? 2 : /engineer|developer|scientist/i.test(t) ? 4 : 3);
const nextRank = (c) => [contactDates(c).length ? 0 : 1, titleRank(c.title), String(c.connected || '9999')];
const byNextRank = (a, b) => { const x = nextRank(a); const y = nextRank(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };

function NextList({ people, today, empty, notes = null }) {
  const [all, setAll] = useState(false);
  if (!people.length) return <p className="muted small">{empty}</p>;
  const shown = all ? people : people.slice(0, 8);
  return (
    <>
      <ul className="people">{shown.map((c) => <PersonLine key={c.name} c={c} today={today} note={notes?.get(c.name)} />)}</ul>
      {people.length > 8 && <button type="button" className="link-btn muted small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${people.length}`}</button>}
    </>
  );
}

const METRIC_INFO = {
  warm_messages: { how: 'Counts every date in a warm contact\'s "contacted" list this week (an ex-colleague: relation ex-<company>).', hints: ['Who in my network should I message this week?', 'Draft a warm note to an ex-colleague', 'Add an ex-colleague as a contact'] },
  hiring_manager_messages: { how: 'Counts messages to contacts with relation hiring-manager this week.', hints: ['Which hiring manager should I write to first?', 'Draft a note to the hiring manager I saved last', 'Find the team lead at one of my tier-1 companies'] },
  applications: { how: 'Counts roles moved to Applied in career-ops this week. Each one should have a human attached.', hints: ['Which evaluated role should I apply to next?', 'Which application still has no human attached?', 'Evaluate a job link I paste'] },
  linkedin_posts: { how: 'Ticked boxes under "LinkedIn posts" in this week\'s file.', hints: ['Suggest a LinkedIn post from my best project', 'Draft a short post about what I am looking for'] },
  interview_prep_hours: { how: 'Ticked hours under "Interview prep" in this week\'s file.', hints: ['Give me a 1-hour prep plan for my next interview', 'What should I prep for an intro call with a recruiter?'] },
};

function PersonLine({ c, today, date, note = '' }) {
  const { open } = usePanel();
  return (
    <li className="person-row clickable" onClick={rowClick(open, { company: c.company || c.name, focus: 'person', ref: c.name })}>
      <TickButton name={c.name} company={c.company} done={Boolean(lastContacted(c)) && c.next_date > today} />
      <Avatar name={c.name} />
      <span className="row-main"><span className="row-title">{c.name}</span>
        {OLD_CO[c.relation] && c.company
          ? <span className="row-sub"> · {c.title && `${c.title} · `}{movedOn(c) ? <span className="now-at">now at {c.company}</span> : `still at ${c.company}`}</span>
          : <span className="row-sub"> · {[c.title || label(c.relation), c.company].filter(Boolean).join(' · ')}</span>}
        {note && <span className="row-note">{note}</span>}
      </span>
      <span className="row-meta">{date ? <span className="muted small">{fmtDay(date)}</span> : c.next_date ? <DueChip date={c.next_date} today={today} /> : null}</span>
      {!date && <DropButton c={c} />}
    </li>
  );
}

function WeekButtons({ kind }) {
  const [busy, setBusy] = useState(false);
  const tick = (hours) => async () => {
    setBusy(true);
    try {
      const r = await post('week', { kind, hours });
      showToast(kind === 'post' ? 'LinkedIn post logged' : `${hours}h of prep logged`, 'ok', () => post('undo', { id: r.undo }));
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="panel-line chips">
      {kind === 'post'
        ? <button type="button" className="btn btn-primary" onClick={tick(1)} disabled={busy}>I posted on LinkedIn</button>
        : [0.5, 1, 2].map((h) => <button key={h} type="button" className="btn" onClick={tick(h)} disabled={busy}>+ {h}h</button>)}
    </div>
  );
}

function MetricBody({ data, metric }) {
  const { open } = usePanel();
  const week = data.week;
  const contacts = allContacts(data);
  if (metric.key === 'warm_messages' || metric.key === 'hiring_manager_messages') {
    const ok = metric.key === 'warm_messages' ? (c) => isWarm(c.relation) : (c) => c.relation === 'hiring-manager';
    const sent = contacts.filter(ok).flatMap((c) => contactDates(c).filter((d) => inWeek(d, week)).map((d) => ({ c, d }))).sort((a, b) => b.d.localeCompare(a.d));
    const next = contacts.filter((c) => ok(c) && c.status !== 'cold' && !contactDates(c).some((d) => inWeek(d, week))).sort(byNextRank);
    if (metric.key === 'warm_messages') {
      // Who can introduce you where: anyone named in another contact's intro_via (from Find people).
      const routes = new Map();
      for (const p of contacts) for (const v of p.intro_via ?? []) routes.set(v, [...new Set([...(routes.get(v) ?? []), p.company])]);
      const notes = new Map([...routes].map(([name, cos]) => [name, `can introduce you at ${cos.join(', ')}`]));
      const byRoute = (a, b) => routes.has(b.name) - routes.has(a.name);
      const moved = next.filter(movedOn).sort(byRoute);
      const stayed = next.filter((c) => !movedOn(c)).sort(byRoute);
      return (
        <>
          <div className="panel-sec"><span className="panel-k">Sent this week · {sent.length}</span>
            {sent.length === 0 ? <p className="muted small">None yet.</p> : <ul className="people">{sent.map(({ c, d }) => <PersonLine key={`${c.name}-${d}`} c={c} today={data.today} date={d} />)}</ul>}
          </div>
          <div className="panel-sec"><span className="panel-k">Moved on · {moved.length}</span>
            <NextList people={moved} today={data.today} notes={notes} empty={`Nobody yet: everyone saved is still at ${formerLabels()}.`} />
            <p className="find-alumni"><button type="button" className="linkish small" onClick={() => open({ kind: 'alumni' })}>Find ex-colleagues who've left <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></button></p>
          </div>
          <div className="panel-sec"><span className="panel-k">Still at {formerLabels()} · {stayed.length}</span>
            <NextList people={stayed} today={data.today} notes={notes} empty="Nobody left here." />
            <p className="muted small">Where people work comes from your LinkedIn connections export, so it's only as fresh as their profiles were then. Ask Claude to check one person, or export again to refresh everyone. Tick the circle when you've sent one.</p>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="panel-sec"><span className="panel-k">Sent this week · {sent.length}</span>
          {sent.length === 0 ? <p className="muted small">None yet.</p> : <ul className="people">{sent.map(({ c, d }) => <PersonLine key={`${c.name}-${d}`} c={c} today={data.today} date={d} />)}</ul>}
        </div>
        <div className="panel-sec"><span className="panel-k">Who to message next · {next.length}</span>
          <NextList people={next} today={data.today} empty={metric.key === 'warm_messages' ? 'No other ex-colleagues saved yet. Your LinkedIn connections export would fill this in.' : 'No hiring managers waiting.'} />
          <p className="muted small">Tick the circle when you've sent one.</p>
        </div>
      </>
    );
  }
  if (metric.key === 'applications') {
    const apps = data.applications.ok ? data.applications.rows : [];
    const sent = apps.filter((r) => !['evaluated', 'skip', 'discarded'].includes(String(r.status).toLowerCase()) && inWeek(r.date, week));
    const ready = apps.filter((r) => String(r.status).toLowerCase() === 'evaluated');
    const best = data.pipeline.openings.filter((o) => o.score >= 4 && !o.shelved);
    return (
      <>
        <div className="panel-sec"><span className="panel-k">Sent this week · {sent.length}</span>
          {sent.length === 0 ? <p className="muted small">None yet.</p> : sent.map((r) => (
            <div key={r.num} className="panel-line chips clickable" onClick={rowClick(open, { company: r.company, focus: 'app', ref: r.num })}>
              <StatusSelect row={r} states={data.appStates} /><span><b>{r.company}</b> <span className="muted">{r.role}</span></span>{!r.contact && <NoHuman />}
            </div>
          ))}
        </div>
        <div className="panel-sec"><span className="panel-k">Ready to apply · {ready.length + best.length}</span>
          {ready.map((r) => <div key={r.num} className="panel-line chips clickable" onClick={rowClick(open, { company: r.company, focus: 'app', ref: r.num })}><StatusSelect row={r} states={data.appStates} /><span><b>{r.company}</b> <span className="muted">{r.role}</span></span></div>)}
          {best.map((o) => <div key={o.url} className="panel-line chips clickable" onClick={() => open({ company: o.company, focus: 'opening', ref: o.url })}><FitScore score={o.score} reason={o.reason} /><span><b>{o.company}</b> <span className="muted">{o.title}</span></span></div>)}
          {ready.length + best.length === 0 && <p className="muted small">Nothing evaluated and waiting.</p>}
        </div>
      </>
    );
  }
  return (
    <div className="panel-sec">
      <span className="panel-k">{metric.key === 'linkedin_posts' ? 'Log a post' : 'Log prep time'}</span>
      <WeekButtons kind={metric.key === 'linkedin_posts' ? 'post' : 'prep'} />
      <p className="muted small">Each click ticks a box in this week's file. Undo is in the notice that appears.</p>
    </div>
  );
}

function TierBody({ data, item }) {
  const { open } = usePanel();
  if (item.kind === 'network') {
    return <div className="panel-sec"><span className="panel-k">People outside the target list</span><ul className="people">{[...data.outreach.network].sort(byMovedFirst).map((c) => <PersonLine key={c.name} c={c} today={data.today} />)}</ul></div>;
  }
  const t = data.outreach.tiers.find((x) => x.tier === item.tier);
  const reached = (c) => c.contacts.some((p) => lastContacted(p));
  const groups = [['Not reached out', t.companies.filter((c) => !reached(c))], ['Reached out', t.companies.filter(reached)]];
  return groups.filter(([, list]) => list.length).map(([label, list]) => (
    <div key={label} className="panel-sec">
      <span className="panel-k">{label} · {list.length}</span>
      <ul className="todo">{list.map((c) => (
        <li key={c.name} className="todo-row clickable" onClick={() => open({ company: c.name, focus: 'company' })}>
          <StatusIcon status={c.status} />
          <span className="row-main"><span className="row-title">{c.name}</span> <span className="row-sub">· {c.contacts.length ? plural(c.contacts.length, 'person') : 'no contact yet'}</span></span>
          {c.lead_with && <Chip kind="lead">{LEAD_WITH[c.lead_with] ?? c.lead_with}</Chip>}
        </li>
      ))}</ul>
    </div>
  ));
}

// Find ex-colleagues: paste LinkedIn's own past-company search results (you run the search),
// match them to the connections export on the server, tick who to add. Nothing on LinkedIn is opened.
function AlumniPanel({ onClose, back }) {
  usePanelEscape(onClose);
  const formers = PROFILE.former_companies;
  const [former, setFormer] = useState(formers[0]?.key ?? '');
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const label = formers.find((f) => f.key === former)?.linkedin ?? '';
  const read = async () => {
    setBusy(true);
    try {
      const r = await post('alumni-preview', { text, former });
      setRes(r);
      setPicked(Object.fromEntries([...r.moved, ...r.stayed].map((p) => [p.url, !p.ambiguous])));
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const people = res ? [...res.moved, ...res.stayed].filter((p) => picked[p.url]) : [];
  const add = async () => {
    setBusy(true);
    try {
      const r = await post('alumni-add', { people, former });
      showToast(`Added ${plural(r.added.length, 'person')} as ex-${res.label}`, 'ok', () => post('undo', { id: r.undo }));
      setRes(null);
      setText('');
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const group = (title, list, note) => list.length > 0 && (
    <div className="panel-sec">
      <span className="panel-k">{title} · {list.length}</span>
      <ul className="people">{list.map((p) => (
        <li key={p.url} className="person-row alumni-row">
          <input type="checkbox" checked={Boolean(picked[p.url])} onChange={(e) => setPicked((x) => ({ ...x, [p.url]: e.target.checked }))} aria-label={`Add ${p.name}`} />
          <Avatar name={p.name} />
          <span className="row-main"><span className="row-title">{p.name}</span>
            <span className="row-sub"> · {p.title && `${p.title} · `}{note(p)}</span>
            {p.ambiguous && <span className="row-note">Two connections share this name: tick the right one</span>}
          </span>
          <span className="row-meta muted small">{p.connected && `connected ${parseDay(p.connected).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}</span>
        </li>
      ))}</ul>
    </div>
  );
  return (
    <aside className="panel" aria-label="Find ex-colleagues">
      <PanelHeader onClose={onClose} back={back} title="Find ex-colleagues" sub="From LinkedIn's past-company search" />
      <div className="panel-body">
        {!res ? (
          <>
            <div className="panel-sec">
              <ol className="alumni-steps">
                <li>On LinkedIn, search People with <b>Connections: 1st</b> and <b>Past company: {label}</b>.</li>
                <li>On each results page, select all (⌘A) and copy (⌘C).</li>
                <li>Paste below: one page, or several at once.</li>
              </ol>
            </div>
            <div className="panel-sec">
              {formers.length === 0 && <p className="muted small">Add your past employers under <b>former_companies</b> in hub-data/profile.yml first (or ask Claude: “add my past companies to my profile”).</p>}
              {formers.length > 1 && <Tabs value={former} onChange={setFormer} items={formers.map((f) => [f.key, f.label])} />}
              <textarea className="alumni-paste" value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste LinkedIn results here" aria-label="Pasted LinkedIn results" />
              <p className="muted small">Names are matched against your connections export, which gives their link, current company and title. Nothing on LinkedIn is opened.</p>
              <div className="panel-line"><span className="grow" /><button type="button" className="btn btn-primary" onClick={read} disabled={busy || !text.trim()}>{busy ? 'Reading…' : 'Read the list'}</button></div>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">Found {plural(res.moved.length + res.stayed.length + res.saved.length + res.unknown.length, 'person')} in what you pasted.</p>
            {group('New · moved on', res.moved, (p) => <span className="now-at">now at {p.company}</span>)}
            {group(`New · still at ${res.label}`, res.stayed, (p) => p.company)}
            {res.saved.length > 0 && <div className="panel-sec"><span className="panel-k">Already saved · skipped · {res.saved.length}</span><p className="muted small">{res.saved.map((p) => p.name).join(' · ')}</p></div>}
            {res.unknown.length > 0 && <div className="panel-sec"><span className="panel-k">Not in your connections export · {res.unknown.length}</span><p className="muted small">{res.unknown.map((p) => p.name).join(' · ')}. These can't be added from here: they may have joined after your export, or changed their name. Ask Claude to add one.</p></div>}
            {res.moved.length + res.stayed.length === 0 && <p className="muted small">Nobody new on this page.</p>}
            <div className="panel-line">
              <button type="button" className="btn" onClick={() => { setRes(null); setText(''); }}>Paste another page</button>
              <span className="grow" />
              {people.length > 0 && <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>{busy ? 'Adding…' : `Add ${plural(people.length, 'person')}`}</button>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// Find people at a company: paste LinkedIn's own people search (current company, 1st + 2nd).
// Claude reads the page on the server; mutual connections who are already contacts become the
// intro path ("via Jamie Chen, ex-Acme"). Nothing is saved until Add.
const INTRO_RANK = (m) => (isWarm(m.relation) ? 0 : m.relation && m.relation !== 'connection' ? 1 : m.relation ? 2 : 3);
const introsOf = (p) => p.mutual.filter((m) => m.relation).sort((a, b) => INTRO_RANK(a) - INTRO_RANK(b));

// Find: who to contact at a company (server/find.mjs). People you know there (connections export)
// and people a short web search suggests, with tick boxes. Nothing is saved until Add; added people
// get today's date, so they show in Today with a Draft button.
function FindPanel({ company, onClose, back }) {
  usePanelEscape(onClose);
  const { open } = usePanel();
  const [res, setRes] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const load = async (refresh = false) => {
    setBusy('search'); setErr('');
    try {
      const r = await post('find-preview', { company, refresh });
      setRes(r);
      const tick = (p) => !p.saved && (p.relation !== 'other' || p.url) && p.confidence !== 'medium';
      setPicked(Object.fromEntries([...r.known, ...r.people].map((p) => [p.name, tick(p)])));
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  useEffect(() => { load(); }, [company]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = res ? [...res.known, ...res.people] : [];
  const chosen = all.filter((p) => !p.saved && picked[p.name]);
  const add = async () => {
    setBusy('add');
    try {
      const r = await post('find-add', { company, people: chosen });
      showToast(`Added ${plural(r.added.length, 'person')} at ${company}. They're in Today with a Draft button.`, 'ok', () => post('undo', { id: r.undo }));
      onClose();
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const group = (title, list, note) => list.length > 0 && (
    <div className="panel-sec">
      <span className="panel-k">{title} · {list.length}</span>
      {note && <p className="muted small">{note}</p>}
      <ul className="people">{list.map((p) => (
        <li key={p.name} className="person-row alumni-row">
          <input type="checkbox" checked={Boolean(picked[p.name])} disabled={p.saved} onChange={(e) => setPicked((x) => ({ ...x, [p.name]: e.target.checked }))} aria-label={`Add ${p.name}`} />
          <Avatar name={p.name} />
          <span className="row-main"><span className="row-title">{p.name}</span>
            <span className="row-sub"> · {p.title || label(p.relation)}</span>
            {(p.saved || p.why) && <span className="row-note">{p.saved ? 'Already saved' : p.why}</span>}
          </span>
          <span className="row-meta">
            {p.relation !== 'other' && <Chip kind="lead">{p.relation === 'hiring-manager' ? 'could hire' : 'recruiter'}</Chip>}
            {(p.source || p.url) && <a className="src" href={p.source || p.url} target="_blank" rel="noreferrer noopener">{p.url && !p.source ? 'Profile' : 'Source'} <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></a>}
          </span>
        </li>
      ))}</ul>
    </div>
  );
  return (
    <aside className="panel" aria-label={`Who to contact at ${company}`}>
      <PanelHeader onClose={onClose} back={back} title={`Who to contact at ${company}`} sub="People you know there, and people Claude found" />
      <div className="panel-body">
        {busy === 'search' && <p className="muted">Claude is looking for people at {company}: the likely hiring manager, a recruiter, maybe a peer. About a minute. It uses a little of your Claude plan and doesn't open LinkedIn.</p>}
        {err && <p className="notice">{err}</p>}
        {res && (
          <>
            {group('You know them', res.known, 'From your LinkedIn connections export.')}
            {group('Suggested by Claude', res.people, 'From a web search. Check each one before you write: titles change.')}
            {all.length === 0 && <p className="muted small">Claude didn't find anyone named at {company} on the open web.</p>}
            {(res.tips?.length > 0 || res.people.length < 3) && (
              <div className="panel-sec">
                <span className="panel-k">Where to look next</span>
                {res.tips?.length > 0 && <ul className="tips">{res.tips.map((t) => <li key={t} className="small"><Md text={t} /></li>)}</ul>}
                <p className="small">Team leads and recruiters are often only named on LinkedIn. You can run LinkedIn's people search yourself and paste the results into the hub.</p>
                <div className="panel-line"><button type="button" className="btn btn-sm" onClick={() => open({ kind: 'people', company })}>Find people at {company} on LinkedIn</button></div>
              </div>
            )}
            {!res.hasExport && <p className="muted small">Add your LinkedIn connections export to also see who you already know here (say “here's my LinkedIn connections export” to Claude).</p>}
            <div className="panel-line">
              <button type="button" className="btn" onClick={() => load(true)} disabled={Boolean(busy)} title="Runs the web search again (uses a little of your Claude plan)">Search again</button>
              <span className="grow" />
              {chosen.length > 0 && <button type="button" className="btn btn-primary" onClick={add} disabled={Boolean(busy)}>{busy === 'add' ? 'Adding…' : `Add ${plural(chosen.length, 'person')}`}</button>}
            </div>
            {res.at && <p className="muted small">Searched {fmtShort(res.at.slice(0, 10))}. Nothing is saved until you click Add.</p>}
          </>
        )}
      </div>
    </aside>
  );
}

function PeoplePanel({ company, onClose, back }) {
  usePanelEscape(onClose);
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState('');
  const read = async () => {
    setBusy('read');
    try {
      const r = await post('people-preview', { text, company });
      setRes(r);
      setPicked(Object.fromEntries(r.people.map((p) => [p.name, !p.saved && p.relation !== 'other' && (p.degree === '1st' || introsOf(p).length > 0)])));
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const fresh = res ? res.people.filter((p) => !p.saved) : [];
  const chosen = fresh.filter((p) => picked[p.name]);
  const add = async () => {
    setBusy('add');
    try {
      const r = await post('people-add', { people: chosen });
      showToast(`Added ${plural(r.added.length, 'person')} at ${company}`, 'ok', () => post('undo', { id: r.undo }));
      setRes(null);
      setText('');
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const viaText = (p) => {
    const via = introsOf(p);
    if (!via.length) return p.mutual.length || p.more ? `${plural(p.mutual.length + p.more, 'mutual connection')}, none saved` : '';
    const [m] = via;
    const who = isWarm(m.relation) ? `${m.name} (${label(m.relation)})` : m.name;
    const rest = p.mutual.length + p.more - 1;
    return `via ${who}${rest > 0 ? ` +${rest}` : ''}`;
  };
  const group = (title, list) => list.length > 0 && (
    <div className="panel-sec">
      <span className="panel-k">{title} · {list.length}</span>
      <ul className="people">{list.map((p) => (
        <li key={p.name} className="person-row alumni-row">
          <input type="checkbox" checked={Boolean(picked[p.name])} onChange={(e) => setPicked((x) => ({ ...x, [p.name]: e.target.checked }))} aria-label={`Add ${p.name}`} />
          <Avatar name={p.name} />
          <span className="row-main"><span className="row-title">{p.name}</span>
            <span className="row-sub"> · {p.title || label(p.relation)}</span>
            {viaText(p) && <span className="row-note">{viaText(p)}</span>}
          </span>
          {p.relation !== 'other' && <span className="row-meta"><Chip kind="lead">{p.relation === 'hiring-manager' ? 'could hire' : 'recruiter'}</Chip></span>}
        </li>
      ))}</ul>
    </div>
  );
  const saved = res ? res.people.filter((p) => p.saved) : [];
  return (
    <aside className="panel" aria-label={`Find people at ${company}`}>
      <PanelHeader onClose={onClose} back={back} title={`Find people at ${company}`} sub="From LinkedIn's people search" />
      <div className="panel-body">
        {!res ? (
          <>
            <div className="panel-sec">
              <ol className="alumni-steps">
                <li>On LinkedIn, search People with <b>Current company: {company}</b> and <b>Connections: 1st, 2nd</b>. Add a keyword like “design” or “product” to keep it short.</li>
                <li>On each results page, select all (⌘A) and copy (⌘C).</li>
                <li>Paste below. Claude reads it (about 10 seconds) and shows who you can reach through someone you know.</li>
              </ol>
            </div>
            <div className="panel-sec">
              <textarea className="alumni-paste" value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste LinkedIn results here" aria-label="Pasted LinkedIn results" />
              <p className="muted small">Nothing on LinkedIn is opened and nothing is saved until you click Add. People you're connected to get their profile link from your connections export.</p>
              <div className="panel-line"><span className="grow" /><button type="button" className="btn btn-primary" onClick={read} disabled={Boolean(busy) || !text.trim()}>{busy === 'read' ? 'Reading…' : 'Read the list'}</button></div>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">Found {plural(res.people.length, 'person')} in what you pasted.</p>
            {group('Intro possible', fresh.filter((p) => p.degree !== '1st' && introsOf(p).length > 0))}
            {group('Already connected', fresh.filter((p) => p.degree === '1st'))}
            {group('No one you know in between', fresh.filter((p) => p.degree !== '1st' && introsOf(p).length === 0))}
            {saved.length > 0 && <div className="panel-sec"><span className="panel-k">Already saved · skipped · {saved.length}</span><p className="muted small">{saved.map((p) => p.name).join(' · ')}</p></div>}
            {fresh.length === 0 && <p className="muted small">Nobody new on this page.</p>}
            <div className="panel-line">
              <button type="button" className="btn" onClick={() => { setRes(null); setText(''); }}>Paste another page</button>
              <span className="grow" />
              {chosen.length > 0 && <button type="button" className="btn btn-primary" onClick={add} disabled={Boolean(busy)}>{busy === 'add' ? 'Adding…' : `Add ${plural(chosen.length, 'person')}`}</button>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// Hiring posts: paste a LinkedIn post search; Claude finds who's hiring and checks each role
// against the location rules. Ticked posters become people to message (saved ones get a note).
function PostsPanel({ onClose, back }) {
  usePanelEscape(onClose);
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState('');
  const read = async () => {
    setBusy('read');
    try {
      const r = await post('posts-preview', { text });
      setRes(r);
      setPicked(Object.fromEntries(r.posts.map((p) => [p.poster, p.fit === 'good'])));
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const chosen = res ? res.posts.filter((p) => picked[p.poster]) : [];
  const add = async () => {
    setBusy('add');
    try {
      const r = await post('posts-add', { posts: chosen });
      const said = [r.added.length && `added ${plural(r.added.length, 'person')}`, r.noted.length && `noted the post on ${plural(r.noted.length, 'saved contact')}`].filter(Boolean).join(', ');
      showToast(said.charAt(0).toUpperCase() + said.slice(1), 'ok', () => post('undo', { id: r.undo }));
      setRes(null);
      setText('');
    } catch (e) { showToast(e.message, 'bad'); } finally { setBusy(''); }
  };
  const group = (title, list) => list.length > 0 && (
    <div className="panel-sec">
      <span className="panel-k">{title} · {list.length}</span>
      <ul className="people">{list.map((p) => (
        <li key={p.poster} className="person-row alumni-row">
          <input type="checkbox" checked={Boolean(picked[p.poster])} onChange={(e) => setPicked((x) => ({ ...x, [p.poster]: e.target.checked }))} aria-label={`Keep ${p.poster}`} />
          <Avatar name={p.poster} />
          <span className="row-main"><span className="row-title">{p.poster}</span>
            <span className="row-sub"> · {[p.title, p.saved && 'saved'].filter(Boolean).join(' · ')}</span>
            <span className="row-note"><b>{[p.role, p.company].filter(Boolean).join(' at ')}</b>{p.location && ` · ${p.location}`}{p.reason && ` · ${p.reason}`}</span>
            {p.gist && <span className="row-note muted">{p.gist}</span>}
          </span>
          <span className="row-meta muted small">{[p.degree, p.when].filter(Boolean).join(' · ')}</span>
        </li>
      ))}</ul>
    </div>
  );
  return (
    <aside className="panel" aria-label="Hiring posts">
      <PanelHeader onClose={onClose} back={back} title="Hiring posts" sub="From LinkedIn's post search" />
      <div className="panel-body">
        {!res ? (
          <>
            <div className="panel-sec">
              <ol className="alumni-steps">
                <li>On LinkedIn, search <b>Posts</b> for something like “hiring {(PROFILE.role || 'product designer').toLowerCase()}”{PROFILE.base && <> or “we're hiring {PROFILE.base.split(',')[0]}”</>}. Set <b>Date posted: Past week</b> and <b>Sort by: Latest</b>.</li>
                <li>Scroll a bit so more posts load, then select all (⌘A) and copy (⌘C).</li>
                <li>Paste below. Claude finds who's hiring and checks each role against your location rules (about 15 seconds).</li>
              </ol>
            </div>
            <div className="panel-sec">
              <textarea className="alumni-paste" value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste LinkedIn posts here" aria-label="Pasted LinkedIn posts" />
              <p className="muted small">Nothing on LinkedIn is opened and nothing is saved until you click Add. Copied text has no post links, so open the post on LinkedIn when you write.</p>
              <div className="panel-line"><span className="grow" /><button type="button" className="btn btn-primary" onClick={read} disabled={Boolean(busy) || !text.trim()}>{busy === 'read' ? 'Reading…' : 'Find hiring posts'}</button></div>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">{res.posts.length ? `Found ${plural(res.posts.length, 'hiring post')} in what you pasted.` : 'No hiring posts in what you pasted.'}</p>
            {group('Good fit', res.posts.filter((p) => p.fit === 'good'))}
            {group('Check first', res.posts.filter((p) => p.fit === 'check'))}
            {group('Not a fit', res.posts.filter((p) => p.fit === 'no'))}
            <div className="panel-line">
              <button type="button" className="btn" onClick={() => { setRes(null); setText(''); }}>Paste another page</button>
              <span className="grow" />
              {chosen.length > 0 && <button type="button" className="btn btn-primary" onClick={add} disabled={Boolean(busy)}>{busy === 'add' ? 'Saving…' : `Keep ${plural(chosen.length, 'person')}`}</button>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function OverviewPanel({ data, item, onClose, back }) {
  usePanelEscape(onClose);
  const metric = item.kind === 'metric' ? data.progress.find((p) => p.key === item.key) : null;
  const tier = item.kind === 'tier' ? data.outreach.tiers.find((t) => t.tier === item.tier) : null;
  const title = metric ? metric.label : tier ? `Tier ${tier.tier} · ${TIER_SHORT[tier.tier]}` : 'Network';
  const thread = metric ? `week-${data.week.id}-${metric.key}` : tier ? `tier-${tier.tier}` : 'network';
  const hints = metric ? METRIC_INFO[metric.key]?.hints : tier ? [`Which Tier ${tier.tier} company should I contact first?`, `Find a design lead at a Tier ${tier.tier} company with no contact`] : ['Who in my network should I follow up with?', 'Draft a check-in note to someone I haven\'t talked to in a while'];
  const context = metric ? { metric, week: data.week } : tier ? { tier: tier.tier, companies: tier.companies.map((c) => ({ name: c.name, status: c.status, people: c.contacts.map((p) => `${p.name} (${p.status})`) })) } : { network: data.outreach.network };
  const target = metric && (metric.min === metric.max ? `${metric.max}` : `${metric.min}–${metric.max}`);
  const [tab, setTab] = useState(item.tab ?? 'overview');
  const sub = metric ? `Week ${data.week.id.slice(-2)} · ${fmtShort(data.week.start)} – ${fmtShort(data.week.end)}`
    : tier ? plural(tier.companies.length, 'company') : plural(data.outreach.network.length, 'person');
  return (
    <aside className="panel" aria-label={title}>
      <PanelHeader onClose={onClose} back={back} title={title} sub={sub} tier={tier?.tier} />
      <PanelTabs tab={tab} setTab={setTab} items={[['overview', metric ? 'This week' : tier ? 'Companies' : 'People'], ['chat', 'Chat']]} />
      {tab === 'overview' && (
        <div className="panel-body">
          {metric && (
            <div className="panel-sec">
              <div className="metric-big"><b>{metric.count}{metric.unit ?? ''}</b><span className="muted"> / {target}{metric.unit ?? ''}</span></div>
              <Segments p={metric} />
              <p className="muted small" style={{ marginTop: 8 }}>{METRIC_INFO[metric.key]?.how}</p>
            </div>
          )}
          {metric ? <MetricBody data={data} metric={metric} /> : <TierBody data={data} item={item} />}
          <a href={metric ? '#/week' : tier ? `#/outreach/tier-${tier.tier}` : '#/outreach/network'} className="src">Open the {metric ? 'This week' : 'Outreach'} page <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" /></a>
        </div>
      )}
      {tab === 'chat' && <Chat key={thread} thread={thread} context={context} hints={hints} contextName={title} title="" />}
    </aside>
  );
}

function Notes({ company, notes }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await post('note', { company, text }); setText(''); } catch (err) { showToast(err.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="panel-sec">
      <span className="panel-k">Notes</span>
      {notes.length === 0 && <p className="muted small">No notes yet.</p>}
      <ul className="notes">{[...notes].reverse().map((n, i) => <li key={i}><span className="muted small">{fmtShort(n.date)}</span> {n.text}</li>)}</ul>
      <form className="note-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a quick note…" aria-label={`Add a note about ${company}`} disabled={busy} />
      </form>
    </div>
  );
}

// Tiny markdown: paragraphs, bullets, **bold**, `code`, links. hub-action blocks are removed
// here and shown as Apply buttons instead.
function Md({ text }) {
  const clean = String(text ?? '').replace(/```hub-action[\s\S]*?```/g, '').trim();
  const inline = (s) => s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:[^)]+\)|https?:\/\/\S+)/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    const md = part.match(/^\[([^\]]+)\]\((https?:[^)]+)\)$/);
    if (md) return <a key={i} href={md[2]} target="_blank" rel="noreferrer noopener">{md[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer noopener">{part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>;
    return part;
  });
  // Code fences first (a draft with blank lines inside stays one block; an unclosed fence
  // while streaming runs to the end), then paragraphs, lists and tables between them.
  const blocks = clean.split(/(```[\w-]*\n[\s\S]*?(?:```|$))/).flatMap((part) => (/^```/.test(part) ? [part] : part.split(/\n{2,}/))).filter((b) => b.trim());
  return blocks.map((b, i) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>)}</ul>;
    if (/^```/.test(b)) return <pre key={i}>{b.replace(/^```[\w-]*\n?|```\s*$/g, '').replace(/\n$/, '')}</pre>;
    // Markdown tables: | a | b | rows, the |---| separator line skipped.
    if (lines.length > 1 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
      const cells = (l) => l.trim().slice(1, -1).split('|').map((c) => c.trim());
      const rows = lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map(cells);
      return (
        <table key={i} className="md-table">
          <thead><tr>{rows[0].map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>
      );
    }
    // Mixed block ("I updated three things:" then "- item" lines): text runs become
    // paragraphs, bullet runs become lists.
    const BULLET = /^\s*([-*]|\d+\.)\s/;
    const runs = [];
    for (const l of lines) {
      const kind = BULLET.test(l) ? 'ul' : 'p';
      if (runs.at(-1)?.kind === kind) runs.at(-1).lines.push(l); else runs.push({ kind, lines: [l] });
    }
    return runs.map((r, k) => (r.kind === 'ul'
      ? <ul key={`${i}-${k}`}>{r.lines.map((l, j) => <li key={j}>{inline(l.replace(BULLET, ''))}</li>)}</ul>
      : <p key={`${i}-${k}`}>{r.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ''))}</span>)}</p>));
  });
}

// ── Evaluate (server/evaluate.mjs): career-ops' full evaluation in the background ─────────
// Never automatic: every run starts from a confirm. One at a time; progress and outcome come
// back through data.evaluations.

const EVAL_COST = 'Full evaluation: a fit report and a tailored CV. Takes a few minutes and uses a fair share of your Claude plan.';
const EVAL_KEEP = "You can keep using the hub. Keep Claude open until it's done.";
let askEvaluate = null; // set while <EvalConfirm /> is mounted

// Opens the confirm. Resolves true once the evaluation has started, false on Cancel.
const requestEvaluate = (target) => (askEvaluate ? askEvaluate(target) : Promise.resolve(false));

function EvalConfirm() {
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    askEvaluate = (target) => new Promise((resolve) => setReq({ target, resolve }));
    return () => { askEvaluate = null; };
  }, []);
  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { req.resolve(false); setReq(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);
  if (!req) return null;
  const { target } = req;
  const close = (v) => { req.resolve(v); setReq(null); };
  const go = async () => {
    setBusy(true);
    try {
      await post('evaluate', target);
      showToast(`Evaluating ${target.company || 'the role'}. ${EVAL_KEEP}`, 'ok');
      close(true);
    } catch (e) { showToast(e.message, 'bad'); close(false); } finally { setBusy(false); }
  };
  return (
    <div className="modal-backdrop" onClick={() => close(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="eval-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="eval-title">Evaluate {[target.company, target.role].filter(Boolean).join(' · ') || 'this role'}?</h3>
        <p>{EVAL_COST}</p>
        {target.force && <p className="muted small">The pre-check stopped this role last time. This runs the full evaluation anyway.</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => close(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={go} disabled={busy} autoFocus>{busy ? 'Starting…' : 'Evaluate'}</button>
        </div>
      </div>
    </div>
  );
}

// The latest evaluation of this posting (by link, else tracker #, else company + role).
function evalFor(data, t) {
  const list = data.evaluations ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (t.url && e.url) { if (e.url === t.url) return e; continue; }
    if (t.num && e.num && String(e.num) === String(t.num)) return e;
    if (!t.url && noteSlug(e.company) === noteSlug(t.company) && String(e.role).toLowerCase() === String(t.role ?? '').toLowerCase()) return e;
  }
  return null;
}

function EvaluateButton({ data, target }) {
  const running = (data.evaluations ?? []).find((e) => e.status === 'running');
  const mine = evalFor(data, target);
  if (mine?.status === 'running') return <Chip kind="evaluating" title={mine.step || 'Starting'}>Evaluating…</Chip>;
  if (mine?.status === 'done') return null;
  const other = Boolean(running);
  const stopped = mine?.status === 'stopped';
  const again = mine && ['failed', 'interrupted'].includes(mine.status);
  const text = other ? `Waiting for ${running.company || 'another role'}` : stopped ? 'Evaluate anyway' : again ? 'Run again' : 'Evaluate';
  const why = other ? `One evaluation at a time: Claude is evaluating ${running.company || 'another role'}. This one can start when it's done.` : EVAL_COST;
  return (
    <button type="button" className="btn btn-sm" disabled={other} title={why}
      onClick={(ev) => { ev.stopPropagation(); requestEvaluate({ url: target.url || '', company: target.company, role: target.role, num: target.num || '', ...(stopped ? { force: true } : {}) }); }}>
      {text}
    </button>
  );
}

// One line under the row: progress while it runs, then how it ended.
function EvalNote({ data, target }) {
  const e = evalFor(data, target);
  if (!e) return null;
  if (e.status === 'running') return <span className="row-note eval-note">Evaluating: {e.step || 'starting'}. {EVAL_KEEP}</span>;
  if (e.status === 'stopped') return <span className="row-note eval-note">The pre-check stopped it: not a fit. Claude explains why in the company's chat.</span>;
  if (e.status === 'interrupted') return <span className="row-note eval-note bad">The evaluation stopped when the hub closed. Run it again?</span>;
  if (e.status === 'failed') return <span className="row-note eval-note bad">The evaluation didn't finish: {String(e.error || 'something went wrong').replace(/\.$/, '')}. Run it again?</span>;
  if (e.status === 'done' && target.opening) return <span className="row-note eval-note">Evaluated{e.score ? `: ${e.score}` : ''}. It's in Applications.</span>;
  return null;
}

const reportHref = (r) => `/api/report?name=${encodeURIComponent(r.reportFile)}`;

const ACTION_RUN = {
  status: (a) => post('status', { num: a.num, status: a.status }),
  track: (a) => post('track', a),
  openings: (a) => post('openings', { jobs: a.jobs }),
  scan: () => post('scan'),
  live: () => post('live'),
  rank: () => post('rank'),
};

function ActionButton({ action }) {
  const [state, setState] = useState('');
  const apply = async () => {
    if (action.type === 'evaluate') {
      if (await requestEvaluate(action)) setState('done');
      return;
    }
    setState('busy');
    try {
      const r = await ACTION_RUN[action.type](action);
      setState('done');
      showToast(action.type === 'openings' ? `Added ${r.added} to New openings${r.skipped?.length ? ` · ${r.skipped.length} already there` : ''}` : `Done: ${action.label}`);
    } catch (e) { setState(''); showToast(e.message, 'bad'); }
  };
  // Adding a role ("track") or jobs ("openings") says Add, so it doesn't read as applying to the job.
  const [verb, busy, doneWord] = action.type === 'evaluate' ? ['Evaluate', 'Applying…', 'Started']
    : action.type === 'track' || action.type === 'openings' ? ['Add', 'Adding…', 'Added']
    : ['Apply', 'Applying…', 'Applied'];
  const done = <><Check size={14} className="ico-inline" /> {doneWord}</>;
  return (
    <div className="proposal">
      <span className="proposal-label">{action.label || action.type}</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={apply} disabled={state !== ''}>{state === 'done' ? done : state === 'busy' ? busy : verb}</button>
    </div>
  );
}

// "Tailor CV": career-ops pdf mode for one of this company's roles (server/chat.mjs, cv-<slug> thread).
function CvTab({ data, ctx }) {
  const slug = noteSlug(ctx.name);
  const cvs = (data.cvFiles ?? []).filter((f) => f.name.includes(`-${slug}`));
  const roles = [
    ...ctx.apps.map((r) => ({ role: r.role, url: r.url, extra: `tracker #${r.num}${r.report ? `, report ${r.report}` : ''}`, focus: ctx.focus === 'app' && ctx.ref === r.num })),
    ...ctx.untracked.map((u) => ({ role: u.role, url: u.url, extra: 'not in the tracker yet' })),
    ...ctx.openings.map((o) => ({ role: o.title, url: o.url, extra: 'new opening', focus: ctx.focus === 'opening' && ctx.ref === o.url })),
  ].sort((a, b) => Boolean(b.focus) - Boolean(a.focus));
  const hints = roles.slice(0, 4).map((r) => ({
    label: `Tailor my CV for ${r.role}`,
    text: `Tailor my CV for ${r.role} at ${ctx.name} (${r.extra}).${r.url ? ` Posting: ${r.url}` : ' I\'ll paste the job description.'}`,
  }));
  if (!hints.length) hints.push({ label: 'Tailor my CV (I\'ll paste the job description)', text: `Tailor my CV for a role at ${ctx.name}. I'll paste the job description next.` });
  const top = roles[0];
  hints.push(top
    ? { label: `Write a cover letter for ${top.role}`, text: `Write a cover letter for ${top.role} at ${ctx.name} (${top.extra}).${top.url ? ` Posting: ${top.url}` : ' I\'ll paste the job description.'}` }
    : { label: 'Write a cover letter (I\'ll paste the job description)', text: `Write a cover letter for a role at ${ctx.name}. I'll paste the job description next.` });
  return (
    <>
      {cvs.length > 0 && (
        <div className="cv-files">
          <span className="panel-k">CVs and letters for {ctx.name}</span>
          {cvs.map((f) => (
            <a key={f.name} className="file-link" href={`/api/cv-file?name=${encodeURIComponent(f.name)}`} target="_blank" rel="noreferrer noopener">
              <span className="file-ext">{f.name.split('.').pop()}</span>{f.name} <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" />
            </a>
          ))}
        </div>
      )}
      <Chat thread={`cv-${slug}`} context={ctx} hints={hints} title="Tailor CV with career-ops"
        intro="Runs career-ops' CV pipeline on your locked cv.md: tailors to the job description, blocks anything not in your CV, then makes the PDF. Ask for a cover letter here too: it drafts it with you first, then makes the PDF. Takes a few minutes; it asks you when it needs a decision."
        placeholder={`Name the ${ctx.name} role, paste a job description, or answer Claude…`} />
    </>
  );
}

// What you were typing, per chat: switching tabs or closing the panel unmounts the chat,
// so the half-written message waits here until you come back (cleared when sent).
const chatDrafts = new Map();

// Which chats are on screen right now. A reply that finishes while its chat is closed (or you
// moved to another chat or tab) shows a notice with Open, and marks the browser tab if it's hidden.
const chatsOnScreen = new Map();
let openFromAnywhere = () => {};
let unseenReplies = 0;
const baseTitle = document.title;
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { unseenReplies = 0; document.title = baseTitle; }
});
// Replies for the Ask Claude dot: chats Claude is still writing in, and answers you haven't seen.
const replies = { writing: new Set(), unseen: [], subs: new Set() };
const repliesChanged = () => { for (const f of replies.subs) f({ writing: replies.writing.size, unseen: replies.unseen }); };
function useReplies() {
  const [st, setSt] = useState({ writing: replies.writing.size, unseen: replies.unseen });
  useEffect(() => { replies.subs.add(setSt); return () => replies.subs.delete(setSt); }, []);
  return st;
}
function seenReply(thread) {
  if (!replies.unseen.some((r) => r.thread === thread)) return;
  replies.unseen = replies.unseen.filter((r) => r.thread !== thread);
  repliesChanged();
}
function replyArrived(thread, target, failed) {
  replies.writing.delete(thread);
  if (chatsOnScreen.get(thread)) { repliesChanged(); return; }
  replies.unseen = [...replies.unseen.filter((r) => r.thread !== thread), { thread, target, where: target.name }];
  repliesChanged();
  const name = target.global ? (thread === 'log' ? 'Log' : target.title ?? 'General')
    : target.kind === 'metric' ? 'This week' : target.kind === 'tier' ? `Tier ${target.tier}` : target.kind === 'network' ? 'Network'
      : target.focus === 'person' ? target.ref : target.company;
  const where = thread.startsWith('cv-') ? `Tailor CV · ${name}` : name;
  showToast(failed ? `Claude's reply failed · ${where}` : `Claude replied · ${where}`, failed ? 'bad' : 'ok', { label: 'Open', run: () => openFromAnywhere(target) });
  if (document.hidden) { unseenReplies += 1; document.title = `(${unseenReplies}) ${baseTitle}`; }
}

function Chat({ thread, context, initial, initialDraft = '', hints = null, contextName = '', title = 'Chat with Claude', intro = '', placeholder = '' }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraftState] = useState(() => initialDraft || chatDrafts.get(thread) || '');
  const { item: panelItem } = usePanel();
  useEffect(() => {
    chatsOnScreen.set(thread, (chatsOnScreen.get(thread) ?? 0) + 1);
    seenReply(thread);
    return () => chatsOnScreen.set(thread, chatsOnScreen.get(thread) - 1);
  }, [thread]);
  const setDraft = (v) => { setDraftState(v); if (v) chatDrafts.set(thread, v); else chatDrafts.delete(thread); };
  const [live, setLive] = useState(null); // {text, tools[]} while Claude answers
  const [undone, setUndone] = useState({});
  const scroller = useRef(null);
  const stick = useRef(true); // follow new text only while you're at the bottom
  const box = useRef(null);
  const sentInitial = useRef(false);
  // A pre-typed draft ("Attach to the X application: ") gets the cursor at its end, ready to paste.
  useEffect(() => {
    const el = box.current;
    if (!initialDraft || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [initialDraft]);

  // If a reply is still running from before (panel closed mid-run), wait for it and reload.
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer;
    const load = () => fetch(`/api/chat?thread=${encodeURIComponent(thread)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      setMessages(d.messages ?? []);
      const last = d.messages?.at(-1);
      const waiting = d.busy && last?.role === 'user';
      setRunning(waiting);
      if (waiting) timer = setTimeout(load, 5000);
    });
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [thread]);
  // Keep the newest message in view, but only while you're at the bottom: scrolling up to
  // read stays put. Set scrollTop on the chat itself (scrollIntoView also moved the page).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, live, running]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = async (text) => {
    const msg = String(text ?? draft).trim();
    if (!msg || live || running) return;
    stick.current = true;
    setDraft('');
    setMessages((m) => [...m, { role: 'user', text: msg, at: new Date().toISOString(), fresh: true }]);
    setLive({ text: '', tools: [] });
    // Where Open in the "Claude replied" notice should take you back to.
    const target = !panelItem || panelItem.global ? { global: true, thread, ...(panelItem?.title && chatFor(panelItem) === thread ? { title: panelItem.title } : {}) }
      : { ...panelItem, send: undefined, draft: undefined, tab: thread.startsWith('cv-') ? 'cv' : 'chat' };
    let failed = false;
    replies.writing.add(thread);
    repliesChanged();
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread, message: msg, context }) });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const ev = JSON.parse(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (ev.type === 'text') setLive((l) => ({ ...l, text: l.text + ev.text }));
          if (ev.type === 'turn') setLive((l) => (l.text && !l.text.endsWith('\n\n') ? { ...l, text: `${l.text}\n\n` } : l));
          if (ev.type === 'tool') setLive((l) => ({ ...l, tools: [...l.tools, ev.label] }));
          if (ev.type === 'error') failed = true;
          if (ev.type === 'done' || ev.type === 'error') setMessages((m) => [...m, ev.message ?? { role: 'assistant', error: ev.error }]);
        }
      }
    } catch (e) {
      failed = true;
      setMessages((m) => [...m, { role: 'assistant', error: e.message }]);
    } finally {
      setLive(null);
      replyArrived(thread, target, failed);
    }
  };

  useEffect(() => {
    if (initial && !sentInitial.current) { sentInitial.current = true; send(initial); }
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = async (id) => {
    try { await post('chat-undo', { id }); setUndone((u) => ({ ...u, [id]: true })); showToast('Changes undone'); } catch (e) { showToast(e.message, 'bad'); }
  };
  // A failed reply: drop it and the message it answered, then send that message again.
  const retry = (i) => {
    const asked = messages[i - 1]?.text;
    if (!asked) return;
    setMessages((m) => m.slice(0, i - 1));
    send(asked);
  };

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
      {title && <span className="panel-k">{title}</span>}
      {intro && messages.length === 0 && <p className="muted small">{intro}</p>}
      {messages.length === 0 && !live && (
        <div className="chat-hints">
          {(hints ?? (context ? [`Who should I write to at ${context.name}?`, `Draft a short LinkedIn note for ${context.name}`, `What's new at ${context.name}?`] : ['Messaged Sam today', 'Which tier-1 company should I contact next?', 'Summarise my week so far'])).map((h) => {
            const { label, text } = typeof h === 'string' ? { label: h, text: h } : h;
            return <button key={label} type="button" className="hint" onClick={() => send(text)}>{label}</button>;
          })}
        </div>
      )}
      <ul className="msgs">
        {messages.map((m, i) => (
          <li key={i} className={`msg msg-${m.role}${m.fresh ? ' msg-new' : ''}`}>
            {m.role === 'user' ? <p>{m.text}</p> : (
              <>
                {m.text && <Md text={m.text} />}
                {m.error && (
                  <p className="chat-error">
                    {m.error}
                    {i === messages.length - 1 && messages[i - 1]?.role === 'user' && !live && <button type="button" className="btn btn-sm" onClick={() => retry(i)}>Retry</button>}
                  </p>
                )}
                {m.note && <p className="warn small">{m.note}</p>}
                {m.actions?.map((a, j) => <ActionButton key={j} action={a} />)}
                {m.files?.map((f) => (
                  <a key={f} className="file-link" href={`/api/cv-file?name=${encodeURIComponent(f)}`} target="_blank" rel="noreferrer noopener">
                    <span className="file-ext">{f.split('.').pop()}</span>Open {f} <ArrowUpRight size={12} strokeWidth={2.25} className="ico-inline" />
                  </a>
                ))}
                {m.changed?.length > 0 && (
                  <div className="changed">
                    <span className="muted small">Changed {m.changed.join(', ')}</span>
                    {m.undo && !undone[m.undo] && <button type="button" className="toast-btn small" onClick={() => undo(m.undo)}>Undo</button>}
                    {undone[m.undo] && <span className="muted small">· undone</span>}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {running && !live && <li className="msg msg-assistant"><p className="muted small">Claude is still working on this… the reply shows here when it's done.</p></li>}
        {live && (
          <li className="msg msg-assistant msg-new">
            {live.tools.length > 0 && <p className="tools muted small">{live.tools.at(-1)}…</p>}
            {live.text ? <Md text={live.text} /> : <p className="typing"><span /><span /><span /></p>}
          </li>
        )}
      </ul>
      </div>
      <form className="chat-box" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} disabled={Boolean(live)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={placeholder || (context ? `Ask about ${contextName || context.name}, research, add a note, or change something…` : 'Ask Claude anything about your search…')} aria-label="Message Claude" />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || Boolean(live) || running}>{live || running ? '…' : 'Send'}</button>
      </form>
    </div>
  );
}

// ── Floating action bar ──────────────────────────────────────────────

function Pill({ data }) {
  const { open } = usePanel();
  const [busy, run] = useScan();
  // Dot on Ask Claude: pulsing while Claude writes in a chat you've left, solid when an answer
  // is waiting. With an answer waiting, the button opens that chat.
  const { writing, unseen } = useReplies();
  const waiting = unseen.at(-1);
  return (
    <div className="pill" role="toolbar" aria-label="Quick actions">
      <button type="button" onClick={() => open({ global: true, log: true, draft: 'Messaged ' })}>Log a message</button>
      <button type="button" onClick={() => focusCommand()}>Search<kbd>⌘K</kbd></button>
      <button type="button" onClick={run} disabled={busy || data.scanning}>{busy || data.scanning ? 'Scanning…' : 'Scan'}</button>
      <button type="button" className="pill-ask" onClick={() => (waiting ? open(waiting.target) : open({ global: true }))}
        title={waiting ? `New answer: open the chat` : writing ? 'Claude is still answering' : undefined}>
        Ask Claude
        {(waiting || writing > 0) && <span className={waiting ? 'ask-dot' : 'ask-dot writing'} aria-label={waiting ? `${unseen.length} new ${unseen.length === 1 ? 'answer' : 'answers'}` : 'Claude is answering'} />}
      </button>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────

// Panel width: dragged by its left edge, remembered in this browser.
const PANEL_MIN = 480;
const PANEL_DEFAULT = 680;
const panelMax = () => Math.max(PANEL_MIN, Math.min(1100, window.innerWidth - 240));
const clampWidth = (w) => Math.round(Math.min(Math.max(w, PANEL_MIN), panelMax()));
function usePanelWidth() {
  const [w, setW] = useState(() => { try { return clampWidth(Number(localStorage.getItem('hub:panel-width')) || PANEL_DEFAULT); } catch { return clampWidth(PANEL_DEFAULT); } });
  const set = (next) => { const v = clampWidth(next); setW(v); try { localStorage.setItem('hub:panel-width', String(v)); } catch { /* private mode */ } };
  return [w, set, setW]; // setW: live, unclamped (while dragging)
}

// Drawer physics. No bounce by default; a little only when a flick back carried momentum.
const DRAWER_SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 };
const RESIZE_SPRING = { type: 'spring', visualDuration: 0.25, bounce: 0 };
// Where a release would coast to (deceleration 0.998 per ms → v × 0.499 s).
const project = (x, v) => x + v * 0.499;

// Resize edge: pointer capture, keeps the grab offset, rubber-bands past 480 / max,
// springs back to the limit on release. Arrow keys still nudge by 24px.
function PanelResize({ width, onResize, onLive }) {
  const start = (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const offset = (window.innerWidth - e.clientX) - width;
    let raw = width;
    const band = (w) => {
      const max = panelMax();
      if (w > max) return max + (w - max) * 0.2;
      if (w < PANEL_MIN) return PANEL_MIN - (PANEL_MIN - w) * 0.2;
      return w;
    };
    const move = (ev) => { raw = band(window.innerWidth - ev.clientX - offset); onLive(Math.round(raw)); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      const target = clampWidth(raw);
      if (target === Math.round(raw) || reducedMotion()) { onResize(target); return; }
      animate(raw, target, { ...RESIZE_SPRING, onUpdate: (v) => onLive(Math.round(v)), onComplete: () => onResize(target) });
    };
    document.body.classList.add('resizing');
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const key = (e) => { if (e.key === 'ArrowLeft') onResize(width + 24); if (e.key === 'ArrowRight') onResize(width - 24); };
  return <div className="panel-resize" style={{ right: width - 5 }} onPointerDown={start} onKeyDown={key} tabIndex={0} role="separator" aria-orientation="vertical" aria-valuenow={width} aria-label="Resize panel" />;
}

// The drawer's header starts a drag (after 10px sideways, so its buttons still click).
const DrawerDrag = createContext(null);
function useHeaderDrag() {
  const startDrag = useContext(DrawerDrag);
  return (e) => {
    if (!startDrag || e.button !== 0 || e.target.closest('button, a, select, input, textarea, label')) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev) => {
      if (Math.abs(ev.clientY - y0) > 10) { stop(); return; } // a vertical move isn't a dismiss
      if (Math.abs(ev.clientX - x0) > 10) { stop(); startDrag(ev); }
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
}

// Shown only if data takes longer than 300ms (it's local, so rarely).
function Skeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 300); return () => clearTimeout(t); }, []);
  if (!show) return null;
  return (
    <div className="home skeleton" aria-busy="true" aria-label="Loading">
      <span className="sk sk-eyebrow" /><span className="sk sk-h1" /><span className="sk sk-h1 short" />
      <span className="sk sk-rule" />
      {[0, 1, 2, 3].map((i) => <span key={i} className="sk sk-row" />)}
    </div>
  );
}

export default function App() {
  const { data, error, stale } = useHubData();
  useWeekFavicon();
  const route = useRoute();
  const [stack, setStack] = useState([]);
  const [panelW, setPanelW, setPanelWLive] = usePanelWidth();
  const item = stack.at(-1) ?? null;
  // Drawer: one motion value x (0 = open, width = off-screen). Opening, closing, dragging and
  // reversing all move it from wherever it is now, so nothing restarts or locks.
  const x = useMotionValue(0);
  const closing = useRef(false);
  // While closing, the page takes its space back at once and the drawer slides away over it
  // (waiting for the spring to settle made the layout lag).
  const [leaving, setLeaving] = useState(false);
  const dragControls = useDragControls();
  const scrim = useTransform(x, (v) => Math.max(0, 1 - v / Math.max(panelW, 1)));
  const openPanel = (next) => {
    if (!next) { closePanel(); return; }
    const fromClosed = !item || closing.current;
    closing.current = false;
    setLeaving(false);
    if (!item) x.set(panelW); // start just off-screen
    setStack([next]);
    if (fromClosed) { if (reducedMotion()) x.set(0); else animate(x, 0, DRAWER_SPRING); }
  };
  openFromAnywhere = openPanel;
  const finishClose = () => { if (closing.current) { closing.current = false; setLeaving(false); setStack([]); } };
  const closePanel = (velocity = 0) => {
    closing.current = true;
    setLeaving(true);
    if (reducedMotion()) { finishClose(); return; }
    animate(x, panelW, { ...DRAWER_SPRING, velocity }).then(finishClose);
  };
  const onDragEnd = (e, info) => {
    const v = info.velocity.x;
    if (project(x.get(), v) > panelW * 0.4 || v > 800) { closePanel(v); return; }
    if (reducedMotion()) { x.set(0); return; }
    animate(x, 0, { ...DRAWER_SPRING, bounce: v < -600 ? 0.15 : 0, velocity: v });
  };
  // From the main page, opening something starts a fresh panel history.
  const panel = useMemo(() => ({ item, open: openPanel }), [item, panelW]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PanelContext.Provider value={panel}>
      <div className={`shell${item && !leaving ? ' panel-open' : ''}${stale && data ? ' stale' : ''}`} style={{ '--panel-w': `${panelW}px` }}>
        <Rail data={data} page={route.page} stale={stale} />
        <main className="main">
          {data && <div className="topbar"><CommandBar data={data} compact /></div>}
          {stale && data && (
            <p className="status-bar status-stale" role="status">
              The hub isn't running, so this is the last data it loaded. Start it again with <code>cd hub &amp;&amp; npm run hub</code>. Actions are paused until then.
            </p>
          )}
          {data?.errors?.map((e) => <p key={e} className="status-bar status-file" role="status">Couldn't read <b>{e.split(':')[0]}</b>:{e.slice(e.indexOf(':') + 1)}. The rest of the hub still works.</p>)}
          {error && !data && <p className="notice error">Couldn't load data: {error}. Is the hub running? <code>cd hub &amp;&amp; npm run hub</code></p>}
          {!data && !error && <Skeleton />}
          {data && route.page === 'home' && <Home data={data} />}
          {data && route.page !== 'home' && (
            <div className="page">
              {route.page === 'applications' && <Applications data={data} />}
              {route.page === 'openings' && <Openings data={data} />}
              {route.page === 'outreach' && <><Outreach data={data} /><div id="group-network"><Network data={data} /></div></>}
              {route.page === 'week' && <WeekPage data={data} />}
              <FollowUpsOnPage data={data} page={route.page} />
            </div>
          )}
        </main>
        {data && item && <motion.div className="drawer-scrim" style={{ opacity: scrim }} onClick={() => closePanel()} aria-hidden="true" />}
        {data && item && (
          <motion.div className="drawer" style={{ x }} drag="x" dragListener={false} dragControls={dragControls}
            dragConstraints={{ left: 0, right: panelW }} dragElastic={{ left: 0.08, right: 0 }} dragMomentum={false} onDragEnd={onDragEnd}>
            <DrawerDrag.Provider value={(ev) => dragControls.start(ev, { snapToCursor: false })}>
              <SidePanel data={data} stack={stack} setStack={setStack} onClose={() => closePanel()} />
            </DrawerDrag.Provider>
          </motion.div>
        )}
        {data && item && !leaving && <PanelResize width={panelW} onResize={setPanelW} onLive={setPanelWLive} />}
        {data && <Pill data={data} />}
        <Toast />
        <EvalConfirm />
      </div>
    </PanelContext.Provider>
  );
}

// The full follow-up list (due + next 7 days) lives on the This week page.
function FollowUpsOnPage({ data, page }) {
  if (page !== 'week') return null;
  return <div className="week-follow"><FollowUps data={data} /></div>;
}
