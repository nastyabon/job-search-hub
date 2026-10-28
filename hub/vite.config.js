import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildPayload, WATCH_DIRS, CAREER_OPS } from './server/data.mjs';
import { alumniPreview, alumniAdd } from './server/alumni.mjs';
import { peoplePreview, peopleAdd } from './server/people-search.mjs';
import { postsPreview, postsAdd } from './server/posts-search.mjs';
import { logoFor } from './server/logos.mjs';
import { startEvaluation, recoverEvaluations } from './server/evaluate.mjs';
import { reportHtml } from './server/report-html.mjs';
import { findPreview, findAdd } from './server/find.mjs';
import { markContacted, undo, setAppStatus, checkLive, runScan, rankOpenings, isScanning, addNote, weekTick, trackApplication, addOpenings, scanTitles, hideItem, unhideItem, dropContact, APP_STATES } from './server/actions.mjs';
import { runChat, readThread, undoChat, chatBusy, listThreads } from './server/chat.mjs';

// The "tiny Node server", inside the Vite dev server.
//   GET  /api/data       the full dashboard payload
//   GET  /api/events     server-sent "change" events when any data file changes
//   POST /api/action/contacted  {name, company}  tick a follow-up: messaged today, next in 7 days
//   POST /api/action/status     {num, status}    career-ops set-status.mjs on a tracker row
//   POST /api/action/undo       {id}             revert a tick (only if outreach.yml is unchanged since)
//   POST /api/action/live                        career-ops check-liveness.mjs on every tracked posting
//   POST /api/action/scan       run career-ops scan.mjs, then web-scan.mjs (companies without a job board), then rank-pipeline.mjs
//   POST /api/action/rank       rank-pipeline.mjs only (quick 0-5 fit score, uses Claude)
//   POST /api/action/note       {company, text}   quick note, no AI
//   POST /api/action/week       {kind: post|prep, hours}  tick this week's manual boxes
//   POST /api/action/track      {company, role, date, status, url, channel, contact}  add a tracker row (career-ops merge)
//   POST /api/action/openings   {jobs: [{url, company, title, location, posted}]}  add job links to New openings (pipeline.md ## Pending)
//   POST /api/action/titles     {add: ["Service Designer"]}  also scan for these job titles (portals.yml title_filter.positive)
//   POST /api/action/drop       {name, company}  "won't help": contact → cold, follow-up cleared
//   POST /api/action/hide       {key, label, reason}  hide a Needs-attention row / shelve an opening (hub-data/hidden.yml)
//   POST /api/action/unhide     {key} or {keys}  bring hidden items back
//   POST /api/action/alumni-preview {text, former}  match pasted LinkedIn past-company results to Connections.csv
//   POST /api/action/alumni-add  {people, former}  add the ticked ones to outreach.yml as ex-<company> (profile.yml former_companies)
//   POST /api/action/people-preview {text, company}  Claude reads a pasted LinkedIn people search; intro paths from saved contacts
//   POST /api/action/people-add  {people}       add the ticked ones to outreach.yml (intro_via, why)
//   POST /api/action/posts-preview {text}        Claude reads a pasted LinkedIn post search: hiring posts, fit vs. location rules
//   POST /api/action/posts-add   {posts}        add the ticked posters to outreach.yml (why = the post)
//   POST /api/action/chat-undo  {id}             revert the hub-data files one chat reply changed
//   GET  /api/chat?thread=…     a side-panel thread's messages (cv-<company> = the Tailor CV tab)
//   GET  /api/chats             recent chat threads (for the General panel)
//   GET  /api/logo?company=…  a company's icon (hub-data/logos, fetched once from its own site)
//   GET  /api/cv-file?name=…    a tailored CV from career-ops/output
//   GET  /api/prep-file?name=…  an interview prep file from career-ops/interview-prep
//   POST /api/chat              {thread, message, context}  streams NDJSON events (see server/chat.mjs)
const ACTIONS = { contacted: markContacted, undo, status: setAppStatus, live: checkLive, scan: runScan, rank: rankOpenings, note: addNote, week: weekTick, track: trackApplication, openings: addOpenings, titles: scanTitles, hide: hideItem, unhide: unhideItem, drop: dropContact, 'chat-undo': undoChat, 'alumni-preview': alumniPreview, 'alumni-add': alumniAdd, 'people-preview': peoplePreview, 'people-add': peopleAdd, 'posts-preview': postsPreview, 'posts-add': postsAdd, evaluate: startEvaluation, 'find-preview': findPreview, 'find-add': findAdd };

// HUB_PORT lets a second copy (e.g. a design branch) run next to the main hub. Default 5199.
const PORT = Number(process.env.HUB_PORT) || 5199;
const ORIGIN = new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${PORT}$`);
const sameOrigin = (req) => !req.headers.origin || ORIGIN.test(req.headers.origin);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    // 2 MB: room for several pasted pages of LinkedIn results (Find ex-colleagues).
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}
function hubData() {
  return {
    name: 'hub-data',
    configureServer(server) {
      recoverEvaluations(); // a run still marked running was cut short when the hub stopped
      const clients = new Set();
      let timer;
      const notify = () => {
        clearTimeout(timer);
        timer = setTimeout(() => clients.forEach((res) => res.write('data: change\n\n')), 150);
      };
      // Cached logos aren't data: writing one shouldn't reload the page.
      const watchers = WATCH_DIRS.filter((dir) => fs.existsSync(dir)).map((dir) => fs.watch(dir, { recursive: true }, (_e, f) => { if (!String(f ?? '').startsWith('logos')) notify(); }));
      server.httpServer?.on('close', () => watchers.forEach((w) => w.close()));

      // Lets scripts/start.mjs tell this hub (this folder) from any other program on the port.
      server.middlewares.use('/api/whoami', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ app: 'job-search-hub', root: path.resolve(import.meta.dirname, '..') }));
      });

      server.middlewares.use('/api/data', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          res.end(JSON.stringify({ ...(await buildPayload()), appStates: APP_STATES, scanning: isScanning() }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      server.middlewares.use('/api/action/', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const action = ACTIONS[req.url.replace(/^\/|\?.*$/g, '')];
        // Same-origin JSON POSTs only: blocks other sites from driving the hub through the browser.
        const origin = req.headers.origin;
        if (req.method !== 'POST' || !action || req.headers['content-type'] !== 'application/json'
          || (origin && !ORIGIN.test(origin))) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Bad request' }));
          return;
        }
        try {
          if (action === runScan || action === rankOpenings) notify(); // lets the page show "scanning…" straight away
          const result = await action(await readJson(req));
          res.end(JSON.stringify({ ok: true, result }));
        } catch (err) {
          res.statusCode = 422;
          res.end(JSON.stringify({ error: err.message }));
        } finally {
          notify();
        }
      });

      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method === 'GET') {
          const thread = new URL(req.url, 'http://x').searchParams.get('thread') || 'global';
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ...readThread(thread), busy: chatBusy(thread) }));
          return;
        }
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json' || !sameOrigin(req)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Bad request' }));
          return;
        }
        let body;
        try { body = await readJson(req); } catch { res.statusCode = 400; res.end('{}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
        const emit = (ev) => res.write(`${JSON.stringify(ev)}\n`);
        try {
          await runChat({ thread: body.thread || 'global', message: body.message, context: body.context }, emit);
        } catch (err) {
          emit({ type: 'error', error: err.message });
        }
        res.end();
        notify();
      });

      // A tailored CV from career-ops/output (basename only, PDF or HTML), to open in a new tab.
      server.middlewares.use('/api/logo', async (req, res) => {
        const company = new URL(req.url, 'http://x').searchParams.get('company') ?? '';
        const logo = await logoFor(company).catch(() => null);
        if (!logo) { res.statusCode = 404; res.end(); return; }
        if (logo.redirect) { res.statusCode = 302; res.setHeader('Location', logo.redirect); res.end(); return; }
        res.setHeader('Content-Type', logo.type);
        res.setHeader('Cache-Control', 'max-age=86400');
        res.end(logo.body);
      });
      server.middlewares.use('/api/cv-file', (req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') ?? '';
        const file = path.join(CAREER_OPS, 'output', path.basename(name));
        if (!/^[\w.-]+\.(pdf|html)$/.test(name) || path.basename(name) !== name || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', name.endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });

      // An evaluation report from career-ops/reports (basename only), as a readable page.
      server.middlewares.use('/api/report', (req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') ?? '';
        const file = path.join(CAREER_OPS, 'reports', path.basename(name));
        if (!/^[\w.-]+\.md$/.test(name) || path.basename(name) !== name || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(reportHtml(fs.readFileSync(file, 'utf8'), name.replace(/\.md$/, '')));
      });

      // An interview prep file from career-ops/interview-prep (or its sessions/), as plain text to read or copy.
      server.middlewares.use('/api/prep-file', (req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') ?? '';
        const file = path.join(CAREER_OPS, 'interview-prep', name);
        if (!/^(sessions\/)?[\w.-]+\.md$/.test(name) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });

      // Recent chats (read-only), for the General panel's list.
      server.middlewares.use('/api/chats', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ threads: listThreads() }));
      });

      server.middlewares.use('/api/events', (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
      });
    },
  };
}

// Local only: bound to 127.0.0.1, never deployed (see ../CLAUDE.md §2).
export default defineConfig({
  plugins: [react(), hubData()],
  server: { host: '127.0.0.1', port: PORT, strictPort: true, open: true },
  preview: { host: '127.0.0.1' },
});
