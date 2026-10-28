# Setup (Claude follows this)

The person you're setting up probably doesn't use a terminal. Do every technical step yourself, explain in plain words what's happening, and never ask them to type a command. Ask a few questions at a time, not a form. Aim for about 25 minutes. Keep it moving: anything that can wait (rebuilding their CV's design, the deeper career questions) goes on the "later" list in step 7, not into setup.

Start by saying, in your own words: "I'll set up your Job Search Hub. It takes about 25 minutes: first I'll install a few things, then I'll ask you about your job search. It helps to have these ready: your CV (all of them, if you have versions for different kinds of roles), the salary range you're after, and 5 to 15 companies you'd like to work at. Everything stays on this computer. You can skip any question or stop at any point and continue later."

At the start of each step, say where they are and how long it takes, in one line: "Step 2 of 7: your CV (about 5 minutes)." Rough times: 1 install 3 min · 2 CV and job targets 8 min · 3 hub profile 3 min · 4 companies 5 min · 5 weekly targets 1 min · 6 LinkedIn connections 2 min · 7 open it 2 min.

## Already installed?

Before downloading anything, look for an existing hub: this folder may already be one (it has `SETUP.md` and `hub/`), or have a `job-search-hub/` folder in it. If so, never download it again and never create a second copy inside it. Work in that folder.

**Always first, even if setup looks done: the hub's own Claude.** Run `node hub/scripts/claude-check.mjs`. It prints one line:

- `CLAUDE_CODE_OK` → go on below.
- `CLAUDE_CODE_MISSING` or `CLAUDE_CODE_SIGNED_OUT` → fix it now as in step 1.3 (install, then sign in), run the check again, and say in one line what you fixed. Only then go on below.

Then:

- `hub-data/profile.yml` has a `name` and `hub-data/setup-progress.md` is all ticked (or missing, with `career-ops/cv.md` present) → setup is done. Say "Your Job Search Hub is already set up." and open it (CLAUDE.md §0, "open my job hub").
- Otherwise → resume (below). Their data is never overwritten: `setup.mjs` only adds missing files.

If the user is in the wrong place (for example Documents, with the hub in `Documents/job-search-hub`), tell them that next time they should open Claude in the **job-search-hub** folder itself.

## Stopping and resuming

- **Skipping:** everything except the CV can be skipped or left for later ("I'll add companies later", "skip LinkedIn"). The CV is needed because job matching and CV tailoring run on it. Leave skipped fields blank; never fill them with guesses.
- **Progress file:** right after step 1, create `hub-data/setup-progress.md` with one line per step 2–7 (`- [ ] 2. CV and job targets`, …). When a step is finished, tick it (`- [x]`); when they skip it, write `- [x] 4. Target companies (skipped)`.
- **Stopping:** if they want to stop, or hit a usage limit, say: "Everything so far is saved. When you're ready, open Claude in the job-search-hub folder and say **continue the setup**."
- **Resuming** ("continue the setup", or the first-run check in CLAUDE.md §0 sends you here): say hello back, do the hub's-Claude check above, read `hub-data/setup-progress.md`, and continue at the first unticked step. If the file is missing, work it out from the files: `node setup.mjs` not run (no `hub/node_modules`) → step 1; no `career-ops/cv.md` → step 2; `hub-data/profile.yml` has no `name` → step 3; no companies in `outreach.yml` → step 4; no file in `hub-data/weeks/` → step 5. Say in one line what's already done ("Your CV and profile are in. Next: the companies you'd like to work at.") and don't ask again for anything that's already there.

## 1. Install

1. Check `node --version`. If Node is missing or older than 22.13, say: "You need one free program called Node.js. Go to nodejs.org, download the version marked **LTS**, open it and click through the installer. Tell me when it's done." Then check again. If `node` still isn't found, try `/usr/local/bin/node --version` (where that installer puts it). If that works, only this session hasn't picked it up: say "Node is installed, but I need a fresh start to see it. Quit Claude completely, open it again in this same folder and say **continue the setup**. Nothing is lost." If that doesn't work either, the installer didn't finish: ask them to run it again.
2. Run `node setup.mjs` from the project root. It checks git, downloads career-ops, copies the starter files into `hub-data/` and installs packages. It's safe to run again.
   - If git is missing on a Mac, run `xcode-select --install` and say: "A window just opened asking to install developer tools. Click **Install** and wait for it to finish (a few minutes), then tell me." Then run setup again.
   - If anything else fails, read the error, fix what you can, and explain the rest in one plain sentence.
3. **Claude for the hub.** The hub has Claude built in (its chat, Find, scoring openings, CV tailoring, reading LinkedIn pastes). It runs the `claude` command, which the Claude desktop app doesn't provide. Look at what setup printed under "Still to do":
   - `CLAUDE_CODE_MISSING`: say "The hub needs its own copy of Claude Code. I'll install it; it uses your same Claude plan." Run Anthropic's installer: `curl -fsSL https://claude.ai/install.sh | bash`.
   - `CLAUDE_CODE_SIGNED_OUT` (or right after installing): say "Now I'll sign the hub in to your Claude account. A Claude page will open in your browser: check it's your account and approve it, then come back and tell me." Run `node hub/scripts/sign-in.mjs` as a background command (it waits for the browser, up to 15 minutes); never ask them to use Terminal for this.
     - **The browser didn't open:** read the command's output and give them the link after "visit:" as a clickable link: "Open this link, check it's your account and approve it."
     - **The Claude page shows a code** (it does when they used that link): "Copy the code the page shows and paste it here." Then run `node hub/scripts/sign-in.mjs --code "<what they pasted>"`. Never repeat the code back or save it anywhere else.
     - The background command ends with `SIGNED_IN` (done), or `SIGN_IN_FAILED` / `SIGN_IN_TIMED_OUT`: start it again; each run gets a new link and an old code won't work.
   - Run `node setup.mjs` again. It should show "Claude Code command …, signed in".
4. **Start the LinkedIn export now** (it arrives by email in 10–30 minutes, so it's ready by step 6): "One thing to start while we go on: LinkedIn can send you a list of your connections, so I can show who you know at each company. On LinkedIn, go to **Me → Settings & Privacy → Data privacy → Get a copy of your data**, pick **Connections**, and click **Request archive**. We'll use it near the end." If they'd rather not, skip it.

## 2. Their CV and job targets (career-ops)

career-ops has its own onboarding. Follow `career-ops/AGENTS.md` → "First Run — Onboarding", running its commands inside `career-ops/`:

- **CV:** ask them to drag their CV into this chat, and say: "If you have more than one version (for different kinds of roles), drag them all in." Say a PDF works best. These steps replace career-ops' own CV options (don't offer to read a LinkedIn URL):
  - **PDF** (including LinkedIn's "Save to PDF" from their profile): read it directly.
  - **Word (.docx / .doc)**: convert it with macOS' built-in `textutil -convert txt -stdout "<file>"` and read the text. If that fails, ask them to use File → Save as PDF in Word and drag the PDF in.
  - **Pasted text**: use it as is.
  - **Pages or Google Docs**: ask them to export a PDF first.
  - **A LinkedIn profile link**: don't open it (LinkedIn shows a login wall). Ask right away for the PDF instead: "On your LinkedIn profile, click **More → Save to PDF** and drag that file in here."
  - **A scanned CV or image**: read it, and check the read-back below with extra care.
  - **A Markdown CV** (some people keep one for Claude already): use it as it is; only move headings into the shape career-ops expects.

  Write `career-ops/cv.md` in the shape career-ops expects. Never add anything that isn't in what they gave you.

  **Several CVs:** career-ops works from one `cv.md`, the source of every fact. Combine them: every job, project, skill and number that appears in at least one of them, worded as in the CV it came from (when two say the same thing differently, keep the more modest one). Then ask in one line what each version is for ("Which roles do you send each one for?"); their answer goes into `modes/_profile.md` (below) as one archetype per version, with how to frame it, so tailoring picks the right angle for each job. Tell them that's what you did.

  **Then read it back. Don't skip this; it's how they learn to trust the tool.** Keep it short: one line per job (title, company, dates), then education, skills and any numbers you kept, and ask: "Here's what I captured from your CV. What's wrong or missing?" Fix what they say before moving on.
- Don't offer to rebuild their CV's design here; it's on the "later" list in step 7.
- **Profile and scanner:** ask for name, email, city and time zone, the roles they want, salary range and currency, and where they'll work (city, country, remote, relocation). Write both files with `node onboard-write.mjs` as AGENTS.md describes.
- **Deal-breakers and red flags**, in one question: "Anything you want to avoid? In the role (for example people management, on-call, travel) or in the company (an industry, a size, how they work, things you've seen go wrong before)." Write them into `modes/_profile.md` as deal-breakers and red flags, so every evaluation checks them.
- Leave career-ops' other Step 5 questions (what makes them good, best achievement) for later: they're on the list in step 7.
- **Fill in `career-ops/modes/_profile.md`** from their CV and answers: their target roles as the archetypes, how to frame them, comp targets and location policy. The shipped template targets AI and engineering roles, so until it's theirs every evaluation scores against the wrong targets. Don't skip it; `node doctor.mjs --json` lists it under `unpersonalized` until it's done.
- Run `node remember-cli.mjs claude` and `node doctor.mjs` in `career-ops/`. Fix what fails (for example `npx playwright install chromium` if the PDF check fails).

## 3. Their hub profile

Fill `hub-data/profile.yml` from the answers above, then ask only what's still missing:

- **Past employers** they'd message for a referral (`former_companies`). Ask how each appears in LinkedIn's "Past company" filter.
- **Projects they lead with** when contacting a company (`lead_with`): 2–4 short names.
- **How they sign messages** (`sign_off`) and whether they have LinkedIn Premium.
- **Hard rules for what Claude writes about them**: "When I tailor your CV or write a cover letter or a draft, is there anything I should never claim? For example a number of years, a job title, a metric, or why you left your last job. You can skip this." If they ask why (they send everything themselves): the CVs and cover letters are made here, so these rules keep anything they wouldn't stand behind out of them. Each answer is a line in `truth_rules`, in their words.
- `location_rules` in one plain sentence, matching what career-ops got.

Check that the YAML parses (CLAUDE.md §6).

## 4. Target companies

Ask: "Which companies would you love to work at? Five to fifteen is a good start." For each, add a company to `hub-data/outreach.yml` (`status: researching`) with a `tier` (explain the three tiers from profile.yml and let them rename them), a one-line `why`, a `lead_with`, and the domain in `hub-data/logos/domains.yml`. Then add them to career-ops' job scanner, asking once for all of them: `node discover-ats.mjs <Name>` in career-ops (preview, then `--write` after they say yes). A company with no job board the scanner reads still gets scanned: the hub reads its careers page itself (no Claude usage) or, failing that, runs a short web search. So for each one discover-ats couldn't place, find its careers page (one web search) and add it under `tracked_companies` in `career-ops/portals.yml` with `careers_url` and `scan_method: websearch`, keeping that file's comments and style. Say it in one line: "Three of these have no public job board; the hub will check their careers pages when you scan." Never tell them to check those themselves.

If they already talk to people (a recruiter, a friend at a company), add those as contacts too.

## 5. Weekly targets

Show the defaults in `hub-data/routine.yml` in plain words ("5–8 messages to ex-colleagues, 5 to hiring managers, 3–5 applications, 1 LinkedIn post and 2–3 hours of interview prep a week") and ask if that's realistic. Adjust. Then create this week's file (CLAUDE.md §7, step 4).

## 6. LinkedIn connections (optional, very useful)

If they requested the export in step 1, ask whether LinkedIn's email has arrived. Yes → ask them to drag `Connections.csv` (or the .zip) into the chat and follow CLAUDE.md §6b (save it, then `node hub/scripts/connections-match.mjs --write` adds who they know at their target companies). Not yet → don't wait: put it on the "later" list and go on.

If they didn't request it: explain in one line ("With LinkedIn's list of your connections, I can show who you know at each company; that's often the fastest way to a referral"), give the steps from step 1, and put it on the "later" list. The hub works without it.

## 7. Open it

Start the hub with `npm start` from the project root, in the background. It opens in their browser by itself; read the address it prints (usually http://127.0.0.1:5199) and give them the link. Then tell them:

- **What they're looking at:** Today (who to follow up with), This week (progress), Applications, Outreach.
- **Three things to try**, exactly these (the setup guide lists the same three):
  1. In **Today**, click **Find** next to your top company. Claude looks for the right person to contact there.
  2. Click a company to open its panel, and ask Claude something about it in the chat.
  3. On the home screen, click Best new openings, then Scan now. It checks your target companies' job boards and careers pages and scores new roles against your CV. Above the list it shows how many jobs it found and what it filtered out, and why.
  If they skipped target companies, Today is empty: make (1) "Tell Claude a company you'd love to work at" instead.
- **Later, when you want** (only list the ones that apply; each is one sentence they can say to Claude in this folder):
  - "Add my LinkedIn connections export" (if it wasn't ready).
  - "Keep my CV design": tailored CVs that look exactly like their own (about 5 minutes, needs their CV as a PDF; CLAUDE.md §6c).
  - "Ask me the deeper questions": career-ops' questions about what makes them good and their best achievement, which sharpen evaluations and cover letters.
- **How to come back later:** open Claude in this folder and say "open my job hub". On a Mac they can also double-click **Start Job Hub** in the folder.
- **How to update it:** just tell Claude what happened, in plain words.
- **Nothing is ever sent for them.** Claude drafts; they send.

Mention once that their data lives only in this folder (`hub-data/` and `career-ops/`) and is worth backing up, for example by copying the folder to an external drive now and then.
