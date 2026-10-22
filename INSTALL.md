# How to install the Job Search Hub

No coding needed. You'll install two free programs, then Claude sets up the rest by chatting with you. It takes about 30 minutes, most of it answering questions about your job search.

**What you need**

- A Mac (Windows should work too, but hasn't been tested yet)
- A paid Claude plan (Pro or higher). The hub uses Claude for its chat, CV tailoring and job matching, so every person uses their own plan.
- Your CV, as a PDF or Word file

**Your data stays on your computer.** The hub isn't a website. It runs only on your machine, and nothing about you or your contacts is uploaded anywhere, apart from what you ask Claude in a chat.

---

## Step 1. Install the Claude app

1. Go to **claude.ai/download** and download the app for your computer.
2. Open it and sign in with your Claude account.

<!-- screenshot: Claude app after sign-in -->

## Step 2. Install Node.js

Node.js is a free program the hub runs on. You install it once and never have to open it.

1. Go to **nodejs.org**.
2. Download the version marked **LTS**.
3. Open the downloaded file and click **Continue** / **Install** until it's done. Your Mac may ask for your password.

<!-- screenshot: nodejs.org with the LTS button highlighted -->

## Step 3. Ask Claude to set it up

1. In the Claude app, open **Code** (Claude Code).
2. Choose a folder to work in, for example **Documents**.
3. Copy this sentence, paste it into the chat and press Enter:

   > Set up the Job Search Hub from https://github.com/nastyabon/job-search-hub in this folder. Read its SETUP.md and walk me through it.

4. Claude will ask for permission before it runs things on your computer. Allow it. It's installing the hub and the job-search tool it uses (career-ops).

<!-- screenshot: Claude Code with the sentence pasted -->

**If a window pops up asking to install "command line developer tools"**, click **Install** and wait a few minutes. Your Mac needs it to download the hub. Then tell Claude "done".

## Step 4. Answer Claude's questions

Claude will ask you about:

- **Your CV.** Drag the file into the chat.
- **What you're looking for:** roles, city, remote or not, salary.
- **Past employers** whose people you could ask for referrals.
- **Companies you'd love to work at.** Five to fifteen is a good start.
- **Anything it should never say about you**, like a number of years or a job title.
- **Your weekly goals**, for example how many messages and applications a week.

Answer in your own words. You can change any of it later just by telling Claude.

## Step 5. Your hub opens

When setup is done, the hub opens in your browser at **127.0.0.1:5199**. That address only works on your computer.

<!-- screenshot: the hub's home page -->

---

## Using it every day

**To open it:** open the Claude app, go to Code, choose the **job-search-hub** folder and say *"open my job hub"*. On a Mac you can also double-click **Start Job Hub** inside that folder.

**To update it, just tell Claude what happened**, in the hub's chat or in Claude Code:

- "Messaged Sam at Acme today, follow up next Monday"
- "Priya replied, we're talking on Thursday"
- "Applied to Acme, here's the link"
- "I posted on LinkedIn" / "did 2 hours of interview prep"
- "Start a new week"

**Claude never sends anything for you.** It writes drafts; you copy them and send them yourself.

## Optional: find who you know at each company

LinkedIn lets you download your list of connections. With it, the hub shows who you know at each company you're targeting, which is often the fastest way to a referral.

1. On LinkedIn, click **Me → Settings & Privacy → Data privacy → Get a copy of your data**.
2. Choose **Connections** and click **Request archive**.
3. LinkedIn emails you a link, usually within 10 to 30 minutes. Download the file and unzip it.
4. Drag **Connections.csv** into the Claude chat and say "here's my LinkedIn connections export".

## Back up your data

Everything personal lives in two folders inside **job-search-hub**: `hub-data` and `career-ops`. Copy the whole job-search-hub folder to an external drive or cloud folder now and then.

## Something's not working?

Tell Claude what you see, in the same folder: "the hub won't open", "I see an error that says…". It can read the setup and fix most things. If you're stuck, ask whoever shared this with you.
