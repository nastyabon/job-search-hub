# Job Search Hub

A local dashboard for one person's job search, run through Claude Code. It reads **career-ops** (job discovery, fit scoring, CV tailoring, application tracking) and adds what career-ops doesn't cover: network outreach and a weekly routine.

## 0. First run

If any of these is true, follow `SETUP.md` before anything else, then come back here:

- `career-ops/` or `hub/node_modules/` is missing,
- `hub-data/profile.yml` is missing or has no `name`,
- `career-ops/cv.md` is missing,
- `hub-data/setup-progress.md` has an unticked step,
- the user says "continue the setup" (even when setup is done: SETUP.md always checks the hub's own Claude install and sign-in first, and fixes them),
- the hub showed "Claude isn't set up for the hub yet" or "Claude isn't signed in for the hub".

When the user says "open my job hub" (or similar) and setup is done: run `npm start` from the project root as a background command. It opens the hub if it's already running; otherwise it starts it on port 5199, or on the next free port (5299, 5399, 5499) if another program has 5199, and the browser opens by itself. Read the address it prints and give them that link.

When the user says "update my job hub" (or similar). Updates never touch their data (`hub-data/`, `career-ops/` are gitignored):

1. `git status --porcelain`. If any tracked file was changed locally, say which in plain words and ask before going on. Never discard their changes.
2. Note the current commit, then `git pull --ff-only`. If it says "Already up to date", tell them and stop.
3. `node setup.mjs` (installs new packages and adds any new starter files without overwriting theirs).
4. Summarise what's new in 2–4 plain lines from `git log --oneline <old>..HEAD`.
5. If the hub is running, stop it and run `npm start` again so the new version loads.
6. Then check career-ops too: `node update-system.mjs check` in `career-ops/`, and follow its own update steps if one is available (ask first, as its AGENTS.md says).

## 1. What this is

One page that shows:

1. **Today**: overdue and due-today follow-ups.
2. **This week**: progress against the weekly targets in `hub-data/routine.yml`.
3. **Applications**: every role from career-ops' tracker, its status, and whether a person is attached to it.
4. **Outreach**: target companies by tier, and the people to contact at each.

The user updates it by talking to Claude in plain language (§6), in this terminal or in the hub's side-panel chat.

## 2. Hard rules (never break)

- **Local only.** The hub runs on `127.0.0.1`. Never deploy it, never make it public, never change `host`. The data includes real people's names and private notes.
- **Data stays out of git.** `hub-data/` and `career-ops/` are gitignored. Never force-add them.
- **Don't modify career-ops code.** Keep it a clean clone so its updater works. The hub reads career-ops files and only writes to them through career-ops commands. (Two exceptions: adding job links under `## Pending` in `data/pipeline.md`, the inbox career-ops asks you to paste job URLs into; changing the job titles in `title_filter` in `portals.yml` (what to look for and what to skip), a user-layer setting, when the user asks; and switching companies in its `tracked_companies` on or off (`enabled`), also user layer.) Personal settings go in career-ops' user layer (`cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`), as its own `AGENTS.md` says.
- **Nothing gets sent automatically.** No auto-submitting applications, no auto-sending messages, no LinkedIn scraping (it breaks LinkedIn's terms and risks the account). Opening a LinkedIn job posting or job search the user sent in the conversation is fine, that exact link only: one page per link, several links one after another (more than 10: ask first). Never open a LinkedIn page the user didn't send, and never follow links from an opened page (not the jobs listed on a search page, not "people also viewed", not the next profile). Profile links (`linkedin.com/in/…`) are never opened, even when the user sends them (LinkedIn blocks profile pages for the hub): save the link on the person if it's useful (their `source`, for a saved contact without one) and reply right away "LinkedIn blocks profile pages for the hub. Open the profile, press ⌘A then ⌘C, and paste it here." When a job search page loads, list its jobs and offer to add them to New openings or evaluate one; A search link with a job selected (`currentJobId=<id>`) also opens that one job's own page (`/jobs/view/<id>`), since the ID is in the link the user sent; to read any other job on the list in full, the user sends its link. Report per link whether it was read or showed a login page / no content, and ask the user to paste the text for those; never guess from a partial page. In the hub's chat and Tailor CV this is enforced in code (`hub/server/linkedin-guard-hook.mjs`); the hub's background runs (Find, scan scoring, Evaluate) never open LinkedIn at all (`no-linkedin-hook.mjs`). Never browse LinkedIn on your own (no searches, feeds or messages the user didn't send), never bulk-collect profiles, never log in or work around a login wall. Drafts only. The user sends.
- **Truthfulness for anything written about the user** (CVs, cover letters, messages):
  - Only facts that are in `career-ops/cv.md` (and career-ops' other user-authored files). Never invent a metric, a title, a project or a skill. Reword, never inflate.
  - Follow every line of `truth_rules` in `hub-data/profile.yml`. Those are the user's own hard rules.
  - If a claim isn't backed by a file, ask. If they don't add it, leave it out.

## 3. Folder layout

```
job-search-hub/
├── CLAUDE.md               ← this brief
├── SETUP.md                ← first-run steps (Claude follows these)
├── setup.mjs               ← installs everything; safe to run again
├── Start Job Hub.command   ← double-click launcher (Mac)
├── career-ops/             ← untouched clone of career-ops (gitignored)
│   ├── cv.md               ← master CV
│   ├── config/profile.yml
│   ├── portals.yml         ← companies to scan
│   └── data/applications.md ← application tracker (career-ops owns this)
├── hub-data/               ← the user's own data (gitignored; starts as a copy of hub-data-example/)
│   ├── profile.yml         ← who they are, location rules, past employers, truth rules
│   ├── outreach.yml        ← companies + people to contact
│   ├── routine.yml         ← weekly targets
│   ├── application-meta.yml ← channel + contact per application
│   ├── weeks/              ← one file per week: manual checkboxes
│   ├── notes/              ← one file per company
│   └── voice-samples.md    ← messages they actually sent (for drafting in their voice)
└── hub/                    ← the dashboard app
```

## 4. Data model

- `profile.yml`: `name`, `sign_off`, `role`, `focus`, `base`, `timezone`, `linkedin_premium`, `location_rules`, `former_companies` (each becomes the warm relation `ex-<key>`), `lead_with` (projects they lead with), `tiers` (what tier 1/2/3 mean), `truth_rules`.
- `outreach.yml`: `companies` (`name`, `tier`, `base`, `lead_with`, `why`, `status`, `notes`) and `contacts` (`name`, `company`, `relation`, `channel`, `contacted` list, `last_contact`, `next_action`, `next_date`, `status`, optional `title`, `why`, `source`, `intro_via`). The comments at the top of the file list the allowed values.
- `routine.yml`: `weekly_targets` (warm messages, hiring-manager messages, applications, LinkedIn posts, interview prep hours), each a number or `{min, max}`.
- `application-meta.yml`: one row per application, keyed by `company` + `role` exactly as in the career-ops tracker, with `channel` (referral | hiring-manager | recruiter-inbound | cold) and `contact`.

## 5. Running the hub

- `npm start` from the project root (`hub/scripts/start.mjs`) → http://127.0.0.1:5199, bound to localhost only. If this hub is already running it just opens it (`/api/whoami` tells it apart from other programs); if another program has 5199 it uses 5299, 5399 or 5499. On a Mac, double-clicking `Start Job Hub.command` does the same. `npm run hub` starts the server directly on 5199 (or `HUB_PORT`).
- The hub's own Claude: `node hub/scripts/claude-check.mjs` says whether it's installed and signed in; `node hub/scripts/sign-in.mjs` signs it in without Terminal (SETUP.md step 1.3: the link if the browser doesn't open, and `--code` for the code the Claude page shows).
- `npm test` runs the parser and date tests. `node hub/scripts/week-progress.mjs [YYYY-MM-DD]` prints one week's counts.
- The page reloads itself when anything in `hub-data/` or `career-ops/data/` changes. Code: `hub/server/data.mjs` (all reads, read-only), `hub/server/profile.mjs` (reads profile.yml), `hub/server/actions.mjs` (the only writes), `hub/vite.config.js` (`/api/data`, `/api/events`, `POST /api/action/*`), `hub/src/App.jsx`.
- What the page itself can change (same-origin POSTs only):
  - Tick a contact or follow-up → `contacted` gets today, `last_contact` today, `next_date` +7, `next_action` "follow up if no reply", `status: messaged` (unless already further along); the company moves `researching`/`to-contact` → `contacted`.
  - Application status dropdown → `node set-status.mjs --row N <Status>` in career-ops (never a hand edit).
  - "Scan now" → `node scan.mjs` in career-ops, then `hub/server/web-scan.mjs`, then `node rank-pipeline.mjs --limit 20` (quick 0–5 fit score against `cv.md`; uses `claude -p`). Results show under New openings (from `data/pipeline.md` `## Pending`), best score first; a green "New" chip marks the ones the latest scan found (`first_seen` in `data/scan-history.tsv`, or `hub-data/web-scan/seen.json`, = that scan's day). Scan filters live in `career-ops/portals.yml`.
  - web-scan.mjs covers the companies scan.mjs can't read: enabled `tracked_companies` no career-ops provider claims, plus `outreach.yml` companies (not parked) missing from portals.yml. A `careers_url` is read with career-ops' `browser-extract.mjs --mode listing` (no Claude usage); otherwise, or when that lists nothing, a short web search (`claude -p`, sonnet, web tools only, no LinkedIn; up to 3 searches of 6 companies per scan, cached 3 days in `hub-data/web-scan/` when it found jobs; one that found nothing is tried again next scan). Jobs go through career-ops' own title and location matchers (`title_filter`, `location_filter`) and into `## Pending` via `addOpenings`; each URL is offered once (`seen.json`). Never tell the user to check a company's jobs themselves.
  - Each web-scanned job must link to a posting (an applicant-system host, or a job / career / position / vacancy path), so news and blog links are dropped. A job with no location is checked against the places named in its title ("…, United States, Redmond"). The same role under two links counts once when both name the same location, and New openings shows each company + title + location once; jobs with no location are kept apart (two cities can share a title).
  - New openings folds away roles the quick score put under 2/5 (wrong place, wrong role, or not a job), behind "Show N roles scored under 2/5"; Best new openings on Home leaves them out. A role with no location says so.
  - First scan: the first time the page loads after setup (`firstScan` in `actions.mjs`: cv.md and portals.yml exist, no unticked setup step, never scanned), the hub starts the scan by itself, once (`hub-data/first-scan.json`). Home shows a welcome notice while it runs, and a Scan now notice if no scan has happened since.
  - The scan list: job titles can't tell industries apart ("Partnerships Manager" is at every company), so which companies are scanned is what keeps New openings in the user's field. career-ops ships with about 100 AI and software companies switched on. The `companies` hub-action (`scanCompanies` in `actions.mjs`; `node hub/scripts/scan-list.mjs` from a terminal) adds companies with `discover-ats.mjs --write`, switches listed ones off or on, or switches off every company not in `outreach.yml` (`onlyMine`). Undo in the toast. A company discover-ats can't place is tried again under other board names (`slugVariants`: no separators, no leading "The", no Group / Studios / Inc), and a board it marks `# verify:` is taken out again and named, so the company is read from its careers page instead.
  - Above New openings: where the last scan's jobs went (found → seen before → filtered by title / location / age → new, from `data/scan-runs.tsv` and `hub-data/web-scan/last.json`), which board-less companies were read how, and "Show what was filtered out" (this scan's `skipped_*` rows in `scan-history.tsv` plus the web scan's). The `titles` hub-action (`scanTitles` in `actions.mjs`) adds title keywords to `title_filter.positive`, removes ones that let in too much, or adds `negative` ones (Undo in the toast).
- Hiding by hand: × on a Needs-attention row, or Shelve on an opening → `hub-data/hidden.yml` (`{key, label, reason, at}`; Undo in the toast). When the user says "shelve X" in chat, add the entry there.
- Removing a person: × on any person row ("won't help") → `status: cold`, `next_date`/`next_action` cleared, a dated note. The contact stays in `outreach.yml` (so a LinkedIn re-import skips them). Same as "drop X" in chat.
- Connections at a new company: when `outreach.yml` gains a company (chat, Find, by hand), the hub adds the people from `career-ops/data/Connections.csv` who work there (`hub/server/connections.mjs`, same as §6b; `hub-data/connections-matched.json` remembers matched companies, so people removed by hand aren't added back).
- Find ex-colleagues (Warm messages panel): the user runs LinkedIn's own people search (1st connections, past company = one of `former_companies`) and pastes the result pages. `hub/server/alumni.mjs` matches the names against `career-ops/data/Connections.csv`; nothing on LinkedIn is opened. Ticked people go into `outreach.yml` as `ex-<key>`, `to-message`.
- Find (Today → Find next to a tier-1 company with nobody yet, or the company panel → "Who should I contact at X?"): `hub/server/find.mjs`. People you already know there (connections export, free) and up to 6 people a short web search suggests (`claude -p`, sonnet, web tools only, never opens LinkedIn pages; cached 7 days in `hub-data/find/`), plus tips when names aren't public. Tick boxes; nothing is saved until Add (Undo in the toast). Added people are `to-message` with `next_date` today and `next_action: first message`, so they show in Today with a Draft button; the company moves `researching` → `to-contact`.
- Find people at a company (company panel): the user pastes LinkedIn's people search (current company, 1st + 2nd). `hub/server/people-search.mjs` has Claude read the paste (`claude -p`, no tools); mutuals who are saved contacts or connections become intro paths (`intro_via`). When the user asks to draft for someone with `intro_via`, draft the intro request to the introducer first.
- Hiring posts (Openings page): the user pastes a LinkedIn Posts search. `hub/server/posts-search.mjs` has Claude pick out hiring posts and rate each role against `location_rules`. Ticked posters are added `to-message`.
- Logos: `hub-data/logos/domains.yml` maps company → website; the icon is fetched once from that site and cached. When you add a company, add its domain there too.
- Side panel chat (`hub/server/chat.mjs`): runs `claude -p` from the project root (so this file applies), one resumable session per thread in `hub-data/chats/`. Locked down: edits only in `./hub-data/**`, Bash only for read-only scripts, no MCP servers. career-ops changes are proposed as ```` ```hub-action {json}``` ```` blocks and only run when the user clicks Apply.
- A LinkedIn job search link the user sends: the chat opens that page once (`linkedin-guard-hook.mjs`) and lists its jobs with their links; "Add" is the `openings` hub-action (`addOpenings` in `actions.mjs`), which puts them under `## Pending` in `career-ops/data/pipeline.md` (skipping any already there or in the tracker), so they show under New openings and can be scored. To read or evaluate another job on the list, the user sends that job's link; the chat never opens it from the list. The job the search page showed open can be evaluated straight away when its full description was on the page.
- Full report (`evaluate`; the button says "Full report" so it isn't mistaken for the quick score next to each opening; on New openings, Best new openings, and applications with no report yet; or Claude proposes it in the chat as a `hub-action` `evaluate`): never automatic, always after a confirm. `hub/server/evaluate.mjs` runs career-ops' auto-pipeline in the background inside `career-ops/` with the same locked-down setup as Tailor CV (edits only in `reports/`, `output/`, `jds/`, `batch/tracker-additions/`, `interview-prep/`, `data/pipeline.md`; only the evaluation and CV scripts; never `set-status`). A pre-check (location, level, role type) runs first and stops it with nothing written if the role clearly doesn't fit. One at a time. State in `hub-data/evaluations.json` (`running` / `done` / `stopped` / `failed` / `interrupted`; a run cut short by the hub stopping shows as interrupted on the next start). The verdict is posted into the company's chat; the hub adds the `application-meta.yml` row. Reports open from the application (`/api/report`).
- "Tailor CV" tab: a `claude -p` session inside `career-ops/` that follows its pdf mode (cv.md → tailored HTML → fact gate → PDF in `output/`). §2 and `truth_rules` are appended to its prompt. It may write only `output/`, `jds/`, `/tmp/cv-*` and `/tmp/cover-payload-*`; never `cv.md`, config, modes or scripts.
  - With the user's own CV design (`hub-data/cv-design/cv.html`, §6c), Tailor CV copies it (`node ../hub/scripts/cv-design.mjs copy`), changes only the words between the tags (never tags, classes, CSS or the order of sections), keeps the original page count (`<meta name="cv-pages">`) and makes the PDF with career-ops' `generate-pdf.mjs`, which runs the fact gate. cv.md stays the source of every fact. Without that folder it uses career-ops' own template.
  - Cover letters run in the same tab ("Write a cover letter for …" hint): career-ops' cover mode (`modes/cover.md`: research, keywords, gaps, four questions, draft in the chat), then, after the user approves the draft, `node generate-cover-letter.mjs --payload /tmp/cover-payload-<slug>.json` (fact gate included; `--format` from the CV design's `cv-format` when there is one, otherwise career-ops' `page_format`) → `output/cover-<candidate>[-<report>]-<company>-<date>.pdf`, listed with the CVs. It uses career-ops' cover-letter template, not the user's CV design. The report's "Cover Letter Draft" section isn't updated (reports/ are read-only there).
- "Interview prep" tab (shows once a role at the company is Responded / Assessment / Interview / Offer, or prep files exist): a `claude -p` session inside `career-ops/` running its interview modes (`interview-prep`, `interview/plan`, `interview/practice`, `interview/debrief`, `interview-redflag`). §2 and `truth_rules` are appended to its prompt. It may write only `interview-prep/**` and `data/salary-observations.tsv`, and run only `story-provenance-check.mjs` and `salary-gap.mjs`; never the tracker, `cv.md`, config, modes or reports. Above the chat, the steps in career-ops' order (1 Prep doc → 2 Prep plan → 3 Practice → 4 Debrief, + Red flags once a practice or debrief exists), ticked from what the modes saved (`# Interview Intel:`, `## Prep Plan`, `## Round N Debrief`, `source:` in `interview-prep/sessions/`). Start sends; Fill in puts the message in the box for the date, round or how it went. Prep files open as plain text (`/api/prep-file`), handy to paste into claude.ai voice mode for spoken practice.
- New week: when `hub-data/weeks/<this week>.md` doesn't exist, Home shows "New week: say 'start a new week'" with a button that sends it to the General chat (§7). It disappears once the file exists. Ticking a post or prep hour on the page creates the week's file first if it's missing (same shape as §7, no summary).
- LinkedIn in background runs (Find, Evaluate, scan scoring): enforced in code, not just the prompt. `hub/server/no-linkedin-hook.mjs` is a PreToolUse hook that refuses WebFetch on linkedin.com, every subdomain (de., uk., …), lnkd.in and licdn.com (a `WebFetch(domain:…)` rule matches the exact host only, so subdomains slipped through). It's passed with `--settings` (`noLinkedInArgs()` in `claude-bin.mjs`); career-ops scripts the hub runs get it through `hub/server/bin/claude` on their PATH. Web search results may still mention LinkedIn links; pages are never opened. Evaluate refuses a LinkedIn job link up front (use the employer's posting, or paste the description in the chat).
- Notes: `hub-data/notes/<company-slug>.md`, one `- YYYY-MM-DD: text` per line.
- How counts work: warm / hiring-manager messages = dates in each contact's `contacted` list that fall in the week (any `ex-*` relation, or `friend`, = warm; `friend` = knows the user well without having worked together, set only when they say so). Applications = `Applied` transitions in `career-ops/data/status-log.tsv`. Posts and prep = ticked boxes in `hub-data/weeks/YYYY-Www.md`.

## 6. Update rules (plain language → file edits)

General:
- Resolve relative dates ("today", "next Monday", "in a week") in the `timezone` from profile.yml (else this computer's) and write ISO `YYYY-MM-DD`. Say the resolved date back.
- Edit YAML in place with the Edit tool: keep comments, order and style. After editing, check it parses: `cd hub && node -e 'const y=require("js-yaml"),fs=require("fs");for(const f of ["profile.yml","outreach.yml","routine.yml","application-meta.yml"])y.load(fs.readFileSync("../hub-data/"+f,"utf8"));console.log("ok")'`.
- Match people and companies case-insensitively. If a name matches more than one contact, or none and the company/relation is unclear, ask one short question instead of guessing.
- Confirm every change in one line ("Sam: messaged 20 Oct, follow up Mon 27 Oct").
- Nothing is ever sent. If the user asks for a message, write a draft; they send it.
- Every message draft goes through the `write-like-me` skill (`.claude/skills/write-like-me/`). When the user says they sent something, add it to `hub-data/voice-samples.md`.

| The user says | Do |
|---|---|
| "Messaged Sam today, follow up next Monday" | Contact Sam: append the date to `contacted`, set `last_contact`, `next_date`, `next_action` (default "follow up if no reply"), `status: messaged` unless already `replied`/`intro-made`/`reference-yes`. No follow-up date given → default +7 days and say so. Unknown person → add a contact (ask the relation if not obvious). |
| "Sam replied" | `status: replied`, `last_contact` = today, and clear `next_date` and `next_action` (the old follow-up no longer applies). Then ask what the next step is and when. If they give one ("we're talking Thursday"), set `next_date` and `next_action` from it. If there's none, or they don't say, leave both empty: never invent a date. Confirm in one line ("Sam: replied 22 Oct, no next step yet"). |
| "Sam introduced me to Priya at Acme" | Sam → `intro-made`. Add Priya (`to-message`, company Acme, relation from context). Company Acme `researching` → `to-contact`. |
| "Sam will be a reference" | `status: reference-yes`. |
| "Priya is a friend" / "I know Jamie well" | `relation: friend` (warm: counts toward warm messages). Only when the user says so; never infer it from a LinkedIn connection. Ex-colleagues keep their `ex-<company>` relation. Unknown person → add them with `status: to-message` (ask their company if not obvious). |
| "Priya is at Figma now" / "where does Priya work now?" | Set the contact's `company` (and `title` if known); keep `relation`. Add a note line: "Now at X (per <source>, YYYY-MM-DD)." If asked to check, one web search for that person only (never their LinkedIn profile page: if they send the link, ask them to paste the profile); never sweep the whole list. |
| "Push Jordan to the 28th" / "move the Acme follow-up to Friday" | Set that contact's `next_date` (keep `status`). Do the same for everyone else at that company who is due on or before the new date, or is `to-message`, so the whole company leaves Today together. Never touch `cold` contacts. Name everyone you moved. |
| "Alex went quiet" / "drop X" | `status: cold`, clear `next_date`. |
| "Add Acme to outreach, tier 2, recruiter reached out" | New company with every field (`tier`, `base`, `lead_with`, `why`, `status`, `notes`); pick `lead_with` from profile.yml and say what you picked. Add the recruiter as a contact and the domain to `logos/domains.yml`. The hub adds their LinkedIn connections there by itself (§5). Offer to add it to career-ops' scanner: `node discover-ats.mjs <Name>` in career-ops (preview first, `--write` only after they say yes; in the hub's chat, propose the `companies` hub-action with `add`). No board found → add it under `tracked_companies` in `career-ops/portals.yml` with its `careers_url` (one web search) and `scan_method: websearch`, so Scan now reads its careers page. |
| "Park Acme" / "Acme: contacted" | Change that company's `status`. |
| "I posted on LinkedIn" | Tick the first unticked box under `## LinkedIn posts` in this week's file; if all are ticked, add `- [x] Post N`. |
| "Did 2h of prep" | Tick 2 boxes under `## Interview prep`; add `- [x] 1h` lines if there aren't enough. Half hours: `- [x] 0.5h`. |
| "Applied to Acme" | Only through career-ops: `cd career-ops && node set-status.mjs <company or #> Applied` (add `--on YYYY-MM-DD` if not today). No tracker row yet → evaluate it first (`/career-ops {JD or URL}` in a Claude session opened in `career-ops/`), or add it without an evaluation (next row). Then make sure `application-meta.yml` has the row's exact company + role, and ask for `channel` and `contact` if missing. Set the outreach company `status: applied`. |
| "Applied to Acme last Friday, here's the link" (no tracker row, no evaluation wanted) | Hub action `track` (`hub/server/actions.mjs` → `trackApplication`): reserve a number, headed TSV in `career-ops/batch/tracker-additions/` (status `Evaluated`, score `N/A`, no report), `merge-tracker.mjs`, then `set-status.mjs --row N Applied --on <date>`. Keep the job link as the posting URL. Then ask for `channel` and `contact`. |
| "Evaluate this job: <link>" (or a pasted job description) | Run career-ops' full evaluation from this folder (§6a). |
| Drags in `Connections.csv` (or LinkedIn's export .zip), or "here's my LinkedIn connections export" | Save it and add who they know at their target companies (§6b). |
| "Got an interview at Acme" / "Acme rejected me" | `node set-status.mjs <company or #> Interview` / `Rejected`. Never edit `applications.md` by hand. |
| After any career-ops evaluation | Add the row to `application-meta.yml` (company + role exactly as in the tracker) and ask: channel and who the human is. |
| "I also worked at Spotify" / "I'm only looking in Berlin now" | Update `hub-data/profile.yml` (`former_companies`, `location_rules`, …) and, if it affects scanning or evaluation, offer the matching change in career-ops' user layer (`config/profile.yml`, `portals.yml`). |
| "Make my tailored CVs look like my own CV" / "keep my CV design" | §6c. |
| "Set my weekly applications goal to 4 to 6" / "make my warm messages goal 5" | Change that goal under `weekly_targets` in `hub-data/routine.yml` (`warm_messages`, `hiring_manager_messages`, `applications`, `linkedin_posts`, `interview_prep_hours`). A range becomes `{ min: 4, max: 6 }`. A single number becomes that number at both ends: `{ min: 5, max: 5 }`. Keep the comment on that line. Messages and applications count against the new goal from this week. For `linkedin_posts` or `interview_prep_hours`, don't touch this week's file: say the new goal starts next week (the next "start a new week" makes the boxes). Confirm in one line ("Applications: 4–6 a week, from this week" / "LinkedIn posts: 2 a week, from next week"). |
| "Also scan for Service Designer roles" / "why did the scan skip X?" | Add the title keywords to `title_filter.positive` in `career-ops/portals.yml` (Edit, keep comments; in the hub's chat, propose the `titles` hub-action). Role titles only, never a bare domain word: "Ad Monetization Manager", not "Monetization", which also matches "Product Designer, Monetization". Say the next scan picks them up. If a negative keyword blocked it, name the keyword and ask before removing it. |
| "Why is a designer role in my openings?" / "stop showing engineering roles" | Find the positive keyword that let it in (usually a bare domain word) and offer to replace it with role titles; offer negatives for role families they don't do ("Designer", "Engineer"). `titles` hub-action with `remove` / `add` / `exclude` in the hub's chat. |
| "Scan only my companies" / "New openings is full of companies I never picked" | `node hub/scripts/scan-list.mjs --only-mine` (preview; companies they want to keep go in `--keep "A,B"`), then `--write` after they agree (in the hub's chat, the `companies` hub-action with `onlyMine`). Say how many were switched off and that the next scan uses it. Offer companies in their field to add instead. |
| "Ask me the deeper questions" | career-ops' onboarding Step 5 questions (what makes them good, best achievement; deal-breakers and red flags if missing), a few at a time. Answers go into `career-ops/modes/_profile.md`. |
| "Start a new week" | §7. |

### 6a. Evaluating a job

The user never has to leave this folder. **In the hub's side-panel chat**, never run it there: propose the `evaluate` hub-action and the hub runs it in the background (§5). **In a Claude Code session in this folder**, when they ask to evaluate a job (a link, or a pasted description):

1. Say first, in one line: "This is career-ops' full evaluation: a fit report and a tailored CV. It takes several minutes and uses a fair share of your Claude plan."
2. Read `career-ops/.claude/skills/career-ops/SKILL.md` and follow its **auto-pipeline** route, with `PROJECT_ROOT` = `career-ops/` (its "Project Root Resolution" section). Every career-ops path is relative to `career-ops/`; run every script as `cd career-ops && node …`. career-ops' own rules apply in full (its `AGENTS.md`): never invent facts, the LinkedIn job-description guard, the employer check for aggregator links, liveness checks. Skip its update check and any first-run onboarding prompts unless `node doctor.mjs --json` says onboarding is needed (then send the user to SETUP.md instead).
3. The result: a report in `career-ops/reports/`, the tracker row added as **Evaluated** (through `batch/tracker-additions/` and `merge-tracker.mjs`, never a hand edit), and a tailored CV PDF in `career-ops/output/`. Never mark it Applied: that's the user's call.
4. Then add the row to `hub-data/application-meta.yml` (company + role exactly as in the tracker), and reply with: the score and a 2–3 line verdict (fit, main gaps, posting legitimacy), where the report and PDF are, and two questions: how they're applying (referral / hiring-manager / recruiter-inbound / cold) and who the person is.

### 6b. Adding the LinkedIn connections export

Works any time, including when setup skipped it. In this folder, when the user drags in `Connections.csv` (or LinkedIn's data-export `.zip`), or says "here's my LinkedIn connections export":

1. **Find the file.** Use the path they dropped. If they only said it, look in `~/Downloads` for the newest `Connections.csv` or a `*LinkedInDataExport*.zip`, and say in one line which file you're using. Nothing there → explain how to get it (LinkedIn → Me → Settings & Privacy → Data privacy → Get a copy of your data → the larger data archive, which includes connections → Request archive; ready in 10–30 minutes: don't wait for an email, refresh that LinkedIn page and click Download) and stop.
2. **Save it** as `career-ops/data/Connections.csv`: `cp "<file>" career-ops/data/Connections.csv`, or from a zip `unzip -p "<zip>" Connections.csv > career-ops/data/Connections.csv`. A newer export replaces the old one. It holds other people's details: never commit it, upload it or paste it into a chat.
3. **Match it** against the target companies in `hub-data/outreach.yml`: `node hub/scripts/connections-match.mjs` (preview), then `node hub/scripts/connections-match.mjs --write`. They asked for this, so add without asking again, unless the preview has more than 30 people: then show it per company and ask first. People already saved are skipped; each new one is `to-message`, `why: Already a connection`, with their profile link.
4. **Reply in 2–4 lines:** how many connections, who was added at which companies (names), and that they now show under each company and in Next up. If nobody matched, say so and suggest adding more target companies. From now on, Find and Find ex-colleagues also use the file.

### 6c. Keeping the user's own CV design

When the user wants their tailored CVs to look like their own CV ("keep my CV's design", "make it look like my CV"), or says yes when setup offers it. Do this in a Claude session in this folder (the hub's chat can't run these tools; if asked there, say so and point them here). It needs their CV as a PDF; a Word or Pages file, export it as PDF first.

Run each `cv-design.mjs` command on its own (not chained with `;` or `&&`, and not with other shell tools), and change files with Edit, not `sed`/`perl`: other commands may be refused.

1. **Start:** `node hub/scripts/cv-design.mjs init "<their CV.pdf>"`. It copies the PDF to `hub-data/cv-design/original.pdf`, renders each page into `hub-data/cv-design/check/` (works on a Mac out of the box; elsewhere it needs poppler's `pdftoppm`), lists the fonts stored in the PDF and saves its pictures (photo, logo) into `hub-data/cv-design/assets/` with their transparency. Read every page image. Delete pictures the CV doesn't show.
2. **Fonts:** for each font, `node hub/scripts/cv-design.mjs font "<Family>" 400,700,400i` downloads the open-license version (Fontsource, the same files as Google Fonts) into `assets/fonts/` with its license and prints the `@font-face` lines for `style.css`. A font that isn't there (a commercial one): use the closest free one and say which. No font names stored in the PDF: match by eye and say so.
3. **Rebuild it** as `hub-data/cv-design/cv.html` (structure and wording) plus `hub-data/cv-design/assets/style.css` (all the styling; fonts as `url("fonts/…")`, images as `assets/…`). Rules:
   - The wording is the PDF's, word for word. If it differs from `career-ops/cv.md`, tell the user; cv.md stays the source of facts.
   - Plain semantic HTML with clear class names (`section`, `h2`, `.job`, `.row` with a `.when` for dates, `ul.bullets`), so changing words never means touching structure. No scripts (the PDF step runs with JavaScript off).
   - In `<head>`: `<meta name="cv-format" content="a4">` (or `letter`, from the page size), `<meta name="cv-pages" content="N">` (the original's page count), and a comment saying Tailor CV changes only the words.
   - Page margins go in `:root { --page-margin: … }` (career-ops sets the page from it), plus the same `@page` rule. Use `break-inside: avoid` on jobs and bullets, and `break-after: avoid` on headings, so pages break where the original's do.
4. **Compare:** `node hub/scripts/cv-design.mjs check` renders cv.html through career-ops' own PDF step into `hub-data/cv-design/check/` and prints the page count next to the original's, then the page images of both. Look at them side by side and fix sizes, spacing, margins and page breaks until the line breaks and page breaks match. Usually 2–4 rounds; if the text wraps earlier everywhere, the font size is a little too big.
5. **Tell the user** what matches and what doesn't. Always mention that career-ops' PDF step turns typographic characters into plain ones for ATS parsers (en dashes become hyphens, curly apostrophes straight ones). Then offer a test: Tailor CV for one role they're applying to, and look at the result together.

To go back to career-ops' own template, delete (or rename) `hub-data/cv-design/`.

## 7. Weekly reset ("start a new week")

1. Work out last week and the new week (ISO weeks, Monday start).
2. Run `node hub/scripts/week-progress.mjs <any date in last week>`.
3. Write a 3-line summary: (1) what hit target, (2) what didn't, with the numbers, (3) one focus for this week drawn from the misses and the dashboard (e.g. tier-1 companies with no contact, applications with no human attached). Show it and append it to last week's file under `## Summary`.
4. Create `hub-data/weeks/<new week>.md` in this exact shape (one box per post target, one box per prep hour at the top of the range from `routine.yml`):

   ```markdown
   # 2026-W44 · Mon 26 Oct – Sun 1 Nov 2026

   <!-- Messages and applications are counted from outreach.yml (contacted dates) and the
        career-ops tracker. Only the manual items below are ticked here. -->

   ## LinkedIn posts
   - [ ] Post 1

   ## Interview prep (1 box = 1 hour)
   - [ ] 1h
   - [ ] 1h
   - [ ] 1h

   ## Notes
   ```
5. Don't change outreach or applications during the reset. Do list anything overdue in Today so they can start the week with it.
