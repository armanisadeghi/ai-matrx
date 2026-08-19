# Pattern Patrol P5 — Copy everywhere

**Run:** 2026-08-19 (America/Los_Angeles)

**Authority:** standing Tier-M adoption repairs plus detector precision

**Certification:** CERTIFIED — exact candidate `8196a478e530cd541714a5611faf5bfdf86bf95b`

**Delivery:** integrated as `872394e1a8502441adef9e279efffb81c9a8bb57`
and released on `origin/main` as `v0.4.840`

## Outcome

- The full `MatrxDataTable` detector returned **4 auto-approved candidates**.
- Verification found **3 real adoption gaps** and **1 detector false positive**.
- **2 gaps are fixed**: the Assists manager and Keyword Research library now
  consume the canonical `MatrxDataTable.copy` system for row, current-view,
  JSON, AI, and export actions.
- **1 gap remains open as missing machinery**: the Unwired console already has
  a bespoke per-row “Copy brief” action. Adding the standard pair without a
  row-level AI-variant seam would create three copy controls and violate the
  canonical consolidation rule.
- The custom table-copy workspace is not an adoption target. It is the
  canonical workspace opened by the table copy system itself, so the detector
  now excludes it explicitly.

## Scope and routing

The run performed the periodic full AST detector pass plus the open P5 ledger
review. It did not scope from raw Git churn.

| Candidate                                                                         | Verified route                                                                                                                     |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `features/assists/manager/AssistsManager.tsx`                                     | Fixed under standing authority with live manager filters, counts, warnings, and rendered row fields in the payload.                |
| `features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx` | Fixed under standing authority using the existing `buildKeywordBrief`, `humanLines`, and `webLocation` primitives.                 |
| `features/admin/unwired/UnwiredConsole.tsx`                                       | Open machinery task: extend the canonical table copy config with row-level AI variants, then fold “Copy brief” into that dropdown. |
| `features/data-tables/components/TableCustomCopyWindow.tsx`                       | Detector false positive: canonical custom-copy workspace, now excluded with regression coverage.                                   |

The 23 pre-existing review-only table rows remain Tier R. Native tables,
JSON/code blocks, lists, and detail panes remain outside the mechanical class.

## Detector baseline

| Status              | Before | Candidate | Meaning                                                                   |
| ------------------- | -----: | --------: | ------------------------------------------------------------------------- |
| compliant           |     87 |        89 | Two verified gaps now use the canonical config.                           |
| auto-approved       |      4 |         0 | Every narrow candidate was routed.                                        |
| equivalent controls |      1 |         1 | Existing canonical controls; do not duplicate.                            |
| review              |     23 |        24 | Unwired moved here because consolidation needs new row-variant machinery. |
| excluded            |      8 |         9 | The canonical custom-copy workspace is now classified with the primitive. |

Detector regression coverage grew from 6 to 8 cases: bespoke copy actions stay
review-only, and the canonical custom-copy workspace stays excluded.

## Verification

- Pre-edit: `pnpm type-check` green; P5 detector tests 6/6; detector
  87 compliant / 4 auto-approved / 1 equivalent / 23 review / 8 excluded;
  scoped status clean; patrol contracts green.
- Post-edit: `pnpm type-check` green; scoped ESLint green;
  `pnpm check:doctrine` green; P5 detector tests 8/8; detector
  89 / 0 / 1 / 24 / 9; `git diff --check` green.
- Canonical interaction and payload coverage: CopyButtons, AI copy menu,
  controlled MatrxDataTable, empty-view list context, and Assist formatter
  suites passed **5 suites / 19 tests**.
- Independent review of candidate `809b7964f` returned **REJECTED** with one
  concrete batch-caused defect: the Assist projection omitted the visible
  flagged, unseen, low-confidence, decision-note, action-description, and
  Everything-count states. Those omissions are corrected in the replacement
  candidate, and a focused formatter regression test now covers them.
- Re-review of candidate `0356e90a5` returned **REJECTED** because row envelope
  attributes still omitted the visible status KPIs, and an empty view had no
  row body in which to carry page context. The canonical table copy contract
  now accepts live `listContext`, so empty views keep their rendered scope in
  `<context>`; every Assist row attribute set also mirrors all visible status
  counts, including Everything.
- Final independent review of exact candidate `8196a478e` returned
  **CERTIFIED**. Both rejected candidates remain ancestors, all required gates
  pass, and no concrete batch-caused defect remains.
- The certified candidate was integrated to `origin/main` in merge
  `872394e1a`, then the serialized release lane published `v0.4.840` at
  `ef97be6b2`. The permanent record is closed with 13 valid hash-chained events.
- Final delivery verification exposed a process contradiction: the permanent
  state machine permits `delivered -> closed`, while the delivery policy only
  accepted a latest `delivered` state. Exact process repair `b1fa1a9d5` now
  accepts `closed` only after the same exact candidate was delivered with the
  deterministic authority ref. Independent review returned **CERTIFIED**;
  focused tests passed 2 suites / 11 tests and the real delivery check is green.
- The managed preview lease is owned by
  `/Users/armanisadeghi/code/matrx-frontend`, not this automation worktree.
  This run will not reuse or stop that foreign preview. The candidate changes
  no shared primitive, layout, theme, or chunk boundary; exact-source static
  coverage plus canonical rendered-component tests are the bounded fallback.

## Reuse and inventory proof

- Searched `MatrxDataTable.copy`, `CopyButtons`, `buildKeywordBrief`, keyword
  copy/format helpers, assist formatters, entity registries, peek registries,
  overlay openers, and item action registries.
- Reused the canonical table copy configuration, the existing keyword brief,
  Marketing `humanLines` / `webLocation`, assist urgency/source/expiry
  formatters, the keyword window opener, and existing row doors/actions.
- Added one pure Assist formatter module because no shared Assist row-copy
  projection existed, and extended the canonical table copy config with one
  `listContext` callback so live view state survives empty result sets. No
  component, hook, service, table, overlay, route, or chunk boundary was
  created.

## Decisions, exceptions, and learning

- Human approvals needed: **0**.
- Exceptions proposed or approved: **0**.
- Degradation: **none**. The release's non-blocking post-push advisory sweep
  stalled in `check-dead-relations` after the tag and branch were published;
  the orphaned process was terminated and its exit trap released the delivery
  lane. All P5-required gates and the exact-candidate certification passed.
- Focused machinery task: add row-level AI variants to the canonical
  `MatrxDataTable.copy` contract before repairing the Unwired console.
- Learning: detector auto-approval must stop when a table file already owns a
  bespoke clipboard action, and empty views need canonical `copy.listContext`
  so visible KPIs, filters, and errors survive without row bodies.
