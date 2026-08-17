# Pattern Patrol P1 — No dead ends

**Run:** 2026-08-17 01:15 PDT (America/Los_Angeles)
**Authority:** Tier M/R — automatic only for an unambiguous canonical entity door
**Certification:** Not applicable — no Tier-M product batch was created

## Outcome

- **1 verified structural-novelty finding; 0 fixed.** It is routed to missing rule-level navigation machinery, not to human approval.
- **1 detector candidate was not a Door Law finding:** `provider_session_id` is the external coding provider's identifier, not an AI Matrx database identity.
- **1 open P1 sighting was resolved before this run:** the child workflow-run id is no longer rendered as bare text.
- Current full detector snapshot: **97 raw findings** (66 high, 31 medium) across 61 files: 51 bare IDs, 34 unlinked names, 3 unlinked counts, and 9 door-less files.
- **Fixed count: 0. Approvals needed: 0. Degradation: none.**

## Scope scanned

Scope followed the registry's structural-novelty recipe rather than raw git churn. Compared with the prior P1 report commit `c7733a4efec8f1c951623720f868a83fce70e087`, this run inspected:

- 40 new route leaves;
- 7 new top-level feature directories (`change-policy`, `github-integration`, `hindsight`, `purpose`, `review-walk`, `vision-interview`, `workflow-runtime`);
- 267 newly added TSX surfaces under `app/`, `features/`, `components/`, and `lib/` through the full detector;
- every open P1 ledger item;
- one full detector pass to refresh the stale scoreboard projection.

The structural intersection produced two detector candidates. The ledger contributed one additional candidate.

## Candidate verification and routing

### Missing machinery — Rulebook rule target

`features/expertise/components/desks/BacktestDialog.tsx:210` renders a backtest finding's `rule_id` as plain text. The finding identifies a specific rule inside the current Rulebook, but the platform has no canonical rule token, rule route, rule peek, overlay opener, window, or rule-level action target.

Inventory results:

- `expertise_pack` has `hrefFor: /expertise/{id}` in the entity registry;
- the Rulebook detail surface owns rule editing, but exposes no stable rule anchor or query target;
- no rule token appears in the peek registry;
- no rule-specific opener, window, or action registry exists.

Normal repair: first add one canonical rule-level target to the Rulebook detail surface, then make every rule citation—including this backtest result—consume it. Choosing whether that target opens, focuses, or edits a rule is feature behavior and must be settled in that focused machinery task; this patrol does not invent a one-off link that lands only on the pack.

### Not a finding — external provider identity

`features/ai-work/conversations/components/ConversationProvenancePanel.tsx:255` renders `provider_session_id` under “From the coding provider.” The source comments and UI explicitly define it as the provider's own session identifier. It is not an AI Matrx row, has no entity token, and has no canonical provider URL or opener in this repository. The Door Law applies to identities in our system, so no product mutation or exception is appropriate.

### Resolved before run — child workflow run

The P1 ledger pointed to `features/workflow-runtime/components/ReadoutView.tsx`. Current code no longer renders `childRunId` as text. It renders “Sub-workflow,” its live status, and an expandable `WorkflowRunBoard` bound to the exact child run. The ledger row is closed as `resolved-before-run`.

## Baseline and verification

- `pnpm check:patrol-contracts`: PASS.
- `pnpm type-check`: baseline FAIL with four existing `MandateTestBench.tsx` errors concerning `mandate_pinned`; no P1 product files changed.
- `pnpm check:migrations`: exit 0 with one pre-existing non-blocking drift warning for `crm_ui_surface_outreach_lists.sql`; this patrol touched no migration or database path.
- `pnpm check:dead-ends --json`: 97 findings, 66 high, 31 medium, 61 files.
- `pnpm check:dead-ends:write`: refreshed `report.json` and `history.json` with the same totals.
- Prior full snapshot: 102 findings. The current 97-row total is a repository-wide delta since 2026-08-12; this report attributes **zero** fixes to the present run.
- Adversarial certifier verdict: **NOT APPLICABLE** because no Tier-M product candidate exists.

## Recursive learning

The detector's unresolved-ID path should distinguish explicitly external identifiers such as `provider_session_id` from candidate AI Matrx records; that narrow classification would remove a recurring medium false positive without suppressing real registered-token doors.
