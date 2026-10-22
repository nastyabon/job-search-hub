# Setup (Claude follows this)

The person you're setting up probably doesn't use a terminal. Do every technical step yourself, explain in plain words what's happening, and never ask them to type a command. Ask a few questions at a time, not a form. The whole thing should take about 15–20 minutes.

Start by saying, in your own words: "I'll set up your Job Search Hub. First I'll install a few things (a couple of minutes), then I'll ask you about your job search. Everything stays on this computer. You can skip any question or stop at any point and continue later."

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

## 2. Their CV and job targets (career-ops)

career-ops has its own onboarding. Follow `career-ops/AGENTS.md` → "First Run — Onboarding", running its commands inside `career-ops/`:

- **CV:** ask them to drag their CV into this chat. Say a PDF works best. These steps replace career-ops' own CV options (don't offer to read a LinkedIn URL):
  - **PDF** (including LinkedIn's "Save to PDF" from their profile): read it directly.
  - **Word (.docx / .doc)**: convert it with macOS' built-in `textutil -convert txt -stdout "<file>"` and read the text. If that fails, ask them to use File → Save as PDF in Word and drag the PDF in.
  - **Pasted text**: use it as is.
  - **Pages or Google Docs**: ask them to export a PDF first.
  - **A LinkedIn profile link**: don't open it (LinkedIn shows a login wall). Ask right away for the PDF instead: "On your LinkedIn profile, click **More → Save to PDF** and drag that file in here."
  - **A scanned CV or image**: read it, and check the read-back below with extra care.

  Write `career-ops/cv.md` in the shape career-ops expects. Never add anything that isn't in what they gave you.

  **Then read it back. Don't skip this; it's how they learn to trust the tool.** Show a short summary of what you captured (each job with title, company and dates; education; skills; any numbers you kept) and ask: "Here's what I captured from your CV. What's wrong or missing?" Fix what they say before moving on.
- **Profile and scanner:** ask for name, email, city and time zone, the roles they want, salary range and currency, and where they'll work (city, country, remote, relocation). Write both files with `node onboard-write.mjs` as AGENTS.md describes.
- Then the deeper questions from its Step 5 (what makes them good, deal-breakers, best achievement).
- **Fill in `career-ops/modes/_profile.md`** from their CV and answers: their target roles as the archetypes, how to frame them, comp targets and location policy. The shipped template targets AI and engineering roles, so until it's theirs every evaluation scores against the wrong targets. Don't skip it; `node doctor.mjs --json` lists it under `unpersonalized` until it's done.
- Run `node remember-cli.mjs claude` and `node doctor.mjs` in `career-ops/`. Fix what fails (for example `npx playwright install chromium` if the PDF check fails).

## 3. Their hub profile

Fill `hub-data/profile.yml` from the answers above, then ask only what's still missing:

- **Past employers** they'd message for a referral (`former_companies`). Ask how each appears in LinkedIn's "Past company" filter.
- **Projects they lead with** when contacting a company (`lead_with`): 2–4 short names.
- **How they sign messages** (`sign_off`) and whether they have LinkedIn Premium.
- **Hard rules about themselves**: "Is there anything I should never say about you? For example a number of years, a job title, a metric, or why you left your last job." Each answer is a line in `truth_rules`, in their words.
- `location_rules` in one plain sentence, matching what career-ops got.

Check that the YAML parses (CLAUDE.md §6).

## 4. Target companies

Ask: "Which companies would you love to work at? Five to fifteen is a good start." For each, add a company to `hub-data/outreach.yml` (`status: researching`) with a `tier` (explain the three tiers from profile.yml and let them rename them), a one-line `why`, a `lead_with`, and the domain in `hub-data/logos/domains.yml`. Offer once to add them to career-ops' job scanner (`node discover-ats.mjs <Name>` in career-ops; preview, then `--write` after they say yes).

If they already talk to people (a recruiter, a friend at a company), add those as contacts too.

## 5. Weekly targets

Show the defaults in `hub-data/routine.yml` in plain words ("5–8 messages to ex-colleagues, 5 to hiring managers, 3–5 applications, 1 LinkedIn post and 2–3 hours of interview prep a week") and ask if that's realistic. Adjust. Then create this week's file (CLAUDE.md §7, step 4).

## 6. LinkedIn connections (optional, very useful)

Explain: "LinkedIn lets you download a list of your connections. With it, I can show you who you know at each company you're targeting. That's often the fastest way to a referral."

How they get it: on LinkedIn, **Me → Settings & Privacy → Data privacy → Get a copy of your data → Connections → Request archive**. LinkedIn emails a link, usually within 10–30 minutes. When they have the file, ask them to drag `Connections.csv` into the chat; follow CLAUDE.md §6b (save it, then `node hub/scripts/connections-match.mjs --write` adds who they know at their target companies).

If they'd rather do this later, skip it. The hub works without it.

## 7. Open it

Start the hub with `npm start` from the project root, in the background. It opens in their browser by itself; read the address it prints (usually http://127.0.0.1:5199) and give them the link. Then tell them:

- **What they're looking at:** Today (who to follow up with), This week (progress), Applications, Outreach.
- **Three things to try**, exactly these (the install guide lists the same three):
  1. In **Today**, click **Find** next to your top company. Claude looks for the right person to contact there.
  2. Click a company to open its panel, and ask Claude something about it in the chat.
  3. On the **Openings** page, press **Scan now**. It checks your target companies' job boards and scores new roles against your CV.
  If they skipped target companies, Today is empty: make (1) "Tell Claude a company you'd love to work at" instead.
- **How to come back later:** open Claude in this folder and say "open my job hub". On a Mac they can also double-click **Start Job Hub** in the folder.
- **How to update it:** just tell Claude what happened, in plain words.
- **Nothing is ever sent for them.** Claude drafts; they send.

Mention once that their data lives only in this folder (`hub-data/` and `career-ops/`) and is worth backing up, for example by copying the folder to an external drive now and then.
