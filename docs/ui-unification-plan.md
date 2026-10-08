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

## 1b. THE ONE CONTROL — the standard (owner direction, 2026-10-02)

> "We are trying to make things uniform and also dense … we need to unify this system with the tap target buttons … visually they need to look identical … tighter and smaller, not bigger and bulkier … a default that can only be overridden if someone goes way out of their way."

**This section supersedes §2.1's size ladder.** The ladder (`2xs`…`xl` rungs to choose from) is exactly the menu an AI agent fills with slop. There is no ladder.

**1. One control, built from the tap geometry.** Every interactive control is the same object as a tap button:
- text button, field, select, tabs, segmented toggle, and the round and wide tap buttons themselves;
- **one visible height:** `--matrx-tap-wide-size`;
- **one half-gap of spacing carried on each side** (the tap box's own spacing), so containers add **no gap** and any mix of controls sits exactly one gap apart;
- **one capsule shape, one 13px/500 label, one 16px glyph.**

Proven on `/demos/ui-unification` D0. Today's row measures 32 / 40 / 36px tall and 8 / 11px apart; the unified row measures one height and 6px apart, with the real tap buttons inside it and no guard violations.

**2. The default, recommended for the owner's pick (board D0–D0e):**

| Token | Today | New default |
|---|---|---|
| Control height (`--matrx-tap-wide-size` = pill) | 32px | **28px** |
| Tap box (footprint) | 38px | **34px** (pill + the same 6px gap) |
| Group pill (`-sm`) | 28px | **24px** (capsule − 4) |
| Label | 13px/500 | 13px/500 |
| Glyph | 16px | 16px |
| Field shape | rounded-md, 40px | capsule, 28px |
| Touch | Button grows its layout to 44px | invisible 44px hit area (tap model), layout unchanged |

Dense page defaults, from the D0e sample at the same content: page side gutter 12px, list row 36px with a 13px title and an 11px meta line, sections separated by hairlines. Same content: **556px tall → 268px**.

**3. Agents get no choice.**
- **Tap sizes move in one place only.** The tap tokens stay the only geometry, and the change lands in `design-system/src/tap-target.css` (the guard already refuses any other scope).
- **`Button`, `Input`, `Select`, `Tabs`, `SegmentedControl` and `Badge` lose their `size` prop.** A codemod deletes every `size=` and every height, padding or text-size class at the call sites. There is nothing left to pick, and the locked geometry layer (§2.9) ignores anything an agent adds.
- **Variants stay tone-only:** primary, neutral, quiet and destructive. Tone is meaning, not size.
- **The exception is a different component, never a prop.** The rare big, custom control (a marketing hero, an onboarding call-to-action) is `<FeatureButton>` from one folder (`components/official/feature/`). Using it requires a `// ui-exception: <reason>` comment on the line; the `ui-drift` findings check reports every use, so it lands on the central findings page. Reaching it means deliberately leaving the default.
- **Icon-only buttons are tap buttons.** `size="icon"` and the 10 `IconButton` copies all go; their call sites become pre-composed `*TapButton`s.

**4. Order of work** (replaces Steps 1–2 for controls):
1. **Package (design-system):**
   - tap tokens to 28 / 34 / 24;
   - Button, Input, Select, Tabs and SegmentedControl rebuilt on the tap geometry: capsule, half-gap margin, `::before` hit slop on coarse pointers, `size` removed;
   - the tap geometry test extended to assert every control's height equals `--matrx-tap-wide-size`.
2. **Codemod in matrx-frontend:** strip size props and size/padding/text classes on those primitives; replace icon-only Buttons and IconButtons with tap buttons.
3. **Lock** (§2.9) and the findings check (§2.12).

Visible effect: every toolbar and form row in the app becomes 28px and evenly spaced at once. That is the point.

## 1c. Round 2 rules (owner, 2026-10-02)

**Space doctrine.** AI-generated UI fails by adding space everywhere: page padding, then a card with more padding, then a box inside with more again. That crams the part people care about until it wraps and collides. Space belongs **between groups**, to make structure readable, and never stacked as padding inside padding. One surface level. Content gets the width. The reference is Apple's Human Interface Guidelines.

**Loading is a system, not a widget.** Every region of a page loads independently, with a skeleton shaped exactly like what renders there: a table skeleton looks like the table, a list skeleton like its rows, a menu skeleton like the menu. Never one block for the page, and never one spinner in the middle. An inline spinner is only for an action in progress inside its own control. AI work streams into the live window (an existing law). Reference implementation: the agent builder.

**Combined answers are allowed.** Several winners take the best of two options. These are on the board as "Combine":
- **Empty state:** the icon + title + action structure, with EmptyStateCard's tinted icon disc, at dense sizes.
- **Status colour:** the raw-palette tint the owner likes, expressed as token variants.
- **Tabs:** underline for page sections, capsule for filters.

**Found live: the status colour ramp is missing.** `--warning-foreground` is near-white in light mode (it is meant for text on a solid fill), so amber text on a light tint is unreadable. Every status role needs four tokens: text, subtle background, border and solid. This is the token gap the audit predicted; it is now confirmed on a real screen.

**Page kinds: inviting vs functional (owner, 2026-10-04).** Every page is one of two kinds, and the density rules in this plan (the 28px one control, hairline rows, prose-to-tooltip, tight padding) apply ONLY to **functional** pages — tables, settings, builders, tools someone drives all day. An **inviting** page (a study kit, a landing, a learner's home) keeps its large hero, open spacing, elevated cards and big type; unification there fixes the header, makes its buttons one consistent style, and removes stray text — it never shrinks or packs anything. The owner, on the study kit sample that was packed into a strip: *"this is where you don't understand the difference between a page with large open things that is inviting and a FUNCTIONAL page that needs things to be densely packed. This page should not be packed!!!"* Before touching any page, name its kind; if it is inviting, the reference is the real `/education/kits/<id>` page, not the 28px system.

**Persistence for the board:** the custom-data probe showed storage works, but the page-level primitive (`ensureTable` + `useTypedTable`) is missing. It is filed as its own task, and the board stays on local storage plus Markdown export until it lands.

## 1d. Sets, not single picks (owner, 2026-10-02)

Unifying means one system, not one option. When a job genuinely has two or three right answers, the system ships all of them as named variants, each with a one-line rule for when to use it. Without that, agents hand-roll the missing ones. The best references (GitHub, Stripe, Linear, Apple) all work this way.

**Delete, three tiers** (board D6b):

| Tier | When to use it |
|---|---|
| **Quiet** | The default: a quiet trash glyph. The item is archived, and the toast offers Undo. |
| **Confirm** | Permanent, or it affects other people. A dialog names the cost ("Removes 214 responses for 3 people"), then a red button. |
| **Danger zone** | Irreversible and account-level. A red section, in settings only. |

**Loading** (D11) is likewise a set: a region-shaped skeleton, an inline spinner inside a busy control, and the live window for AI.

**Toast — one component, four layers** (owner spec, prototype on the board). The component carries the intelligence; a developer only passes props.

1. **Always:** message, close, and a small copy-for-AI glyph. That is the Alchemy idea in its simplest form: one button, no menu. It copies an XML block with the route, message, kind and time automatically, plus an optional developer `aiContext`.
2. **Optional detail:** on hover or click, the toast opens a thin popover in the agent peek style.
3. **Optional:** open the detail as a window panel. There is exactly one way to do this, and it looks the same everywhere.
4. **Optional:** a route for the detail, opened in a new tab only. A toast never navigates the current page.

**Components to bring into the standard system** (inventory, then the same treatment as the controls):
- the thin peek popover (`features/organizations/peek/*`, the agent peek in `features/agents/orchestras/components/AgentPeekButton.tsx`);
- window panels (`features/window-panels`);
- the flexible side drawer (`components/matrx/resizable/MatrxDynamicPanelHost.tsx`, 61 importers);
- the toast above.

Each gets one canonical component, one density, and the tap geometry for its controls. The toast's layers 2 and 3 use the peek and the window panel, so all three stay one family.

**Tap group fix** (design-system 0.50.13):
- A selected or hovered pill inside a group is inset 2px on every side (it was 3px at the ends and 2px top and bottom), and it is fill-only, so there is one outline, not two.
- The dense-table scope now recomputes the group pill size; until now group pills filled a table's capsule with no inset.

## 2. Mechanism per drift category

Mechanism key: **A** = close the component · **B** = add the missing variant · **C** = enforce mechanically · **D** = instruct.

### 2.1 Control sizing (Button, Input, Select, Tabs, SegmentedControl, Badge) — B, then A + C

*Superseded by §1b (one size, no ladder). Kept for the evidence it carries.*

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
- **Built 2026-10-03, approved the same day** ("Daily check is an absolute yes!"): `scripts/ui-drift/check-ui-drift.mjs` (row `ui-drift`, baseline `scripts/ui-drift/baseline.json`, shrink-only), run daily by `.github/workflows/ui-drift-daily.yml` and ingested by the app's hourly pull. Card-in-card and page-gutter rules are not in it yet.

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

### Step 7b — Packages that ship their own UI system (high visibility, medium risk, 1–2 sessions each)
- **Scope.** In order: meet, messaging, chat, then capture, media, print and detail. Each one's raw controls move to design-system primitives, and its stylesheet shrinks to what is truly its own (the meet video stage, the chat transcript layout). Its private `--mx-*` colour tokens map onto the design-system roles.
- **Started 2026-10-02:** the meet pre-join lobby (`@ai-matrx/meet` 0.7.76).
- **Rules** (the Same-Session Law):
  - each change is made in the package, released, and adopted in matrx-frontend in the same session;
  - each adds a guard test proven red first, like the lobby's "renders design-system controls, never native ones".
- **Census and checks extend to packages.** `scripts/ui-drift/census.cjs` gains the `aidream/apps/shared/*/src` roots, and the `ui-drift` findings check watches them too.
- **Runtime sweep.** The rendered-page measurement used on 2026-10-02 (overflow, collapsed columns, nested surfaces, mismatched row heights, native controls; at 375px and desktop) becomes a script the in-app check runner runs on a schedule against live as `admin@admin.com`. That's the only way to see cross-file nesting and layout collapse.
- **Exit per package:** zero native `<select>`/`<input type=checkbox>`/styled `<button>` in its TSX, and its CSS has no rule that restates a design-system primitive.

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
