# Batch savings — one honest number on every surface

**What it is:** the client half of batch spend and savings. One service reads
`batch.savings_summary` (aidream migration 0679); every surface that shows batch
spend or savings renders from it and nothing computes its own flavour.

Verified against code and live data 2026-09-14.

## The rule

- **Saving = `live_equivalent_cost_usd − actual_cost_usd`.** `live_equivalent_cost_usd`
  is the item's ACTUAL tokens (in, out, cache-read) at the same model's LIVE catalog
  rate, written by the matrx-batch poller beside `actual_cost_usd`.
- **`est_live_cost_usd` is never a saving basis.** It prices ESTIMATED tokens before
  submission: the 2026-09-13 run read 76.8% on it for what was really 50%. It may be
  shown only labelled as an estimate. Guard: aidream
  `scripts/check_batch_savings_source.py` (static over both repos + `--live` over DB
  function bodies, `--self-test`).
- **Batch spend is already inside the platform headline.** Every completed, priced
  work item is one `runtime.global_execution` row (`link_kind = batch_work_item`), so
  a surface never adds batch spend on top of a ledger total. Guard: aidream
  `tests/test_batch_spend_ledger_live.py`.
- **Authorization is RLS.** The function is `SECURITY INVOKER`; `organizationId`
  only scopes the read.
- **Every number names its window and item count.**

## Files

| Path | What |
|---|---|
| `service.ts` | `fetchBatchSavings({from, to, organizationId})` — the one RPC call + runtime parsing |
| `types.ts` | `BatchSavingsSummary`, `BatchSavingsRow`, `BatchLaneSplit` |
| `BatchSavingsPanel.tsx` | "Saved by batching" on `/administration/billing/spend`: headline saving, discount, billed vs live price, spend by lane (live / batch / escalated), breakdown by consumer and by provider/model one click away |
| `OrgBatchSavings.tsx` | one line in the organization settings AI budget section (`#ai-budget`): billed, saved, discount, item count, last 30 days |

## Consumers

- `features/admin/spend/SpendExplorer.tsx` — the panel follows the explorer's window
  and its `organization` filter; any other active filter is named as not applied.
- `features/administration/batch/service/batchAdminService.ts` — the batch admin
  savings band (`fetchSavings`) is a window over this service.
- `features/administration/kg-cost` — the "Batch savings (7d)" tile reads
  `fn_kg_cost_summary`, which calls `batch.savings_summary` server-side.
- `features/organizations/components/OrgManage.tsx` — mounts `OrgBatchSavings`.

## Payload (`batch.savings_summary(p_from, p_to, p_organization_id)`)

Window `[p_from, p_to)` on `work_item.completed_at` (NULL = open); `lanes` sums
`runtime.global_execution` on `created_at` for the same window. Keys: `items`
(completed + priced), `completed_items`, `unpriced_items` (excluded, stated),
`batch_items`, `escalated_items`, `actual_usd`, `live_equivalent_usd`, `saved_usd`,
`discount_pct`, token totals, `undelivered_items/usd`, `pre_submission_estimate_usd`
(labelled only), `by_purpose`, `by_model`, `by_organization`, `lanes`.

## Change Log

- **2026-09-14** — Created. Batch spend moved onto the one spend ledger, savings moved
  onto the actual-token live-equivalent, and the spend dashboard, batch admin page,
  kg-cost tile and organization settings all read `batch.savings_summary`.
