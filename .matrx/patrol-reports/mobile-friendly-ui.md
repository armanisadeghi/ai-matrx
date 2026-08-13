# P3 Mobile-Friendly UI Patrol

- **Run date:** 2026-08-12 (America/Los_Angeles)
- **Run kind:** first/full pass, resumed for one certified repair and one
  manually approved viewport-unit attempt
- **Outcome:** 64 verified findings across 54 files; 17 fixed and certified, 47
  plain-`vh` occurrences remain open
- **Run status:** the canonical drawer repair and the recovered 16-token
  literal `vh`→`dvh` batch are independently CERTIFIED under the corrected
  baseline-delta policy

## Scope scanned

The first pass established its baseline at
`24a25f61878d6e60310eb4a907df3928afc7eaf6`. This resumed pass reran the full
P3 detectors, independently verified both P3 ledger entries, and included
structurally new routes/client components since that baseline. It did not use
raw git churn as scope.

- 1,061 route leaves under `app/**/page.tsx` / `page.dev.tsx`
- 355 direct client route leaves
- 5,306 client `.tsx` files under `app/`, `components/`, and `features/`
- 122 top-level feature directories
- all runtime TS/TSX/JS/JSX/CSS/SCSS under `app`, `components`, `features`,
  `hooks`, `lib`, `providers`, `styles`, and `utils`, excluding generated,
  documentation, migration, public-asset, build-output, and dependency trees

The structural baseline remains 1,061 route leaves and 122 top-level feature
directories. The client-file list now contains 5,306 files; the next run must
diff structural kinds against the baseline commit rather than treating every
changed line as scope.

## Findings

### Banned viewport units

The registry detector for `h-screen|100vh` found no runtime violation. Its only
matches are explanatory comments in `app/globals.css`.

The stricter mobile skill requires `dvh`, never plain `vh`. After the recovered
batch, the full numeric-unit detector returns 58 raw lines. Triage removes five
comment-only lines and six lines in the confirmed zero-consumer
`components/matrx/resizable/panel-config.ts`, leaving **47 code-bearing `vh`
occurrences across 38 runtime files**.

The remaining backlog mixes desktop window configuration, parser/config
contracts, loading/empty-state layout, and other surfaces needing per-item
review. The newly certified direct literal CSS/Tailwind recipe is now eligible
for narrowly gated Tier-M automation; layout or runtime-contract judgment
remains Tier R.

Durable full-pass detector:

```bash
rg --pcre2 -n --glob '*.{ts,tsx,js,jsx,css,scss}' \
  '(?:\d+(?:\.\d+)?|\})vh\b' \
  app components features hooks lib providers styles utils
```

False-positive classes remain identifier variables such as
`const vh = window.innerHeight`, comments, already-correct `dvh`, and the
confirmed zero-consumer resizable prototype. Priority remains: full-height
dialogs/public viewers first, shared header/menu primitives second, bounded
desktop/admin popovers and minimum-height empty states last.

### Fixed-bottom safe areas

The fixed-bottom detector returned 32 candidates on the resumed pass. Context
review confirmed that all but the canonical drawer were already protected by
`pb-safe`/`env(safe-area-inset-bottom)`, delegated safe padding to their fixed
panel body/footer/nav, were full-height sidebars/backdrops or desktop-only
positioning, or belonged to the known zero-consumer resizable prototypes.

The verified canonical finding was repaired:

- `components/ui/drawer.tsx:87` now includes `pb-safe` in the shared styled
  `DrawerContent` fixed-bottom class.
- `components/ui/radix-dialog-accessibility.test.tsx` now asserts that the
  canonical Vaul drawer carries the safe-area class.
- `DrawerContentPrimitive` remains unstyled by design for custom layouts and
  was correctly excluded as a false-positive class.

### Core route header cross-check

`pnpm check:page-headers` reported eight existing dev/public faux-header
candidates during the first pass. They are outside P3's mechanical classes and
remain report-only layout judgment; no core route header was changed.

## Fixes and certification

- **Fixed:** 17 of 64 findings
- **Tier-M batches:** canonical drawer (2 files) plus recovered literal viewport
  batch (15 files), each within the ceiling
- **Adversarial certifier:** **CERTIFIED** for both batches
- **Rejected batches:** none under the current policy; the old
  infrastructure/global-baseline rejection is superseded
- **Paused mutation:** none; 47 findings remain
- **Delivery:** product commit `70a7a1e4f` first entered main in `v0.4.548` and
  is an ancestor of READY main-site production release `v0.4.550`
  (`9419ff9bd`), Vercel deployment
  `dpl_C9bwWNG9fJZqdhzpwnnbFQF61c45`

Certification evidence:

- focused Jest suite: 6/6 passed
- changed-file lint, `git diff --check`, doctrine, tsconfig, and UI primitive
  gates passed; UI-primitives retained 19 unrelated existing warnings
- 375x812 light and dark: drawer computed 12px bottom safe padding, ended
  exactly at the viewport bottom, had no horizontal overflow, and retained its
  interaction behavior
- 1280x800 light and dark: desktop surface retained its normal non-drawer
  layout with no fixed drawer/dialog and no horizontal overflow
- the drawer batch's historical type/migration failures were unrelated shared
  state; the recovered viewport batch started from isolated `origin/main` and
  recorded a green `pnpm type-check` before and after
- no suppression, generated-file edit, migration, or chunk-boundary change was
  used by either P3 batch

### Manually approved literal viewport batch — recovered and CERTIFIED

Arman manually approved 16 direct literal CSS/Tailwind `vh`→`dvh`
substitutions across 15 runtime files. Static review confirmed the intended
one-token-only edits, no suppression/generated/chunk changes, a clean
`git diff --check`, and no residual plain `vh` in the proposed batch.

The old infrastructure/global-baseline rejection was invalid under the
corrected patrol policy and is superseded. The batch was recovered in an
isolated worktree from `origin/main`, with exact pre-edit and post-edit gates.
The adversarial certifier returned **CERTIFIED**:

- exact diff: 15 files, 16 literal `vh`→`dvh` substitutions, with every number
  and surrounding width/flex/overflow/theme/interaction class unchanged
- scoped old-`vh` detector: 16 findings → 0; `git diff --check` clean
- `pnpm type-check`: PASS → PASS
- doctrine: PASS → PASS; UI-primitives: 19 warnings → the same 19; tsconfig:
  PASS with two notes → the same result
- scoped ESLint: 6 errors/2 warnings → the same exact baseline diagnostics
- sandbox focused Jest: 3 failures/6 passes → the same exact baseline tests
- migration check: exit 0 with credentials-absent skip → the same result
- adversarial risk review covered standard capped dialogs, fixed-height flex
  dialogs, a custom overlay, bounded popover/ScrollArea containers, and the
  editable minimum-height textarea; no batch-caused defect was found

The one bounded preview attempt attached to a pre-existing shared server at
20.8 GB RSS, already above the mandated 8 GB cap, so it did not navigate or
restart. Per the updated constitution, the certifier used focused static and
code-semantic equivalent evidence rather than treating infrastructure as a
product rejection. Desktop/theme styling and all interaction semantics are
unchanged by this one-token unit substitution.

This successful representative batch promotes the exact literal viewport
recipe to narrowly gated P3 auto-approval in the registry; layout judgment and
runtime/config contracts remain manual.

## Structural baseline for the next run

Use baseline commit `24a25f61878d6e60310eb4a907df3928afc7eaf6`, then add
open P3 ledger sightings and the required periodic full pass. Never scope by
raw changed-line volume.

- route leaves (1,061):
  `a99b52673d5eacd5244080730b6b33a27de090386a587c51b1d90f5a8353becd`
- top-level feature directories (122):
  `edda1d66263b6d74c36ab96a4fdf184b5fd1c2a0005da1ce6de100f299d0e2e0`
- current client TSX inventory (5,306):
  `487cc70fdad379e3d2564622b53910cdb4bd13334fb8e643f80f4bf28a3b893e`

## Cadence health and candidates

This is the only P3 run in the preceding month, so there is not enough clean-run
history to propose a longer cadence. The earlier infrastructure-based rejection
is superseded; P3 mutation is not paused. The schedule remains unchanged. No
recurring unregistered class was established. The plain `vh` backlog is already
P3, not a candidate-bench nomination.
