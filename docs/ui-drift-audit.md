# UI drift audit — matrx-frontend

**Date:** 2026-10-01 · **Scope:** every tracked `.tsx` in matrx-frontend (9,761 files excluding tests) plus the `@ai-matrx/design-system` package (`aidream/apps/shared/design-system`, v0.49.59) · **Companion:** [`ui-unification-plan.md`](./ui-unification-plan.md) · **Status:** research only — nothing was refactored.

**How the numbers were produced.** Primitive call-site counts come from an AST census ([`scripts/ui-drift/census.cjs`](../scripts/ui-drift/census.cjs) — `node scripts/ui-drift/census.cjs . /tmp/census.json`). For each JSX element whose tag resolves to an import of a shared primitive (`@ai-matrx/design-system`, `@/components/ui/*`, the official `IconButton`), it reads every static class string in `className` (literals, template parts, every `cn()`/`clsx()` argument, conditional ones included) and classifies each token. A **placement** token (margin, `w-full`, `flex-1`, `shrink-0`, positioning, display, overflow, alignment) does not count as an override. A **visual** token (padding, gap, height, size, colour, border, radius, shadow, typography) does. Files inside `components/ui/` and `components/official/` are the definition layer and are excluded from call-site counts. The duplicate-family, guardrail and bespoke-pattern counts come from four parallel read-only investigations. They resolved imports to files, so importer counts are real importing files, not name matches. Where a number is a regex heuristic rather than an AST count, the text says so. Two load-bearing claims were verified live in a browser on the running preview, as noted inline.

---

## Summary

**The worst problems**

1. **The primitives cannot express the density the app actually uses, so overriding them is the only way to get a legitimate result.**
   - 56% of all 27,361 primitive call sites pass visual classes.
   - Sibling controls do not share a height scale:
     - Input is 40px, Button and Select are 36px.
     - "sm" means 32px on Button but 28px on Select.
     - Input, Badge and Tabs have no size prop at all.
     - The Button has no 28px text size, which is the size dense UIs use most: `size="sm"` plus a hand-written `h-7` appears **1,440** times.
   - The type scale has no step below `text-xs`. The 14 custom font-size tokens in `globals.css` are written in Tailwind 3 syntax and are **inert under Tailwind 4** (verified live). So `text-[10px]` / `text-[11px]` were typed **11,753** times.
   - Icon size inside a Button is set by the Button on every rung and **cannot be overridden from the icon**. 3,613 icons inside Buttons carry a size class, and about 2,200 of those request a size the user never sees (verified live: the login page's 20px social icons render at 16px).
2. **Phones get the worst of it.**
   - Touch grows the Button's *layout* to 44px while fields stay small.
   - Cards nest inside cards: 36 nested surfaces on `/organizations` at 375px.
   - Page roots pad 24–32px per side with no phone value.
   - Details in §2.5b.
3. **Bespoke reimplementation is as common as the primitives.**
   - **5,594** raw `<button>` against 8,180 `<Button>`.
   - **2,808** hand-rolled card divs against `<Card>` in 331 files.
   - **~3,000** `Loader2 animate-spin` against ~290 uses of any shared loader.
   - No `EmptyState` exists anywhere, so there are 140 local ones.
   - 10 `IconButton` implementations, three live toast stacks, and ~104 hand-rolled tab bars.
4. **Nothing enforces anything, and the agent instructions teach the drift.**
   - ESLint is never executed (no CI step, no hook, no release step).
   - No check anywhere inspects `className` on a primitive, arbitrary values, or colours outside one feature.
   - Every UI check that does exist is advisory, runs after the push, or runs nowhere.
   - The design-system skills prescribe:
     - hand-rolled badges and tab bars
     - `DialogContent` overrides with arbitrary values
     - `text-[clamp()]` for "all typography"
     - a different named "champion" product for every page

**The single highest-leverage fix:** give every control primitive **one shared size scale** — height, padding, font size, icon size and gap, all owned inside the primitive and identical across Button, Input, Select, Tabs, SegmentedControl and Badge — and add the two missing type tokens. That turns most of the 15,366 overrides from *necessary* into *deletable*, which a codemod can then remove. It must come before any ban: closing `className` without it would push agents from `<Button className>` to raw `<button>`, which is already nearly as common.

**Mechanical vs discipline — honest estimate.**
- **About 70–75% of the drift counted here can be made mechanically impossible or CI-detectable.** That covers primitive overrides, arbitrary type and colour values, icon sizing, raw elements where a primitive exists, and duplicate exports.
- **The remaining 25–30% will always depend on review.**
  - Spacing *between* primitives in page layout: 211 distinct paddings and 45 gaps, most of them on plain `div`s.
  - Hand-rolled cards and panels under new names.
  - Picking the right primitive for the job.
  - Whether a new need deserves a variant.
- Weighted by what a person *perceives* as inconsistency, the discipline share is closer to half, because page composition is what the eye reads first.

---

## 1. The foundation

### 1.1 Token sources

| # | Source | Defines | Notes |
|---|---|---|---|
| T1 | `app/globals.css:58-716` `@theme inline` | 53 `--color-*`, 34 animations, **14 `--font-size-*` (inert)**, 3 font families, 4 `--radius-*` (derived from `--radius`), 3 shadows, `--breakpoint-2xl` | Tailwind entry |
| T2 | `app/globals.css:810+` `:root` / `.dark` | Raw HSL semantic colours; `--radius: 0.5rem` (899, 1058); `--elevation-1..3`; **`--z-*` scale, 10 tokens (946-955)**; `--header-height: 2.5rem` (813); glass, scrollbar, meet and messaging vars | 143 unique |
| T3 | `styles/shell.css` | 43 `--shell-*` geometry tokens, incl. **`--shell-header-h: 2.75rem`** (line 12, overridden to 2.5rem at 1887) | |
| T4 | package `tokens.css` (imported `app/layout.tsx:20`) | The same 35 semantic colour names as T2, plus 31 package-only tokens (chart, motion, scrim, tooltip, table) | **19 dark values differ from T2**; the host wins by cascade layer |
| T5 | package `theme.css` | 24 `--color-*` mappings | Not imported; duplicate source |
| T6/T7 | package `styles.css`, `tap-target.css` | structural CSS, `--matrx-tap-*` | |
| T8 | feature CSS (`messages-native.css`, `rich-editor.css`, …) | 63 feature-local vars | |
| T9 | Theme mode | Cookie → `.dark` class + Redux (`styles/themes/themeSlice.ts`) | No `next-themes`. Both `ThemeSwitcher` components have 0 importers. |
| T10 | JS "tokens" | `styles/dynamic.ts`, `styles/dynamicStyles.ts` (**0 importers**); 55 ad-hoc `*COLOR*/PALETTE/THEME*` constants | |

**Conflicts**

- **Type scale.** `--font-size-2xs … --font-size-9xl` (`globals.css:140-153`) use Tailwind 3 naming. Tailwind 4 reads font sizes only from `--text-*`.
  - Verified live: `text-xs` computes to 12px (stock), not the file's 0.8rem; `getPropertyValue('--font-size-xs')` is empty; `text-2xs` does not exist.
  - **The app has no custom type scale. It has a stock one plus a dead file that claims otherwise.**
- **Spacing scale:** stock Tailwind. No source defines spacing tokens.
- **Header height** has two tokens with two values: `--header-height` 2.5rem (52 uses) and `--shell-header-h` 2.75rem (589 uses).
- **Three z-index systems.**
  - The `--z-*` CSS scale is used **3 times**.
  - The package uses `MODAL_LAYER_Z = 10000`.
  - Tailwind literals: `z-10` ×416, `z-50` ×157, and 131 arbitrary `z-[N]` (`z-[9999]` ×33, `z-[2147483600]` ×2).
  - `components/official/Z-INDEX-ARCHITECTURE.md` documents a fourth model, which is stale.
- **Elevation** is defined twice: `--elevation-*` and `--shadow-glass*` / `--shadow-input`. On top of that there are 192 arbitrary `shadow-[…]` uses and **134 distinct shadow classes**.
- **`cn` is defined five times in the app** (`lib/utils.ts` 2,545 importers, `utils/cn.ts` 131, `styles/themes/utils.ts` 183, plus two dead copies), plus the package's own.

### 1.2 Primitive inventory

**The canonical primitives live in the package.** `components/ui/` is mostly doors to it. Of its 121 source files:

| Class | Files |
|---|---|
| Pure re-export of the package | 27 |
| Binding (wraps the package and changes a default) | 6 |
| Host additions composed on the package | 7 |
| Stock shadcn | 9 |
| Modified shadcn | 6 |
| Bespoke effect (aceternity-style: sparkles, 3d-card, wobble-card…) | 28 |
| Bespoke app component | 38 |
| **Dead (0 production importers)** | **20** |
| Reachable only from a demo route | 20 more |

**Bindings that change what a primitive looks like depending on the import path** (live drift):
- **Switch:** the host door binds `size="sm"` (`components/ui/switch.tsx:20`). 7 files import the package directly and render `md`, e.g. `features/settings/universal/KnobFieldControl.tsx`, `features/settings/tabs/NotificationsTab.tsx`.
- **Checkbox:** same pattern; 3 bypassers, e.g. `components/official/review-deck/ReviewDeck.tsx`.
- **Card:** the host binds `size="sm"` (`p-2 rounded-xl shadow`) for the whole app. **0 of 787 `<Card>` pass a size.** The call sites then repaint padding by hand (§2.2).
- **Resizable:** two host doors to one component, with 2px and 8px handles.
- **Package-direct imports are routine:** 1,487 files import the package root (Input in 853 of them).

**`components/official/`** (55 top-level files) is a second tier: ProInput, ProTextarea (427 importers), IconButton, GatedActionButton, FullScreenOverlay, FloatingSheet, InfoHint and others. **`components/matrx/`** is an unacknowledged third tier: 129 files, **51 with 0 importers**, holding its own IconButton, Selects ×6, Tooltips ×3, Checkbox, date picker, 8 collapsibles and an entire AnimatedForm kit.

**The package's styling API** (full census in the Appendix).
- **Every primitive takes `className` and merges it last through `twMerge`, so the call site wins every conflict.** `button.tsx:126`, `badge.tsx:33`, `card.tsx:75`, `input.tsx:69`, `tabs.tsx:88`, `tooltip.tsx:126`.
- The only exception is `DialogContent` on mobile, where the sheet geometry is applied after `className` on purpose.
- **No primitive restricts `className` by type.**

### 1.3 Duplicates and near-duplicates

| Family | Implementations (production importers) | Canonical per code |
|---|---|---|
| **Button / IconButton** | Package `Button` (2,581 files) · `components/official/IconButton` (25) · `components/ui/icon-button` (2) · `features/shell/components/IconButton` (3) · `components/matrx/IconButton` (0) · `TextIconButton` internal · 5 private `IconButton`s (JsonEditor, JsonEditorItem, ChatHeaderActions, FileTableRow, QueryBlock) · `navigation-button` (0) · `tailwindcss-buttons` (demo) · `MagicButton` (0) · `AnimatedButton` ×2 · 18 `*CopyButton*` files with no single copy primitive · 151 `*Button.tsx` files, **50 of which render a raw `<button>`** | `Button` (`components/ui/button.tsx:4-17`: "Need a new size … Add it to the PACKAGE") |
| **Dialog / Sheet / Overlay** | Package Dialog (434), AlertDialog (88), ConfirmDialog (169), Drawer (130), Sheet (15), BottomSheet (24), TabbedBottomSheet (2) · **Credenza** (18; Dialog↔Drawer by media query, which Dialog already does) · **FloatingSheet** (3, hand-rolled, own ESC/backdrop) · FullScreenOverlay (11) · SplitScreenOverlay (0) · MobileOverlayWrapper (5) · AnimatedForm modals · 8 fully hand-rolled `*Modal.tsx` (`fixed inset-0`, no primitive), e.g. `features/agent-settings/components/AgentSettingsModal.tsx`, `features/html-pages/components/HtmlPreviewModal.tsx` | `Dialog` |
| **Card / Panel** | Package Card (324) · `official/card-and-grid/*` (4/2/1/1/1) · `official/cards/SectionCard` (0), `SimpleCard` (0), `EmptyStateCard` (2) · ThemedSectionCard (2, own 370-line CSS module) · StructuredSectionCard (3) · GlassContainer (0) · 10 effect cards · **2,808 hand-rolled `rounded-* border bg-card` divs in 1,577 files** (regex). Of 185 `*Card.tsx` files, 27 use Card; of 353 `*Panel.tsx`, 20 do. | `Card` (its header: "collapsed four forked cards") |
| **Spinner / loader** | **No canonical spinner is declared, and the package exports none.** `Loader2 animate-spin` ×3,017 in 1,733 files · `components/ui/loading-spinner` `LoadingSpinner` (25) · `components/ui/spinner` **also exports `LoadingSpinner`**, a different component (6) · `loaders/Spinner` (0) · SuspenseLoader (79) · MatrxMiniLoader (56) · MultiStepLoader · `StageLoader` copied 3× in podcast studio · 30 hand-built CSS rings · 67 exported `*Spinner/*Loader/*Skeleton` definitions | none |
| **Tabs** | Package Tabs (159 files) · SegmentedControl (14, `role=tablist` without Radix keyboard) · ToggleGroup (24) · `tabs-navigation` (0) · 24 `*Tabs*/*TabBar*` files · **48 files hand-write `role="tablist"`** · ~104 files with a hand-rolled tab bar (state + `<button>` + active ternary; heuristic) | `Tabs` |
| **Select / Picker** | Package Select (468) · CreatablePicker (17) · OptionCombobox (7) · IconSelect · floating-select-label · **9 dead select variants** in `components/ui/{loaders,matrx}` and `components/matrx` · **108 `features/**/*Picker.tsx`** on at least 5 different bases · native `<select>` in 161 files | Select / CreatablePicker / OptionCombobox by option count |
| **Input** | Package Input (h-10) and BasicInput (h-9) · ProInput (58) · ClampedNumberInput (56, "the ONE integer field") alongside **8 other NumberInput implementations** · **15 search-input implementations** · 63 exported `*Input` components | Input → ProInput |
| **Toast** | `@/lib/toast` (1,550) · **legacy Radix `use-toast` (92), still mounted** at `app/layout.tsx:28,120` · `lib/toast-service` (36) with its own provider · a dead fourth copy in `components/ui/matrx/` · 1 bare-sonner violation, `features/ai-models/components/AiModelsContainer.tsx:8` | `@/lib/toast` |
| **Tooltip** | Package Tooltip (189; every `title=` is routed to it) · InfoHint (33) · HelpIcon · `matrx/Tooltip` (10) · `MatrxTooltip` (3) · hover-tooltip · animated-tooltip · NavItemTooltip · HelpTooltip | Tooltip / InfoHint |
| **Empty state** | **No shared primitive.** 34 files define a local `EmptyState`; 106 more `*Empty*` components; 727 hand-written empty-copy lines | none |
| **Hook / util twins** | `useIsMobile` (`hooks/use-mobile.tsx`, **258 importers**, own 767px query) vs the package's · `useScrollFade` twin · `cn` ×5 — **none registered in `scripts/package-twins.json`** | package |

---

## 2. Drift map

### 2.1 Ranking by override rate (AST, call sites outside the definition layer)

| Rank | Primitive | Sites | Compliant | Placement only | **Overridden** | Rate | Override kinds (sites) |
|---|---|---|---|---|---|---|---|
| 1 | Popover / HoverCard content | 260 | 9 | 0 | 251 | **96.5%** | spacing 249 (`p-0` 109, `p-3` 38, `p-2` 33, `p-1` 32) |
| 2 | Textarea | 190 | 25 | 4 | 161 | **84.7%** | typography 154 (`font-mono` 103, `text-xs` 74), size 82 |
| 3 | Badge | 2,062 | 339 | 58 | 1,632 | **79.1%** | typography 1,423, spacing 706, colour 435, size 363 |
| 4 | Input | 1,880 | 528 | 44 | 1,294 | **68.8%** | typography 1,066, size 965, spacing 230, colour 147 |
| 5 | Button | 8,180 | 2,624 | 463 | 5,020 | **61.4%** | size 4,060, spacing 3,014, typography 2,145, colour 1,051, radius 246 |
| 6 | Card (+ parts) | 1,822 | 652 | 70 | 1,092 | **59.9%** | spacing 762, colour 284, typography 231, size 142 |
| 7 | Label | 2,204 | 852 | 28 | 1,297 | **58.8%** | typography 1,223, colour 423 |
| 8 | Table parts | 387 | 124 | 23 | 208 | 53.7% | colour 103, spacing 85, size 81, typography 78 |
| 9 | Sheet / Drawer content | 387 | 138 | 41 | 207 | 53.5% | spacing 118, size 101 |
| 10 | Tabs (+ parts) | 1,330 | 411 | 222 | 687 | 51.7% | size 412, spacing 393, typography 186, colour 140, radius 83 |
| 11 | Combobox (Command) | 123 | 62 | 1 | 60 | 48.8% | size 27, spacing 22, typography 21 |
| 12 | Tooltip content | 371 | 178 | 13 | 178 | 48.0% | typography 114 (`text-xs` 110), size 110 (`max-w-xs` 59) |
| 13 | IconButton (official) | 100 | 41 | 0 | 46 | 46.0% | colour 37 (raw `bg-slate-500`, `bg-purple-500` fills) |
| 14 | Dialog / AlertDialog parts | 2,130 | 1,281 | 52 | 797 | 37.4% | size 439, spacing 344, typography 132 |
| 15 | DropdownMenu parts | 1,082 | 677 | 15 | 390 | 36.0% | size 170, spacing 149, colour 89 |
| 16 | Select parts | 3,022 | 2,071 | 22 | 914 | 30.2% | size 605, typography 597 |
| 17 | Checkbox | 348 | 205 | 100 | 39 | 11.2% | size 31 |
| 18 | Switch | 394 | 350 | 35 | 9 | **2.3%** | — |
| — | Skeleton | 1,089 | — | — | — | n/a | Skeleton takes its shape from `className` by design; not counted as drift |
| | **All** | **27,361** | **10,567** | **1,196** | **15,366** | **56.2%** | |

**What the ranking says.**
- **Switch and Checkbox barely drift (2–11%).** Their primitives have a size that matches what callers need, and visually there is nothing else to want.
- **Badge, Input, Textarea and Popover drift worst.** Each lacks a dimension callers clearly need: Badge and Input have no size, Popover has no padding variant, and Textarea has no mono/dense mode.
- **Drift tracks API gaps, not carelessness.** That is the central finding. It is also why the plan puts variants before enforcement.

### 2.2 Per primitive: the exact overrides

The counts below are AST counts of individual class tokens across all overridden sites of that primitive.

**Button** (8,180 sites)
- Most common tokens: `h-7` ×1,626 · `text-xs` ×1,485 · `gap-1.5` ×936 · `px-2` ×849 · `h-8` ×700 · `gap-1` ×674 · `h-6` ×639 · `text-muted-foreground` ×489 · `p-0` ×360 · `h-11` ×344 · `w-7` ×318 · `text-[11px]` ×274 · `min-h-11` ×205 · `hover:text-destructive` ×190 · `text-[10px]` ×174 · `rounded-full` ×139 · `text-destructive` ×113.
- Size prop × hand-written height: `size="sm"` + `h-7` **1,440** · `sm` + `h-8` (the rung already *is* h-8) **578** · `sm` + `h-6` **556** · `sm` + `h-11` 183 · `size="icon"` + `h-7` **179** (`icon-sm` exists; 7 sites use it) · `icon` + `h-8` 104 · `icon` + `h-6` 77. `size="xs"` is used by 22 sites.
- Variants used: outline 2,941 · ghost 2,574 · none 1,999 · destructive 111 · secondary 79.
- Examples:
  - `app/(admin)/administration/database/sql-functions/components/SqlFunctionsContainer.tsx:246` — `h-7 text-xs border-slate-300 dark:border-slate-700`
  - `app/(core)/cms/[siteId]/collections/[collectionId]/page.tsx:648` — `gap-1.5 text-xs text-destructive hover:text-destructive`
  - `app/(admin)/administration/applets/categories/page.tsx:523` — `h-5 w-5 p-0`
  - `features/secrets/components/VaultWorkspace.tsx:736`, `features/research/components/tasks/TasksView.tsx:639` — `size="sm"` + `h-7`

**Input** (1,880 sites; **no `size` prop exists**)
- Most common tokens: `h-8` ×410 · `text-xs` ×333 · `text-sm` ×301 · `font-mono` ×273 · `text-base` ×230 · `h-7` ×206 · `h-9` ×113 · `h-11` ×78 · `pl-8` ×63 / `pl-7` ×53 / `pl-9` ×29 (a hand-placed leading search icon) · `text-[16px]` ×46 · `border-destructive` ×26.
- Examples:
  - `features/admin/relationships/components/EntityTypeForm.tsx:183` — `h-8 font-mono`
  - `components/mermaid/outline/OutlineModePane.tsx:740` — `h-7 w-14 text-base sm:text-sm`
  - `app/(admin)/administration/applets/categories/page.tsx:619` — `bg-muted text-[16px]`
- The `text-base` / `text-[16px]` overrides (262) duplicate the global iOS zoom floor in `globals.css`.

**SelectTrigger** (835 triggers)
- Most common tokens: `text-xs` ×237 · `h-8` ×199 (no 32px rung) · `h-7` ×138 (a `sm` rung exists at h-7; **23 sites use `size="sm"`**) · `h-9` ×80 (= the default) · `w-[180px]`, `w-[140px]`, `w-[150px]` (arbitrary widths).

**Badge** (2,062 sites; **no `size` prop, no icon sizing, no gap**)
- Most common tokens: `text-[10px]` ×855 · `py-0` ×264 · `px-1.5` ×237 · `text-xs` ×234 · `h-4` ×223 · `gap-1` ×192 · `px-1` ×181 · `font-normal` ×151 · `text-[9px]` ×129 · `font-mono` ×101.
- Raw palette status colours on top of the existing `success`/`warning`/`info` variants: `dark:text-amber-400` ×49, `text-amber-700` ×39, `bg-green-50` ×21 … 154 sites in total.
- Example: `app/(admin)/administration/preview/unified-management/places/BindingsPanel.tsx:169` — `text-[10px] tabular-nums border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 …`

**Label** (2,204 sites)
- `text-xs` ×795 · `text-muted-foreground` ×290 · `text-sm` ×289 · `font-medium` ×266 · `uppercase` ×65 · raw `dark:text-gray-300` ×52 / `text-gray-700` ×48.
- The Label is `text-sm`. Forms want a smaller caption label and an overline label, and there is no variant for either.

**Card** (1,822 part sites)
- `CardHeader pb-2` ×79 · `CardTitle text-sm` ×75 · `CardContent space-y-4` ×65 · `Card p-6` ×62 · `Card p-4` ×58 · `CardHeader pb-3` ×45 · `Card shadow-lg` ×38 · `Card rounded-2xl` ×25 · `Card hover:shadow-lg` ×24.
- 187 sites pad the Card root and 191 pad CardContent: the host's `sm` binding (p-2) is too tight, and `size` is never used.
- 45 sites hand-roll an interactive card, and 34 hand-roll a tone card.
- Example: `app/(admin)/administration/database/enums/components/EnumsContainer.tsx:233` — `bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700`

**Tabs** (1,330 part sites)
- `TabsTrigger text-xs` ×136 · `TabsTrigger h-6` ×37 / `h-7` ×25 (no size) · `gap-1.5` ×39.
- The underline recipe `rounded-none` / `border-b-2` / `border-transparent` / `data-[state=active]:border-primary` / `data-[state=active]:bg-transparent` appears ×34 each, copy-pasted per file. That is a missing `variant="line"`.
- `TabsList h-auto` ×24 · `bg-transparent` ×23 · `grid w-full grid-cols-N` ×39 (a missing `fullWidth`).

**DialogContent** (450 sites)
- **433 of 474 set a width** (there is no `size` prop): `sm:max-w-md` ×59 · `max-w-2xl` ×55 · `max-w-lg` ×52 (= the default) · `sm:max-w-2xl` ×35 · `max-w-3xl` ×23, plus ~25 one-off pixel widths (`[425px]`, `[600px]` …).
- `p-0` ×76 · `max-h-[90dvh]` ×74 · `max-h-[85dvh]` ×47 (the base already clamps 85dvh) · `gap-0` ×44 · `flex flex-col` ×107. These sites are rebuilding a flush dialog with a scrolling body, which the primitive does not offer.
- `DialogTitle gap-2` ×106 (an icon in the title).

**PopoverContent:** `p-0` ×109. The popover is used as a container for a Command list, which needs to be flush, and there is no padding variant.

**DropdownMenuItem:** `gap-2` ×130 (the item already has `gap-2`, so these are no-ops) · `text-destructive` ×45 · `focus:text-destructive` ×40 (a missing destructive item variant) · `DropdownMenuContent w-56/w-64/w-52/w-44` (four competing widths).

**TooltipContent:** `text-xs` ×110 (the tooltip already *is* `text-xs`) · `max-w-xs` ×59 · six other max-widths.

**IconButton (official):** 37 sites paint raw fills (`bg-slate-500 hover:bg-slate-600 text-white`, `bg-purple-500 …`) — all in `components/mardown-display` and `content-refine`.

### 2.3 Bespoke reimplementations

| Pattern | Count | Primitive alternative | Worst directories |
|---|---|---|---|
| Raw `<button>` | **5,594** (5,324 visually styled) | Button | features/agents 497, app/(dev)/demos 396, features/marketing 363, components/mardown-display 316, features/files 157, features/notes 149, features/research 148, **components/official 147** |
| Raw `<input>` (text-like) | 630 elements | Input | app/(dev)/demos 136, features/agents 32 |
| Native `<select>` | 256 elements / 161 files | Select | |
| Raw `<textarea>` | 129 | Textarea / ProTextarea | |
| Raw `<table>` | 139 elements / 137 files | Table / MatrxDataTable (240 files, adopted well) | components/mardown-display 20, app/(dev) 15 |
| Hand-rolled card div | ~2,808 / 1,577 files (regex) | Card | |
| Spinner via `animate-spin` | 3,283 lines / 1,863 files (regex; includes legitimate button-pending icons) | none exists | features/marketing 367, features/agents 186 |
| Hand-rolled skeleton bar (`animate-pulse bg-muted…`) | 439 lines / 203 files | Skeleton (321 files) | components/mardown-display 65 |
| Bare "Loading…" text | 69 literals; 166 by the `real-loading-states` detector | loaders | |
| Empty state | 140 local components, 727 hand-written lines | none exists | features/marketing 107 lines |
| Modal backdrop `fixed inset-0 bg-black…` | 63 lines / 58 files outside the overlay systems | Dialog | **components/mardown-display: one recipe copy-pasted ~12× across the block renderers** (`ComparisonTableBlock.tsx:533`, `TroubleshootingBlock.tsx:357`, `DecisionTreeBlock.tsx:549` …) |
| Hand-written `role="dialog"` | 14 (e.g. `features/code/views/source-control/CredentialsModal.tsx:89`, `features/rag/components/library/ProcessingProgressDialog.tsx:273`) | Dialog | |
| `createPortal` outside the overlay systems | 32 files | overlay controller | |
| Hand-rolled tab bar | ~104 files (heuristic) | Tabs | features/window-panels 15 (window chrome, plausibly legitimate), features/agents 12 |

### 2.4 Icons

There are 23,975 Lucide icon elements.
- **Size source:** call-site `className` 22,517 (93.9%) · `size` prop 801 (3.3%; values 16, 12, 14, 18, 10, 20, 11, 15, 13, 24, 22, 28, 9 — thirteen pixel sizes) · unset 657.
- **Size distribution:** `h-3.5` 7,184 · `h-4` 6,569 · `h-3` 5,007 · `h-5` 1,067 · `h-6` 450 · `h-2.5` 418 · `size-3.5` 411 … **40 distinct size spellings** for about six real sizes.
- **Stroke width** is set at 186 sites with 13 distinct values (2, 2.5, 1.75, 3, 1.2, 1.5, 3.5, 2.25, 1.6, 6, 1, 2.4, plus a constant).
- **Colour:** set at the call site on 6,624 icons.

**Icon sizing inside a Button is not controlled by the call site at all. Verified live.**
- The Button base carries `[&_svg]:size-4`, which has specificity (0,1,1). That beats any single class on the icon (0,1,0).
- On `/login`, the Google/Apple/GitHub icons are authored `h-5 w-5` and compute to **16px**. A probe icon with `h-3.5` inside a Button-class element computes to 16px, and the same icon standalone computes to 14px.
- Of the 3,673 icons that are direct children of `<Button>`, 3,613 carry a size. The requested sizes break down as:

  | Requested | Icons | Effect |
  |---|---|---|
  | 14px | ~1,520 | dead; renders 16px |
  | 12px | ~600 | dead; renders 16px |
  | 20px+ | ~80 | dead; renders 16px |
  | 16px | ~1,320 | redundant |

- **So about 2,200 authored icon sizes are silently ignored.**
- `components/official/IconButton.tsx` is built on this broken path: its `xs`…`xl` icon sizes (10–24px) all render 16px, and an `xs` IconButton is a 20px box holding a 16px icon.
- This is the inverse of the usual drift: the primitive *does* own icon size, but with **one** size for boxes from 24px to 64px. Agents believe they are setting it, and the screen shows something else.

**Wrapper elements inside primitives (the "padded icon inside a button" problem):** 11 instances of a padded or sized `span`/`div` as a direct Button child. All 11 are count badges or dots inside a button, e.g. `features/marketing/seo/keyword-table/ColumnChooser.tsx:135`, `features/request-recovery/components/RequestRecoveryButton.tsx:32`. **This pattern is not a significant problem in this codebase.** The real icon problem is the dead size classes above.

### 2.5 Hardcoded values and scale sprawl

| Dimension | Distinct values in use | Defined by the system |
|---|---|---|
| Font sizes (`text-*`) | **98** (including 85 arbitrary) | 13 stock Tailwind steps; the custom scale is inert |
| Font weights | 8 (`font-medium` 10,293, `font-semibold` 5,788, `font-bold` 821) | stock |
| Padding utilities | **211** | stock 4px grid |
| Gap utilities | 45 | stock |
| `space-*` utilities | 26 | stock |
| Heights (`h-*`) | **206** | stock |
| Radius utilities | **67** (`rounded-md` 6,175, `rounded-lg` 3,999, `rounded` 3,903, `rounded-full` 3,316, `rounded-xl` 1,511, `rounded-2xl` 558) | 4 derived tokens |
| Shadows | **134** | 3 custom + stock |
| Line height | 28 | stock |
| Letter spacing | 24 (`tracking-[0.12em]`, `[0.2em]`, `[0.18em]` … 15 arbitrary) | stock |

- **Arbitrary values:** **19,669** arbitrary-value tokens, 1,783 distinct.
  - Leading: `text-[11px]` 6,187 · `text-[10px]` 5,566 · `text-[9px]` 573 · `pt-[var(--shell-header-h)]` 283 · `text-[12px]` 258 (which *is* `text-xs`) · `text-[13px]` 205 · `min-h-[44px]` 147 · `text-[0.6875rem]` 125 (which is 11px again) · `text-[15px]` 106 · `max-h-[90dvh]` 94 · `text-[11.5px]` 70 · `text-[10.5px]` 53 · `text-[12.5px]` 42 · `text-[8px]` 40 · `z-[9999]` 31.
  - The 11px size alone is spelled three ways: `text-[11px]`, `text-[0.6875rem]` and `text-[11.5px]`.
- **Raw hex:** 48 hex values inside class strings, 61 inside `style` props, and 913 hex string literals across 142 files (some legitimate: brand logos, editor themes, chart palettes).
  - With `check:theme-color-literals` pointed at the whole repo: 1,608 raw-colour findings, including light-only neutrals with no dark pair.
- **Inline `style`:** 2,365 attributes.
- **The package itself uses arbitrary values** (`text-[11px]` ×9, including the Badge base; `z-[10000]` ×21; `max-h-[90dvh]` ×10), so there is no clean example to copy.

### 2.5b Phone structure: cards inside cards, and touch growing the layout

*Added 2026-10-02 on the owner's report that pages are "unusable on mobile".*

**Cards inside cards — static count.**
- Within single files: 43 cases. 9 are a Card inside a Card, 22 a bordered padded box inside a Card, and 12 a box inside a box. Top locations: `app/(core)` 11, `app/(admin)` 5, `features/marketing` 5.
- **This is a floor.** Most nesting crosses component boundaries — a `*Panel` rendered inside a Card defined in another file — and that is invisible to per-file analysis.

**Cards inside cards — measured in the rendered DOM** at 375px, signed in as the test admin on the clone. A *surface* is an element with a border on 3+ sides, radius ≥4px and padding ≥8px.

| Route | Surfaces | Nested surfaces | Notes |
|---|---|---|---|
| `/organizations` | 83 | **36** | Every organization card holds a bordered "Context" card. Names truncate ("LCP Test Repositories l…"). Body text starts about 95px from the left edge of a 375px screen. |
| `/agents/all` | 26 | 0 | No nesting, but the toolbar runs off the right edge (6 controls in a 375px row) and a two-line prose banner sits above the list |
| `/user-settings`, `/tasks` | 1–2 | 0 | |

**So the class is real and cross-file. It must be detected at runtime**, where the dev guard can see two surfaces nested in the DOM, not only by static scan.

**Touch grows the layout.**
- The Button raises its *layout* height to 44px on a coarse pointer, while Input and Select do not. Measured on `/demos/ui-unification` at phone emulation:
  - a "28px" toolbar row renders 44 · 28 · 28 · 30 · 32px;
  - a "32px" form row renders 32 · 32 · 44px.
- No height choice survives on a phone today.
- The tap-target system solved this the other way: an invisible `::before` hit area, so the layout is unchanged.

**Page gutters.** 38 route files open with a literal `p-6`/`p-8`/`px-6`/`px-8` page padding and no phone value. On 375px that is 48–64px of a 375px width spent on side padding before any card adds its own.

### 2.5c Packages that ship their own UI system — missed by the first pass

*Added 2026-10-02.* The owner reported the meeting lobby (`/meet/<slug>`), and **this audit's first pass had missed it.** The census scanned only matrx-frontend's own files. But much of what users see is rendered by `@ai-matrx/*` packages from `aidream/apps/shared/*`, and some of those never adopted the design system at all.

| Package | Own stylesheet | Own tokens | Raw controls in TSX | Design-system primitives | Where users see it |
|---|---|---|---|---|---|
| **meet** | 2,296 lines CSS, 437 `mx-meet__*` classes, 73 hex/rgb | 61 `--mx-meet-*` | 69 `<button>`, 7 `<select>`, 21 `<input>` | **0** (only `ErrorBox`) | `/meet/[slug]`, `/meetings`, `/meetings/[id]`, `/rsvp/[secret]` |
| **messaging** | 990 lines, 67 hex/rgb | 62 `--mx-msg-*` | 16 `<button>`, 21 inline styles | **0** | `/messages`, `/messages/[id]`, `/messages/admin` |
| **chat** | 1,698 lines | 64 `--mx-chat-*` | 27 `<button>` | 1 `Button` | chat surfaces |
| capture, media, print, detail | no stylesheet | — | 41 / 16 / 7 / 15 raw buttons; capture has 36 hex/rgb in TSX | partial | capture, media and print flows |
| records-ui, diff, associations, alchemy | — | — | low | mostly design-system | — |

**meet's stylesheet restates the design system:**
- Buttons: `.mx-meet__primary` / `__send` (999px pills), `__chip`, `__link`.
- Fields: `.mx-meet__input` / `__select`, with their own radius and focus ring.
- Checkbox: `.mx-meet__toggle` wraps a native checkbox.
- Segmented control: `.mx-meet__pills`.
- Banners: seven kinds.
- Badge: `.mx-meet__badge`.

Only the dark video stage is defensibly its own.

**The lobby, specifically** (`aidream/apps/shared/meet/src/react/components.tsx`, `PreJoinBody`). Two causes:
1. **Layout.** The settings column was `minmax(280px, 0.8fr)` (`styles.css:592`). On the owner's 2560px Studio Display that is about 1,000px, so every dropdown ran ~1,000px wide and Join sat at the far edge. Measured on the preview: 739px dropdowns at 1920px.
2. **Components.** Every control was native and restyled by the package's own CSS: device `<select>`s, `<input type=checkbox>`, pill buttons, a blue `__consent` banner, a 999px "Join now".

**Fixed in `@ai-matrx/meet` 0.7.76:**
- Design-system `Select`, `Checkbox` + `Label`, `SegmentedControl`, `Button` and `Alert`.
- A 300–400px column centred inside 1,200px.
- A guard test, proven red on 0.7.75.

The rest of meet (polls, Q&A, in-room panels, `collab.tsx`) is still bespoke and is a plan step.

**Lesson for the method.** The census must also walk every package's `src/` that renders in the app, and static scanning must be paired with a runtime sweep.

### 2.5d Runtime sweep, 2026-10-02 (rendered pages at 375px and desktop)

These come from real browser measurements: overflow, collapsed columns, nested surfaces, mismatched row heights, and native controls.

| Route | Finding | Severity |
|---|---|---|
| `/free/data-truncator` (phone) | Three side-by-side panes squeeze to ~112px each: one letter per line, a button collapsed to 16×110px. Fixed `w-[30%]`/`w-[38%]` with no stacking (`components/official-candidate/json-truncator/JsonTruncator.tsx` ~2435) | broken |
| `/free/uuid/generator` (phone) | Large empty body, controls pinned to the bottom with a 4px gutter, both selects blank, an input past the 375px edge (`app/(public)/free/uuid/generator/page.tsx`) | broken |
| `/` (phone) | 4px side gutter; CTAs run edge to edge, while `/pricing` uses 16px | inconsistent |
| `/organizations` (phone) | 36 nested surfaces; names truncate | inconsistent |
| `/agents/all` (phone) | Toolbar runs off the right edge | inconsistent |
| `/free/character-counter` | One native `<select>` among styled controls (`features/text-counter/CharacterCounter.tsx`) | inconsistent |
| Public header | The "assists" chip is 28px beside a 20px button in the same row | inconsistent |

| `/schedules` (phone, first load) | "This page stopped working": `RangeError: Maximum call stack size exceeded` in the window-panels / scopes / mandates chunks, alongside `persist.hold.expired scopesTree`. A reload works | broken (flaky) |
| `/schedules` | A two-clause prose banner (`features/scheduling/components/list/ScheduleList.tsx:175`); 16px labels beside 32px controls in 8 rows | inconsistent |
| `/meet/<bad slug>` | The error card prints the RPC name: "meet_meeting_by_slug: no meeting for that link" (`features/meet/components/MeetingSurface.tsx`) | inconsistent |
| `/education/overview` | 4 `rounded-xl` cards nested in a `rounded-2xl` card | inconsistent |
| `/messages` | The search box is 28px beside 36px siblings (messaging package) | inconsistent |
| `/files` (phone) | Rows are 55px around 44px controls | minor |

**Clean on the core sweep:** no horizontal overflow and no native `<select>` on `/chat`, `/agents/all`, `/tasks`, `/notes`, `/projects`, `/dashboard`, `/cms`, `/research`, `/workflows` or `/user-settings`.

**Not swept:** the admin routes, because `/administration` on the local preview redirects to the production manage host.

### 2.6 Where the drift lives

**Highest override rate** (directories with ≥150 primitive call sites):

| Directory | Overridden / sites | Rate |
|---|---|---|
| features/rag | 217/282 | 77% |
| features/ai-models | 383/513 | 75% |
| features/projects | 129/179 | 72% |
| features/research | 285/410 | 70% |
| features/marketing | 1,909/2,834 | 67% |
| features/tasks | 158/239 | 66% |
| features/applets | 243/368 | 66% |
| features/data-tables | 173/261 | 66% |
| components/matrx | 118/178 | 66% |
| features/tool-registry | 170/267 | 64% |
| features/agents | 1,041/1,626 | 64% |

**Lowest:** features/files 28% · features/masterwork 37% · features/secrets 39% · app/(admin)/administration 41% · features/admin 43%.

**Raw-element and arbitrary-value density** (raw buttons + raw inputs + arbitrary values + hex, per file):

| Directory | Per file |
|---|---|
| features/pdf-extractor | 13.5 |
| features/image-studio | 12.2 (60 hex) |
| features/skills | 11.1 |
| features/tool-registry | 11.0 |
| features/surfaces | 9.1 |
| features/bindings | 8.5 |
| features/rag | 7.9 |
| features/research | 7.7 |
| features/ai-models | 7.6 |
| features/marketing | 5.4 |

By absolute volume, features/marketing carries 2,821 arbitrary values on its own.

**Demo routes are not the problem.** `app/(dev)` overrides at 54%, against 56.4% for everything else.

**Named inspiration does not predict drift.** Across 87 directories with ≥20 `.tsx` files, the Spearman correlation between inspiration mentions per 100 files ("Notion-style", "after Linear", "champion", Airtable, Figma …) and a composite drift index is **−0.10** (−0.16 without hex). That is noise.
- **Weak evidence for inspiration-driven drift:** features/knowledge (Linear/Raycast) and features/code (Cursor) do run about 2× the average for raw buttons.
- **Evidence against it:** features/data-tables (Airtable), features/education (Linear/Notion posture) and features/board (Figma) are at or below average on every metric. The heaviest drift sits in directories with few or no named references.
- **A closer look at the mentions:** many "after Linear" lines are recent page-pass changelog entries describing a polish pass, not the original authoring.
- **Conclusion:** the per-page-champion habit is a real *process* risk (§4.2), but the drift in the code today is explained by missing variants and zero enforcement, not by inspiration.

---

## 3. Root causes

**3.1 `className` is open on every primitive, and the call site wins.** Every override kind appears, on every primitive:
- size: 4,060 Button sites
- spacing
- typography (`text-[10px]` on Badge ×855)
- colour (raw palette on Badge, Button, IconButton, Label)
- border and radius (`rounded-full` on Button ×139, `rounded-2xl` on Card)
- shadow (`shadow-lg` on Card)

No primitive restricts `className` by type, and no runtime filter exists.

**3.2 Primitives that lack a needed variant, so overriding was the only option. This is the most important finding.**

| Missing variant | Evidence (sites) | Verdict |
|---|---|---|
| A shared control height scale across Button / Input / Select / Tabs / SegmentedControl / Badge. Today "sm" = 32 (Button) vs 28 (Select, Segmented); Input default 40 vs 36; Input, Tabs and Badge have no size | Button `sm`+`h-7` 1,440 · Input `h-6/7/8` 656 · Select `h-8` 199 · Tabs `h-6/h-7` 62 · Badge `h-4`/`text-[10px]` ~965 | **Legitimate need** |
| A 28px Button text rung. CHANGELOG 0.6.0 moved `sm` from h-7 to h-8 when the `ButtonMine` fork was absorbed; every dense toolbar then re-asserted h-7 by hand | 1,440 | Legitimate |
| Per-rung icon size owned by the Button (12/14/16/20) | ~2,200 dead icon classes; all IconButton sizes | Legitimate (primitive defect) |
| Sub-`xs` type tokens (10px, 11px) | 11,753 `text-[10px]`/`text-[11px]` + 125 `text-[0.6875rem]` | Legitimate. The design already uses 11px in the Badge base. |
| Square icon rungs at 24 and 32 | ~350 | Legitimate |
| Button `ghost` muted/quiet | 447 | Legitimate |
| Button ghost-destructive (row trash icon) | 222 | Legitimate |
| `DialogContent` size + flush layout with a scrolling body | 433 widths; ~107 flex-col rebuilds | Legitimate |
| Tabs `variant="line"`, `size`, `fullWidth` | 34+15 / 178 / 39 | Legitimate |
| Badge `size` + icon gap | ~965 + 187 | Legitimate |
| Card: use the existing `size`; add `interactive` and `flush` | 187 root paddings; 45; 19 | Partly: `size` exists but the host binding hides it |
| Input leading/trailing slot that scales with size | 140 `pl-7/8/9` | Legitimate |
| Popover `padding="none"` | 109 `p-0` | Legitimate |
| DropdownMenuItem destructive | 85 | Legitimate |
| Label `size`/`tone` (caption, overline) | ~1,000 | Legitimate, small |
| Spinner, EmptyState primitives | 3,000+ / 140 | **Missing entirely** |

**3.3 Gratuitous overrides** (the primitive already does it, or it is a no-op). A codemod can delete these with zero visual change:
- `text-xs` on `size="sm"` Buttons: 1,442
- `h-8` on `sm`: 534
- `h-7 w-7` on `size="icon"`: 177 (use `icon-sm`)
- `text-base` on Input: 262 (the global zoom floor already does it)
- viewport touch floors `min-h-11 sm:min-h-9`: ~250 (the package raises sub-44px controls on coarse pointers)
- `max-w-lg` on DialogContent: 87
- `text-xs` on TooltipContent: 110
- `gap-2` on DropdownMenuItem: 130
- `h-7` on SelectTrigger: 128 (use `size="sm"`)
- raw palette status on Badge: 154 (use the variants)

**3.4 Tokens that don't exist or don't work.**
- The type scale is inert.
- The z-index token scale is unused.
- Two header-height tokens.
- 19 colour tokens defined twice with different dark values.

**3.5 Nothing is enforced.** See §4.

**3.6 The instruction layer models the drift.** See §4.2.

---

## 4. Guardrails

### 4.1 What exists and whether it bites

| Guard | Detects | Where it runs | Bites? |
|---|---|---|---|
| ESLint (`eslint.config.mjs`, 2,385 lines; custom `matrx/*` rules for banned icons, raw storage media, bespoke stream renderers, bare ids; `no-alert`; bare-sonner import ban) | No rule touches `className`, arbitrary values, hex, or primitives. No Tailwind plugin is installed. | **Nowhere.** CI and repo-only-checks have 0 lint steps; `scripts/run-release-gates.sh:237-240`: "`pnpm lint` runs in neither CI nor this script". About 2,344 standing errors. | No |
| `check:ui-primitives` (`scripts/check-ui-primitives.ts`) | Raw checkbox/radio/range inputs, fake checkbox, fake switch, raw `role=dialog`, direct Radix dialog imports. Exempts all of `components/ui/**`. | Release runner, after the push, advisory (exit 0) | No: **53 findings today** |
| `check:reserved-icons` | `BrainCircuit` outside its home | Release runner, advisory | No: **failing today** on `features/workflow-runtime/components/board/WorkflowRunBoardView.tsx` |
| `check:scroll-chain` | Broken flex scroll chains | Release runner, advisory | No: 4 findings today |
| `check:interface-text` | Copy length and shape | **Nowhere** (honour system, "before every commit") | No: 8,952 findings |
| `check:theme-color-literals` | Raw hex/rgb/hsl, light-only neutrals | **Nowhere**; `DEFAULT_ROOTS = ["features/masterwork"]` | No: 13 findings in its one feature; **1,608 repo-wide**, never in scope |
| `check:package-twins` | A local export *named* like a package export (132 design-system names) | Release runner, advisory | Partly: catches `function Button`, not `function StatusPill` built from `<button>`; `useIsMobile`, `useScrollFade` and `cn` are unregistered |
| `check:canonical-pickers`, `check:archived-items-law` | One agent picker; archive controls | **CI** | Yes, the only UI guards in CI. Even CI is a post-push signal on a push-to-main repo. |
| **Tap-target dev guard** (`enableTapTargetGuard()`, design-system `tap-target`) | Off-canon geometry, a wrapper adding gap or padding, `className` beyond a glyph colour, on tap buttons | In the browser, dev builds, the moment the page renders: a red box plus a console error naming the fault | **Yes — the only UI guard that reaches the author at the right moment.** It caught the decision board adding a gap on 2026-10-02. It is the model for §2.9/§2.12 of the plan. |
| Package Vitest (field surface, one chevron, popover sizing, touch floors, no hardcoded colour in `styles.css`) | Package source only | Package publish gate | Yes, but cannot see a single consumer call site. `popover-sizing-guard.test.tsx` documents the core weakness: "cn() lets a caller's className silently win over sizing". |

**Guards that do not exist:**
- `className` on a primitive
- arbitrary values
- off-scale type
- raw palette colours outside one feature
- hand-rolled badges, tabs or cards under new names
- off-grid spacing

### 4.2 Agent instructions, and why they failed

**What the instructions say:**
- **`CLAUDE.md` UI/UX section** has: "semantic tokens only" (line 166), "Don't wrap a component in wrappers" (167), and "Official component library … no local restyling" (176). The last is the closest thing to "don't override primitives", but it is **scoped to `components/official/`, not the design system**. No instruction anywhere says "never pass visual classes to a primitive".
- **The skills model the defect directly:**
  - `ios-mobile-first/SKILL.md:120`: `<DialogContent className="max-w-[95vw] w-full lg:max-w-[1400px] max-h-[90dvh] overflow-hidden flex flex-col">` is the worked example.
  - `ui-sharp/project-conventions.md:71-73, 216-218` ("applies to ALL UI work"): "Use `clamp()` for all typography via Tailwind arbitrary values … `text-[clamp(2rem,1.5rem+2vw,3.5rem)]`".
  - `ui-dense/data-dense-rules.md` §6, which CLAUDE.md names as the colour authority:
    - a hand-rolled badge `<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] … border">` (the package Badge is `rounded-md`);
    - a hand-rolled tab bar `<button className="… border-b-2 …">`;
    - raw `div` cards and empty states.
  - `data-dense-rules.md` §1 sanctions raw emerald/blue/amber status colours, although Badge ships `success`/`warning`/`info`.
  - `page-pass/SKILL.md:383-385`: "every `DialogContent` carry `matrx-touch-targets`", an instruction to pass a class at every call site.
- **They contradict each other.**
  - Typography: ui-dense says density "is spacing, not smaller text" and floors badges at `text-[11px]`; project-conventions says `clamp()` for all type; the package uses fixed sizes.
  - Colour: ground-rules says never `bg-zinc-*`; data-dense-rules says palette is fine for status.
- **They reward divergence.**
  - ui-sharp: "Name the real product you're modeling after … you pick it".
  - ui-refine: "Name the reference".
  - ui-reimagine: "A restyle of the existing screen is an automatic failure … Run it twice and you'll get two different concepts — that's the point".
  - ui-bakeoff: "Do NOT add … component names, 'reuse X'".
  - page-pass: "Name … the real product you matched".
  - `champions.md`: "A brief with no champion named is incomplete".
  - "Borrow bones, never skin" protects colour and font, but density, control shape, spacing rhythm and type size are all "bones". So every page can legitimately land on a different look.

**Why they failed:**
1. Nothing reads them at the moment of writing a class.
2. They are scoped to the wrong layer ("no restyling" covers `official/`).
3. They teach the exact overrides they should forbid.
4. A change to a primitive's look in the package needs approval and a consumer list, while an override at one call site needs nothing. The cheapest path to "this page looks right" is always a local override, and nothing makes it cost anything.

---

## Appendix A — Package primitive API census

| Primitive | Variants | Sizes | Icon control | Missing |
|---|---|---|---|---|
| Button | default, primary (=default), destructive, success, outline, secondary, ghost, link, subtle | xs h-6 **px-1** · sm h-8 · default/md h-9 · lg h-10 · xl h-12 · 2xl h-14 · 3xl h-16 · icon h-9 · icon-sm h-7 · roundIcon h-8 (round) | `[&_svg]:size-4` on **every** size; not overridable from the icon | 28px text rung; per-rung icon/gap; icon-xs (24) / square icon-md (32); ghost-muted; ghost-destructive |
| Input | variant switch (`success` falls through) | **none**: h-10 only (`BasicInput` h-9) | prefix slot `left-3` + `pl-10`, not dense | size; scalable prefix/suffix |
| SelectTrigger | — | sm h-7 · default h-9 · lg h-10 | chevron 14/16 by size | 32px rung; item size |
| Textarea | Elevated / Basic | none | — | dense/mono mode |
| Dialog | `mobileSheet`, `showCloseButton`, … | **none** (max-w-lg fixed) | — | size; flush layout + `DialogBody` |
| Sheet | side | `sm:max-w-sm` only | — | width size; padding |
| Drawer / BottomSheet | direction | adaptive / full | — | — |
| Card | — | sm p-2 rounded-xl shadow · md p-4 · lg p-6 (**host binds sm; 0 call sites pass size**) | — | interactive; flush; tone |
| Tabs | **none** | **none** (List h-9) | none | line variant; size; fullWidth; icon gap |
| SegmentedControl | — | sm h-7 · md h-9 · lg h-10, fullWidth | — | Radix keyboard semantics |
| Badge | default, secondary, destructive, outline, success, warning, info, error, neutral | **none** (`text-[11px]` base) | none | size; gap; icon size |
| Tooltip | — | — | — | (fine) |
| Popover | — | `sizing`: fixed / content | — | padding none |
| DropdownMenu | `inset` | — | gap-2 | destructive item |
| Table | — | sm / md (host binds sm) | — | (fine) |
| Switch / Checkbox | — | sm / md (host binds sm) | — | (fine; lowest drift) |
| Label | — | none | — | size / tone |
| Skeleton | — | shape via className | — | (fine) |
| Spinner / EmptyState | **do not exist** | | | |

**Density matrix: what a dense row actually lines up.**

| Height | Button (text) | Button (square) | Input | Select | Tabs | Segmented | Badge |
|---|---|---|---|---|---|---|---|
| 24 | xs (px-1, unusable for text) | — | — | — | — | — | — |
| 28 | **—** | icon-sm | — | sm | — | sm | — |
| 32 | sm | roundIcon (round only) | — | — | — | — | — |
| 36 | default | icon | BasicInput | default | List | md | — |
| 40 | lg | — | **Input (only size)** | lg | — | lg | — |

A default `Input` + `Select` + `Button` form row renders 40 / 36 / 36. A "small" `Button` + `Select` pair renders 32 / 28.

## Appendix B — Reproducing these numbers

- **AST census:** `node scripts/ui-drift/census.cjs <repoRoot> <out.json>`. It runs in about 7 seconds and covers primitive call-site classification, size-prop × height matrices, the icon census, raw elements, arbitrary values, scale sprawl, and per-directory stats.
- **Guard measurements in this session:**
  - `pnpm exec tsx scripts/check-ui-primitives.ts`: 53 findings
  - `node scripts/check-theme-color-literals.mjs features app components`: 1,608 findings
- **Live verification:** done on the shared preview (`/login`) with throwaway DOM probes (no data written):
  - icon computed heights inside Button-class elements;
  - `text-xs` / `text-2xs` computed sizes and the empty `--font-size-xs` custom property.
