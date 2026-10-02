# UI unification plan

**Date:** 2026-10-01 · **Evidence:** [`ui-drift-audit.md`](./ui-drift-audit.md) · **Status:** PLAN — not started. Execution begins only on an explicit go.
**Decision board:** `/demos/ui-unification` renders each contested option live, side by side, with its real call-site count. Picks made there settle the open choices in §2.

---

## Summary

**The three worst problems** (evidence in the audit):

1. **The primitives can't express the density the app uses.**
   - Sibling controls have mismatched heights.
   - Input, Badge and Tabs have no size at all.
   - The Button has no 28px text rung.
   - The type scale has no step under `text-xs`; the custom scale is dead CSS.
   - Icon size inside a Button is fixed at 16px and can't be overridden.
   - Result: 56% of 27,361 primitive call sites override, and most of them *had* to.
2. **Bespoke reimplementations are as common as the primitives:** 5,594 raw `<button>`, ~2,800 hand-rolled cards, ~3,000 hand-rolled spinners, no EmptyState, 10 IconButtons and 3 toast stacks.
3. **Zero enforcement, plus instructions that teach the drift.**
   - Lint never runs.
   - No check inspects a primitive's `className`.
   - The UI skills prescribe arbitrary-value dialogs, hand-rolled badges and tabs, and a new reference product per page.

**The highest-leverage fix:** one shared **control size scale**, owned inside the primitives. Each rung (height, padding, font size, icon size, gap) is identical across Button, Input, Select, Tabs, SegmentedControl and Badge. Add the two missing type tokens, then run a codemod that deletes every override the scale makes redundant. Everything else in this plan, especially closing `className`, depends on this step landing first. Closing the primitives without it would push agents onto raw `<button>`, which is already nearly as common as `<Button>`.

**The model already exists in this repo: the tap-target system** (`@ai-matrx/tap-target`, geometry in `design-system/src/tap-target.css`). It solved this exact disease for icon buttons:
- **One footprint expressed as tokens.** A 38px box, a 32px pill, a 28px capsule for wide shapes; the gaps are *derived*, never literal.
- **Locked geometry.** It lives in a CSS cascade layer declared first, with `!important`, so no call-site class can move it.
- **Touch handled as an invisible hit area, never layout growth.** A coarse pointer gets a `::before` that grows the hit area toward 44px. Today's Button instead grows its *layout* to 44px, which is why every phone row is ragged. The board measures it: on a phone a "28px row" renders 44 · 28 · 28 · 30 · 32.
- **A dev-time guard.** It paints a misused button as a red box and logs a console error naming the fault. It caught the decision board itself adding a forbidden gap.

This plan generalises that system to every control rather than inventing a new one.

**How much can be enforced mechanically:**
- **About 70–75% of the counted drift** can be made impossible, or detectable before it lands:
  - primitive overrides
  - arbitrary type and colour values
  - icon sizing
  - raw elements where a primitive exists
  - re-declared primitives
- **The remaining 25–30% will always need discipline:**
  - spacing between components in page layout (211 paddings, mostly on plain `div`s)
  - hand-rolled panels under new names
  - choosing the right primitive
  - judging whether a need deserves a new variant
- Weighted by what a person *sees* as inconsistent, the discipline share is closer to half. Page composition is what the eye reads first.

---

## 1. Principles

1. **Make the wrong thing impossible, not discouraged.** Where impossible is too expensive, make it detectable. Instructions come last.
2. **Variants before walls.** A primitive is closed only after the variants its overrides were standing in for have shipped and the codemod has run. Otherwise a closed `className` turns into a raw `<button>`.
3. **The primitive owns every visual dimension.** Height, padding, type, icon size, gap, colour, radius, shadow. A call site owns *placement* only: margin, width-in-layout, flex and grid participation, positioning, visibility.
4. **One table defines "visual" vs "placement".** The census, the `findings` check and the dev guard all import the same token-category table, so the three can never disagree.
5. **Nothing fails silently.** When locked geometry ignores a class, the dev guard says so in the browser, naming the class, the component and the fix.
6. **Mobile is built in, not added later.**
   - Touch means an invisible hit area, never a taller layout.
   - One surface level: never a card inside a card. Sections are separated by hairlines or grouped into a single inset surface (board D15).
   - Phone side gutters are 12px. Nothing else pads the sides.
   - Every primitive's own padding is sized for 375px first.
6. **Fixes land in the package** (`@ai-matrx/design-system`), released and adopted in the same session, per the repo's Same-Session Law. No host shims.

---

## 2. Mechanism per drift category

Mechanism key: **A** = close the component · **B** = add the missing variant · **C** = enforce mechanically · **D** = instruct.

### 2.1 Control sizing (Button, Input, Select, Tabs, SegmentedControl, Badge) — B, then A + C

**B. The shared scale.** The owner chooses this on the board; it is not decided here. The board offers:
- **D1, toolbar height:** today's mixed row, 28px, 32px or 36px. Every option is rendered next to the shipped tap-target pair, so its alignment with the 32px pill and 28px capsule is visible.
- **D1b, touch:** grow the layout to 44px (Button today), or an invisible 44px hit area (the tap system).
- **D1c, rung count:** five rungs (24 · 28 · 32 · 36 · 40), three (28 · 32 · 36), or two (28 · 36).
- **D2, form-row height:** today's 40/36, all 36, or all 32.

**Engineering recommendation:**
- Anchor the scale to the tap geometry the owner already ruled on 2026-10-01: 28 = the capsule, 32 = the pill.
- Three rungs, 28 · 32 · 36, with 36 for forms.
- Touch as hit area.

The table below is the five-rung version for reference. Whatever the board settles becomes CSS tokens (`--matrx-control-h-xs` …) in the design-system package, exactly as `--matrx-tap-*` are, never literals in component code.

| Rung | Height | Text | Icon | Gap | Who has it today |
|---|---|---|---|---|---|
| `2xs` | 24 | 11px | 12px | 1 | Button `xs` (px-1, unusable); 556 sites hand-roll `sm`+`h-6` |
| `xs` | 28 | 12px | 14px | 1.5 | Select `sm`, Segmented `sm`, Button `icon-sm`; **1,440** hand-rolled |
| `sm` | 32 | 12px | 14px | 1.5 | Button `sm`; Input via 410 overrides; Select via 199 |
| `md` (default) | 36 | 14px | 16px | 2 | Button / Select / Tabs defaults; `BasicInput` |
| `lg` | 40 | 14px | 16px | 2 | Button `lg`, Select `lg`, **Input's only size** |
| `xl`+ | 48–64 | 16px | 20px | 2 | Button only |

Each rung also gets a square icon twin (`icon-2xs` … `icon-lg`). Today 350+ sites hand-roll 24px and 32px squares, and 179 write `size="icon" h-7 w-7` instead of `icon-sm`.

**Why rename by pixel instead of keeping today's names.**
- Today "sm" means 32px on Button and 28px on Select. One of the two must change meaning.
- Keeping Button `sm` = 32 preserves the 2,695 unoverridden `sm` Buttons, the largest group.
- What moves:
  - Select `sm` (23 sites) moves from 28 to 32.
  - Button `xs` (22 sites) moves from 24 to 28.
  - Both are codemodded to keep their pixels.

**One visible default change, flagged for the owner:** Input's default goes from 40px to 36px, so a default form row of Input + Select + Button stops rendering 40/36/36. This changes 992 unoverridden Inputs by 4px. **It is the right call** — every reference system (Linear, Stripe, Vercel, shadcn) keeps field and button the same height — but it is visible, so the board asks the question directly (D2).

**Icon size moves into the rung.** The Button's existing high-specificity `[&_svg]:size-*` is kept *on purpose*. It already makes the icon size impossible to override from a call site, which is exactly the closure we want. It has only ever been wrong in having one value for every box. The 3,613 icon size classes inside Buttons become deletable no-ops. `components/official/IconButton` collapses onto the square rungs.

**Also add:**
- `ghost` + `tone="muted"` (447 sites) and `tone="destructive"` (222 sites) for ghost and outline buttons
- Badge `size` and a built-in icon gap
- Tabs `size`, `variant="line"` and `fullWidth`
- an Input prefix/suffix slot that scales with the rung (140 hand-placed `pl-7/8/9`)

**C. The codemod** (AST, built on `scripts/ui-drift/census.cjs`):
- Rewrite `size="sm" className="h-7 …"` to `size="xs"`, deleting every token that equals the new rung's value.
- Delete the pure no-ops: `text-xs` on `sm` (1,442), `h-8` on `sm` (534), `h-7 w-7` on `icon` (177), icon size classes inside Buttons (3,613), viewport touch floors (~250) and `text-base` on Input (262).
- Classes the codemod can't map stay put, and the ratchet counts them.

**A + C. Close.** Ratchet to zero, then switch on the CSS geometry lock and the dev guard (§2.9).

### 2.2 Typography tokens — B, then C

- Add `--text-2xs` (11px) and `--text-3xs` (10px), each with a line height, under the `--text-*` namespace Tailwind 4 actually reads.
- Delete the 14 inert `--font-size-*` lines (`globals.css:140-153`).
- Codemod `text-[11px]` / `text-[0.6875rem]` → `text-2xs`, `text-[10px]` / `text-[0.625rem]` → `text-3xs`, and `text-[12px]` → `text-xs`. **About 12,100 replacements, pixel-identical.**
- The 9px and 8px cases (613) are judged one by one: most become `text-3xs`.
- **C:** a check bans `text-[<n>px|rem]` outright. Fluid display type gets a named token pair (`text-display`, `text-hero`), so `text-[clamp(…)]` is never written by hand.
- **Why B:** 11px is already in the system (the Badge base uses `text-[11px]`). The need is real; only the token is missing.

### 2.3 Badge — B + A + C

- Add `size: sm | md`, gap and icon sizing.
- Raw palette status classes (154) become the existing `success`/`warning`/`info`/`error` variants.
- `data-dense-rules.md`'s hand-rolled `rounded-full` pill is retired in favour of Badge (D5 decides `rounded-md` vs `rounded-full` for the one Badge).
- After the codemod, Badge is **closed**: placement only.

### 2.4 Dialog / Sheet — B + C (partial A)

- Add `DialogContent size: sm | md | lg | xl | 2xl | full` (433 call sites set a width; six named widths cover nearly all of them).
- Add `layout="panel"`: a flush card with a fixed header and footer and a scrolling `DialogBody` slot. This covers about 107 flex-column rebuilds and 76 `p-0` overrides.
- Delete Credenza (Dialog already adapts on mobile), **subject to the owner naming it dead**. The repo's unfinished-work rule forbids deleting on an agent's word alone, and the same applies to every dead file this plan names.
- **C:** a check bans `fixed inset-0` scrims, hand-written `role="dialog"` and `createPortal` outside the overlay systems. The ~12 copy-pasted markdown-block fullscreen modals collapse onto one `FullscreenBlock` composition.

### 2.5 Card — B + A, with C advisory

- Remove the host's silent `size="sm"` binding, or keep it as an explicit default the board picks (D9).
- Add `interactive` and `flush`.
- Status tint stays `Alert`'s job.
- Card's root is closed: placement only.
- **Hand-rolled card divs (2,808) can't be banned mechanically without false positives.** A `rounded-lg border bg-card` div is also a legitimate layout region. A heuristic check *reports* them and ratchets the count down. This is the biggest discipline-dependent bucket.

### 2.6 Tabs — B + A + C

- Add `variant: pill | line`, `size` and `fullWidth`, so the 34 copy-pasted underline recipes disappear.
- SegmentedControl stays as the 2–4 option toggle, but rides Radix ToggleGroup for keyboard semantics.
- **C:** a check flags `role="tablist"` outside the primitive (48 files), with window-panel chrome tabs registered as the one named exception.

### 2.7 Loading and empty states — B (new primitives), then C

- **`Spinner`** (sizes matching the icon rungs). Plus a Button `loading` prop that swaps the leading icon — `PRINCIPLES.md:33` already asks for exactly this.
- **`EmptyState`** (icon, title, one line, an optional action; inline and block sizes), with the interface-text budgets enforced through typed props.
- The two `LoadingSpinner` exports, `components/ui/spinner.tsx` and the copied `StageLoader`s converge on Spinner.
- **C:** ban `animate-spin` outside Spinner and the package, and ban bare "Loading…" text (the `real-loading-states` detector already exists).
- **Empty states stay mostly discipline:** a check can find local `function EmptyState` definitions, but not every hand-written "No items yet".

### 2.8 Raw elements — C (ratchet), A where cheap

- **Raw `<button>` (5,594) is the largest single bucket.** Many are legitimately unstyled click targets: a row, a card or a chip. Raw buttons get a sanctioned primitive (`<Pressable>`: focus ring, disabled and touch floor, no visual skin). Every *styled* raw button must become `Button` or `Pressable`. The check forbids a raw `<button>` carrying visual classes (5,324 today) and ratchets down per directory.
- Raw `<input>` (text-like), `<select>`, `<textarea>` and `<table>`: same ratchet, the existing `check:ui-primitives` widened.

### 2.9 Closing `className` (A) — the tap-target way

**Two weaker options were rejected:**
- **Narrowing `className` in the type system.** TypeScript cannot express "only placement classes" for an arbitrary string at reasonable cost. A template-literal union over Tailwind is unmaintainable.
- **Deleting `className`.** It would break all 27,361 call sites, including the ~1,200 that are placement-only.

**The mechanism already proven in this repo:**
1. **A CSS geometry lock** (from `design-system/src/tap-target.css`).
   - Control geometry lives in a cascade layer the host declares first: height, padding, font size, icon size, gap and radius per rung.
   - Every declaration is `!important` and reads tokens.
   - An important declaration in the earliest layer beats every later layer and all unlayered CSS, Tailwind `!` utilities included. So `className="h-7 text-xs"` on a locked Button simply does nothing.
   - **This is "impossible", with no JavaScript and no runtime cost.** It is switched on per primitive only after the codemod has removed that primitive's overrides, so nothing visibly changes when it flips.
   - Colour is not locked this way; colour overrides are caught by the check in §2.12.
2. **A dev-time guard per primitive**, modelled on `enableTapTargetGuard()` / `findTapViolation`.
   - In development builds, a mounted control whose measured geometry is off its rung, whose `className` carries a visual class, or whose wrapper adds gap or padding is flagged in two ways:
     - a visible red outline;
     - one console error naming the component, the class and the variant to use.
   - The agent sees it in the browser the moment it renders the page.
3. **A typed escape hatch for the rare legitimate one-off:** `unsafeClassName` plus a `// ui-drift-ok: <reason>` comment. Counted, listed in the status doc, and reviewed.

### 2.10 Colour, z-index, shadow, radius — C

- Widen `check:theme-color-literals` from `features/masterwork` to the whole repo, ratcheted (1,608 today).
- Ban arbitrary `z-[…]` and route layering through the package's `floatingLayerZIndex` / `MODAL_LAYER_Z`. Delete the unused `--z-*` scale or adopt it; one system, not three.
- Ban arbitrary `shadow-[…]` and `rounded-[…]`. Collapse elevation to the `--elevation-*` / `shadow-*` tokens.
- Pick one header-height token.

### 2.11 Instructions — D, the residue only

These run on day one, because they are cheap and they stop new drift that copies the docs.
- **Fix the skills that model the defect:**
  - `ios-mobile-first:120` (the arbitrary-value DialogContent example)
  - `ui-sharp/project-conventions.md:71-73, 216-218` (`text-[clamp()]` for all type)
  - `data-dense-rules.md` §1 and §6 (palette status colours, the hand-rolled badge, the tab bar)
  - `page-pass:383` (a class on every DialogContent)
- **Add one hard rule to the root `CLAUDE.md` UI section**, with the real violations as examples: *"A primitive's `className` carries placement only. A visual class on a primitive is a defect: add the variant to the package. ✗ `<Button size="sm" className="h-7 text-xs">` (1,440 sites) ✗ `<Badge className="text-[10px] h-4">` (965) ✗ `<DialogContent className="max-w-[95vw] lg:max-w-[1400px]">`"*. It points at the status doc for what is locked.
- **Amend `champions.md` and the ui-* postures:** *"The champion governs a surface's composition and behaviour. Control size, density rungs, radius, type scale and colour are the design system's and never vary per page."* This closes the "bones not skin" loophole without dropping the champion discipline.
- These skill files are synced from `common-docs`, so the edits land at the canonical source and run through the sync script.

### 2.12 Detection: warn the agent who wrote it, report it where others will see it

**No release gate.** Blocking a release punishes the agent running the release, not the agent who wrote the code (owner, 2026-10-02). Detection has three moments, all run by or about the author.

**1. While rendering (seconds).**
- What it is: the dev guard from §2.9.
- What it catches: any agent that opens its page in the preview sees the red outline and the console error. That is the closest possible feedback, and it needs no command.

**2. After every code change (about 1 second).**
- What it is: `pnpm findings <changed files>`.
- The `findings` command already exists. It runs only the checks whose watch paths match the files given, prints each **new** problem with file:line, a fix hint and the exact accept command, and exits non-zero when something new appeared. The `finalize-and-ship` skill already makes "no open findings in touched files" part of done.
- `ui-drift` is added to its registry (`scripts/findings/registry.mjs`) as an item-emitting check (the MATRX-ITEM protocol: one item per offending site, fingerprinted, `new`/`known` against the baseline).
- Because it is scoped to the changed files and diffed against the baseline, an agent sees only what *it* introduced. It never sees the 15,000-site backlog.
- What it flags:
  - a visual class on a primitive (with the variant that replaces it);
  - an off-scale `text-[Npx]`;
  - a raw palette or hex colour;
  - `animate-spin` outside Spinner;
  - a styled raw `<button>`;
  - a hand-written scrim, dialog or tablist;
  - a Card inside a Card, or a bordered padded box inside a Card (the card-in-card class);
  - an unresponsive page gutter (`p-6`/`p-8` on a page root with no phone value).

**3. Centrally (whoever ignores it, someone else sees it).**
- The same check runs **in the app**, on `main`, through the existing checks-run-in-the-app system.
- Its items land in `ops.check_item`, beside every other check's findings, on the admin page `/administration/reporting/check-findings`.
- Each item names its file:line, so the commit and session that introduced it are one `git blame` away.
- Fixer agents drain that queue with the existing fix-or-accept flow, so an ignored warning becomes somebody's task instead of disappearing.
- **The one approval this needs:** the in-app schedule. Every automated schedule is approved by exact name and interval. Proposed: **"UI drift check — daily"**.
- Until it is approved, the check still runs on demand, and its output can be ingested by hand (`aidream/scripts/checks/ingest.py`).

**Agents are told once, in the root `CLAUDE.md` UI section:** "after any UI change run `pnpm findings <files>`". The tap-target precedent shows the guard does most of the teaching.

---

## 3. Sequence

Each step lists its scope, files, regression risk, effort, and the exit criteria for the next step. Effort is in focused agent-sessions.

### Step 0 — Measure, record, and stop the bleeding (low risk, about 1 session)
- **Scope:**
  - Land `scripts/ui-drift/census.cjs` (done with this audit).
  - Add the `ui-drift` check to the `pnpm findings` registry: items, a per-primitive baseline, changed-files scope.
  - Request the in-app schedule "UI drift check — daily".
  - Add the status doc (§4).
  - Apply the §2.11 instruction fixes.
  - Run the decision board.
- **Files:** `scripts/ui-drift/*`, `docs/ui-unification-status.md`, 5 skill files (via common-docs), root `CLAUDE.md` UI section.
- **Risk:** none (no rendering change).
- **Exit:**
  - The baseline is recorded.
  - `pnpm findings` reports `ui-drift` items for changed files (§2.12), and the in-app schedule has been requested.
  - The owner has decided D1, D1b, D1c, D2–D5 and D15 on the board.

### Step 1 — The control size scale and icon rungs in the package (high visibility, medium risk, 2 sessions)
- **Scope:**
  - Button rungs, icons and gaps; ghost tones.
  - Input `size` (with the default change if D2 approves) and the scalable prefix slot.
  - Select rungs; SegmentedControl rungs.
  - Package tests asserting that every control at a given rung has the same height, a "row parity" test.
  - Release, then adopt in matrx-frontend the same session.
- **Files:** `aidream/apps/shared/design-system/src/{button,input,select,segmented-control}.tsx` and their tests; the host `components/official/IconButton.tsx`.
- **Visible change:**
  - Icons in small Buttons shrink from 16px to 14px (what 1,520 call sites asked for).
  - Input default height, if approved.
  - Select `sm` and Button `xs` move, and are codemodded in Step 2 to keep their pixels.
- **Exit:**
  - Package released.
  - matrx-frontend on the new version.
  - Screenshots of five dense toolbars (secrets vault, research tasks, MCP admin, agent builder, CMS collections) show aligned rows.

### Step 2 — Button / Input / Select codemod and lock (high visibility, low–medium risk, 2 sessions)
- **Scope:**
  - The §2.1 codemod.
  - Delete no-ops.
  - Ratchet baselines drop to the residue; review the residue by hand.
  - Switch on the CSS geometry lock and the dev guard for Button, Input and Select.
- **Files:** about 2,600 files touched mechanically. Commit them per directory, so a regression bisects to one area.
- **Risk:**
  - Low for deletions of no-ops: pixel-identical by construction.
  - Medium for `sm`+`h-7` → `xs`, where padding changes from px-3 to the rung's padding. The codemod reports every site whose remaining classes it couldn't map.
  - Verify with before/after screenshots of 20 named routes.
- **Exit:**
  - Ratchet at zero for Button, Input and Select, apart from listed `unsafeClassName` exceptions.
  - Filter on.
  - Status doc shows the three as LOCKED.

### Step 3 — Type tokens (zero visual change, low risk, 1 session; can run in parallel with Step 1)
- **Scope:** §2.2 — tokens, codemod, and ban `text-[px]`.
- **Files:** `app/globals.css`, about 2,900 files mechanically.
- **Exit:**
  - `text-[<n>px]` count is 0 outside listed exceptions.
  - The check bans new ones.

### Step 4 — Badge, Tabs, Label (medium visibility, low risk, 1–2 sessions)
- **Scope:** §2.3 and §2.6. Label `size`/`tone` (caption, overline). Codemod, then lock.
- **Exit:** all three LOCKED.

### Step 5 — Dialog, Sheet, Popover, DropdownMenu, Card (medium visibility, medium risk, 2 sessions)
- **Scope:**
  - Dialog sizes and the panel layout.
  - Popover `padding`.
  - DropdownMenuItem `destructive`.
  - Card `interactive`/`flush` and the binding decision.
  - Codemod and lock.
- **Risk:** dialog layout changes are the most behaviour-adjacent (scroll and sticky footer). The package's sticky-footer and touch-floor tests already cover the geometry; extend them for `layout="panel"`.
- **Exit:** all LOCKED; the 433 DialogContent width overrides are gone.

### Step 6 — The missing primitives (high value, low risk, 2 sessions)
- **Scope:**
  - `Spinner`, `EmptyState`, `Pressable`, and Button `loading`.
  - Migrate the shared loader zoo onto Spinner.
  - The checks: `animate-spin` ban, bare "Loading…" ban, raw styled `<button>` ratchet, `role=tablist` / scrim / portal bans.
- **Exit:** the primitives are released, and the bespoke ratchets are recorded and falling.

### Step 7 — The bespoke burn-down (long tail, mixed risk, ongoing, per feature)
- **Scope:** feature by feature, highest drift first:
  1. features/marketing
  2. features/agents
  3. components/mardown-display
  4. features/research
  5. features/rag
  6. features/ai-models
- **Work in each feature:**
  - convert raw styled buttons, hand-rolled tabs and spinners;
  - consolidate local empty states;
  - collapse duplicate families (IconButton ×10, toast stacks ×3, select variants, search inputs ×15, number inputs ×8).
- **Dead files** (51 in `components/matrx`, 20 in `components/ui`, `styles/dynamic*.ts`, the ThemeSwitchers) are **presented to the owner as a list to name dead**, never deleted on an agent's say-so.
- **Exit per feature:** its row in the status doc reads green on raw-button, spinner, tabs and arbitrary-value counts.

### Step 8 — Colour, layering, elevation (low visibility, low risk, 1–2 sessions)
- **Scope:** §2.10.

---

## 4. Tracking: `docs/ui-unification-status.md`, generated

**Requirements:**
- It lives in the repo.
- It costs nothing to keep current.
- A future agent can read it as the authority on what it may touch.

**Design:**
- **The source of truth is a small config, `scripts/ui-drift/locks.json`**: one entry per primitive with `state` (`OPEN` → `VARIANTS-LANDED` → `CODEMODDED` → `LOCKED`), the allowed placement categories, and the `unsafeClassName` exceptions with reasons. **The check reads this same file**, so enforcement and documentation cannot disagree.
- **`pnpm ui-drift --write` regenerates the status doc** from `locks.json` plus a fresh census. It produces three tables:
  1. **Primitives:** state · sites · overridden · ratchet baseline · top three residual classes · lock on/off.
  2. **Feature areas** (every `features/*`, `components/*` and `app/(group)` with ≥8 files): override rate · styled raw buttons · arbitrary values · hex · spinners · trend versus the last write.
  3. **Exceptions:** every `unsafeClassName` and `ui-drift-ok` with its file:line and reason.
- **It is maintained as part of the work, not beside it.**
  - Each step's commit includes the regenerated doc.
  - The check fails when a baseline is *higher* than the census (a regression) and prints `--write` when it is *lower*, so the ratchet tightens itself.
  - No human edits the tables; a human edits only `locks.json` state transitions.
- **What it tells a future agent, in the header the generator writes:**
  - LOCKED primitive → "placement classes only; a visual need means a package variant".
  - OPEN primitive → "do not add new overrides; the ratchet will fail".
  - Feature rows → which directories are mid-migration, and so whose structure must not be rebuilt in a different style meanwhile.

---

## 5. Decisions the board settles

| # | Question | Recommendation |
|---|---|---|
| D1 | Toolbar height | 28px (the tap capsule) for dense toolbars. |
| D1b | Touch behaviour | An invisible 44px hit area; layout never grows (the tap system). |
| D1c | Rung count | Three: 28 · 32 · 36. |
| D2 | Form-row height | 36px: Input matches Button and Select. |
| D3 | Icon size in small buttons | 14px at `xs`/`sm`, 16px at `md`/`lg`. |
| D4 | Micro text sizes | Add 11px (`text-2xs`) and 10px (`text-3xs`); nothing smaller. |
| D5 | Badge shape and status colour | One Badge, variants for status, no palette classes. Owner picks the shape. |
| D6 | Quiet and destructive ghost styles | `tone="muted"`, `tone="destructive"` on ghost/outline. |
| D7 | Icon-only button family | Square rungs on Button. `official/IconButton` becomes a tooltip wrapper only. |
| D8 | Tabs style | Pill and line, both as variants; owner picks the default. |
| D9 | Card density | Owner picks; recommend `md` (p-4, rounded-lg) as default, `sm` explicit. |
| D10 | Dialog widths | Default `md`; named sm–2xl plus full. |
| D11 | Loading indicator | One Spinner; Skeleton for content-shaped loads. |
| D12 | Empty state | Icon, title, one line and an action; inline and block sizes. |
| D13 | Toasts | `@/lib/toast` only; retire the Radix stack and toast-service. |
| D14 | Surface radius | Owner picks one for panels; controls stay `rounded-md`. |
| D15 | Phone page structure | Flat rows with hairlines, or inset grouped. Never cards inside cards. |

These choices also feed the Claude Design session inputs: the design system that session produces should state each answer as a token or variant, not as prose.
