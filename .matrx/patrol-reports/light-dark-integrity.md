# P4 Light/Dark Integrity Patrol

- **Run date:** 2026-08-18 (America/Los_Angeles)
- **Permanent run:** `P4/2026-08-18T131537Z`
- **Run kind:** scheduled M/R patrol; structural novelty plus source-only full reconciliation
- **Starting commit:** `612f1a3c32bb62db4b5ff8a821ef7685331855f9`
- **Outcome:** 48 active exception proposals / 102 raw-token lines; 0 product theme defects; 1 detector-scope defect repaired
- **Readiness:** Skill ✅ / Detector ✅

## Isolation and baseline

- The checkout began at `HEAD == origin/main` with a clean tracked status.
- The existing managed preview belonged to this exact checkout. It was stopped
  before authoritative scanning because a parked profile had left generated
  `app/_admin_build_excluded*` copies on disk.
- Pre-edit detector tests: 4/4 PASS.
- Pre-edit `pnpm type-check`: 31 existing errors, dominated by the active
  `context_slots` → `context_policies` transition plus unrelated flashcards,
  education, and SMS errors. The P4 batch changes no TypeScript product file.
- Manifest contract: PASS (`pnpm check:patrol-contracts`). The prompt and P4
  manifest row agree on id, M/R tier, schedule, recipe, and authority.

## Scope and detector baseline

The prior run started at `3528d656712fd4ace5bc08fb8ef3d15c13cb8640`.
Structural novelty through this run's starting commit contained 1,230 existing
added/changed `.tsx` files and 55 added/renamed route leaves. No raw Git churn
was used as the finding set; those files were only the registry-defined source
scope.

- Structural scan: 1,230 files; 85 matching lines; 68 property-specific pairs;
  17 review candidates.
- Source-only full scan: 6,949 files; 674 matching lines; 538 property-specific
  pairs; 136 review candidates; 0 approved exceptions; 0 invalid exceptions.
- The 136 candidates route to 102 active proposal lines and 34 repeatedly
  scanned explicit-theme, overridden, commented, non-rendered, or currently
  non-consumed lines.

The full proposal artifact with URLs and exact review states is
`.matrx/patrol-reports/light-dark-integrity-exception-review.md`.

## Finding routes

### Standing-authority product repairs

None. Every structurally new raw-token candidate was either an already-open
fixed-palette proposal or one of the three new intent decisions below. No
theme surface had one unambiguous semantic-token repair.

### New human decisions

1. `P4-PENDING-053` — `AgentExecutionDebugPanel.tsx:356`: white-alpha close
   hover on an opaque violet debug header. The old unmounted
   `PromptExecutionDebugPanel` proposal (`P4-PENDING-009`) resolved by deletion;
   the mounted successor is separately reviewable.
2. `P4-PENDING-054` — `enhanced-draggable-card.tsx:347`: white simulated glare
   layer on the live draggable-card demo.
3. `P4-PENDING-055` — `MarketingReportsWorkspace.tsx:298`: print-only white
   paper and black text for PDF output.

Existing proposal sources were reconciled after code movement:

- `P4-PENDING-013` now covers 12 current lines in `FlashcardMobileView.tsx`.
- `P4-PENDING-032` moved to `PageEditor.tsx:966`.
- `P4-PENDING-044` moved to `SetupBridgeSection.tsx:1144`.

No proposal was approved, suppressed, or added to `exceptions.json`.

### Unresolved evidence or machinery

No finding lacks a stable review surface. The default detector itself did have
a verified scope defect: it recursively scanned active and quarantined Next
route parks, duplicating tracked UI and reporting 7,619 files / 804 matching
lines / 138 review candidates instead of source truth.

The automatic professional repair teaches `collectFiles` to ignore `.next*`,
`_*_build_excluded`, and `_*_build_excluded.stale-*` directories. A regression
fixture proves all three are excluded while live source remains scanned.

## Batch verification and certification

Changed batch: detector implementation, detector regression test, patrol
reports, sighting projection, and hash-chained P4 run record. Product UI code,
theme tokens, exception ledger, dependencies, generated types, imports, and
chunk boundaries are unchanged.

- Detector regression suite: 5/5 PASS (new parked-copy test included).
- Default full detector after repair: 6,949 files / 674 lines / 538 paired /
  136 review; zero parked paths; zero approved or invalid exceptions.
- Structural detector after repair: unchanged at 1,230 / 85 / 68 / 17.
- Post-change `pnpm type-check`: the same 31 unrelated baseline errors; no
  changed TypeScript product file and no batch-caused diagnostic.
- Adversarial certifier: **CERTIFIED** exact candidate
  `86fe855c6465c53464fe77ef8875fc25dff3010c`. The independent reviewer found
  no batch-caused defect and confirmed every count and proposal source above.

## Recursive learning

This run proved that an otherwise-correct detector can become overinclusive
when Next profile parking leaves ignored source copies beside the live tree.
The smallest durable improvement is now encoded: full-repo detectors must
exclude `.next*` and `_*_build_excluded*`, with a fixture that places a real
candidate inside each ignored directory.

## EXCEPTION APPROVAL REQUIRED

Arman must approve or reject all 48 active items in
`.matrx/patrol-reports/light-dark-integrity-exception-review.md`. Resolved items
009, 027–031, and 052 require no decision.

ARMAN, WE NEED YOU: approve or reject every listed active P4 exception.
