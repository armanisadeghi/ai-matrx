# P4 Light/Dark Integrity Patrol

- **Run date:** 2026-08-11 (America/Los_Angeles)
- **Run kind:** first/full-pass correction, exception-governance hardening, and
  one rejected/fully-reverted Tier-M repair attempt
- **Outcome:** 3 confirmed defect lines remain open; 52 proposed exception
  files / 109 lines remain open; 0 fixed; 0 exceptions approved
- **Readiness:** doctrine, skill, detector, and schedule are ready; product
  mutation is paused until the approved browser/preview harness can certify the
  open UI fixes, and the historical sweep remains reopened

## Why the earlier report was corrected

The first report said 138 unpaired lines were legitimate exclusions. That was
not acceptable: agents had inferred intent and the polished summary made an
incomplete sweep look clean. Its detector was also property-agnostic: any
`dark:` class on a line could hide an unrelated raw color, such as
`text-black dark:bg-zinc-900`. The corrected detector uncovered eleven
additional review lines across six files.

Every candidate was reopened and independently reclassified. The durable
replacement is now enforced at every level:

- the system doctrine and operator template say agents propose and Arman approves;
- all 10 patrol automations contain the Human Exception Contract;
- fleet health alerts when a patrol prompt is missing that contract;
- P4 has a typed approval ledger, currently empty;
- pairing is property- and state-variant-specific;
- every approval is an exact file/line/token-set match with exactly one source
  annotation, and approved exceptions remain separately reported;
- a proposal without a stable UI route cannot be approved.

## Scope and baseline

The correction repeated the required full scan rather than relying on git churn:

```bash
node .claude/skills/light-dark-integrity/scripts/detect-light-dark.mjs --json
```

Entering scan: 6,940 `.tsx` files; 312 files / 754 matching lines; 604 lines
with a property-specific same-line dark pair; 150 lines requiring contextual
review.

Independent line-by-line review classified those 150 lines as:

- **109 lines / 52 files:** proposed fixed-palette exceptions, all still open;
- **38 lines:** compliant explicit/multiline branches, overridden fallbacks, comments, or
  non-rendered/no-consumer code; these are not allowlisted;
- **3 lines / 2 files:** real light/dark defects, still open after the attempted
  repair batch was rejected and fully reverted.

Final baseline: 6,940 `.tsx` files; 312 files / 754 matching lines; 604
property-specific pairs; 150 remaining review candidates; 0 approved
exceptions; 0 invalid exception records. `--strict` correctly exits nonzero
while proposals and defects remain open.

The complete human review list, with exact source lines, URLs, UI states, and
normal-fix effects, is in
`.matrx/patrol-reports/light-dark-integrity-exception-review.md`.

## Rejected and fully reverted Tier-M attempt

The attempted two-file batch used the skill's exact semantic substitutions:

1. `CandidateProfileView.tsx`: `bg-white/{20,10}` →
   `bg-foreground/{20,10}` for two loading skeleton bars.
2. `RoomHeader.tsx`: `active:bg-white/5 border-white/[0.06]` →
   `active:bg-accent/50 border-border` for the mobile action-sheet row.

The adversarial certifier rejected the batch because it uncovered detector
false negatives and could not complete the mandatory actual-surface browser
proof in the isolated browser environment. The detector was repaired, but the
UI batch was fully reverted rather than shipped “mostly.” Both defects remain
open in `.matrx/PATROL_SIGHTINGS.md` for a session with the approved preview
harness.

## Human exception review

- **Approved:** 0
- **Pending:** 52 files / 109 lines
- **Reviewable by production URL or existing harness:** 51
- **Blocked:** 1 — `features/applet/home/app-display/ModernGlass.tsx` has no
  stable/current render path and requires a Tier-C review harness before approval.

Representative production examples for Arman to inspect:

- `https://aimatrx.com/free/games/tic-tac-toe` — fixed-dark authored game board;
- `https://demos.aimatrx.com/demos/model-activity-indicators` — select MatxLoader;
- `https://manage.aimatrx.com/administration/ui/official-components/content-editor`
  — open an HTML preview to judge a deliberately light document matte;
- `https://aimatrx.com/images/convert` — upload an image and enter crop mode;
- `https://aimatrx.com/tools/scanner` — enter capture mode to judge camera chrome;
- `https://aimatrx.com/_apps/app-builder/apps/create` — inspect yellow, amber,
  and lime action-button labels in both themes.

## Validation and certification

- Detector regression suite: 4/4 pass (wrong-property and standalone-dark
  pairing, exact-line approval, duplicate annotations, and duplicate-ledger
  rejection).
- Detector JSON scan: pass; 0 invalid exception records.
- Detector strict mode: expected failure because 150 contextual candidates
  remain and no exception has been approved.
- Detector ESLint: pass.
- `pnpm check:doctrine`: pass.
- `pnpm check:ui-primitives`: completes with 18 pre-existing warnings, none in
  this batch.
- Focused ESLint reaches only pre-existing React hook/static-component errors in
  the two legacy files; neither changed line is implicated.
- `pnpm type-check`: remains red on pre-existing generated-type drift and
  missing `vitest`; no error names a changed P4 line.
- **UI-batch adversarial certifier:** REJECTED — found property-agnostic detector
  false negatives and insufficient one-to-one approval validation. Both were
  repaired and locked with focused tests; required actual-surface visual proof
  was unavailable, so the UI batch was fully reverted.
- **Detector/process recertifier:** CERTIFIED — independently reconciled all
  52 proposals to 109 unique detector lines and exact unpaired token sets;
  reran the 4/4 regression suite, full scan, strict-mode failure, adversarial
  ledger/annotation cases, and confirmed zero product-UI diff.
- **Report-only exception review:** certification not applicable; no exception
  was approved or changed.

## Cadence health and candidates

This is still P4's first day of runs, so a longer cadence is not proposed. No
batch has been rejected repeatedly, mutation is not paused, and no recurring
unregistered pattern was found. The sweep remains partial until Arman resolves
the pending exception proposals; the automation cadence itself is unchanged.

ARMAN, WE NEED YOU: approve or reject every listed P4 exception.
