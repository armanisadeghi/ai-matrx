# G2 F3 — create controls for pay groups and org structure: fix evidence

**Fixed by:** lane-f3-create-controls. **Date:** 2026-08-26.
**Environment:** live DB `db.matrxserver.com`; preview `localhost:3001`; **`NEXT_PUBLIC_HR_MOCK=0`**
(checked in `.env.local` before every step below and left at `0`).
**Org:** `zzz-throwaway-surface-test-org` = `2643e470-b275-47f3-95f3-ae275ad3ca47`.
Signed in as `admin@admin.com` via `/api/dev-login`.

## What F3 said

> `HrPayGroupsPanel.tsx` mounts `PayGroupEditor` **only** as a `MatrxDataTable` `detail:`
> renderer — i.e. as the expansion of an existing row. With zero rows there is no path to it.

True of all four entities. `HrStructurePanel.tsx` had the same shape for departments,
locations and job titles, and its own empty state promised the opposite.

## The four rows created **through the UI**, in a browser

| Entity | Name | Row id |
|---|---|---|
| Department | `G2F3 Field Services` (cost centre `CC-9100`) | `d1c21852-5302-430a-8b76-60f97ca99250` |
| Location | `G2F3 Riverside Depot` — tz `America/Denver`, jurisdiction **Colorado (state)** | `89a80ace-d2d3-4ecd-9fbe-2d6ac3911b3f` |
| Job title | `G2F3 Depot Coordinator` — EEO-1 **Operatives** | `5f8c48b9-d64e-4b77-b400-b3dc10892022` |
| Pay group | `G2F3 Depot Biweekly` — biweekly, workweek Sunday 00:00, first period 2026-08-26 | `541ca2d0-1c2b-468c-a067-f03401dbd714` |

Every one was created by clicking a control on the page — no RPC was called by hand, and no
row in this table was written by SQL. Each list refreshed in place so the new row was visible
immediately.

## 🚨 A second defect, found because the first one hid it

`upsertHrStructure({ kind: "pay_group" })` — what the pay-group editor's save path called —
**could never have worked**. `public.hr_structure_upsert`'s first statement, read live:

```sql
if p_kind not in ('department','location','job_title') then
  raise exception 'hr_structure_upsert: % is not a structure kind', p_kind using errcode = '22023';
```

The only writer of `hr.pay_group` is `public.hr_pay_group_upsert(p_payload jsonb)`. The broken
write was invisible because nobody could reach the form that would have failed: a missing
affordance was concealing a dead write. Both the create and the edit path now go through
`features/hr/settings/pay-groups/pay-group-write.ts`.

## Evidence

| File | What it shows |
|---|---|
| `01-pay-groups-empty-state-has-create.png` | The empty state **carries the primary action**. This is the exact card F3 photographed with nothing to click. |
| `02-pay-group-create-form-open.png` | The create form is the same editor the row expansion uses — including the live six-period preview and the "existing workweeks are not re-cut" rule, in create mode. |
| `03-structure-four-created-rows.png` | `/hr/settings/structure` with a header action on each of the three sections, and the created department and location listed. |
| `04-pay-group-created.png` | `G2F3 Depot Biweekly` listed with its frequency, workweek and first period — the row that makes `hr.pay_period` reachable. |
| `05-mobile-375-structure-create-actions.png` | 375px: every action is full-width and ≥44px, and the page does not scroll sideways (the table scrolls inside its own container). |
| `06-location-refusal-names-the-field.png` | A refusal rendered **at the control**: `aria-invalid` on the time-zone select plus its sentence, not "something went wrong". |

## Not proven here

- **The workweek future-date refusal on an EDIT** (`workweek_change_needs_future_date`) is
  mirrored at the control and enforced server-side, but was not exercised in a browser.
- Everything downstream of a pay group — `hr.pay_period` generation, attestation, approval,
  export, lock — remains blocked on the other reopen items (F1/F2/F5). This fix removes the
  first step's blocker; it does not on its own make the G2 vertical runnable.
