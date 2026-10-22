# Job Search Hub

A personal dashboard for your job search that you run by talking to Claude.

- **Today:** who to follow up with, and what's overdue.
- **This week:** messages, applications, posts and interview prep against your own weekly targets.
- **Applications:** every role you're tracking, its status, and whether a real person is attached to it.
- **Outreach:** the companies you're targeting, by tier, and who you know at each.

You update it in plain words ("Messaged Sam today, follow up Monday") and Claude does the rest. It finds and scores openings, tailors your CV and drafts messages in your voice. It never sends anything for you.

It's built on [career-ops](https://github.com/career-ops-hq/career-ops) for job discovery, fit scoring, CV tailoring and the application tracker, and adds network outreach and a weekly routine on top.

**Private by design.** It runs only on your computer (`127.0.0.1`), and your data stays in local folders that are never committed to git. Please don't deploy it anywhere.

## Install

**Not technical?** Follow **[INSTALL.md](INSTALL.md)**. You install the Claude app and Node.js, then Claude sets everything up by chatting with you.

**Comfortable with a terminal?**

```bash
git clone https://github.com/nastyabon/job-search-hub
cd job-search-hub
node setup.mjs     # Node 22.13+, git, and Claude Code (signed in) required
claude             # then say: "walk me through SETUP.md"
npm run hub        # http://127.0.0.1:5199
```

Requirements: a paid Claude plan, the Claude Code command (`claude`, installed and signed in; the hub calls `claude -p` for chat, Find, scoring openings, CV tailoring and reading LinkedIn pastes; the desktop app alone doesn't provide it, so setup installs it), Node.js 22.13 or newer, and git.

## How it's organised

| Path | What it is |
|---|---|
| `CLAUDE.md` | The rules Claude follows: hard rules, how plain-language updates map to file edits, the weekly reset |
| `SETUP.md` | The first-run conversation Claude walks you through |
| `hub/` | The dashboard (Vite + React, plus a small local Node server) |
| `hub-data-example/` | Starter files, copied to `hub-data/` on setup |
| `hub-data/` | Your data: profile, outreach, weekly files, notes (gitignored) |
| `career-ops/` | An untouched clone of career-ops (gitignored) |
| `.claude/skills/write-like-me/` | Drafts messages that sound like you, learning from what you actually sent |

## LinkedIn

The hub never scrapes LinkedIn. You run LinkedIn's own searches and paste the results, or upload your connections export. Claude only opens a single job posting or profile link you give it.
