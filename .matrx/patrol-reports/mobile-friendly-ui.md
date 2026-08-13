# P3 Mobile-Friendly UI Patrol

- **Run date:** 2026-08-12 (America/Los_Angeles)
- **Run kind:** first/full pass, resumed to complete the safe Tier-M repair
- **Outcome:** 64 verified findings across 54 files; 1 fixed and certified, 63
  Tier-R `vh` occurrences remain open
- **Run status:** completed; the only registry-approved mechanical finding was
  repaired and independently certified

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

The stricter mobile skill requires `dvh`, never plain `vh`. The full numeric-unit
detector now returns 74 raw lines. Triage removes five comment-only lines and
six lines in the confirmed zero-consumer
`components/matrx/resizable/panel-config.ts`, leaving **63 code-bearing `vh`
occurrences across 53 runtime files**. Two occurrences in the structurally new
`features/marketing/seo/public-tools/AiVisibilityTool.tsx` were added after the
initial baseline, increasing the verified backlog from 61 to 63.

These remain Tier R. They mix `min-height`, `max-height`, dialog sizing,
desktop window configuration, popover constraints, and loading/empty-state
layout. P3 authorizes Tier M only for the exact `h-screen` to `h-dvh` transform;
changing these arbitrary height semantics without surface judgment would exceed
the approved recipe.

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

- **Fixed:** 1 of 64 findings
- **Tier-M batch:** 2 files, within the 15-file ceiling
- **Adversarial certifier:** **CERTIFIED**
- **Rejected batches:** none
- **Paused mutation:** none; all remaining findings are registry-declared Tier R

Certification evidence:

- focused Jest suite: 6/6 passed
- changed-file lint, `git diff --check`, doctrine, tsconfig, and UI primitive
  gates passed; UI-primitives retained 19 unrelated existing warnings
- 375x812 light and dark: drawer computed 12px bottom safe padding, ended
  exactly at the viewport bottom, had no horizontal overflow, and retained its
  interaction behavior
- 1280x800 light and dark: desktop surface retained its normal non-drawer
  layout with no fixed drawer/dialog and no horizontal overflow
- repo-wide `pnpm type-check` was rerun but is red in concurrent, unrelated
  feedback/schema work; neither patrol batch file is implicated and no
  suppression, generated-file edit, or widening was used by P3
- `pnpm check:migrations` reports an unrelated concurrent unapplied migration
  and the pre-existing drifted `web_audit_rollup_gone_pages.sql`; P3 did not
  touch migrations or generated files

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
history to propose a longer cadence. No batch was rejected and no recurring
unregistered class was established. The schedule remains unchanged. The plain
`vh` backlog is already P3, not a candidate-bench nomination; expanding it into
a mechanical class requires an explicit registry recipe rather than agent
inference.
