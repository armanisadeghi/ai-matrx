# P4 Light/Dark Integrity Patrol

- **Run date:** 2026-08-12 (America/Los_Angeles)
- **Run kind:** approved Tier-M recovery under delta-based certification
- **Outcome:** 3 defect lines fixed across 2 files; 0 approved exceptions
- **Readiness:** doctrine, skill, detector, schedule, and certification are
  ready; the historical exception sweep remains open for Arman's decisions

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

Entering scan: 6,941 `.tsx` files; 312 files / 754 matching lines; 604 lines
with a property-specific same-line dark pair; 150 lines requiring contextual
review.

Independent line-by-line review classified those 150 lines as:

- **109 lines / 52 files:** proposed fixed-palette exceptions, all still open;
- **38 lines:** compliant explicit/multiline branches, overridden fallbacks, comments, or
  non-rendered/no-consumer code; these are not allowlisted;
- **3 lines / 2 files:** real light/dark defects, fixed and certified in the
  2026-08-12 recovery batch.

That first-pass baseline was 6,941 `.tsx` files; 312 files / 754 matching
lines; 604 property-specific pairs; 150 review candidates; 0 approved
exceptions; 0 invalid exception records.

The 2026-08-12 recovery baseline from current `origin/main` is 6,595 `.tsx`
files; 262 files / 668 matching lines; 532 property-specific pairs; 136 review
candidates; 0 approved exceptions; 0 invalid exception records. Detector tests
are 4/4 green, and `--strict` correctly exits nonzero while proposals remain.

The complete human review list, with exact source lines, URLs, UI states, and
normal-fix effects, is in
`.matrx/patrol-reports/light-dark-integrity-exception-review.md`.

## Recovered and certified Tier-M batch

The approved two-file batch used the skill's exact semantic substitutions:

1. `CandidateProfileView.tsx`: `bg-white/{20,10}` →
   `bg-foreground/{20,10}` for two loading skeleton bars.
2. `RoomHeader.tsx`: `active:bg-white/5 border-white/[0.06]` →
   `active:bg-accent/50 border-border` for the mobile action-sheet row.

The earlier infrastructure/global-baseline rejection was invalid under the
corrected certification constitution because it named no defect caused by
these substitutions. The recovery ran in an isolated worktree from current
`origin/main`, recorded pre-edit diagnostics, reapplied only the approved
classes, and compared the same diagnostics after editing.

- `pnpm type-check`: green before and after; byte-identical output.
- Scoped P4 detector: 3 review candidates before, 0 after; the other 8 paired
  matches were unchanged.
- Scoped ESLint: the same 4 legacy errors and 1 warning before and after; none
  names a changed line.
- Doctrine and UI-primitives: same green exit and byte-identical output before
  and after.
- Focused preview: both representative routes compiled and returned HTTP 200,
  then the process reached Arman's 8 GB safety cap and was terminated at 10.2
  GB. The certifier used the constitution's equivalent evidence: compiled JS
  contains both new skeleton classes, compiled CSS contains all four semantic
  utilities, and the light/dark theme variables define distinct foreground,
  accent, and border values.
- **Adversarial verdict:** CERTIFIED — no concrete batch-caused defect; the
  preview cap was infrastructure-only. The final product diff is exactly 2
  files / 3 class substitutions, with no import, layout, interaction,
  responsive-rule, component-boundary, or chunking change.

## Human exception review

- **Approved:** 0
- **Pending:** 47 active files / 100 historical raw-token lines
- **Reviewable by production URL or existing harness:** 47
- **Resolved by feature deletion:** 5 applet files / 9 lines
- **Blocked:** 0

Representative production examples for Arman to inspect:

- `https://aimatrx.com/free/games/tic-tac-toe` — fixed-dark authored game board;
- `https://demos.aimatrx.com/demos/model-activity-indicators` — select MatxLoader;
- `https://manage.aimatrx.com/administration/ui/official-components/content-editor`
  — open an HTML preview to judge a deliberately light document matte;
- `https://aimatrx.com/images/convert` — upload an image and enter crop mode;
- `https://aimatrx.com/tools/scanner` — enter capture mode to judge camera chrome.

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
- `pnpm type-check`: green before and after with byte-identical output.
- **UI-batch adversarial certifier:** CERTIFIED under the corrected
  batch-delta policy; no concrete batch-caused defect.
- **Detector/process recertifier:** CERTIFIED for the original first-pass
  inventory — independently reconciled all 52 historical proposals to 109
  unique detector lines and exact unpaired token sets. The recovery reconciled
  five applet proposal files / nine lines as resolved by feature deletion and
  reran the 4/4 regression suite plus the current full scan.
- **Report-only exception review:** certification not applicable; no exception
  was approved or changed.

## Cadence health and candidates

P4 does not have a preceding month of all-clean runs, so a longer cadence is
not proposed. Mutation is not paused, and no recurring unregistered pattern
was found. The sweep remains partial until Arman resolves the pending exception
proposals; the automation cadence itself is unchanged.

ARMAN, WE NEED YOU: approve or reject every listed P4 exception.
