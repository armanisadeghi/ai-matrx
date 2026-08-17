# P3 Mobile-Friendly UI Patrol

- **Run date:** 2026-08-17 (America/Los_Angeles)
- **Run id:** `2026-08-17T131440Z`
- **Base:** `244042ddc314ba7995e3d8e8a3ed79aae9e5baca` (`v0.4.762`)
- **Run kind:** structural-novelty scope + open-sighting verification + periodic full viewport/fixed-bottom pass
- **Current state:** exact candidate pending independent certification
- **Findings:** 15 verified occurrences in 14 files
- **Fixed in candidate:** 15
- **Approvals needed:** 0
- **Degradation:** none; the exact-worktree preview lease was unavailable, so bounded static/component proof is recorded for the certifier

## Resume reconciliation

The prior 2026-08-13 P3 product candidate was not stranded. Its integrated
equivalent `03e81104d` is an ancestor of this run's base and the current release.
No P3 permanent record existed because the lifecycle machinery landed later;
this run starts the first hash-chained P3 record without rewriting history.

## Scope scanned

Structural novelty since the preceding P3 product commit `03e81104d`:

- 39 added route leaves
- 209 added direct client TSX files
- 7 added top-level feature directories: `change-policy`, `github-integration`,
  `hindsight`, `purpose`, `review-walk`, `vision-interview`, and
  `workflow-runtime`
- all open P3 sightings
- a full runtime viewport-unit pass and full fixed-bottom pass

Current structural baseline:

- 1,040 route leaves; SHA-256
  `368b7c993bbfe789832d02b014ce6cb4e14538bcdff060ace569bded3ec706fe`
- 5,148 direct client TSX files; SHA-256
  `80849c202e5b1bb0b04119db47620eb11d2ea9da2a4af04b904e714cf77c58a5`
- 127 top-level feature directories; SHA-256
  `4b4bae4fbfc127b30253daf3dca3aa878b745efc8792f6b4c3e04ce3e886921d`

## Verified findings and standing-authority repairs

### Dynamic viewport units — 10 code tokens in 9 files

The full detector found 23 raw lines. Triage identified 10 live code tokens,
six expressions in the confirmed zero-consumer resizable prototype, and seven
comments/explanatory references. The live code tokens are now `dvh` with every
numeric value and every other property unchanged:

- one new expertise dialog max-height
- one new public growth-loop ring constraint
- four floating-window defaults/overrides
- the keyword-research feed cap
- two AI Visibility live-window openings
- the content-plan brief window

The changed-file legacy viewport detector moved 10 → 0. The remaining full-pass
matches are only the six zero-consumer prototype expressions and four current
comments after related comments were made truthful.

### Established touch floor — 4 structurally new surfaces

These surfaces contain concrete sub-44px controls and/or sub-16px text inputs.
Each now consumes the existing `.matrx-touch-targets` subtree primitive, which
applies only on coarse pointers and therefore leaves desktop density unchanged:

- Admin Launchpad
- Gemini embedding lab
- Vision Interview room
- Workflow Runtime demo

### Hover-only actions — 2 occurrences in one surface

Vision Interview's **Reopen/Defer** and **Accept as risk** actions were invisible
on touch devices. They are now visible by default and hidden-until-hover only
inside `@media (hover:hover)`, preserving the desktop interaction while making
the actions reachable on touch.

## Fixed-bottom review

The full detector returned 31 candidates. No new safe-area defect was verified:
bottom bars already use `pb-safe`/`env(...)`, delegate safe padding to their
content, are full-height sidebars rather than bottom action bars, or belong to
zero-consumer prototypes. The canonical drawer and toast primitives remain
protected by their existing safe-area defaults.

## Baseline-delta verification

- `pnpm type-check`: PASS → PASS
- `pnpm check:page-headers`: 7 warnings → the same 7
- `pnpm check:ui-primitives`: 24 warnings → the same 24
- `pnpm check:doctrine`: PASS → PASS
- `pnpm check:tsconfig`: PASS with the same two notes
- `pnpm test:window-panels`: 19 suites / 164 tests passed
- `git diff --check`: PASS
- changed-file legacy viewport detector: 10 → 0
- touch-floor roots asserted: 4
- touch-visible hover-capability repairs asserted: 2
- scoped ESLint: one pre-existing `react-hooks/set-state-in-effect` error at
  `PackDriftDialog.tsx:96`; this batch changes only its viewport class at line
  127, so the diagnostic is unchanged baseline debt

The exact-worktree managed preview start was attempted twice and correctly
refused the foreign lease owned by `/Users/armanisadeghi/code/matrx-frontend`.
That server was not reused or stopped. The candidate therefore carries the
constitution-approved bounded fallback: exact token delta, CSS media-query
semantics, unchanged desktop selectors, focused window-panel tests, and the
full baseline→post gate comparison.

## Open routing

- `/administration/ai/ai-models/provider-sync` remains an open visual sighting:
  its 375×812 compressed/overlapping header could not be re-verified against
  this exact worktree while the preview lease was occupied. It remains a
  missing-current-evidence item, not an exception and not a product rejection.
- The broad hover-only detector currently returns 225 files. This run verified
  and repaired the two real actions in `OpenQuestionsPanel`; decorative icons
  in the other structurally new matches were not findings. The wider backlog
  remains a detector/triage task until each control can be distinguished from
  decorative hover polish.

No exception was proposed, approved, suppressed, or allowlisted. No legitimate
product-layout choice requiring Arman was found.

## Certification

Pending independent adversarial review of the exact candidate SHA.

## Recursive learning

This run proved that `.matrx-touch-targets` is the safe platform-level repair
for a newly added dense surface: one coarse-pointer-only root fixes both the
44px target floor and 16px input floor without changing desktop density. The
smallest next detector improvement is to flag new route roots containing
sub-floor controls or form typography when no ancestor opts into that class.
