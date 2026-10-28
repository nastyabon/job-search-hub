# Job Search Hub

Your job search on one screen. You tell Claude what happened, and it keeps track.

**Not technical? Start here:** [the setup guide](https://imanabonda.notion.site/Job-Search-Hub-401d59d513f78062ab8afd18e945963e). It walks you through everything, no terminal needed.

![The hub's home screen, with demo data]([SCREENSHOT])

## What it does

- **Today:** who to message or follow up with today.
- **This week:** messages, applications, LinkedIn posts and interview prep, against your own weekly goals.
- **Applications:** every role you're tracking, its status, and whether a real person is attached to it.
- **Outreach:** your target companies by tier, and who you know at each.

You update it in plain words ("Messaged Sam today, follow up Monday") and Claude edits the files. Claude also finds people to contact at your target companies, scans their job boards and careers pages and scores new roles against your CV (showing what it filtered out, and why), evaluates a role on request, tailors your CV (in your own CV's design, if you like) and writes cover letters with you, walks you through interview prep step by step (prep doc, plan, practice, debrief), and drafts messages that learn from what you tell it you sent.

## What it never does

- It never sends anything for you.
- It never browses LinkedIn on its own. You paste LinkedIn's own search results, or upload your connections export. If you send Claude a LinkedIn job or job search link, it opens that page and nothing else. Profile pages aren't opened: LinkedIn blocks them, so you paste the text instead. This is enforced in code, and the background tasks (Find, Scan, Evaluate) never open LinkedIn at all.
- There's no account and no server. The hub runs only on your computer (`127.0.0.1`), and your data stays in local folders that are never committed to git. Please don't deploy it anywhere.
- Claude reads your files to answer you, like in any other Claude conversation, and every Claude task uses your own Claude plan.

## What you need

- A Mac. Windows is untested.
- A paid Claude plan (Pro or higher).
- Node.js 22.13 or newer, and git.
- Claude Code. The desktop app alone isn't enough: the hub calls `claude -p` in the background, so setup installs its own copy and signs it in to your account.
- About 25 minutes for setup. Have these ready: your CV (all versions, if you have several for different kinds of roles; Claude combines them), the salary range you're after, and 5 to 15 companies you'd like to work at.

## Quick install

For people comfortable with a terminal:

```bash
git clone https://github.com/nastyabon/job-search-hub
cd job-search-hub
node setup.mjs     # checks Node, git and Claude Code, installs packages
claude             # then say: "walk me through SETUP.md"
npm run hub        # opens at http://127.0.0.1:5199, or the next free port
```

Later: "open my job hub" to start it, "update my job hub" to update, "continue the setup" to finish anything left. On a Mac you can also double-click `Start Job Hub.command`.

## How it's organised

| Path | What it is |
|---|---|
| `CLAUDE.md` | The rules Claude follows: hard rules, how plain-language updates map to file edits, the weekly reset |
| `SETUP.md` | The first-run conversation Claude walks you through |
| `INSTALL.md` | A pointer to the setup guide, and the setup sentence to paste into Claude |
| `setup.mjs` | Installs everything: checks Node, git and Claude Code, downloads career-ops, copies the starter files and installs packages. Safe to run again |
| `Start Job Hub.command` | Double-click launcher for Mac: starts the hub, or opens it if it's already running |
| `hub/` | The dashboard (Vite + React, plus a small local Node server) |
| `hub/scripts/` | Helpers Claude runs: start the hub, check and sign in its Claude, weekly progress, match your connections |
| `hub/server/linkedin-guard-hook.mjs` | The LinkedIn check for the chat: a LinkedIn page opens only if you sent that exact link, once per link, spaced out |
| `hub/server/no-linkedin-hook.mjs` | Blocks LinkedIn pages completely in the background tasks (Find, scan scoring, Evaluate) |
| `hub/server/bin/claude` | A stand-in `claude` command for career-ops' own scripts: runs the real one with the LinkedIn block on |
| `hub-data-example/` | Starter files, copied to `hub-data/` on setup |
| `hub-data/` | Your data: profile, outreach, weekly files, notes (gitignored) |
| `career-ops/` | An untouched clone of career-ops, downloaded on setup (gitignored) |
| `.claude/skills/write-like-me/` | Drafts messages that sound like you, learning from what you actually sent |
| `LICENSE` | MIT |

## Status

Early. Mac only, tested on a few machines. I don't have data on outcomes, so there are no promises here about getting hired faster. Bugs and questions are welcome as GitHub issues.

## Credits

Built on [career-ops](https://github.com/career-ops-hq/career-ops) (MIT), by [Santiago Fernández de Valderrama](https://github.com/career-ops-hq/career-ops), with network outreach and a weekly routine added on top. career-ops does job discovery, fit scoring, CV tailoring and the application tracker.

Made by [@imanabonda](https://www.instagram.com/imanabonda/). Updates on [Instagram](https://www.instagram.com/imanabonda/) / [LinkedIn](https://www.linkedin.com/in/anastasia-bondarchuk-60838912b/) / [Threads](https://www.threads.com/@imanabonda?xmt=AQG08GMkDXbUHCUAnnzegF6gD1cKu7_mTfnIjjPuZQgf3TI).

## License

MIT. See [LICENSE](LICENSE).
