# Pattern Patrol P5 — Copy everywhere

**Run:** 2026-08-12 (America/Los_Angeles)  
**Authority:** six manually approved Tier-M `MatrxDataTable.copy` repairs
**Certification:** CERTIFIED — baseline-delta static coverage plus focused rendered-component fallback

## Outcome

- **6 verified findings; 6 fixed** across 3 product files: AI Visibility
  Claims, Sources, Signals, and History; Referring Domain Intelligence; and SEO
  Change Tracking's Untracked Changes queue.
- Every repair uses the existing `MatrxDataTable.copy` configuration and the
  existing Marketing `humanLines` and `webLocation` helpers. No copy primitive,
  layout, theme, interaction, or chunk boundary changed.
- Adversarial review found three concrete payload-fidelity defects in the first
  draft: the Claims copy omitted its visible critical warning, Referring Domains
  dropped visible fallback text, and Untracked Changes exposed raw field keys
  instead of the visible title-cased labels. All three were corrected and
  independently reverified.
- `SitesPortfolio` remains the pinned equivalent-controls false-positive: its
  page and row already have canonical copy actions, so no duplicate control was
  added.

## Scope scanned

- Full repository `MatrxDataTable` AST pass via
  `pnpm check:copy-everywhere`, including all open P5 ledger entries.
- The six approved product surfaces and the canonical false-positive classes:
  tests/specs, demos, the `MatrxDataTable` primitive, and same-surface equivalent
  whole-list plus row controls.
- This recovery used an isolated worktree from `origin/main`; no shared dirty
  checkout files were modified.

## Current detector baseline

| Status | Table instances | Meaning |
| --- | ---: | --- |
| compliant | 80 | Direct built-in `copy` configuration |
| equivalent controls | 1 | Canonical controls already exist; do not duplicate |
| auto-approved | 2 | Narrow mechanical candidates for a future patrol |
| review | 20 | Insufficient structural evidence; Tier R/manual review |
| excluded | 8 | Tests, demos, or the canonical primitive |

The six approved findings moved exactly from `auto-approved` to `compliant`.
The two untouched future candidates remain
`features/assists/manager/AssistsManager.tsx` and
`features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx`.

## Verification and certification

- Pre-edit baseline: `pnpm type-check` green; detector tests 6/6; detector
  baseline 74 compliant / 8 auto-approved / 1 equivalent / 20 review / 8
  excluded; scoped ESLint green.
- Post-edit: `pnpm type-check` green; `pnpm sync-types` completed with
  "Type-check passed"; `pnpm check:migrations` green; detector tests 6/6;
  detector baseline 80 / 2 / 1 / 20 / 8; scoped detector 7 compliant and zero
  findings across the three product files; scoped ESLint and `git diff --check`
  green. `pnpm check:doctrine` had no batch-caused finding.
- The one bounded direct-route proof was infrastructure-blocked: while compiling
  the stable Referring Domains route, the managed Next preview reached
  9,754,688 KB RSS and was stopped immediately at the fleet's 8 GB safety cap,
  before navigation completed. This was not a product rejection and no retry
  was attempted.
- Focused fallback proof rendered the unchanged canonical `MatrxDataTable` with
  the same Referring Domain copy-config shape. It proved toolbar and row human
  Copy, JSON, and Copy-for-AI actions, 44px mobile action sizing, compact desktop
  sizing, and the sticky mobile identity column. Together with canonical
  `MatrxDataTable` controlled/mobile and `CopyButtons` suites: **3 suites, 9
  tests passed**. The temporary proof file was removed afterward; the committed
  product batch remained exact and clean.
- Independent certifier verdict: **CERTIFIED**. No concrete batch-caused defect
  remains; direct-route visual proof was unavailable only for infrastructure
  reasons and the focused rendered-component fallback completed certification.

## Loop health and candidates

- This is the first completed P5 repair cycle, so there is not a month of clean
  runs and no longer cadence is proposed.
- Mutation is not paused; there is no repeated product rejection pattern.
- No recurring unregistered class was found, so no Candidate-bench nomination
  is made.
- No exception is proposed or approved.
