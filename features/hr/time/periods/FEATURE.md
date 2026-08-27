# FEATURE.md — `hr/time/periods`

**Status:** `scaffolded` — the surfaces are built; **no SQL RPC in this lane exists yet**
**Tier:** `2` · **Lane:** L3 / register item **HRB-015** · **Last updated:** `2026-08-26`
**Behaviour spec:** `../../../../../common-docs/projects/hr-domain/specs/SPEC-TIME.md` §2.7, §7 —
*that* document says what these screens do; this file says how the code is arranged and what a
change here must not break.

## What this is

SPEC-UI-IA routes **32** (`/hr/time/periods`) and **33** (`/hr/time/periods/[periodId]`): the
pay-period state machine per pay group, one period's approval progress, its payroll-export runs,
and the corrections tagged to it after lock.

## THE LAWS — each one has cost somebody money somewhere

1. **TWO STATE MACHINES, LABELLED DISTINCTLY** (§14 D8). The header is `hr.pay_period.state`
   (7 values); the rows are `hr.pay_period_employment.state` (6 values). They share three token
   spellings and mean different things. `PeriodStatePanel` puts them in separate blocks under
   *"This period"* and *"Timecards in it"*, and `periodStateMachine.ts` keeps two label maps that
   are not reachable through each other. **Approving one person never moves the period.**
   `submitted` is never a row state; there is no row-level `reopened`.
2. **APPROVE IS REFUSED WITH AN OPEN TIMECARD AND PERMITTED OVER A DISAGREEMENT**, and the surface
   says so in §2.7's exact words: *"3 timecards are approved with an open disagreement. The
   disagreement travels to the export."* The disagreement is the employee's own words, it is never
   resolved by exporting, and the export carries it as evidence.
3. **REOPEN DOES NOT UN-EXPORT AND DOES NOT RE-PAY.** `locked → reopened → approved` only, reason
   required, gated by `hr.time_and_attendance.allow_period_reopen`. The sentence appears BEFORE the
   click (`REOPEN_NOTICE`, in the confirm dialog) and again after it, verbatim from the server's
   `notice`. A delivered export is never regenerated because regenerating in place **double-pays**;
   the fix is an adjustment.
4. **AFTER LOCK, THE ADJUSTMENT LANE IS THE ONLY EDIT DOOR.** `PostLockAdjustments` renders BOTH
   period ids on every row — the locked period it belongs to and the next open period it is paid in
   — because showing one says the locked period was rewritten, which is what did not happen.
5. **THE BOUNDARY-WEEKS PANEL IS A SENTENCE, NOT AN ID LIST.** Overtime for a straddling week is
   computed on the whole week and attributed to the period containing the week's **end** date. A
   reader reconciling against a total that lands in the next period will otherwise conclude the
   numbers are wrong.
6. **NO CLIENT COMPUTES HOURS, MONEY OR ELAPSED TIME.** Enforced, not merely asserted, by
   `scripts/check-hr-time-arithmetic.ts` (`pnpm check:hr-time-arithmetic`).
7. **MONEY IS ABSENT WHEN A CONTRIBUTING RULE IS ADVISORY** — never a zero, never a dash, never a
   guess. `amountWithheld` sits beside `amountDelta` so a null can never be read as a zero.

## Files

| File | What it is |
|---|---|
| `periodStateMachine.ts` | The legal edges, both label sets, and the courtesy offer logic. **Pure** — no React, so the laws are provable headless. |
| `api/periodReads.ts` | `listPayPeriods` · `getPayPeriod` · `listTimeAdjustments`, all through the one RPC door. |
| `hooks/usePayPeriods.ts` | Fetch-and-hold for the three reads. |
| `components/PayPeriodsTable.tsx` | Route 32's `MatrxDataTable`. |
| `components/PayPeriodsPage.tsx` | Route 32 body **+ the org-wide export history row 32 requires**. |
| `components/PeriodStatePanel.tsx` · `PeriodTransitionBar.tsx` | Route 33's header and its transitions. |
| `components/BoundaryWeeksPanel.tsx` · `PostLockAdjustments.tsx` | The two panels §2.7 names. |
| `components/PeriodDetailPage.tsx` | Route 33 body; mounts **L13's** export components. |
| `__checks__/non-browser-contracts.ts` | L3-76 / T-14 — the headless proof. |

## 🚨 The export half is NOT this lane's

The payroll-export **engine** (E-18…E-26) is lane **L13 / HRB-025**. R-L3 U-02 moved export
generation onto the server lane and **L3 builds no export RPC**. Routes 32/33 mount L13's
`<ExportRunPanel>` and `<ExportRunList>` from `features/hr/exports/` — read
[`../../exports/FEATURE.md`](../../exports/FEATURE.md) before touching that half.

This lane briefly carried a second component set at `features/hr/time/exports/`. The coordinator
ruled on 2026-08-26 that L13's wins, and that fork was **deleted** — no shim, no fallback, no
deprecated twin ([no-legacy](../../../../../common-docs/policies/no-legacy.md)). Do not recreate it.

## Verification

- `pnpm type-check` — the only type gate.
- `npx tsx features/hr/time/periods/__checks__/non-browser-contracts.ts` — 120 checks, headless,
  asserting **meanings** rather than shapes. It also guards the cross-tenant fix on
  `public.hr_payroll_export_list` (see below).
- `pnpm check:hr-time-arithmetic` — proven falsifiable: six planted bad cases go red, `--strict`
  exits 1, a reasoned `hr-time-arithmetic-allow:` marker suppresses and an unreasoned one does not.

## Change log

- **2026-08-26** — Built routes 32/33. Deleted this lane's export fork per the coordinator's
  deconfliction ruling and mounted L13's components; added the org-wide export history to route 32.
  Moved route metadata onto `createRouteMetadata`. Scoped `public.hr_payroll_export_list`'s
  `payroll.read` capability check to the organization being read (it was ambient, and therefore a
  cross-tenant grant) — applied live, hardened in the declaring migration, and guarded by an
  assertion in the headless proof.
