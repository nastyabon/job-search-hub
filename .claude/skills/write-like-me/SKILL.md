---
name: write-like-me
description: Draft or check any message the user will send (LinkedIn connection note, DM, InMail, email, follow-up, reply to a recruiter) so it reads like they typed it, not like it was generated. Use before showing any outreach draft, and when they paste a message and ask "does this sound generated", "make it sound like me", "more human", or "human check".
---

# Write like me

A message sounds generated when it could be sent to anyone, is too neat, or uses the words models reach for. It sounds like the user when it's short, plain, a bit uneven, and has one real detail only they would know or notice.

## 1. Read first (every time)

- `hub-data/voice-samples.md`: messages the user actually sent, and what they changed in drafts. **This is the best evidence. Copy their rhythm, openers and sign-offs from here over anything below.** If it's empty, write plainly and ask them after the first message what they changed.
- `hub-data/profile.yml`: their name, how they sign off (`sign_off`), `linkedin_premium`, and `truth_rules`. The truth rules are hard rules.
- `career-ops/voice-dna.md` §3 (banned list) and §3F (negative parallelisms), if the file exists.
- The contact in `hub-data/outreach.yml` (title, why, source, notes) and the application in `career-ops/data/applications.md` if there is one.

## 2. Write it

- **Start with why you're writing, in plain words.** "I applied for the Senior Designer role last week and wanted to say hi." No "I hope you're well", "I came across your profile", "I'm reaching out because", "I wanted to connect".
- **One real detail about them or their product**, taken from the contact's `source`/`why` or something the user told you. Not flattery ("love what you're building"). If you don't have a real one, ask for one. **Never invent** a shared connection, a talk they gave, a post the user read, or that the user uses their product.
- **One thing about the user**, one fact, said the way they'd say it across a table. **No numbers or metrics** in short notes unless they ask; then only figures that are in `career-ops/cv.md`. Not a CV line.
- **A small, easy ask.** "Who's the best person to talk to about it?" or "Happy to send a short video of the work if useful." Not "would love to learn more about opportunities on your team".
- **Shape:** 2 to 4 sentences of different lengths. A short fragment is fine. Contractions. No headline-style lines, no matching halves, no list of three.
- **Their English:** match the samples. Don't polish it into textbook English, and don't invent mistakes they wouldn't make.
- **Sign-off:** `sign_off` from profile.yml, else their first name. Never "Best regards" or "Looking forward to hearing from you".
- **Length:** LinkedIn connection note ≤ 300 characters with Premium, ≤ 200 without (`linkedin_premium` in profile.yml). DM, InMail or email: about 40 to 90 words. Follow-up: 1 or 2 sentences.
- No emoji, at most one "!", no bold, no bullet points.

Don't use a fixed formula (hook → proof → CTA) as a template. Its parts are fine, but when every message has the same skeleton, the skeleton itself gives it away.

## 3. Check it

1. Run the linter on the draft as one plain command, exactly this shape, from the job-search root (no `cd`, no variables, no `&&` or `;`, or the hub chat blocks it): `node .claude/skills/write-like-me/lint.mjs "<the draft text>"`. Inside the quotes, leave out `"`, `$` and backticks. `HARD` = fix it. `flag` = look again; one is fine, several mean the draft drifted.
2. Then answer these yourself:
   - **Swap test:** if you replace the name and company, could it go to someone else? Then it's generic. Add the real detail.
   - **Out loud:** would the user say this to this person at a meetup, in this order?
   - **Too neat:** mirrored phrases, a contrast pair, a line that sounds like a quote card? Make it uneven.
   - **Facts:** every claim is true, from `cv.md`, `outreach.yml` or what the user said.

## 4. Show it

- One draft, in a plain code block so it's easy to copy, followed by `N characters` (and the limit, for a connection note).
- One line underneath: who it's for and the one detail it uses.
- No alternatives unless asked. If the user edits it, take their edit as the new truth and don't re-polish it.
- Nothing is ever sent. The user sends.

## 5. Learn from what they sent

When the user says they sent it ("sent", "sent it like this", or pastes the final text), append it to `hub-data/voice-samples.md`:

```markdown
## YYYY-MM-DD · LinkedIn note · hiring manager (Company)
<the text exactly as they sent it>
Changed from the draft: <what they changed, in a few words, or "sent as drafted">
```

Then record the contact as messaged (CLAUDE.md §12). If they changed the same kind of thing twice (e.g. always cut the first sentence, always drop numbers), add it as a line under `## Patterns` at the top of that file.
