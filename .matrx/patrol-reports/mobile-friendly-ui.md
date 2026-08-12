# P3 Mobile-Friendly UI Patrol

- **Run date:** 2026-08-12 (America/Los_Angeles)
- **Run kind:** first/full pass (no prior baseline report or automation memory)
- **Outcome:** 62 open findings across 53 files, 0 fixed (61 Tier-R `vh`
  occurrences plus 1 blocked Tier-M safe-area primitive)
- **Run status:** degraded to report-only because the approved local preview-start
  capability was unavailable, so a Tier-M change could not receive the required
  mobile-and-desktop adversarial visual certification

## Scope scanned

This first run established the structural baseline at repository commit
`24a25f61878d6e60310eb4a907df3928afc7eaf6` and ran the full P3 source scan
instead of using raw git churn.

- 1,061 `app/**/page.tsx` / `page.dev.tsx` route leaves
- 355 direct client route leaves
- 5,300 client `.tsx` files under `app/`, `components/`, and `features/`
- 122 top-level feature directories
- every P3 ledger entry (both historical entries independently rechecked)
- all runtime TS/TSX/JS/JSX/CSS/SCSS under `app`, `components`, `features`,
  `hooks`, `lib`, `providers`, `styles`, and `utils`, excluding generated,
  documentation, migration, public-asset, build-output, and dependency trees

The 375x812 production spot check of `https://www.aimatrx.com/notes` was clean:
the list remained single-column, header controls stayed reachable, and the
bottom search/action dock stayed inside the viewport. This was a sample, not a
substitute for the required full new-route visual review.

## Detection results

### Banned viewport units

The narrow registry detector for `h-screen|100vh` found no runtime occurrence.
Its only two text matches were explanatory comments in `app/globals.css`, so
the cleared ledger sightings for those exact forms remain verified.

The required skill is stricter than that narrow grep: it says `dvh`, never
plain `vh`. A PCRE2 numeric-unit scan found 72 raw lines in 55 files. Context
triage removed five comment-only lines and six lines in the zero-consumer
`components/matrx/resizable/panel-config.ts`, leaving **61 code-bearing `vh`
occurrences across 52 runtime source files** (4 `app`, 5 `components`, 43
`features`). These include popup/dialog max heights, full-height dialogs and
windows, minimum-height empty/loading states, and shared header/menu limits.

They remain Tier R. The registry authorizes Tier M only for the exact
`h-screen` to `h-dvh` transform; blindly changing arbitrary `min-height`,
`max-height`, window configuration, and desktop-only values would exceed the
approved mechanical recipe. The durable detection command is:

```bash
rg --pcre2 -n --glob '*.{ts,tsx,js,jsx,css,scss}' \
  '(?:\d+(?:\.\d+)?|\})vh\b' \
  app components features hooks lib providers styles utils
```

Every non-comment match must be reviewed in context; identifier names such as
`const vh = window.innerHeight`, comments, `dvh`, and the confirmed
zero-consumer panel configuration are false-positive classes.

Tier-R priority ranking:

1. **Mobile lockout risk — review first:** full-height dialogs/windows and
   public viewers in `DerivativeResultsDialog.tsx`,
   `CleanupReviewDialog.tsx`, `AnalyzeCurationDialog.tsx`,
   `AiReviewQuotaDialog.tsx`, `EnrollDialog.tsx`,
   `YouTubeVideoPreview.tsx`, `SeoChangeTrackingWorkspace.tsx`,
   `AiCopyMenu.tsx`, `NodePanel.tsx`, `SharedResourceView.tsx`, and the
   window-panel height constants. These can place actions below mobile browser
   chrome.
2. **Shared blast radius:** header/menu primitives (`EntityModeHeader`,
   `CrumbTrailHeader`, `header-variants.css`, admin navigation), smart-input
   menus, the data-table filter builder, and `app/globals.css`. One approved
   primitive-level repair would protect many routes.
3. **Lower immediate risk:** bounded popovers, scroll areas, desktop/admin
   subpanels, and minimum-height empty/loading states. They still violate the
   skill, but each needs surface context before its height semantics change.

### Fixed-bottom safe areas

The full same-line detector produced 33 `fixed` + `bottom-0` candidate lines.
Context review classified 32 as already safe or outside the target class:

- direct `pb-safe` or `env(safe-area-inset-bottom)` padding;
- safe padding on the fixed panel's bottom body/footer/nav;
- full-height sidebars/backdrops rather than bottom action surfaces;
- desktop-only bottom positioning;
- zero-consumer resizable prototypes already recorded in the ledger.

One confirmed finding remains:

- `components/ui/drawer.tsx:87` — canonical `DrawerContent` is a fixed mobile
   bottom surface without default `pb-safe`. There are 105 `DrawerContent`
   call sites; only 28 contain a same-line explicit `pb-safe`, so correctness
   currently depends on each consumer remembering the safe area. The approved
   Tier-M repair is the skill's one-file mechanical transformation: add
   `pb-safe` to the canonical fixed-bottom class. This was not applied because
   the run could not start the one approved local preview server and therefore
   could not certify both the changed mobile drawer and desktop behavior before
   shipping.

### Core route header cross-check

`pnpm check:page-headers` completed and reported eight existing faux-header
candidates under dev/public routes. They were not counted as P3 findings: they
are outside P3's two mechanical classes, and layout/header redesign is Tier R.
No core route header was changed.

## Fixes and certification

- **Fixed:** 0 of 62
- **Tier-M batch:** not created
- **Adversarial certifier:** not applicable because no product batch exists
- **Reason mutation paused:** the required approved local preview-start
  capability was unavailable; starting an unmanaged dev server is forbidden
  by repository doctrine
- **Rejected batches:** none

Validation completed:

- `pnpm type-check`: pass
- `pnpm check:page-headers`: completed with eight report-only dev/public
  warnings, none changed by P3
- `pnpm check:migrations`: exited successfully but reported one pre-existing,
  non-blocking drift warning for `web_audit_rollup_gone_pages.sql`; P3 did not
  touch migration or generated files
- `git diff --check` on the patrol artifacts: pass

## Structural baseline for the next run

The next patrol should compute additions against the baseline commit above and
then filter by structural kind; it must not scope by changed-line volume.
These sorted-list fingerprints make accidental baseline drift visible:

- route leaves (1,061):
  `a99b52673d5eacd5244080730b6b33a27de090386a587c51b1d90f5a8353becd`
- client TSX files (5,300):
  `a0c9afc092b957a2d7e7688637b2252700cac0f345b9b33f7788e7c18cc6c8af`
- top-level feature directories (122):
  `edda1d66263b6d74c36ab96a4fdf184b5fd1c2a0005da1ce6de100f299d0e2e0`

For the periodic full pass, rerun the same whole-repository detectors above.
For ordinary runs, compare route leaves, newly added client TSX files, and
top-level feature directories to the baseline commit, then add open P3 ledger
sightings.

## Cadence health and candidates

No earlier P3 report or memory exists in the preceding month, so there is not
enough clean-run history to propose a longer cadence. No batch was rejected,
and no recurring unregistered class was established. The P3 schedule should
remain unchanged. The wider `vh` backlog and canonical drawer finding are both
already part of P3, not new candidate-bench nominations. The mismatch between
P3's narrow registry grep and its stricter skill should be corrected before
any future mechanical expansion; this run did not edit the cross-repo registry.
