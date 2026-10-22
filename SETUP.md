# Setup (Claude follows this)

The person you're setting up probably doesn't use a terminal. Do every technical step yourself, explain in plain words what's happening, and never ask them to type a command. Ask a few questions at a time, not a form. The whole thing should take about 15–20 minutes.

Start by saying, in your own words: "I'll set up your Job Search Hub. First I'll install a few things (a couple of minutes), then I'll ask you about your job search. Everything stays on this computer."

## 1. Install

1. Check `node --version`. If Node is missing or older than 22.13, say: "You need one free program called Node.js. Go to nodejs.org, download the version marked **LTS**, open it and click through the installer. Tell me when it's done." Then check again.
2. Run `node setup.mjs` from the project root. It checks git, downloads career-ops, copies the starter files into `hub-data/` and installs packages. It's safe to run again.
   - If git is missing on a Mac, run `xcode-select --install` and say: "A window just opened asking to install developer tools. Click **Install** and wait for it to finish (a few minutes), then tell me." Then run setup again.
   - If anything else fails, read the error, fix what you can, and explain the rest in one plain sentence.

## 2. Their CV and job targets (career-ops)

career-ops has its own onboarding. Follow `career-ops/AGENTS.md` → "First Run — Onboarding", running its commands inside `career-ops/`:

- **CV:** ask them to drag their CV (PDF or Word) into this chat, or paste it, or share their LinkedIn profile text. Write `career-ops/cv.md` from it in the shape career-ops expects. Read it back briefly and ask if anything is wrong or missing. Never add anything that isn't in what they gave you.
- **Profile and scanner:** ask for name, email, city and time zone, the roles they want, salary range and currency, and where they'll work (city, country, remote, relocation). Write both files with `node onboard-write.mjs` as AGENTS.md describes.
- Then the deeper questions from its Step 5 (what makes them good, deal-breakers, best achievement).
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

How they get it: on LinkedIn, **Me → Settings & Privacy → Data privacy → Get a copy of your data → Connections → Request archive**. LinkedIn emails a link, usually within 10–30 minutes. When they have the file, ask them to drag `Connections.csv` into the chat; save it as `career-ops/data/Connections.csv`. Run `node linkedin-join.mjs --summary` in career-ops and add the matches at target companies to `outreach.yml` as `to-message` contacts (ex-colleagues as `ex-<key>`).

If they'd rather do this later, skip it. The hub works without it.

## 7. Open it

Start the hub (`npm run hub` from the project root, in the background) and wait until http://127.0.0.1:5199 answers; it opens in their browser. Then tell them:

- **What they're looking at:** Today (who to follow up with), This week (progress), Applications, Outreach.
- **Three things to try:** click a company to open its panel and chat; type "Messaged Sam today" in the ⌘K bar; press **Scan now** on the Openings page.
- **How to come back later:** open Claude in this folder and say "open my job hub". On a Mac they can also double-click **Start Job Hub** in the folder.
- **How to update it:** just tell Claude what happened, in plain words.
- **Nothing is ever sent for them.** Claude drafts; they send.

Mention once that their data lives only in this folder (`hub-data/` and `career-ops/`) and is worth backing up, for example by copying the folder to an external drive now and then.
