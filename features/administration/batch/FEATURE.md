# Batch admin surface — `/administration/knowledge/batch`

Per-item visibility for the **platform Batch system** (`matrx-batch`): background
AI work that nobody needs in the next few minutes, run through provider Batch
APIs at roughly half price. The system is live in production and is idle most of
the time.

**Backend contract (system of record):**
`aidream/packages/matrx-batch/matrx_batch/FEATURE.md`. This surface reads that
system; it never writes to it and never asks the aidream server for it.

## Why this surface exists

A work item can be `status='completed'` — the provider returned an answer and we
were billed for it — while `handler_status='dead'`, meaning every delivery
attempt failed and the item was dead-lettered. **Tokens bought, nothing
delivered.** Before this page, that state existed only in the database: the only
batch surface was the aggregate tiles on `/administration/knowledge/kg-cost`,
which count submissions and 7-day savings and cannot show it.

So `handler_status='dead'` is an **alert band at the top of the page**, with the
money it wasted, not a number in a table row. At the time this was built 12 of
the 20 live work items were in exactly that state (all from the `crm.party_kind`
handler, whose judge agent returned output missing its required keys).

## Files

| File | Owns |
|---|---|
| `service/batchAdminService.ts` | Every read. Exact `head` counts per lifecycle/delivery value; `readAllRows` for the savings roll-up and provider batches; a filtered, counted page for the item table. |
| `components/BatchDashboard.tsx` | The page: undelivered alert, queue chips (which are also the filter), savings band with a 7d/30d/all window, and the two tabs. |
| `components/WorkItemsPanel.tsx` | The filterable item ledger + expand-in-place detail (`error` / `handler_error` jsonb, timings, tokens, deadline/escalation). |
| `components/ProviderBatchesPanel.tsx` | One row per provider submission: lifecycle, item count, poll count, turnaround, escalation state, realized savings. |
| `components/presentation.tsx` | The shared vocabulary — money/time formatters and the two badges. The same word must mean the same thing in a chip, a row and a detail panel. |
| `app/(admin)/administration/knowledge/batch/page.tsx` | Route. |

## Data access

Reads go **React → Supabase directly** (`supabase.schema("batch")`), like every
other read in this repo. `batch.work_item` and `batch.provider_batch` are
`ledger` tables: `authenticated` holds `SELECT` only and the server writes, so
there is nothing a Next route or the Python server could add. `batch` is exposed
to PostgREST and `authenticated` holds `USAGE` on it; RLS (`std_select`, which
leads with `is_platform_admin()`) is the authorization layer.

**Two read shapes, deliberately:**

- **Counts are `{ count: "exact", head: true }`.** The queue is unbounded by
  design; a count computed as `rows.length` of a page PostgREST silently capped
  at 1000 would be a confident lie (CLAUDE.md § `readAllRows`).
- **Sums page through `readAllRows`** inside an explicit window, because a total
  must see every row it claims to cover. The window is shown in the UI
  ("across N completed items"), never implied.

Nothing on this page treats a rendered page as a complete set. The item table
states `Showing X of Y matching items` and says so when the newest 200 is not
all of them.

## Vocabulary this screen renders

`handler_status` is the queue's **yield signal**, not a retry counter
(matrx-batch FEATURE.md): `succeeded` = accepted, `dead` = rejected, anything
else = undecided. The labels here say that in English:

| Column value | Label | Meaning |
|---|---|---|
| `NULL` | not dispatched | No handler has been asked to deliver this yet. |
| `dispatched` | delivering | A handler is running. |
| `succeeded` | delivered | The answer reached the consumer that ordered it. |
| `failed` | retrying | The handler raised; the queue will try again. |
| `dead` | **never delivered** | Dead-lettered. Paid for, delivered nowhere. |

🚨 **`handler_status` has no CHECK constraint** — it is re-drivable by design.
A value this screen does not know renders with its raw name, a warning tone, and
a tooltip saying the screen cannot tell whether it means delivered or lost. It
never silently reads as "fine". **Adding a `handler_status` value on the server
means adding it to `HANDLER_STATUSES` and `DELIVERY` here in the same change** —
otherwise it is invisible in the chip row, which is the page's whole summary.

The same applies to `WORK_ITEM_STATUSES`: it mirrors the lifecycle the DB trigger
`batch.enforce_work_item_lifecycle()` enforces. Widening that trigger's map means
widening this list.

## Idle is a state, not a failure

The queue is empty most of the time. Every empty state says what would put
something there ("items appear here the moment a background job is submitted at
batch pricing") rather than showing a blank panel or a spinner. The savings band
with no completed work in the window says so in words and does not print `$0.00`
as if it were a measurement.

## No dead ends between the two tabs

An item's expanded detail names its provider submission as a link that opens
that submission on the Provider batches tab, already expanded; a submission's
detail has a "Show its N work items" button that narrows the items tab to
`provider_batch_row_id` (chip `submission <id8>`). A raw UUID that opens nothing
is the dead-end class `no-dead-ends` forbids.

A cost cell on an unsettled row (`status !== 'completed'`) says **not billed
yet** and shows only the live estimate — never `$0.0000 -100%`, which would read
as a measured total discount.

## Verified

2026-09-11, localhost as `admin@admin.com`, against the live DB: 32 work items
(12 pending, 20 completed, 12 `handler_status='dead'` from `crm.party_kind`),
3 provider batches; the alert band, chip filters, "Show these items", both
cross-tab jumps, row expand with `handler_error` JSON, 7d/30d/all savings
windows, and the 375px layout all exercised. Every read on the page returned
200; the console 400s on admin pages are the known `@ai-matrx/associations`
door probe (`lib/diagnostics/errorTierRules.ts`), not this surface.

## Change log

- **2026-09-11** — Cross-tab jumps (item ↔ submission), honest unsettled cost
  cell, `Input` imported from `@ai-matrx/design-system` (the host
  `components/ui/input` no longer exports it — the page 500'd), phone layout of
  the alert band. Browser-verified.
- **2026-09-11** — Built. Route, service, three panels, nav entries under
  Administration → Knowledge → Knowledge Graph, and reciprocal links with
  `/administration/knowledge/kg-cost`.
