# Timesheet surfaces — routes 5, 28, 29 (and the punch/exception lanes beside them)

**What this covers:** the employee's own timesheet, the manager approval grid, one person's period
in full, the raw punch register, and the attendance-exception queue. Lane L3 / HRB-015.

**Cross-repo source of truth:** [`SPEC-TIME`](../../../../../common-docs/projects/hr-domain/specs/SPEC-TIME.md)
(§0, §2.2–§2.6, §4.1, §4.3, §5, §6, §9, §10, §11, §14 D7–D9) and
[`SPEC-UI-IA`](../../../../../common-docs/projects/hr-domain/specs/SPEC-UI-IA.md) §3.4, §4.5, §5.5, §7.
This file is the local mechanics only. Where they disagree, the spec wins.

---

## The seven rules this code exists to keep

Every one of these has a component that owns it, so a new surface cannot forget it by omission.

1. **No client computes hours, overtime, premiums, rounding, categorization or a weighted average**
   (§0 law 6, §9.2). No timestamp subtraction, no `differenceInMinutes`, no `hours × rate`, and **no
   summing of hours across rows**. Guarded by `pnpm check:hr-time-arithmetic` (blocking on
   `--strict`). If you need a total that does not already arrive computed, the answer is a server
   contract, not a `reduce`.
2. **Money is ABSENT when a contributing rule is advisory** — never a zero, never a dash, never a
   guess (§0 law 4). `MoneyAmount` in `shared/MoneyAndFlags.tsx` is the only renderer of an amount,
   and it prints *"Amount not calculated"* plus the flag sentence when `moneyWithheld` is true.
3. **Every computed number carries a path to its rule snapshot** (§0 law 2). Every OT, DT and
   premium figure is a `RuleSnapshotDoor`, never a `<span>`. A figure without that path is an
   unfinished surface.
4. **Raw and computed are never conflated in one cell** (AD-11). `PunchChain` is the raw block and
   renders no derived value; the day view puts it *beneath* the intervals, never interleaved; the
   grid's hours cell opens raw punches in a `DataRowWindow` beside it.
5. **A void is rendered, struck through, with the voiding punch as a door — never hidden.**
   `PunchChain` has no prop that hides one, and the door is unconditional.
6. **Two state machines, labelled distinctly** (§14 D8). `RowStateChip` is
   `pay_period_employment.state` (no `submitted`, no `reopened`); `PeriodStateChip` is
   `pay_period.state` and is prefixed with the words "Pay period". They are deliberately different
   shapes.
7. **`varianceMinutes: null` renders the words "Not scheduled"** — never `0`, which reads as perfect
   adherence (§6.2). `formatVariance` is the only renderer, and the sign is explained in words.

## Where things live

| Path | What it owns |
|---|---|
| `shared/format.ts` | Display formatting. **Re-exports `clock/stampedTime.ts`** — do not delete that block, it is what stops a second spelling of `5:58 AM PDT` and it breaks every sibling lane when removed. |
| `shared/vocabulary.ts` | Labels for the closed CHECK-constrained vocabularies. **Not** a label source for anything the server names — an interval's label is `earningCodeName`, an exception's is `message`. |
| `shared/MoneyAndFlags.tsx` | Rule 2, plus `incomplete[]` as a visible sentence naming the missing fact. |
| `shared/RuleSnapshot.tsx` | Rule 3. ONE window per surface via `RuleSnapshotProvider`; `useRuleSnapshot()` throws outside it rather than silently making a figure look like a door. |
| `shared/badges.tsx` | Rules 6 and the §5.2 badge law: label from `earningCodeName`, `isOvertime` in distinct visual weight, the paid-leave tooltip. |
| `shared/timing.tsx` | §9 and §10 — the DST sentence printed verbatim, both midnight-crossing markers, dual workday attribution, and L3-50's inline rounding sentence. |
| `shared/DisagreementBlock.tsx` | §5.5 — both values side by side, the employee's words verbatim, the manager's response separately labelled, surviving approval. |
| `shared/ExceptionsStrip.tsx` | §5.4 strip **and** `ExceptionResolveControls`, the one renderer of `allowedResolutions`. |
| `shared/workflowApi.ts` | `hr_wf_decide` / `_bulk_decide` / `_for_target` through the mock-aware door. |
| `timesheet/WeekBlocks.tsx` | The timesheet itself: workweek columns, the stamped week header, three grains, multi-rate. |
| `punches/`, `exceptions/` | Routes 30 and 31 plus the punch correction lane. |

## Things that will bite you

- **`useRuleSnapshot()` throws without a provider.** Mount `<RuleSnapshotProvider>` at the surface.
- **Fixtures must be arithmetically plausible.** Two were not, and both rendered as visible
  nonsense: raw and paid times identical beside "+1 minute", and an OT line reusing the regular
  line's amount. A screenshot of an implausible fixture proves nothing.
- **Route search params are `employment` / `period` / `kind`**, matching `features/hr/routes.ts`.
  Build hrefs with those builders, never by hand.
- **Turbopack's dev cache corrupts and 404s sub-routes.** Symptom: one `(core)` route 404s while its
  siblings are fine. `pnpm preview:stop`, `rm -rf .next-preview/dev/cache/turbopack`, restart.

## Contracts this lane consumes, and their live state (verified 2026-08-26)

| Contract | Live? |
|---|---|
| `public.hr_timesheet_get`, `public.hr_timesheet_period_grid` | **Yes** |
| `public.hr_wf_decide`, `_bulk_decide`, `_for_target` | **Yes** |
| `hr.punch_correct`, `hr.punch_void` | Bodies exist in `hr`; **no `public.hr_*` wrapper**, so no browser can reach them |
| `hr_punch_register`, `hr_attendance_exception_resolve` | **Do not exist** in either schema |
| `hr_attendance_exception_list` | **Does not exist.** Named by this lane (see `api/rpc.ts`) because §2.6 specifies route 31's filters without naming a contract. Owed by the SQL lane. |

## Change log

- **2026-08-26** — Built routes 5, 28, 29, 30, 31 and the punch correction lane. Declared
  `hr_attendance_exception_list`. Closed a dead end where a voided punch's replacement rendered as a
  bare uuid. Collapsed two rival names for one datetime formatter and restored the `stampedTime`
  re-export block another session had removed.
