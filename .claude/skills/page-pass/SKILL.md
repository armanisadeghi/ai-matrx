---
name: page-pass
description: "The one skill for taking a page to done: its agent surface and its UI/UX, in one pass. Use when assigned pages or routes to pass, on `/page-pass <route>`, or when a campaign brief says 'do the page pass'. NOT for certification ledger writes (use surface-certification-loop)."
---

# page-pass — take one page to done

**Version 1 (2026-09-27).** Built with Arman and tested on real pages; every
miss found in testing becomes a rule here. **This file plus
[`page-types.md`](./page-types.md) is everything you read up front.** Each rule
below is complete as written. The skill named after a rule holds the step-by-step
procedure — open it only when you are doing that job or the check fails.

## What you do with a page — six steps, in order

1. **Look first.** Run `pnpm page:look --route <route>` (every route the page
   has, with a real record id): it signs in as the test admin and writes
   desktop 1280×800 and phone 375×812 screenshots in light and dark, plus
   `look.json` — console errors, failed requests, anything under the header,
   how much of the first screen holds content, headings, text under 12px,
   emoji, small phone targets. Add `--full` to see below the fold,
   `--signed-out` for what a visitor sees, and `--click 'SELECTOR=>TEXT'`
   (repeatable) to open each menu, dialog and tab and capture it. Read every
   screenshot yourself; the numbers are places to look, not verdicts. For a
   longer interaction, write a throwaway Playwright script in your own TMPDIR
   modelled on `scripts/page-look.mjs` — never a dev server. Use it the way a person would: click every
   control, open every menu, dialog and tab. **Before you read any rule, write
   down everything that looks wrong or wasteful.** This list is yours; the rules
   must end up covering every line of it.
2. **Name the page's type** from [`page-types.md`](./page-types.md). The type
   says which core rules change and what it adds. Unsure between two types →
   pick the one whose "recognize it" line fits, and say why in your report.
3. **Run the core (below), then your type's additions.** Every rule gets a
   verdict: `pass` · `fixed` (what) · `na` (one-line why) · `deferred-visual`
   (code done; name the exact look still owed) · `arman` (question filed) ·
   `blocked` (what blocks).
4. **Fix what you found** — the cause, not the symptom. Never remove, rename or
   hide a feature to make a rule pass. If the fix belongs in a shared component
   or package, fix it there. If it belongs on the server (a read wrongly gated,
   a 4xx/5xx the page can't fix), fix it in `../aidream` under that repo's
   CLAUDE.md, same commit rules, and name both commits in your report.
5. **Prove it live.** Every fix seen working on the real page; every main
   action carried through to its real saved result, then re-checked (console
   and Error Inspector clean after, not just on load).
6. **Record it.** One Change Log line in the owning feature's `FEATURE.md` (no
   FEATURE.md for this route? the nearest one that owns its code) in the same
   commit (`page-pass <date>: type <x>, posture <x> after <product>, fixed …`),
   then the report below.

**You decide; you never interview.** Product questions only — does a feature
exist, should a surface move in the hierarchy, a size or policy outside what
this file allows — go to Arman through `ask-arman`; keep working on everything
else. Posture skills that say "interview first" mean a person live in the
session, never you.

## Where you work — pick your lane once

| | **Local lane** (a Mac session) | **Cloud lane** (a cloud container) |
|---|---|---|
| Server | none needed to look; `pnpm preview:start` (the ONE shared server, `http://<session>.localhost:3001`) only when you must see an unreleased change | **none** — a container cannot run a dev server and a type check together |
| Look and prove | `TMPDIR=/tmp/pl-<you> pnpm page:look --route <route> --commit <sha>` against `https://aimatrx.com` after the release carrying your commit (about hourly; exit 3 = not live yet — work on something else) | same |
| Agent surface proof | `TMPDIR=/tmp/pp-<you> pnpm surface:probe --surface <name> --route <route> --commit <sha>` (+ `--agent '<request>'` for write targets) | same |
| A view you cannot see | `deferred-visual` with the exact step | same |

**Both lanes:**
- Type check only your files: write `tsconfig.focused.<you>.tmp.json` at the
  repo root — `{"extends":"./tsconfig.json","compilerOptions":{"noEmit":true,"incremental":false},"include":["global.d.ts","cartesia.d.ts","types/typecheck-env.d.ts", <your files>]}`
  — run `node --max-old-space-size=11000 node_modules/typescript/bin/tsc6 -p <it>`,
  delete it. Errors in files you didn't touch are not yours; list them.
- **Commit right after each coherent edit** — a sync sweeps the shared
  checkout every ~30 minutes and commits any dirty file under its own message,
  so a file left uncommitted loses your authorship and message.
- Commit by path per page: `git add <files>` → `git commit --only -m "page-pass(<route>): …" -- <files>` → push.
  One shared checkout on `main`: no branches, no worktrees, no tree-wide git,
  never format a file you didn't create, never run `release.sh`. After a
  pull, re-run `pnpm install --frozen-lockfile` if the lockfile changed.
- Test data you create is obviously named (`PP test — …`) and listed in your report.

## The core — seven areas, every page

### 1 · Agents can work on the page
- **Registered:** a surface manifest in `features/surfaces/manifests/`, label =
  the page's human name, route mapped in `route-to-surface.ts`, DB mirror synced.
- **Sees everything:** every piece of data the page loads and a person could
  point at is a declared value, emitted by one pure scope module from state the
  page already rendered (`getScope` never fetches). Not loaded yet → omit the
  key; loaded and empty → `[]`/`0`/`""`; a failed load reports its status
  (a `load_error`-style value the agent can see), never counts, rows or a
  value that contradicts what the person sees.
  Keep existing value names (stored bindings use them).
- **Sees what its jobs need up front — the context budget.** An agent that
  lacks what it needs fails or spends more tokens looking it up, so send it —
  up to 10,000 chars per page in total, spent by the page's shape: a focused
  record ~10,000; a record with its comments/folders ~7,000 + the rest shared;
  a list page's condensed visible list ~4,000; a broad page (SEO, dashboards)
  only a ~2,000-3,000 overview and a guide for discovery. Pack it as ONE XML
  bundle with the shared bundle helpers — never raw JSON rows. Over budget
  needs Arman's approval. Procedure: `surface-write-targets` Step 4.
- **Can change what makes sense:** every record type the page lists gets
  `create_/update_/delete_<plural>` over lists (one set per type, built with
  `collectionWriteHandlers`), plus `<record>_draft` when the page has a
  "New ___" dialog, and `draft` targets for authored fields on editors. All
  `ask`. Handlers save through the page's own save function, validate the whole
  value before the approval card, and return what landed with ids. Never
  targets for ids/ownership, credentials, billing, permissions, or derived
  numbers (scores, counts).
- **Told how:** the intro names which target does which job; a page with more
  than one record type or rules the descriptions can't hold gets a guide.
- **Right-click menu:** one menu per pane, delegated per row, wrapper carries
  `sourceFeature` + `surfaceName` + `getApplicationScope`; the runtime
  provider goes AROUND the menu. A page showing a real record passes that
  record's own `contentSource` (and `entity` when it can be attached or
  shared); `{type:"raw"}` only when there is no primary text. Items are short
  verbs with no subtext; a disabled item says why. Menu's last entry = this
  page's label.
- **Agents menu:** every AI job the page already runs appears once in the top
  Agents menu; nothing is added to the visible page to announce it, and no AI
  feature is invented to fill it. A mandate opens in place.
- **Agent feedback read first:** `pnpm surface:feedback --surface <name>`; fix
  what agents reported or say why not.
- **Proven with a real agent:** the probe reads the page (every visible value
  supplied, nothing undeclared, no `INERT MENU` / `VALUE MAPPING GAP`); with
  write targets, `--agent '<a real request>'` creates two, updates one,
  archives one, gets one refused before the card — and a read-only SQL check
  shows created rows complete, matching one made by hand.
- Checks: `pnpm check:surface-drift` · `check:surface-routes` ·
  `check:surface-impact <name>` · `check:context-menu` · `check:menu-naming` ·
  `check:agent-disclosure`.
- Procedures: `surface-write-targets` (Steps 0-4: targets, handlers, inline
  tiers, guide, live agent test) · `surface-authoring/references/campaign-worker.md`
  §2 "Rules that bite" and §3 sync · `context-menu-v3` · `agent-disclosure`.

### 2 · It actually works
- Every button, link and menu item does something real — no dead controls,
  no toast stubs, no disabled-looking controls that work or working-looking
  ones that don't.
- Every load ends: data, an honest empty state, or a visible error with a
  retry after a bounded wait. Never an endless skeleton or spinner.
- Loading says what is loading: `SuspenseLoader` with a `message` for compact
  states; a `Skeleton` from `@ai-matrx/design-system` shaped like the content
  for content areas. Never plain "Loading…" or a bare pulsing box.
- Errors surface; nothing is swallowed. AI work streams into the live-run
  window, never a spinner.
- Every record the page names (a person, agent, document, a count over our
  records) opens — open, new tab, peek or window. Every detected problem
  carries its one-click fix.
- Reads and writes go straight to the database through the feature's service;
  a list treated as complete uses `readAllRows`.
- A browser component never imports a value from server-only code (a loader
  using the server database client, `next/headers`, `"server-only"`) — share
  constants from a plain module. The type check cannot see this; the build breaks.
- Checks: `pnpm check:dead-ends` · `check:unwired` · `check:static-loader` ·
  `check:client-server-only`.
- Procedures: `real-loading-states` · `no-dead-ends`.

### 3 · The first screen is right
- **The title stands alone.** One title, in the page header, with no
  description or subtitle under it and no second title or hero in the body.
  No welcome text, no "this page lets you…". Help is one short sentence next
  to the thing it helps with, or a tooltip. **The same holds for every section
  and card:** a heading, not a heading plus an explanatory sentence.
- **Empty is compact.** A thin record never shows a wall of "—" rows or a stack
  of empty cards: empty fields collapse into one "Add …" affordance, and an
  empty section is one line with its create action, not a full card.
- **Nothing sits under the header.** The header is glass over the page. Content
  that must stay visible — buttons, toolbars, card grids, banners — starts
  below it with `pt-[var(--shell-header-h)]` (never a hand-typed `pt-12`), and
  at rest nothing interactive or readable sits inside the glass or its fade.
  Content that scrolls freely may pass behind it while scrolling.
- **No wasted space.** At 1280×800 the real work (the table, the editor, the
  list) is on screen without scrolling and uses the width. No empty bands, no
  oversized headings, no cards holding one label and an icon, no tiles that
  show one small number, no box inside a box, no narrow centered column
  unless it is long reading text.
- `(core)` routes: header via `<PageHeader>`; body `h-full overflow-hidden`;
  never `h-screen`, `100vh`, `h-page`; no fake title bar in the body.
- Density: `ui-sharp` by default, `ui-dense` for all-day power pages. Name the
  real product you matched in the Change Log line.
- Checks: `pnpm check:page-headers` · `check:scroll-chain:strict` · live look at
  the top edge on desktop and phone.
- Procedures: `core-route-headers` · `.claude/ui-skills/shared/application-ui-copy-and-hierarchy.md` · `ui-sharp` / `ui-dense`.

### 4 · It works on a phone
- Every desktop action exists on a phone (header actions → bottom sheet);
  functionality is gated with `useIsMobile()`, never just hidden with CSS.
- Finger-sized: the page's section roots and every `DialogContent` carry
  `matrx-touch-targets` (44px on touch, desktop stays compact); a checkbox,
  radio or switch gets `matrx-tap-area` on its label.
- Nothing hover-only: a control revealed with `opacity-0 group-hover:opacity-100`
  also carries `pointer-coarse:opacity-100`.
- A plain `<Dialog>` becomes a bottom sheet by itself; hand-roll a Drawer only
  for a drag handle or a genuinely different layout.
- `dvh` never `vh`; `pb-safe` on anything fixed to the bottom; one scroll area;
  no tabs as phone navigation; tables reflow; popups capped with internal
  scroll; fields authored `text-base`, never an inline font size under 16px.
- Long-press opens the same menu as right-click.
- Checks: `pnpm check:phone-layout` · live look at 375×812, tapping everything.
- Procedure: `ios-mobile-first`.

### 5 · It looks like one product
- **Only our standard parts.** Buttons, icon buttons (TapButtons from
  `@ai-matrx/tap-target/buttons`), inputs, pickers, dialogs, tables and lists
  come from the design system. A hand-styled `<button>` or one-off control
  that does what a standard one does is a finding — replace it.
- Tables: `MatrxDataTable`, sort and filter on every column. Lists:
  `EntityListPage` with saved view preferences and an archive control wherever
  records can be archived. Pickers over a growable list offer
  `Create "what you typed"`.
- Dialogs open through their typed opener (`useOpenX()`), never
  `dispatch(openOverlay(...))`. No browser `confirm/alert/prompt`; `toast`
  only from `@/lib/toast`. With a layer open, the page behind stays usable.
- Lucide icons only; no emoji; no Sparkles for AI; `INTELLIGENCE_ICON` only
  for Intelligence, `AGENT_ICON` for Agents.
- Text a person reads is 12px or larger; 10px only for small all-caps section
  labels and keyboard hints. Machine labels (`some_key`) are humanized.
- **Show what a person recognizes, never an internal key.** A value is shown
  as its display form (proper case, platform named, a link when it is a
  link), never its normalized/dedupe key, slug, raw id or JSON. A person never
  types JSON: structured input gets real fields (an address is address
  fields, a state is a state picker, a fixed set is a select).
- **One name per thing.** The header, tab title, buttons, placeholders, empty
  and error states use the same noun (a "deck" is never also a "set").
- **Nothing internal reaches a person.** No test/fixture product names, no
  engineering notes ("no read path…", ticket codes), no placeholder copy. An
  unbuilt part is absent, or a Coming Soon entry.
- Semantic color tokens only; right in light AND dark.
- A destructive or expensive click says what it will cost before it happens.
- Tab title leads with the specific word; the route has a favicon entry.
- Checks: `pnpm check:ui-primitives` · `check:one-table-law` ·
  `check:archived-items-law` · `check:picker-add` · `check:canonical-pickers` ·
  `check:browser-dialogs` · `check:blocking-dialogs` · `check:popover-sizing` ·
  `check:reserved-icons` · `check:new-tab-icon` · `check:theme-color-literals` ·
  `check:route-metadata:strict` · `check:favicon-letters` ·
  `node .claude/skills/light-dark-integrity/scripts/detect-light-dark.mjs <paths> --strict`.
- Procedures: `efficient-tap-button-migration` · `canonical-table-usage` ·
  `picker-custom-entry` · `overlay-system` · `no-emojis-in-ui` ·
  `light-dark-integrity` · `route-metadata-favicons` · `compact-nav-menus`.

### 6 · Copy and AI are everywhere
- Nothing is shown that can't be copied — field, row, record, page — through
  the canonical two-icon Copy / Copy-for-AI pair.
- Every box a person writes in is `ProTextarea` / `ProInput` with the
  microphone and the page's agents (`surfaceName` + `getApplicationScope`
  passed). A bare textarea needs a comment saying why.
- A field that expects a syntax (formula, pattern, cron, JSON, filter) offers
  "Help with this…".
- A friction point gets an assist chip before anyone invents a manual button.
- Checks: `pnpm check:copy-everywhere`.
- Procedures: `agent-copy` · `components/official/ProTextarea.tsx` docstring.

### 7 · Proof and record
- Live proof for this page: desktop light, desktop dark, phone light, phone
  dark, the right-click menu, the probe output — with the URL and commit.
- `FEATURE.md` Change Log line in the same commit; manifest `readiness`
  honest (`partial` with a note naming what is unproven; `verified` only when
  everything is); anything Arman should see → `agent-review-queue` row;
  unrelated defects → `FOUND_DEFECTS.md`.

## Report — one per page

```
<route> — type <x>, posture <x> after <product>, commit <sha>
My first look (step 1): <every problem I wrote down> → each: fixed / covered by rule / not fixed (why)
Core 1-7 and type additions: <n> <verdict> — <what>
Proof: <lane, URL, screenshots / probe file>
Test rows created: <table, ids>
Left open: <exact remaining work, or none>
```

Checks no script runs yet: [`candidate-checks.md`](./candidate-checks.md).

**A problem from your first look that no rule covered goes in its own line:**
`RULE GAP: <problem>`. Those lines are how this skill improves.
