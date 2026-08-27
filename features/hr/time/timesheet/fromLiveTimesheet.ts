"use client";

/**
 * features/hr/time/timesheet/fromLiveTimesheet.ts — the seam between the LIVE `hr_timesheet_get`
 * envelope and the `Timesheet` view model routes 5 and 29 render.
 *
 * 🚨 WHY THIS FILE HAD TO BE WRITTEN (G2 round-3 blocker R4).
 * ----------------------------------------------------------
 * `EmploymentTimesheetPage` crashed with `Cannot read properties of undefined (reading '0')`, so
 * intervals the engine was computing correctly could not be READ anywhere. The cause was not a null
 * check. `types.ts` describes a contract the database does not implement, and the snake→camel
 * mapper in `callHrTimeRpc` cannot fix that because the difference is **structural, not lexical**:
 *
 * | `types.ts` says | `hr.timesheet_get` actually returns |
 * |---|---|
 * | `weeks[].days[]` — days nested inside week blocks | `days[]` and `weeks[]` as **two flat sibling arrays** |
 * | `day.punches` | `day.punch_chain` |
 * | `day.totalHours` / `day.hoursByCategory` | `day.day_total_hours` / `day.totals_by_category` |
 * | `interval.earningCodeName` / `.earningCode` / `.isOvertime` | nested `interval.earning_code.{name,code,is_overtime}` |
 * | `interval.money.{amount,moneyWithheld,flags}` | a bare `interval.amount` |
 * | `interval.calc` | `interval.calc_ref` |
 * | `punch.actorType` / `.hasGeo` / `.hasPhoto` | nested `punch.actor.{...}` / `geo_captured` / `photo_captured` |
 * | `rowState` | `row.row_state` |
 * | a `{ok, data}` envelope | `{granted: true, …}` — and `{granted:false, reason, detail}` on refusal |
 *
 * `weeks[0].days` was therefore `undefined`, and `.days[0]` threw. **This is exactly the silent
 * runtime drift the earlier contract report warned about**: there is no typecheck between a `jsonb`
 * return and a hand-written interface, so the disagreement waits until a real row exists and then
 * fails as a crash rather than a red build.
 *
 * WHY THE ADAPTER LIVES HERE AND NOT IN `types.ts`.
 * Rewriting `types.ts` would be a cross-lane change to the shared contract while three lanes are
 * mid-build against it, and it would not settle which side is right — the SQL is live and running,
 * the types are what every component reads. So the translation is explicit, in one file, in this
 * lane, where it can be deleted the day the two are reconciled. It is a seam, not a fix.
 *
 * 🚨 NOTHING HERE COMPUTES HOURS. Every number is carried across as the server sent it. The only
 * derived value is which WEEK BLOCK a day belongs to, decided by comparing `local_work_date`
 * strings against the week's own local dates — a string comparison, never date arithmetic.
 */

import { HrRpcError } from "../api/rpc";
import type {
  CalcBlock,
  PeriodGridRow,
  HoursCategory,
  MoneyBearing,
  PayPeriodEmploymentState,
  PayPeriodState,
  PunchRow,
  Timesheet,
  TimesheetDay,
  TimesheetWeek,
  WorkIntervalRow,
  WorkweekRow,
} from "../api/types";

/** What `callHrTimeRpc` hands back for this RPC: the live envelope, camelized key-by-key. */
export type Live = Record<string, unknown>;

export const obj = (v: unknown): Live => (v && typeof v === "object" ? (v as Live) : {});
export const arr = (v: unknown): Live[] => (Array.isArray(v) ? (v as Live[]) : []);
export const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
export const nstr = (v: unknown): string | null => (typeof v === "string" ? v : null);
export const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : fallback;
export const nnum = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
export const bool = (v: unknown): boolean => v === true;

const EMPTY_CATEGORIES: Record<HoursCategory, number> = {
  worked: 0,
  paid_leave: 0,
  unpaid_leave: 0,
  holiday: 0,
  on_call: 0,
  premium: 0,
};

function categories(v: unknown): Record<HoursCategory, number> {
  const src = obj(v);
  const out = { ...EMPTY_CATEGORIES };
  for (const key of Object.keys(out) as HoursCategory[]) {
    if (key in src) out[key] = num(src[key]);
  }
  return out;
}

/** `calc_ref` → the `CalcBlock` every figure's rule-snapshot door reads. */
function calcBlock(v: unknown): CalcBlock {
  const c = obj(v);
  const ids = c.ruleVersionIds;
  return {
    ruleVersionIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [],
    engineKey: nstr(c.engineKey),
    engineVersion: nstr(c.engineVersion),
    computedAt: nstr(c.computedAt),
    calc: obj(c.calc),
    autoCloseEstimate: bool(obj(c.calc).autoCloseEstimate),
    autoCloseRuleId: nstr(obj(c.calc).autoCloseRuleId),
  };
}

/**
 * 🚨 THE MONEY RULE, PRESERVED ACROSS THE SEAM (SPEC-TIME §0 law 4).
 *
 * Live sends a bare `amount` that is **stored as NULL when a contributing rule is advisory**. A
 * `?? 0` anywhere in this function would turn "we cannot calculate this" into "nothing is owed" —
 * the single most damaging thing an adapter in this lane could do. `moneyWithheld` is therefore
 * derived from the null itself, and the flags come across untouched.
 */
function money(v: unknown, flagsSource: unknown): MoneyBearing {
  const amount = nnum(v);
  const rawFlags = arr(flagsSource);
  return {
    amount,
    moneyWithheld: amount === null,
    flags: rawFlags.map((f) => ({
      code: str(f.code),
      class: str(f.class),
      ruleId: nstr(f.ruleId),
      jurisdictionKey: nstr(f.jurisdictionKey),
      message: str(f.message),
    })),
  };
}

function interval(raw: Live, fallbackDate: string, fallbackTz: string): WorkIntervalRow {
  const code = obj(raw.earningCode);
  const calc = calcBlock(raw.calcRef ?? raw.calc);
  return {
    id: str(raw.id),
    employmentId: str(raw.employmentId),
    positionAssignmentId: nstr(raw.positionAssignmentId),
    positionTitle: nstr(raw.positionTitle),
    workweekId: str(raw.workweekId),
    payPeriodId: nstr(raw.payPeriodId),
    intervalKind: str(raw.intervalKind, "worked") as WorkIntervalRow["intervalKind"],
    hoursCategory: str(raw.hoursCategory, "worked") as HoursCategory,
    earningCodeId: str(code.id),
    // LAW 3a: the label is the earning code's NAME. If the join ever comes back empty the code
    // itself is shown — still a human label, never the `hours_category` enum token.
    earningCodeName: str(code.name) || str(code.code) || "Unnamed earning code",
    earningCode: str(code.code),
    startedAt: nstr(raw.startedAt),
    endedAt: nstr(raw.endedAt),
    localWorkDate: str(raw.localWorkDate, fallbackDate),
    tz: str(raw.tz, fallbackTz),
    hours: num(raw.hours),
    rate: nnum(raw.rate),
    isOvertime: bool(code.isOvertime) || bool(raw.isOvertime),
    roundingAppliedMinutes: num(raw.roundingAppliedMinutes),
    rawStartedAt: nstr(raw.rawStartedAt),
    rawEndedAt: nstr(raw.rawEndedAt),
    sourcePunchIds: Array.isArray(raw.sourcePunchIds)
      ? raw.sourcePunchIds.filter((x): x is string => typeof x === "string")
      : [],
    attendanceExceptionId: nstr(raw.attendanceExceptionId),
    isCurrent: raw.isCurrent === undefined ? true : bool(raw.isCurrent),
    supersededById: nstr(raw.supersededById),
    calc,
    money: money(raw.amount, raw.flags ?? calc.calc.flags),
  };
}

/**
 * Exported because the punch register (route 30) reads the SAME rows from a different RPC. One
 * punch mapper for the whole lane — a second copy is how one of them quietly stops rendering voids.
 */
export function mapLivePunch(raw: Live, fallbackDate = "", fallbackTz = "UTC"): PunchRow {
  const actor = obj(raw.actor);
  return {
    id: str(raw.id),
    employmentId: str(raw.employmentId),
    positionAssignmentId: nstr(raw.positionAssignmentId),
    shiftId: nstr(raw.shiftId),
    punchKind: str(raw.punchKind, "clock_in") as PunchRow["punchKind"],
    breakPaid: typeof raw.breakPaid === "boolean" ? raw.breakPaid : null,
    occurredAt: str(raw.occurredAt),
    deviceReportedAt: nstr(raw.deviceReportedAt),
    serverReceivedAt: str(raw.serverReceivedAt),
    clockSkewAppliedSeconds: num(raw.clockSkewAppliedSeconds),
    source: str(raw.source, "web") as PunchRow["source"],
    tz: str(raw.tz, fallbackTz),
    localWorkDate: str(raw.localWorkDate, fallbackDate),
    jurisdictionKey: nstr(raw.jurisdictionKey) ?? nstr(raw.jurisdictionId),
    // The actor block is NESTED live and flat in the view model.
    actorType: str(actor.actorType ?? raw.actorType, "employee") as PunchRow["actorType"],
    actorEmploymentId: nstr(actor.actorEmploymentId),
    actorUserId: nstr(actor.actorUserId),
    actorDeviceId: nstr(actor.actorDeviceId),
    actorNote: nstr(actor.actorNote),
    // Presence only — the register shows THAT geo/photo exist, never the values (§4.7).
    hasGeo: bool(raw.geoCaptured ?? raw.hasGeo),
    geoAccuracyM: nnum(raw.geoAccuracyM),
    hasPhoto: bool(raw.photoCaptured ?? raw.hasPhoto),
    photoFileId: nstr(raw.photoFileId),
    sourceIp: nstr(raw.sourceIp),
    attestationKind: nstr(raw.attestationKind) as PunchRow["attestationKind"],
    attestationResponse: obj(raw.attestationResponse) as PunchRow["attestationResponse"],
    voidedAt: nstr(raw.voidedAt),
    voidedReason: nstr(raw.voidedReason),
    voidedByPunchId: nstr(raw.voidedByPunchId),
    enteredReason: nstr(raw.enteredReason),
    originalValues: obj(raw.originalValues),
    duplicateSuspectedGroup: nstr(raw.duplicateSuspectedGroup),
  };
}

function day(raw: Live, tz: string): TimesheetDay {
  const date = str(raw.localWorkDate);
  return {
    localWorkDate: date,
    tz,
    intervals: arr(raw.intervals).map((i) => interval(i, date, tz)),
    // `punch_chain` live, `punches` in the view model — the rename that broke the day view.
    punches: arr(raw.punchChain ?? raw.punches).map((p) => mapLivePunch(p, date, tz)),
    totalHours: num(raw.dayTotalHours ?? raw.totalHours),
    hoursByCategory: categories(raw.totalsByCategory ?? raw.hoursByCategory),
    roundingAppliedMinutes: num(raw.roundingAppliedMinutes),
    /*
     * ⚠️ NOT YET SERVED. `hr.timesheet_get` returns no DST block, no midnight-crossing markers, no
     * per-day exceptions and no scheduled hours. The renderers for all of those exist and are
     * driven entirely by these fields, so they stay dark rather than being faked — a DST sentence
     * this client invented would be the exact defect §9 rule 7 forbids ("the renderer reads them;
     * it never re-derives them from arithmetic"). Owed by the SQL lane.
     */
    dst: { transition: false, sentence: null },
    crossesMidnight: false,
    continuesIntoDate: null,
    continuedFromDate: null,
    workdayAttribution: null,
    exceptions: [],
    scheduledHours: null,
  };
}

/**
 * 🚨 THE CATEGORY BREAKDOWN LIVES IN THE ROLLUP'S `calc`, NOT IN COLUMNS (G2 round-5, T5).
 *
 * `hr.pay_period_employment` has **no per-category columns**. It carries `total_hours` and a `calc`
 * jsonb, and the recompute refresher writes the breakdown into that jsonb:
 *
 *   calc.totals_by_category        {worked: 0.08}   ← at the COLUMN's scale; this is what we render
 *   calc.totals_by_category_exact  {worked: 0.0757} ← full precision, kept for the engine
 *   calc.hours_overtime / hours_doubletime / premium_line_count
 *   calc.amounts_incomplete + calc.amounts_note     ← the period-level money-withheld signal
 *
 * The old mapping read `totals.pay_period.by_category`, which does not exist, so every category
 * rendered **0.00 underneath a correct total** — a breakdown that silently contradicts the number
 * above it, on a wage record.
 *
 * ⚠️ `calc` IS DELIBERATELY LEFT SNAKE_CASE by the response mapper: it sits inside a calc block, and
 * `camelizeDeep` treats a calc block's inner `calc` as the engine's opaque payload (renaming inside
 * it would corrupt evidence). So the keys are read in snake here, on purpose. Both spellings are
 * accepted only so a future contract change cannot silently zero this row again.
 */
function rollupTotals(row: Live): {
  hoursByCategory: Record<HoursCategory, number>;
  hoursOvertime: number;
  hoursDoubletime: number;
  premiumLineCount: number;
  notComputedYet: boolean;
  amountsIncomplete: boolean;
} {
  const calcRef = obj(row.calcRef);
  const c = obj(calcRef.calc);

  /*
   * 🚨 A PLACEHOLDER ENROLLMENT IS NOT A ZERO. `hr.pay_period_enrollment` writes the row when the
   * employee joins the period, before any recompute has run. Rendering 0.00 there is a claim that
   * they worked nothing; the truth is that nobody has calculated yet, and the surface says so.
   */
  const engineKey = str(calcRef.engineKey ?? row.engineKey);
  const notComputedYet = engineKey === "hr.pay_period_enrollment";

  return {
    hoursByCategory: categories(c.totals_by_category ?? c.totalsByCategory),
    hoursOvertime: num(c.hours_overtime ?? c.hoursOvertime),
    hoursDoubletime: num(c.hours_doubletime ?? c.hoursDoubletime),
    premiumLineCount: num(c.premium_line_count ?? c.premiumLineCount),
    notComputedYet,
    // The engine's own note: at least one interval has no amount, so the period total is NOT zero.
    amountsIncomplete: c.amounts_incomplete === true || c.amountsIncomplete === true,
  };
}

function workweek(raw: Live, employmentId: string, payGroupId: string): WorkweekRow {
  const h = obj(raw.hours);
  const components = arr(raw.rateComponents);
  return {
    id: str(raw.workweekId ?? raw.id),
    employmentId,
    payGroupId,
    weekStartAt: str(raw.weekStartAt),
    weekEndAt: str(raw.weekEndAt),
    weekStartLocalDate: str(raw.weekStartLocalDate),
    weekStartDow: num(raw.weekStartDow),
    weekStartTime: str(raw.weekStartTime, "00:00:00"),
    tz: str(raw.tz, "UTC"),
    hoursWorked: num(h.worked),
    hoursRegular: num(h.regular),
    hoursOvertime: num(h.overtime),
    hoursDoubletime: num(h.doubletime),
    hoursPaidLeave: num(h.paidLeave),
    hoursUnpaidLeave: num(h.unpaidLeave),
    hoursHoliday: num(h.holiday),
    hoursOnCall: num(h.onCall),
    hoursOfService: num(h.ofService),
    weightedAverageRegularRate: nnum(raw.weightedAverageRegularRate),
    multiRate: bool(raw.multipleRates ?? raw.multiRate),
    rateComponents: components.map((rc) => ({
      positionAssignmentId: nstr(rc.positionAssignmentId),
      positionTitle: nstr(rc.positionTitle),
      rate: num(rc.rate),
      hours: num(rc.hours),
      product: num(rc.product),
    })),
    isFinal: bool(raw.isFinal),
    isBoundaryWeek: bool(raw.boundaryWeek ?? raw.isBoundaryWeek),
    calc: calcBlock(raw.calcRef ?? raw.calc),
    money: money(raw.amount, raw.flags),
  };
}

/**
 * Put each day in its week block.
 *
 * Live sends days and weeks as siblings with no link between them, and the view model needs the
 * nesting because the WORKWEEK is the overtime unit (§5.1). Assignment is by comparing
 * `local_work_date` against each week's own local dates — **string comparison on `YYYY-MM-DD`,
 * which sorts correctly and involves no date arithmetic**. A day matching no week still renders,
 * in a trailing block, because dropping a day silently would lose hours from the page.
 */
function bucketDays(days: TimesheetDay[], weeks: WorkweekRow[]): TimesheetWeek[] {
  if (weeks.length === 0) {
    return days.length > 0 ? [{ workweek: syntheticWeek(days), days, splitAtBoundary: false }] : [];
  }

  const ordered = [...weeks].sort((a, b) =>
    a.weekStartLocalDate.localeCompare(b.weekStartLocalDate),
  );
  const blocks: TimesheetWeek[] = ordered.map((w) => ({
    workweek: w,
    days: [],
    splitAtBoundary: false,
  }));
  const leftovers: TimesheetDay[] = [];

  for (const d of days) {
    let placed = false;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (d.localWorkDate >= ordered[i].weekStartLocalDate) {
        blocks[i].days.push(d);
        placed = true;
        break;
      }
    }
    if (!placed) leftovers.push(d);
  }

  if (leftovers.length > 0) {
    blocks.unshift({
      workweek: syntheticWeek(leftovers),
      days: leftovers,
      splitAtBoundary: false,
    });
  }
  return blocks.filter((b) => b.days.length > 0);
}

/**
 * A block for days no workweek row covers yet — a period whose weeks have not been rolled up.
 * Its hour totals are **zero, not a sum of the days**: this client does not add hours, and a total
 * it invented would disagree with `hr.workweek` the moment one exists.
 */
function syntheticWeek(days: TimesheetDay[]): WorkweekRow {
  const first = days[0];
  return {
    id: `unrolled-${first?.localWorkDate ?? "week"}`,
    employmentId: "",
    payGroupId: "",
    weekStartAt: "",
    weekEndAt: "",
    weekStartLocalDate: first?.localWorkDate ?? "",
    weekStartDow: 0,
    weekStartTime: "00:00:00",
    tz: first?.tz ?? "UTC",
    hoursWorked: 0,
    hoursRegular: 0,
    hoursOvertime: 0,
    hoursDoubletime: 0,
    hoursPaidLeave: 0,
    hoursUnpaidLeave: 0,
    hoursHoliday: 0,
    hoursOnCall: 0,
    hoursOfService: 0,
    weightedAverageRegularRate: null,
    multiRate: false,
    rateComponents: [],
    isFinal: false,
    isBoundaryWeek: false,
    calc: {
      ruleVersionIds: [],
      engineKey: null,
      engineVersion: null,
      computedAt: null,
      calc: {},
    },
    money: { amount: null, moneyWithheld: false, flags: [] },
  };
}

/**
 * The one entry point. Throws {@link HrRpcError} on a refusal so every caller's existing error path
 * — which renders `userMessage` verbatim — keeps working unchanged.
 *
 * 🚨 THE REFUSAL SHAPE IS `{granted:false, reason, detail}` AND `callHrTimeRpc` DOES NOT RECOGNISE
 * IT. Its envelope check looks for an `ok` key, which this function never sends, so a refusal
 * arrives here dressed as a successful payload. Detecting it is this adapter's job, and getting it
 * wrong is how "you do not have access to this timesheet" renders as an empty grid.
 */
export function fromLiveTimesheet(payload: unknown): Timesheet {
  const live = obj(payload);

  if (live.granted === false) {
    throw new HrRpcError({
      rpc: "hr_timesheet_get",
      code: str(live.reason, "hr_timesheet_refused"),
      message: str(live.detail, "The timesheet could not be read."),
      userMessage: str(live.detail, "The timesheet could not be read."),
      details: live as Record<string, unknown>,
    });
  }

  const employment = obj(live.employment);
  const employee = obj(employment.employee);
  const period = obj(live.payPeriod);
  const row = live.row && typeof live.row === "object" ? obj(live.row) : {};
  const tz = str(arr(live.weeks)[0]?.tz, "UTC");
  const payGroupId = str(period.payGroupId ?? employment.payGroupId);

  const days = arr(live.days).map((d) => day(d, tz));
  const weeks = arr(live.weeks).map((w) => workweek(w, str(employment.id), payGroupId));
  const totalsPeriod = obj(obj(live.totals).payPeriod);

  const disputedAt = nstr(row.disputedAt);

  return {
    employmentId: str(employment.id),
    employeeDisplayName: str(employee.displayName) || "This employee",
    payPeriod: {
      id: str(period.id),
      payGroupId,
      // Not served by this read. Named honestly rather than filled with a guess.
      payGroupName: str(period.payGroupName) || "This pay group",
      periodStartOn: str(period.periodStartOn),
      periodEndOn: str(period.periodEndOn),
      payDate: nstr(period.payDate),
      sequenceNumber: num(period.sequenceNumber),
      state: str(period.state, "open") as PayPeriodState,
      submittedAt: nstr(period.submittedAt),
      approvedAt: nstr(period.approvedAt),
      exportedAt: nstr(period.exportedAt),
      lockedAt: nstr(period.lockedAt),
      closedAt: nstr(period.closedAt),
      reopenedAt: nstr(period.reopenedAt),
      reopenReason: nstr(period.reopenReason),
      boundaryWorkweekIds: Array.isArray(period.boundaryWorkweekIds)
        ? period.boundaryWorkweekIds.filter((x): x is string => typeof x === "string")
        : [],
      counts: { employments: 0, approved: 0, open: 0, attested: 0, disputed: 0 },
    },
    rowState: str(row.rowState, "open") as PayPeriodEmploymentState,
    weeks: bucketDays(days, weeks),
    periodTotals: {
      // The server's own display sum. Never recomputed here.
      totalHours: num(totalsPeriod.hours ?? row.totalHours),
      ...rollupTotals(row),
      boundaryNote: nstr(totalsPeriod.boundaryNote),
    },
    attestation: {
      stepId: nstr(obj(arr(obj(live.workflow).steps)[0]).stepId),
      canAttest: bool(obj(live.viewer).mayAttest) && !nstr(row.attestedAt),
      attestedAt: nstr(row.attestedAt),
      // 🚨 STORED AS SHOWN. `attestation_statement` is what this person actually agreed to.
      statementShown: nstr(row.attestationStatement),
      statementToShow: nstr(live.attestationStatementToShow),
    },
    dispute: disputedAt
      ? {
          disputedAt,
          disputeNote: str(row.disputeNote),
          disputeResolution: nstr(row.disputeResolution),
          disputeResolvedAt: nstr(row.disputeResolvedAt),
          disputeResolvedByName: nstr(row.disputeResolvedByName),
        }
      : null,
    editHistory: arr(live.editHistory).map((h) => ({
      at: str(h.at),
      byName: str(h.byName) || "Someone",
      reason: str(h.reason),
      field: str(h.field),
      originalValue: nstr(h.originalValue),
      newValue: nstr(h.newValue),
      voidedPunchId: nstr(h.voidedPunchId),
      replacementPunchId: nstr(h.replacementPunchId),
      rateAtTime: nnum(h.rateAtTime),
    })),
    openExceptions: arr(live.exceptions).map((e) => ({
      id: str(e.id),
      employmentId: str(e.employmentId ?? employment.id),
      employeeDisplayName: str(employee.displayName) || null,
      exceptionKind: str(e.exceptionKind, "missed_punch") as never,
      severity: str(e.severity, "warn") as never,
      resolutionState: str(e.resolutionState, "open") as never,
      detectedAt: str(e.detectedAt),
      localWorkDate: str(e.localWorkDate),
      tz: str(e.tz, tz),
      varianceMinutes: nnum(e.varianceMinutes),
      scheduledStartAt: nstr(e.scheduledStartAt),
      scheduledEndAt: nstr(e.scheduledEndAt),
      actualStartAt: nstr(e.actualStartAt),
      actualEndAt: nstr(e.actualEndAt),
      punchId: nstr(e.punchId),
      shiftId: nstr(e.shiftId),
      workIntervalId: nstr(e.workIntervalId),
      scheduleChangeId: nstr(e.scheduleChangeId),
      correctiveActionId: nstr(e.correctiveActionId),
      resolutionNote: nstr(e.resolutionNote),
      resolvedAt: nstr(e.resolvedAt),
      resolvedByName: nstr(e.resolvedByName),
      premiumEarningCodeId: nstr(e.premiumEarningCodeId),
      allowedResolutions: Array.isArray(e.allowedResolutions)
        ? (e.allowedResolutions.filter((x): x is string => typeof x === "string") as never)
        : ([] as never),
      message: str(e.message),
      isEstimate: bool(e.isEstimate),
      workedAfterDenial: typeof e.workedAfterDenial === "boolean" ? e.workedAfterDenial : null,
    })),
    recomputedSinceApproval: null,
    noTimesheetReason: null,
  };
}

// ---------------------------------------------------------------------------------------------
// The sibling read: `hr_timesheet_period_grid` (route 28) — same class of drift.
// ---------------------------------------------------------------------------------------------

/**
 * 🚨 THE GRID'S ENVELOPE IS NOT `Paged<T>` EITHER.
 *
 * `types.ts` declares `{rows, page: number, pageSize, totalRows, hasMore}`. The live function
 * returns `{granted, pay_period, progress:{approved,total}, variance_warn_minutes, filters_applied,
 * page:{limit, offset, returned, total_count, has_more, next_offset}, rows}`.
 *
 * `page` is an OBJECT where the view model expects a NUMBER, and `totalRows` does not exist — so
 * the table's pagination read `undefined` and reported zero total rows while happily rendering a
 * page of them. Not a crash, which is why it would have survived review: a grid that silently
 * claims one page of a four-page period is how a manager approves two thirds of a pay group and
 * believes they are done.
 *
 * It also carries `progress`, which is the authoritative "N of M approved" figure §6.4 requires —
 * so route 28 no longer makes a second `hr_pay_period_get` call to get it.
 */
export interface LivePeriodGrid {
  rows: PeriodGridRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  hasMore: boolean;
  /** §6.4's progress figure, from the same response the rows came from. */
  progress: { approved: number; total: number };
  periodState: PayPeriodState;
  periodId: string;
  periodStartOn: string;
  periodEndOn: string;
  /** `hr.time_and_attendance.variance_warn_minutes` — the knob, served with the data. */
  varianceWarnMinutes: number | null;
}

export function fromLivePeriodGrid(payload: unknown): LivePeriodGrid {
  const live = obj(payload);

  if (live.granted === false) {
    throw new HrRpcError({
      rpc: "hr_timesheet_period_grid",
      code: str(live.reason, "hr_period_grid_refused"),
      message: str(live.detail, "The approval grid could not be read."),
      userMessage: str(live.detail, "The approval grid could not be read."),
      details: live as Record<string, unknown>,
    });
  }

  const page = obj(live.page);
  const period = obj(live.payPeriod);
  const progress = obj(live.progress);
  const limit = num(page.limit, 50) || 50;
  const offset = num(page.offset);

  return {
    rows: arr(live.rows).map(gridRow),
    // The table's pagination is one-based; the wire is limit/offset.
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
    totalRows: num(page.totalCount),
    hasMore: bool(page.hasMore),
    progress: { approved: num(progress.approved), total: num(progress.total) },
    periodState: str(period.periodState ?? period.state, "open") as PayPeriodState,
    periodId: str(period.id),
    periodStartOn: str(period.periodStartOn),
    periodEndOn: str(period.periodEndOn),
    varianceWarnMinutes: nnum(live.varianceWarnMinutes),
  };
}

function gridRow(raw: Live): PeriodGridRow {
  const employee = obj(raw.employee);
  const hours = obj(raw.hours);
  const exceptions = obj(raw.exceptions);
  const counts = obj(exceptions.byKind ?? raw.openExceptionCountsByKind);

  return {
    employmentId: str(raw.employmentId ?? raw.id),
    employeeDisplayName:
      str(employee.displayName ?? raw.employeeDisplayName) || "This employee",
    employeeNumber: nstr(employee.employeeNumber ?? raw.employeeNumber),
    departmentName: nstr(raw.departmentName),
    locationName: nstr(raw.locationName ?? raw.workLocationName),
    managerName: nstr(raw.managerName),
    state: str(raw.rowState ?? raw.state, "open") as PayPeriodEmploymentState,
    openStepId: nstr(raw.openStepId ?? obj(raw.workflow).stepId),
    totalHours: num(hours.total ?? raw.totalHours),
    hoursByCategory: categories(hours.byCategory ?? raw.hoursByCategory),
    hoursOvertime: num(hours.overtime ?? raw.hoursOvertime),
    hoursDoubletime: num(hours.doubletime ?? raw.hoursDoubletime),
    premiumLineCount: num(raw.premiumLineCount ?? raw.premiumLines),
    openExceptionCountsByKind: counts as PeriodGridRow["openExceptionCountsByKind"],
    openExceptionCount: num(exceptions.open ?? raw.openExceptionCount),
    hasDispute: bool(raw.hasDispute ?? raw.disputed),
    hasAutoClosedPunch: bool(raw.hasAutoClosedPunch ?? raw.autoClosedPresent),
    recomputedSinceApproval: bool(raw.recomputedSinceApproval),
    /*
     * 🚨 `null` stays `null` and renders as "Not scheduled" (§6.2). A `?? 0` here would turn "no
     * schedule to compare against" into "perfect adherence" — the exact substitution the spec
     * singles out, made invisible inside an adapter.
     */
    varianceMinutes: nnum(raw.varianceMinutes ?? obj(raw.variance).minutes),
    scheduledHours: nnum(raw.scheduledHours ?? obj(raw.variance).scheduledHours),
  };
}
