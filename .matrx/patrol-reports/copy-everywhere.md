# Pattern Patrol P5 — Copy everywhere

**Run:** 2026-08-12 (America/Los_Angeles)  
**Authority:** six manually approved Tier-M table fixes; detector-routed R/M baseline
**Certification:** REJECTED — product batch fully reverted

## Outcome

- **6 verified findings; 0 fixed** across 3 files: AI Visibility Claims,
  Sources, Signals, and History; Referring Domain Intelligence; and SEO Change
  Tracking's Untracked Changes queue.
- The approved batch used the existing `MatrxDataTable.copy` configuration plus
  the existing Marketing `humanLines` and `webLocation` helpers. The adversarial
  certifier could not complete the required desktop/mobile × light/dark visual
  matrix because the one approved preview returned HTTP 500 after an unrelated
  transient merge marker poisoned Turbopack, and its earlier process exceeded
  the machine's 16 GB memory threshold. The preview was safely restarted once,
  failed again, and was stopped. The six product changes were then fully
  reverted; all six findings remain open.
- The first report's **101 “confirmed” label was incorrect**. Those were
  screening candidates from broad signatures. The new control-aware detector
  proves only the table-adoption state; native tables, JSON/code blocks, lists,
  and detail panes remain screening queues until a detector can distinguish
  records, tools, and parent-owned controls.
- `SitesPortfolio` is the pinned false-positive class: it lacks a table `copy`
  prop but already has canonical whole-list and row Copy-for-AI controls. It
  was not changed.

## Scope scanned

- Full repository `MatrxDataTable` AST pass via `pnpm check:copy-everywhere`.
- The original six approval candidates, every open P5 ledger line, and the
  original strongest-table screening list.
- Canonical false-positive classes: tests/specs, dev/component demos, the
  `MatrxDataTable` primitive, the URL-state adapter, and same-surface equivalent
  whole-list + row controls.
- First-run structural baselines remain: 1,047 route leaves, 121 top-level
  feature directories, and 6,957 TSX files. Future runs scope new data-table
  files plus the ledger and run a full pass every fourth run and at least
  monthly.

## Current detector baseline

| Status | Table instances | Meaning |
| --- | ---: | --- |
| compliant | 75 | Direct built-in `copy` configuration |
| equivalent controls | 1 | Canonical controls already exist; do not duplicate |
| auto-approved | 8 | The six reverted findings plus two future mechanical candidates |
| review | 20 | Insufficient structural evidence; Tier R/manual review |
| excluded | 8 | Tests, demos, primitive, or adapter |

The six approved-but-reverted findings remain auto-approved and open. The two
additional future mechanical candidates are
`features/assists/manager/AssistsManager.tsx:326` and
`features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx:653`.
They were discovered after the approved batch was fixed and remain untouched in
this run; the next patrol may process them under the newly approved narrow rule.

## Process improvements completed

- Added `.claude/skills/agent-copy/scripts/detect-copy-adoption.mjs` and six
  regression tests. Package commands are `pnpm check:copy-everywhere` and
  `pnpm test:copy-everywhere`.
- Updated the canonical P5 registry, `pattern-patrol` skill, and `agent-copy`
  skill with tiered routing: auto-approved items mutate; certain/safe/worthwhile
  non-auto items go to Arman as a plain-English proposal; uncertain items stay
  open. An empty auto list is never a reason to stop at counts.
- Updated the scheduled automation prompt to use the detector, honor equivalent
  controls, make manual proposals, and reserve ambiguous surfaces for Tier R.
- Added feature documentation for AI Visibility and SEO Change Tracking.

## Verification

- `pnpm test:copy-everywhere`: **6/6 passed**.
- `pnpm check:copy-everywhere`: completed with the baseline above; the six
  reverted tables correctly classify `auto-approved` and remain open.
- `pnpm type-check`: ran; no error points to the six product files or patrol
  detector. The repository is currently red on unrelated concurrent changes:
  four API insert paths missing `organization_id`, the shared
  `MatrxDataTable` URL-state branch, and `useTableUrlState` options.
- Agent-copy skill validation initially exposed a pre-existing invalid angle
  bracket in the frontmatter description; the description was corrected and
  validation is rerun before release.
- Scoped `git diff --check`: passed.
- Adversarial certifier: **REJECTED**. Touched-file ESLint, doctrine, detector
  tests/classification, and scoped diff checks passed; type-check failures were
  unrelated, but the required visual matrix was unavailable. Product batch
  fully reverted; nothing ships mostly.

## Loop health and candidates

- This is the first P5 cycle, so there is not a month of clean runs and no
  cadence change is proposed.
- No repeated rejection history exists; mutation is not paused.
- No new pattern is nominated: the broad adoption queues belong to P5 itself.
- No exception is proposed or approved.
