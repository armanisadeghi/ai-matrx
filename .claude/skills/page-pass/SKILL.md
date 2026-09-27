---
name: page-pass
description: "The one per-page checklist covering a page's agent surface and its UI/UX cleanup in a single pass. Use when assigned pages or routes to pass, on `/page-pass <route>`, or when a campaign brief says 'do the page pass'. NOT for certification ledger writes (use surface-certification-loop)."
---

# page-pass — one pass per page, 18 items, nothing else up front

**This is the only file you read before you start.** Every item says what
_pass_ looks like, how it is checked, and which skill to open **only if the
item fails**. Do not pre-read the owning skills; open one when its item is red.
The full-depth certification version of this list is
[`../surface-check/CHECKLIST.md`](../surface-check/CHECKLIST.md) (S1–S18); this
file is the same bar, trimmed to what one worker does on one page.

## Step 0 — how you work

- **You decide; you never interview.** Posture skills (`ui-sharp`,
  `ui-dense`, `ui-refine`, `ui-reimagine`) open with "interview first" — that
  applies only when a person asked, live, for a redesign. In a page pass you
  answer those questions yourself from the page, its `FEATURE.md` and the best
  product doing the same job, write the answers in your change-log line, and go.
  The only things that go to Arman are product semantics (does this feature
  exist, re-homing a surface in the hierarchy). File those with `ask-arman`
  and keep working.
- **Fix, don't report.** A finding without a fix is acceptable only when it is
  one of those product-semantics questions. Never remove, rename or hide a
  feature to make an item pass.
- **Verdict per item:** `pass` · `fixed` (what, commit) · `na` (one-line why) ·
  `deferred-visual` (code done and statically checked; name the exact eyes-on
  step) · `arman` (question id) · `blocked` (what blocks).
- **Commit by path, push, per page.** `git add <your files>` →
  `git commit --only -m "page-pass(<route>): …" -- <your files>` → `git push`.
  Shared checkout on `main`: no worktrees, no branches, no tree-wide git, never
  format a file you did not create. Never run `./scripts/release.sh` — the
  release train ships `main` about every 30 minutes.

## Where you verify — pick your lane once

| | **Local lane** (a Mac session with the shared preview) | **Cloud lane** (a cloud container) |
|---|---|---|
| Server | `pnpm preview:start` (the ONE shared server, port 3001); open the `http://<session>.localhost:3001` host it prints | **None.** A container cannot run the dev server and a type check together |
| Sign in | `pnpm dev-login /<route>` (test admin, pre-authorized) | Not needed for the probe; it signs in itself |
| See it | In-app browser, desktop 1280×800 and mobile 375×812, light and dark | Push, wait for the train, then `pnpm surface:probe --surface <name> --route <route> --commit <sha> --shots <dir>` against `https://aimatrx.com` |
| When you cannot see a view | — | Record `deferred-visual` for that view with the exact step; keep going |

- **Type check only what you touched** in both lanes. Write
  `tsconfig.focused.tmp.json` at the repo root:
  `{"extends":"./tsconfig.json","compilerOptions":{"noEmit":true,"incremental":false},"include":["global.d.ts","cartesia.d.ts","types/typecheck-env.d.ts", <your files>]}`,
  run `node node_modules/typescript/bin/tsc6 -p tsconfig.focused.tmp.json`,
  delete the file. Errors in files you did not touch are not yours; list them.
  CI runs the full `pnpm type-check`.
- Build pages in batches: build → check → commit + push; verify the previous
  batch while this one ships. Wait only when nothing else is left.

## The 18 items

Legend — **Check:** `script` (run it; red = fail) · `live` (headless or
in-app browser look) · `eye` (you judge it against the rule). **If it fails:**
the one skill to open.

### 1 · Agent surface
- **Pass:** the page has a registered surface manifest whose label is the
  page's human name; every piece of data a person could point at and say "use
  this" is a declared value; every field an agent could sensibly edit is a
  write target with a real handler; the Surface Context window on the live page
  shows every value supplied, none missing, none invented.
- **Check:** `script` `pnpm check:surface-drift` · `pnpm check:surface-routes` ·
  `pnpm check:surface-impact <surface>` · `live` `pnpm surface:probe` (or the
  Surface Context window in the in-app browser).
- **If it fails:** `surface-authoring` (values, manifest) · `surface-write-targets` (write-backs).

### 2 · Right-click menu
- **Pass:** one menu per pane, delegated per row; the wrapper carries
  `sourceFeature`, `surfaceName`, `getApplicationScope`; items are short verbs
  with no subtext (a disabled item says why); the last entry is this page's
  label; right-click → Export → Download as Markdown saves the content.
- **Content source (ruling):** a page showing a real record passes that
  record's own `contentSource` (and `entity` when it can be attached or
  shared). `{type:"raw"}` only when the page has no primary text — a gallery,
  a chart — and then record `na — no rich-document content` for the download
  line.
- **Check:** `script` `pnpm check:context-menu` · `pnpm check:menu-naming` ·
  `live` open the menu with the console open — zero `INERT MENU` / `VALUE
  MAPPING GAP` lines.
- **If it fails:** `context-menu-v3`.

### 3 · Agents-menu disclosure
- **Pass:** every AI job the page ALREADY runs appears once in the top Agents
  menu (manifest `agentRole` with `mandateKey`, or `useDeclaredSurfaceMandates`).
  Nothing was added to the visible page to disclose it — no chips, badges,
  rows, callouts. No AI integration was invented to fill the menu. A mandate
  opens in place (`useOpenMandateWindow`), never as a link.
- **Check:** `script` `pnpm check:agent-disclosure` · `live` open "Agents for this page".
- **If it fails:** `agent-disclosure`.

### 4 · Page header
- **Pass (`(core)` routes):** chrome through `<PageHeader>` (center zone);
  body `h-full overflow-hidden`; no `h-screen` / `calc(100vh…)` / `h-page`; no
  faux in-body title bar; content that must not slide under the glass header
  has `pt-[var(--shell-header-h)]`; desktop header actions have a mobile
  counterpart (bottom sheet).
- **Check:** `script` `pnpm check:page-headers` · `pnpm check:scroll-chain:strict` ·
  `live` top edge clear at desktop and mobile.
- **If it fails:** `core-route-headers`.

### 5 · One title, work above the fold
- **Pass:** the page is named once (header, not a second body H1 or hero); no
  welcome copy or "this page lets you…" narration; subtitles only when they
  change what the person does; at 1280×800 the primary work area (table,
  editor, list) is visible without scrolling.
- **Check:** `eye` + `live` desktop screenshot.
- **If it fails:** `.claude/ui-skills/shared/application-ui-copy-and-hierarchy.md`, then `live-ui-iteration` (first-screen gate).

### 6 · Mobile
- **Pass:** `dvh`, never `vh`/`h-screen`; `pb-safe` on fixed bottoms; no tabs
  as phone navigation; one scroll area; popups capped with `max-h` and
  internal scroll; tables reflow (`phone-stack`); long-press opens the same
  menu as desktop; every desktop action exists on a phone (functionality gated
  with `useIsMobile()`, presentation with `max-sm:`).
- **Dialogs (ruling):** a plain `<Dialog>` already becomes a bottom sheet on a
  phone. Hand-roll a Drawer branch only for a drag handle or a genuinely
  different layout.
- **Inputs (ruling):** the global iOS zoom floor handles zoom; author
  mobile-facing fields `text-base`; never an inline `fontSize` under 16px.
- **Check:** `script` `pnpm check:phone-layout` · `live` 375×812.
- **If it fails:** `ios-mobile-first`.

### 7 · Light and dark
- **Pass:** semantic tokens only (`bg-card`, `text-muted-foreground`,
  `border-border`…); no `bg-white` / `text-black` / raw palette / hex literals;
  both themes look right.
- **Check:** `script` `node .claude/skills/light-dark-integrity/scripts/detect-light-dark.mjs <paths> --strict` ·
  `pnpm check:theme-color-literals` · `live` both themes.
- **If it fails:** `light-dark-integrity`.

### 8 · Loading, empty, error
- **Pass:** every loading state says what is loading or is shaped like the
  content that replaces it; every load ends — data, an honest empty state, or
  a visible recoverable error after a bounded wait; errors surface, never
  swallowed; AI work streams into the live-run window, never a spinner.
- **Loaders (ruling):** compact → `SuspenseLoader` with a `message`
  (`Loading model providers…`); content → a `Skeleton` from
  `@ai-matrx/design-system` shaped like the final content; a `dynamic()`
  placeholder reserves the final size AND names what is loading. A bare
  `animate-pulse` box or plain "Loading…" is a finding. `LoadingComponents.tsx`
  is legacy.
- **Check:** `script` `pnpm check:static-loader` · the two `rg` commands at the
  top of `real-loading-states` scoped to your files · `live` cold load + retry.
- **If it fails:** `real-loading-states`.

### 9 · Every named record opens
- **Pass:** every record the page names (a person, an agent, a document, a
  count over our records) opens — open, new tab, peek or window — through
  `EntityRef` / the opener registry; every detected problem carries its
  one-click fix.
- **Check:** `script` `pnpm check:dead-ends` · `pnpm check:unwired` · `eye` click every name.
- **If it fails:** `no-dead-ends`.

### 10 · Icons
- **Pass:** Lucide only; no emoji anywhere a person sees them; no Sparkles for
  AI; `INTELLIGENCE_ICON` only for Intelligence/Mandates, `AGENT_ICON` for
  Agents; `Loader2` only while spinning.
- **Check:** `script` `pnpm check:reserved-icons` · `pnpm check:new-tab-icon` ·
  `pnpm check:static-loader` · the emoji `rg` in `no-emojis-in-ui`.
- **If it fails:** `no-emojis-in-ui`.

### 11 · Tap buttons and touch size
- **Pass:** icon buttons are pre-composed TapButtons from
  `@ai-matrx/tap-target/buttons` with an `ariaLabel`, no spacing wrappers;
  the page's section roots (and every `DialogContent`, which portals out) carry
  `matrx-touch-targets`, so every control is 44px on touch while desktop stays
  dense; small-by-nature controls (checkbox, radio, switch) use
  `matrx-tap-area` on their label.
- **Hover (ruling):** anything revealed on hover (`opacity-0
  group-hover:opacity-100`) also carries `pointer-coarse:opacity-100`.
  Desktop density (`h-5`/`h-7` icon buttons) is correct on desktop.
  `RouteModeNav` is the one exception to the 44px floor (its phone reach is
  its bottom-sheet rows).
- **Check:** `eye` + `live` 375×812 (tap every control).
- **If it fails:** `efficient-tap-button-migration`, then `ios-mobile-first` rules 4 and 11.

### 12 · Tables and lists
- **Pass:** tables are `MatrxDataTable` (`@ai-matrx/design-system/data-table`)
  with sort and filter on every column and the canonical Copy / Copy-for-AI;
  list pages are `EntityListPage` + `useListViewPrefs` with an archive control
  wherever the table has `is_archived`. `GenericDataTable` is legacy.
- **Check:** `script` `pnpm check:one-table-law` · `pnpm check:archived-items-law`.
- **If it fails:** `canonical-table-usage`.

### 13 · Pickers allow "add"
- **Pass:** a picker over a list the person can grow offers `Create "what you
  typed"` when nothing matches, outside the scrolling list; agent pickers are
  the one canonical picker.
- **Check:** `script` `pnpm check:picker-add` · `pnpm check:canonical-pickers`.
- **If it fails:** `picker-custom-entry`.

### 14 · Copy and Copy-for-AI
- **Pass:** nothing is shown that cannot be copied — field, row, record, page —
  through the canonical icon-only `CopyButtons` pair.
- **Check:** `script` `pnpm check:copy-everywhere`.
- **If it fails:** `agent-copy`.

### 15 · Dialogs through openers
- **Pass (ruling):** a dialog, sheet or window opens through its typed opener
  (`useOpenX()` from `features/overlays/openers/<id>.tsx`), never
  `dispatch(openOverlay(...))` — migrate any raw dispatch you touch. No
  browser dialogs (`confirm()` / `alert()` / `prompt()`); `toast` only from
  `@/lib/toast`. With any layer open, the top Agents menu and right-click AI
  still work and the page behind stays clickable.
- **Check:** `script` `pnpm check:browser-dialogs` · `pnpm check:blocking-dialogs` ·
  `pnpm check:popover-sizing` · `rg "dispatch\(\s*openOverlay\(" <your files>`.
- **If it fails:** `overlay-system`.

### 16 · Tab title and favicon
- **Pass:** the tab title leads with the specific word; the route has a
  favicon entry in `constants/favicon-route-data.ts` (two letters, the
  family's colour); OG metadata where the page is public.
- **Check:** `script` `pnpm check:route-metadata:strict` · `pnpm check:favicon-letters`.
- **If it fails:** `route-metadata-favicons`.

### 17 · Design posture
- **Pass:** you named the posture and the real product you matched —
  `ui-sharp` by default; `ui-dense` for all-day power surfaces — and the page
  meets it: spacing on the 4/8/16/24/32 scale, no boxes inside boxes, no
  wrapper around a component that has its own chrome, text at 12px or larger
  (10px only for uppercase section overlines and keyboard hints), machine
  labels humanized.
- **Check:** `eye`, against the named product.
- **If it fails:** the posture skill you named (`ui-sharp` / `ui-dense`); `compact-nav-menus` for sidebars and list panels.

### 18 · Change log and review row
- **Pass:** the feature's `FEATURE.md` Change Log has a `page-pass <date>`
  line (posture + benchmark named, fixes listed) in the same commit as the
  code; anything Arman should see is an `agent-review-queue` row; unrelated
  defects are in `FOUND_DEFECTS.md`.
- **Check:** `eye` — `git show --stat` includes the `FEATURE.md`.
- **If it fails:** `context-docs` (FEATURE.md) · `agent-review-queue`.

## Report per page

One line per item: `<n> <verdict> — <what / why / commit>`, then the live proof
references (lane, URL, commit, screenshots or probe output). A page with any
`deferred-visual`, `arman` or `blocked` is not done; say what remains.

## Not yet checked by a script (candidates — do not build unless asked)

These items rely on `eye` or a raw `rg` today; each could be a guard:

1. Hover-revealed controls with no `pointer-coarse:opacity-100` (item 11; ~205 `opacity-0 group-hover` sites).
2. Emoji in rendered UI strings (item 10; only an `rg` recipe exists).
3. Raw `dispatch(openOverlay(...))` ratchet — count only goes down (item 15; ~115 sites).
4. Content text at `text-[10px]` outside an uppercase overline (item 17; ~5,650 uses to triage).
5. Non-Pro `<textarea>` ratchet — the `check:textareas` named in `surface-check` was never built.
6. Inline `fontSize` under 16px on an input or textarea (item 6).
7. A hand-rolled `useIsMobile()` Drawer branch around a plain Dialog, now redundant (item 6).
8. New imports of legacy primitives — `GenericDataTable`, `LoadingComponents` (items 8, 12).
9. A body H1 or hero repeating the `PageHeader` title in a `(core)` route (item 5).
10. Bare "Loading…" text and unlabeled pulse boxes as a script, not an `rg` recipe (item 8).
11. `contentSource={{type:"raw"}}` on a surface whose manifest names an entity (item 2).
12. `matrx-touch-targets` missing on a `(core)` route root or a `DialogContent` (item 11).
13. A feature code change with no `FEATURE.md` change in the same commit (item 18).
