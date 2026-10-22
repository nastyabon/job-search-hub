# DESIGN.md — Job Search Hub

Directive reference for any agent that builds or critiques UI in `hub/`. Values below are the ones in
`hub/src/styles.css` and `hub/src/App.jsx`; when they disagree with this file, the code wins and this
file gets fixed. History of how we got here: `DESIGN-history.md`. Visual source: `DESIGN-notion-reference.md`.

## 1. Purpose and scope

- **Product:** a local, single-user dashboard for a job search that runs through people, not only job boards.
  It reads career-ops data and adds outreach, the weekly routine and a Claude chat per job.
- **Users:** one person per copy (the job seeker). The UI says "you"; no name is hard-coded in UI copy.
- **Jobs, in priority order:**
  1. Tell me who to contact today, and let me log it.
  2. Talk to Claude about an opening, a company, a draft or who to reach.
  3. See where applications, openings and outreach stand.
  4. See the week against the routine.
- **Scope:** every screen in `hub/src`. Not career-ops' own output (CVs, reports).
- **Platforms:** desktop web on localhost, in Chrome. Phone width must stay usable, not designed for. Never deployed.

## 2. Product and user principles

1. **People first.** Every application should have a person attached. The UI shows the gap (the thread) instead of hiding it.
2. **Today answers the job.** The first section on Home is always Today; it never says "nothing to do" while the weekly pace is behind.
3. **Nothing is sent.** The hub drafts, logs and tracks. the user sends. No UI may imply sending.
4. **Colour means something.** A hue marks a tier, a channel or a weekly target, the same one everywhere. Vermillion means "needs you".
5. **Calm by default, alive on action.** Things move when the user does something (tick, attach, open, drag), not on load.
6. **Talk instead of forms.** Data changes happen through ticks, plain-language chat and career-ops commands, not data-entry forms.

## 3. Visual hierarchy and layout rules

- **Shell:** icon rail (56px, opens to 200px over the page) · sticky top bar with search (`--bar-h` 60px) · page · floating action bar · side drawer.
- **Home, left column, in this order:** headline + serif lede → Today → No person yet (only when any) → Best new openings (3) → Outreach tiles.
  **Right column:** week targets only. Charts live on This week.
- **Headline:** one sentence that answers the day ("3 people to reach today." / "Done for today."). The week count goes in the lede below it.
- **Drawer:** header (what it is) → facts line (status, channel, person, posting) → tabs (Details · Chat · Tailor CV) → one full-height tab body.
  General / Log open as a single chat with a history button; week, tier and network panels open on their overview tab.
- **Rows:** at most two direct actions — click opens the drawer, the tick logs it. "Draft", "attach a person" and × are shortcuts into the same flows.
- **Lists are ruled rows inside white cards.** No cards inside cards. The outreach tiles are the only colour panels.
- **Page width:** Home max 1240px, list pages max 1100px, centred. Section rhythm on Home: 16–24px between cards.

## 4. Token and visual-system guidance

Use tokens. No raw hex in components. Dark values exist for every token (`prefers-color-scheme: dark` and `data-theme`).

| Role | Token | Light |
|---|---|---|
| Canvas | `--bg` | `#f6f5f4` |
| Card / panel | `--surface` | `#ffffff` |
| Hover | `--hover` | `#efeeec` |
| Hairline / strong line | `--line` / `--line-strong` | `#e4e2df` / `#d3d0cc` |
| Text: ink / body grey / faintest allowed | `--ink` / `--ink-2` / `--ink-3` | `#191918` / `#615d59` / `#6f6a65` |
| UI state (current page, chosen row) | `--select` | `#e6f3fe` |
| The one filled action | `--primary` (+ `-bg`, `-ink`) | `#0075de` |
| Needs you | `--signal` (+ `-bg`) | `#e32d14` |
| Good / done | `--good` (+ `-bg`) | `#1f8a5a` |

**Meaning hues** (token names kept from an earlier palette; set with `hue-*` classes that expose `--c`, `--c-bg`, `--c-deep`, `--c-on`):

| Class | Colour | Means |
|---|---|---|
| `hue-violet` | marigold `#ffb110` | Tier 1 · hiring managers · HM messages |
| `hue-teal` | sky `#62aef0` | Tier 2 · recruiters · interview prep |
| `hue-green` | mocha `#b18164` | Tier 3 · referrals |
| `hue-amber` | midnight `#02093a` | network · warm messages |
| `hue-blue` | `#0075de` | applications |
| `hue-pink` | mocha `#b18164` | LinkedIn posts |
| `hue-grey` | `--ink-3` | cold · no meaning |

- **Type:** Inter (`--font-display`, `--font-ui`; numbers use tabular figures) and Source Serif 4 (`--font-serif`) for the Home lede only.
  Headline 46px/650/-0.035em · page title 32px/650/-0.03em · section title 15px/600 · body 14px · meta 12–12.5px.
  Reference scale for anything new: caption 12/1.33 (+0.01em) · body-sm 14/1.43 · body 16/1.5 · subheading 20/1 ·
  heading-sm 22/1.27 (-0.011em) · heading 40/1.5 · display-sm 54/1.04 (-0.035em). Negative tracking only from 22px up; body stays at normal tracking.
- **Radius** (`--radius-sm/-md/-lg/-full`, from the reference): 12px cards and tiles · 8px buttons, rows, inputs · 4px small marks · 9999px pills and chips. 2–3px only for data marks (segments).
- **Spacing:** 4px base, scale from the reference: `--space-4` 4 · `-8` 8 · `-12` 12 · `-16` 16 · `-20` 20 · `-24` 24 · `-28` 28 · `-32` 32 · `-36` 36 · `-64` 64 · `-80` 80.
  New UI uses these tokens only. Existing styles still use 6 · 10 · 18 · 22px in places; snap them to the scale when touched.
- **Layout constants** (reference → hub): element gap 8px · card padding 24px (hub cards use 18/22px for density; new cards use 24px) ·
  section gap 80px on marketing-style pages only; the hub keeps 16–24px between cards · page max 1440px (hub caps content at 1240 / 1100px).
- **Elevation:** content cards have no shadow (hairline only). Shadows only on:
  top bar = nav elevation `0 0.7px 1.462px rgb(0 0 0 / .015), 0 3px 9px rgb(0 0 0 / .03)` ·
  drawer, ⌘K results = mockup elevation `0 4px 12px rgb(0 0 0 / .1)` · floating bar and notices (their own soft shadow).
- **Motion:** reference default is 200ms ease for hovers and transitions. The hub uses `--ease: cubic-bezier(0.23, 1, 0.32, 1)`;
  0.1–0.15s for hover/press, 0.18–0.22s for enters. Springs only where a gesture is involved (no bounce in the hub).
  Drawer and resize use springs (`visualDuration` 0.3 / 0.25, `bounce` 0).

## 5. Component selection and usage rules

| Need | Use | Rule |
|---|---|---|
| Open an item | Row click → drawer | Never navigate away for an item |
| Log "messaged" | `TickButton` | On people only; Today rows fold away after the tick |
| Remove from a list | `HideButton` (×) | Hides via `hidden.yml`; Undo in the notice. On people, `DropButton` marks them cold |
| Person ↔ application | `Thread` | Channel colour; missing = dashed stub, amber ≤2 days, vermillion after |
| Person on a company | `ContactRow` (threaded) | Spine + branch in relation colour; tick is the branch end |
| Status / channel / date | `Chip` kinds: late, today, soon, later, undated, via, warn, score, fit-*, reached, not-reached, suggested, untracked | One chip style per row; words from `LABEL`, never raw codes |
| Weekly target | `Segments` / `WeekBars` | One segment per unit; outline = stretch range |
| Fit score | `FitScore` | Neutral under 4, green from 4 |
| Primary action | `.btn-primary` | One per view (Ask Claude, Send) |
| Secondary action | `.btn` (outlined), sky-tint ghost for Draft / Get ahead | |
| Feedback | `showToast` | One at a time; Undo when the action is reversible |
| Server / file problems | `.status-bar` (stale, file) | Keep the page usable; say what to run |
| Loading | `Skeleton` | Only after 300ms |
| Talk to Claude | `Chat` inside the drawer | One chat per job (see §10) |

## 6. Interaction states and behavior

- **Hover:** soft rounded highlight behind rows (inset, never past the card edge). Colour change only on buttons.
- **Press:** rows highlight on pointer-down; buttons, the tick and icon buttons scale to 0.97 / 0.92 for 100ms.
- **Focus:** `:focus-visible` ring, 2px ink. Hover-only controls (×) also show on `:focus-within`.
- **Drawer:**
  - opens with a spring from off-screen;
  - dragging the header right dismisses it, decided by projected position or flick speed;
  - it reverses from wherever it is;
  - the page takes its space back the moment closing starts;
  - nothing locks input.
- **Rail:** opens over the page after a 0.15s hover delay; names are revealed by the growing width.
- **Tick:** strike, then fold (~280ms), then save; if the save fails, the row comes back.
- **Live data:** the page refreshes on file changes without moving your scroll; if the server stops, data stays and is marked stale.
- **Reduced motion:** everything instant except short fades on notices.

## 7. Content and microcopy guidance

- Sentence case. Plain words. Talk to "you".
- Headline is a sentence; section titles are nouns ("Today", "Best new openings").
- Name the person before the task: "Priya Shah · Head of Product · Acme".
- Dates: "Wed 21 Oct" / "21 Oct"; relative for nearness ("1d late", "Today", "8 min ago"). Week is "Week 43".
- Empty states name the next action in one line ("Nobody at Acme yet. Paste a LinkedIn link in the chat to add someone.").
- Never show data codes (`to-message`, `recruiter-inbound`); map them through `LABEL`.
- Say "Ask Claude", never sparkle icons or "AI magic".
- Drafts follow the `write-like-me` skill and the truthfulness rules in `CLAUDE.md` §2.

## 8. Accessibility requirements

- Text contrast ≥ 4.5:1 against its background; `--ink-3` is the lightest text colour allowed (4.9:1 on canvas). Check new tokens before use.
- Every icon-only control has an `aria-label`. Status never relies on colour alone (icon or text alongside).
- Keyboard: ⌘K focuses search; Esc closes the drawer; arrow keys resize the drawer edge; × controls reachable by Tab.
- `prefers-reduced-motion` is honoured everywhere (CSS global rule + `reducedMotion()` in JS).
- Touch (`hover: none`): hover-only controls are always visible.
- [NEEDS TEAM INPUT: target standard, e.g. WCAG 2.2 AA, and whether rows should become focusable for keyboard opening]

## 9. Responsive behavior

| Width | Behaviour |
|---|---|
| > 1180px | Drawer pushes the page (page margin = drawer width) |
| ≤ 1180px | Drawer covers the page; scrim follows it |
| Home container ≤ 1040px | Right column drops under the left |
| ≤ 1000px | Week page goes to one column; application titles take the room, thread shortens |
| ≤ 760px | Rail becomes a bottom bar; drawer full width; floating bar above the bottom bar; row meta wraps |

- Drawer width: 680px default, drag 480–1100px (max also window − 240px).
- [NEEDS TEAM INPUT: whether tablet widths need their own layout]

## 10. AI-specific UI patterns

- **One chat per job:**
  - General (whole search);
  - Log (what you did, one-line confirmations);
  - one per company (people share it);
  - Tailor CV per company (career-ops pdf mode);
  - one per weekly target per week;
  - tiers;
  - network.
  The header names the chat.
- **Context is automatic:** the drawer passes the item to Claude; don't make the user re-explain.
- **Drafts appear in chat, copyable; nothing is sent.** "Draft" on a row asks for one straight away.
- **hub-data edits apply at once, with Undo per reply;** broken YAML is reverted automatically.
- **career-ops changes come as Apply buttons** (`hub-action` blocks) and run only on click.
- **Streaming:** show the tool in use ("Reading…") and the text as it arrives; a reply still running after reopening shows "Claude is still working on this…".
- **Errors** sit in the thread with Retry; the typed message is kept.
- **Chat history** lists every chat (General and Log first) with "x min ago" and the last message.

## 11. Anti-patterns and prohibited choices

- Gradients, glass / backdrop blur, glow.
- Shadows on content cards; cards inside cards.
- Colour without a meaning, or a meaning hue used for UI state.
- Any filled button colour other than `--primary`; more than one primary per view.
- Raw data codes, ALL-CAPS labels, emoji in UI chrome, sparkle icons.
- Animations on page load, staggered lists, bounce on buttons or modals, hover-scaling.
- Animating layout properties (`width`, `margin`, `left`) on everyday interactions, except the rail, which overlays.
- Forms for data entry; "Send" buttons for messages; anything that implies auto-sending.
- Text below 4.5:1; hover-only controls with no focus or touch fallback.
- Deploying, public URLs, or real people's data in screenshots shared outside the machine.

## 12. Canonical design references

- Code: `hub/src/styles.css` (tokens, components), `hub/src/App.jsx` (components, labels, motion).
- Visual source: `hub/DESIGN-notion-reference.md` (warm canvas, hairline cards, accent cast).
- Decisions and history: `hub/DESIGN-history.md` (decision log from the 21 Oct grilling session).
- Behaviour and data rules: `CLAUDE.md` §2 (hard rules), §11 (running the hub), §12 (update rules).
- Figma / Storybook: none. [NEEDS TEAM INPUT]

## 13. Preflight checklist (before generating UI)

- [ ] Which job from §1 does this serve? If none, don't build it.
- [ ] Does it fit an existing component (§5)? Reuse before adding.
- [ ] Which hue, if any, and what does it mean? Is that meaning already taken?
- [ ] Is there one primary action at most?
- [ ] What are the empty, loading, error and stale states?
- [ ] What moves, and is it caused by the user's action?
- [ ] Does any text need a `LABEL` mapping or plain-language rewrite?
- [ ] Does it touch data? Then: through actions.mjs, career-ops commands or chat, never a form; Undo where possible.

## 14. Final UI QA checklist

- [ ] Tokens only; no raw hex; works in light and dark.
- [ ] Contrast ≥ 4.5:1 for all text.
- [ ] Hover, press, focus-visible and touch states present.
- [ ] Reduced motion: nothing moves except allowed fades.
- [ ] 1440, 900 and 390px widths checked; drawer open and closed.
- [ ] No raw codes, no ALL-CAPS, no emoji, sentence case.
- [ ] No cards in cards, no content shadows, one primary action.
- [ ] Empty / loading / error / stale states render.
- [ ] `npm test` passes and the page loads with no console errors.
