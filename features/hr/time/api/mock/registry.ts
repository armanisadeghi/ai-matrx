/**
 * features/hr/time/api/mock/registry.ts — the RPC lane's fixture set.
 *
 * SPEC-CONTRACTS §6.4 puts four cases on every HTTP endpoint — happy · empty · error · edge — and
 * the 243 frozen fixtures deliver that for the sixty `/hr/*` operations. **A punch is not one of
 * them**: punches, clock state, timesheet reads, period transitions and exception resolution are
 * the *direct* lane (§2.2), so they have no HTTP operation and no frozen fixture. This file is the
 * same discipline applied to the lane that actually carries them, so every client surface in L3
 * starts serverless on day one (L3-78) and every error path is built at the same time as its happy
 * path.
 *
 * 🚨 WHAT THESE FIXTURES ARE FOR, AND WHAT THEY CAN NEVER BE USED FOR
 * -------------------------------------------------------------------
 * They exist so the UI can be built before the SQL lands. They are **not evidence of anything**.
 * D15 is explicit: an independent verifier proves the acceptance targets against the live UI with
 * real data entered by real non-admin users, and **manufactured fixture data never counts**. A
 * screenshot of a mock is not a verification, and nobody may mark an item Met from this file.
 *
 * The edge cases below are chosen to be the ones that are *expensive to discover late*: the
 * idempotent replay that must render as a success, the advisory rule that must render hours with
 * **no amount and no zero**, the DST night that is 7 hours and not 8, the multi-rate week that must
 * never show a single week rate, the preserved disagreement, and the violation-severity exception
 * that must not offer `excused`.
 *
 * When an RPC lands for real, delete its entry here rather than leaving both — two sources for one
 * shape is the drift this system exists to prevent.
 */

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import type { HrTimeRpcName } from "../rpc";

/** One fixture. `ok:false` is THROWN by the transport, so it exercises the caller's error path. */
export interface HrTimeRpcFixture {
  ok: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  user_message?: string | null;
  details?: Record<string, unknown> | null;
}

export type HrTimeRpcFixtureSet = Partial<Record<HrFixtureCase, HrTimeRpcFixture>>;

const EMPLOYMENT = "11111111-1111-4111-8111-111111111111";
const WORKWEEK = "22222222-2222-4222-8222-222222222222";
const PERIOD = "33333333-3333-4333-8333-333333333333";
const TZ = "America/Los_Angeles";

const CALC_OK = {
  ruleVersionIds: ["9a1c0f5e-0000-4000-8000-000000000001"],
  engineKey: "ot_engine",
  engineVersion: "3984be1",
  computedAt: "2026-03-17T23:10:00Z",
  calc: { daily_ot_at: 8, weekly_ot_at: 40, jurisdiction_key: "US-CA" },
};

const MONEY_OK = { amount: 292.5, moneyWithheld: false, flags: [] };

/**
 * 🚨 The advisory case. The amount is **absent**, `moneyWithheld` is true so a null can never be
 * read as a zero, and the flag is a human sentence with the rule id behind it. A surface that
 * renders `$0` or `—` here is the exact defect SPEC-TIME §0 law 4 exists to prevent.
 */
const MONEY_WITHHELD = {
  amount: null,
  moneyWithheld: true,
  flags: [
    {
      code: "advisory_rule",
      class: "fair-workweek",
      ruleId: "8f2c1a90-4b3d-4c2e-9a10-2f7b6c5d4e3a",
      jurisdictionKey: "US-CA-LOS_ANGELES",
      message:
        "Los Angeles Fair Workweek parameters are still awaiting verification, so we cannot " +
        "calculate predictability pay for this line. The hours are correct and are paid.",
    },
  ],
};

const PUNCH_CLOCK_IN = {
  id: "aaaaaaa1-0000-4000-8000-000000000001",
  employmentId: EMPLOYMENT,
  positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000001",
  shiftId: null,
  punchKind: "clock_in",
  breakPaid: null,
  occurredAt: "2026-03-17T15:58:00Z",
  deviceReportedAt: "2026-03-17T15:58:04Z",
  serverReceivedAt: "2026-03-17T15:58:00Z",
  clockSkewAppliedSeconds: -4,
  source: "kiosk",
  tz: TZ,
  localWorkDate: "2026-03-17",
  jurisdictionKey: "US-CA",
  actorType: "kiosk_device",
  actorEmploymentId: null,
  actorUserId: null,
  actorDeviceId: "ddddddd1-0000-4000-8000-000000000001",
  actorNote: null,
  hasGeo: false,
  geoAccuracyM: null,
  hasPhoto: false,
  photoFileId: null,
  sourceIp: null,
  attestationKind: null,
  attestationResponse: {},
  voidedAt: null,
  voidedReason: null,
  voidedByPunchId: null,
  enteredReason: null,
  originalValues: {},
};

const CLOCK_STATE_IN = {
  employmentId: EMPLOYMENT,
  phase: "clocked_in",
  blocked: null,
  localWorkDate: "2026-03-17",
  tz: TZ,
  elapsedWorkedMinutes: 154,
  elapsedBreakMinutes: 0,
  dayTotalHours: 2.57,
  openChain: [PUNCH_CLOCK_IN],
  lastPunchAt: "2026-03-17T15:58:00Z",
  attestation: {
    requiredAtClockOut: true,
    promptVersion: "ca-meal-rest-v1",
    mealRuleResolved: true,
    mealMinimumMinutes: 30,
    mealWaiverOffered: false,
    restBreaksOwed: 2,
  },
  capture: { geoRequested: false, photoRequested: false, maxGeoAccuracyM: null },
  openExceptions: [],
  allowedKinds: ["clock_out", "break_start", "meal_start", "transfer"],
};

const EXCEPTION_VIOLATION = {
  id: "eeeeeee1-0000-4000-8000-000000000001",
  employmentId: EMPLOYMENT,
  employeeDisplayName: "Dana Ruiz",
  exceptionKind: "meal_not_provided",
  severity: "violation",
  resolutionState: "open",
  detectedAt: "2026-03-17T23:59:40Z",
  localWorkDate: "2026-03-17",
  tz: TZ,
  varianceMinutes: null,
  scheduledStartAt: null,
  scheduledEndAt: null,
  actualStartAt: null,
  actualEndAt: null,
  punchId: "aaaaaaa1-0000-4000-8000-000000000009",
  shiftId: null,
  workIntervalId: null,
  scheduleChangeId: null,
  correctiveActionId: null,
  resolutionNote: null,
  resolvedAt: null,
  resolvedByName: null,
  premiumEarningCodeId: "ccccccc1-0000-4000-8000-00000000000a",
  // 🚨 `excused` is ABSENT. A statutory-premium exception cannot be excused into nonexistence,
  // and an org cannot configure that away (SPEC-TIME §2.6).
  allowedResolutions: ["acknowledged", "corrected", "escalated", "closed"],
  message: "The clock-out attestation says no meal break was provided on a 9.5-hour shift.",
  isEstimate: false,
  workedAfterDenial: null,
};

export const HR_TIME_RPC_FIXTURES: Partial<Record<HrTimeRpcName, HrTimeRpcFixtureSet>> = {
  hr_clock_state: {
    happy: { ok: true, data: CLOCK_STATE_IN },
    empty: {
      ok: true,
      data: {
        ...CLOCK_STATE_IN,
        phase: "clocked_out",
        elapsedWorkedMinutes: 0,
        elapsedBreakMinutes: 0,
        dayTotalHours: 0,
        openChain: [],
        lastPunchAt: null,
        allowedKinds: ["clock_in"],
      },
    },
    // The `blocked` state is a SERVER fact and it always carries a door. A contractor is gated off
    // the punch lane entirely (§8) — and the surface is ABSENT, not disabled, with somewhere to go.
    edge: {
      ok: true,
      data: {
        ...CLOCK_STATE_IN,
        phase: "clocked_out",
        openChain: [],
        allowedKinds: [],
        blocked: {
          reason:
            "Contractors record time through their engagement, not the company time clock.",
          href: "/hr/me/engagement",
          hrefLabel: "Open your engagement",
        },
      },
    },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "hr.capability(uid,'time.read',employment) is false",
      user_message: "You do not have access to this person's clock. Ask an HR administrator for time.read.",
      details: { capability: "time.read" },
    },
  },

  hr_punch_record: {
    happy: {
      ok: true,
      data: {
        punch: PUNCH_CLOCK_IN,
        clockState: CLOCK_STATE_IN,
        exceptionsRaised: [],
        replayed: false,
      },
    },
    // 🚨 THE REPLAY. A duplicate submit — double tap, retry, offline replay — is a SUCCESS PATH.
    // The surface shows the SAME confirmation, never an error (§1.1, §3.4).
    edge: {
      ok: true,
      data: {
        punch: PUNCH_CLOCK_IN,
        clockState: CLOCK_STATE_IN,
        exceptionsRaised: [],
        replayed: true,
      },
    },
    // A near duplicate is a DIFFERENT key: it is WRITTEN, and flagged for a human to resolve.
    // Refusing it would lose a fact.
    empty: {
      ok: true,
      data: {
        punch: { ...PUNCH_CLOCK_IN, id: "aaaaaaa1-0000-4000-8000-000000000002" },
        clockState: CLOCK_STATE_IN,
        exceptionsRaised: [
          {
            ...EXCEPTION_VIOLATION,
            id: "eeeeeee1-0000-4000-8000-000000000002",
            exceptionKind: "missed_punch",
            severity: "warn",
            allowedResolutions: ["acknowledged", "excused", "corrected", "escalated", "closed"],
            message: "A second clock_in landed 74 seconds after the first. A human decides which to void.",
          },
        ],
        replayed: false,
      },
    },
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "punch kind clock_in is illegal from state clocked_in",
      user_message: "You are already clocked in. Clock out first, or tell your manager if that is wrong.",
      details: { current_phase: "clocked_in", attempted_kind: "clock_in" },
    },
  },

  hr_punch_correct: {
    happy: {
      ok: true,
      data: {
        voidedPunchIds: ["aaaaaaa1-0000-4000-8000-000000000001"],
        replacementPunchIds: ["aaaaaaa1-0000-4000-8000-00000000000b"],
        recomputedWorkweekIds: [WORKWEEK],
        exceptionsOpened: [],
        exceptionsClosed: ["eeeeeee1-0000-4000-8000-000000000002"],
        // One reasoned action, one reason, N audit trails — the count always equals the punch count.
        auditTrailCount: 1,
        employeeNotified: true,
        requiresReapproval: false,
      },
    },
    // The bulk case §4.1 ruled in: the same mistake across nine days, ONE reason, NINE audit trails.
    edge: {
      ok: true,
      data: {
        voidedPunchIds: Array.from({ length: 9 }, (_, i) => `aaaaaaa1-0000-4000-8000-00000000010${i}`),
        replacementPunchIds: Array.from({ length: 9 }, (_, i) => `aaaaaaa1-0000-4000-8000-00000000020${i}`),
        recomputedWorkweekIds: [WORKWEEK],
        exceptionsOpened: [],
        exceptionsClosed: [],
        auditTrailCount: 9,
        employeeNotified: true,
        // The period was already approved — the banner shows prior vs current and re-approval is required.
        requiresReapproval: true,
      },
    },
    empty: { ok: true, data: { voidedPunchIds: [], replacementPunchIds: [], recomputedWorkweekIds: [], exceptionsOpened: [], exceptionsClosed: [], auditTrailCount: 0, employeeNotified: false, requiresReapproval: false } },
    // 🚨 After lock the edit is ABSENT and the surface offers the adjustment lane instead.
    error: {
      ok: false,
      error: "hr_period_locked",
      message: "pay period 33333333-… is locked; corrections are hr.time_adjustment rows",
      user_message:
        "This pay period is locked. We can record a correction that lands in the next period and " +
        "stays tagged to this one.",
      details: { pay_period_id: PERIOD, state: "locked" },
    },
  },

  hr_punch_register: {
    happy: {
      ok: true,
      data: {
        rows: [
          PUNCH_CLOCK_IN,
          {
            ...PUNCH_CLOCK_IN,
            id: "aaaaaaa1-0000-4000-8000-000000000003",
            punchKind: "clock_out",
            occurredAt: "2026-03-18T00:03:00Z",
            // A void is RENDERED, struck through, with the voiding punch as a door. Never hidden —
            // a hidden void is a destroyed record.
            voidedAt: "2026-03-18T17:02:00Z",
            voidedReason: "Employee reported the real clock-out was 4:30pm.",
            voidedByPunchId: "aaaaaaa1-0000-4000-8000-00000000000b",
          },
        ],
        page: 1,
        pageSize: 50,
        totalRows: 2,
        hasMore: false,
      },
    },
    empty: { ok: true, data: { rows: [], page: 1, pageSize: 50, totalRows: 0, hasMore: false } },
    edge: {
      ok: true,
      data: {
        rows: [
          { ...PUNCH_CLOCK_IN, duplicateSuspectedGroup: "grp-1" },
          {
            ...PUNCH_CLOCK_IN,
            id: "aaaaaaa1-0000-4000-8000-000000000004",
            occurredAt: "2026-03-17T15:59:14Z",
            duplicateSuspectedGroup: "grp-1",
          },
        ],
        page: 1,
        pageSize: 50,
        totalRows: 2,
        hasMore: false,
      },
    },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "no read reach on the requested employments",
      user_message: "You can only see punches for people who report to you.",
      details: { capability: "time.read" },
    },
  },

  hr_timesheet_get: {
    happy: {
      ok: true,
      data: {
        employmentId: EMPLOYMENT,
        employeeDisplayName: "Dana Ruiz",
        payPeriod: {
          id: PERIOD,
          payGroupId: "44444444-4444-4444-8444-444444444444",
          payGroupName: "Semimonthly — Hourly",
          periodStartOn: "2026-03-16",
          periodEndOn: "2026-03-31",
          payDate: "2026-04-05",
          sequenceNumber: 6,
          state: "submitted",
          submittedAt: "2026-04-01T16:00:00Z",
          approvedAt: null,
          exportedAt: null,
          lockedAt: null,
          closedAt: null,
          reopenedAt: null,
          reopenReason: null,
          boundaryWorkweekIds: [WORKWEEK],
          counts: { employments: 41, approved: 38, open: 2, attested: 1, disputed: 0 },
        },
        rowState: "open",
        weeks: [
          {
            workweek: {
              id: WORKWEEK,
              employmentId: EMPLOYMENT,
              payGroupId: "44444444-4444-4444-8444-444444444444",
              weekStartAt: "2026-03-15T07:00:00Z",
              weekEndAt: "2026-03-22T07:00:00Z",
              weekStartLocalDate: "2026-03-15",
              weekStartDow: 0,
              weekStartTime: "00:00:00",
              tz: TZ,
              hoursWorked: 46,
              hoursRegular: 40,
              hoursOvertime: 5,
              hoursDoubletime: 1,
              hoursPaidLeave: 0,
              hoursUnpaidLeave: 0,
              hoursHoliday: 0,
              hoursOnCall: 0,
              hoursOfService: 46,
              weightedAverageRegularRate: null,
              multiRate: false,
              rateComponents: [],
              isFinal: false,
              // 🚨 The semimonthly boundary week (fixture OT-BOUND-01): OT is computed on the WHOLE
              // week and attributed to the period containing the week's END date.
              isBoundaryWeek: true,
              calc: CALC_OK,
              money: MONEY_OK,
            },
            days: [
              {
                localWorkDate: "2026-03-17",
                tz: TZ,
                intervals: [
                  {
                    id: "ffffff01-0000-4000-8000-000000000001",
                    employmentId: EMPLOYMENT,
                    positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000001",
                    positionTitle: "Line Cook",
                    workweekId: WORKWEEK,
                    payPeriodId: PERIOD,
                    intervalKind: "worked",
                    hoursCategory: "worked",
                    earningCodeId: "ccccccc1-0000-4000-8000-000000000001",
                    earningCodeName: "Regular",
                    earningCode: "REG",
                    startedAt: "2026-03-17T15:58:00Z",
                    endedAt: "2026-03-18T00:03:00Z",
                    localWorkDate: "2026-03-17",
                    tz: TZ,
                    hours: 8,
                    rate: 24.375,
                    isOvertime: false,
                    // Non-zero: the employee's own timesheet says so INLINE, not behind a hover.
                    roundingAppliedMinutes: 1,
                    rawStartedAt: "2026-03-17T15:58:00Z",
                    rawEndedAt: "2026-03-18T00:03:00Z",
                    sourcePunchIds: [PUNCH_CLOCK_IN.id],
                    attendanceExceptionId: null,
                    isCurrent: true,
                    supersededById: null,
                    calc: CALC_OK,
                    money: MONEY_OK,
                  },
                ],
                punches: [PUNCH_CLOCK_IN],
                totalHours: 8,
                hoursByCategory: { worked: 8, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
                roundingAppliedMinutes: 1,
                dst: { transition: false, sentence: null },
                crossesMidnight: false,
                continuesIntoDate: null,
                continuedFromDate: null,
                workdayAttribution: null,
                exceptions: [],
                scheduledHours: 8,
              },
            ],
            splitAtBoundary: false,
          },
        ],
        periodTotals: {
          totalHours: 46,
          hoursByCategory: { worked: 46, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
          hoursOvertime: 5,
          hoursDoubletime: 1,
          premiumLineCount: 0,
          boundaryNote:
            "One workweek straddles this period's edge. Overtime for that week is computed on the " +
            "whole week and attributed to the period containing the week's end date.",
        },
        attestation: {
          stepId: "99999999-0000-4000-8000-000000000001",
          canAttest: true,
          attestedAt: null,
          statementShown: null,
          statementToShow:
            "I confirm these hours are a complete and accurate record of the time I worked, " +
            "including all meal and rest breaks I was provided.",
        },
        dispute: null,
        editHistory: [],
        openExceptions: [],
        recomputedSinceApproval: null,
        noTimesheetReason: null,
      },
    },
    // Explicit sentence, never an empty grid (§2.2).
    empty: {
      ok: true,
      data: {
        employmentId: EMPLOYMENT,
        employeeDisplayName: "Sam Okafor",
        payPeriod: null,
        rowState: "open",
        weeks: [],
        periodTotals: {
          totalHours: 0,
          hoursByCategory: { worked: 0, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
          hoursOvertime: 0,
          hoursDoubletime: 0,
          premiumLineCount: 0,
          boundaryNote: null,
        },
        attestation: { stepId: null, canAttest: false, attestedAt: null, statementShown: null, statementToShow: null },
        dispute: null,
        editHistory: [],
        openExceptions: [],
        recomputedSinceApproval: null,
        noTimesheetReason:
          "This role is salaried and exempt, so there is no hourly timesheet to review.",
      },
    },
    error: {
      ok: false,
      error: "not_found",
      message: "employment out of reach",
      user_message: "We could not find that timesheet.",
      details: {},
    },

    /**
     * 🚨 THE UGLY-STATES FIXTURE — appended by the timesheet lane so every rule that is expensive
     * to discover late can be LOOKED AT on one screen rather than reasoned about:
     *
     *   • a **multi-rate** week (no single week rate exists, OT rides the weighted average);
     *   • a **spring-forward** day whose shift was 7 hours and not 8, with the server's sentence;
     *   • a **cross-midnight** pair — hours on the clock-in's date, the next day carrying the
     *     reciprocal marker and NOT repeating them;
     *   • a **workday attribution** where the 04:00 workday differs from the calendar day;
     *   • an **advisory** premium line: hours present, amount ABSENT, `moneyWithheld` true;
     *   • an interval with a **non-zero rounding delta** for the inline sentence;
     *   • a preserved **disagreement**, and **recomputed-since-approval**.
     */
    edge: {
      ok: true,
      data: {
        employmentId: EMPLOYMENT,
        employeeDisplayName: "Dana Ruiz",
        payPeriod: {
          id: PERIOD,
          payGroupId: "44444444-4444-4444-8444-444444444444",
          payGroupName: "Semimonthly — Hourly",
          periodStartOn: "2026-03-01",
          periodEndOn: "2026-03-15",
          payDate: "2026-03-20",
          sequenceNumber: 5,
          state: "approved",
          submittedAt: "2026-03-16T16:00:00Z",
          approvedAt: "2026-03-17T16:00:00Z",
          exportedAt: null,
          lockedAt: null,
          closedAt: null,
          reopenedAt: null,
          reopenReason: null,
          boundaryWorkweekIds: [WORKWEEK],
          counts: { employments: 41, approved: 38, open: 2, attested: 1, disputed: 1 },
        },
        rowState: "disputed",
        weeks: [
          {
            workweek: {
              id: WORKWEEK,
              employmentId: EMPLOYMENT,
              payGroupId: "44444444-4444-4444-8444-444444444444",
              weekStartAt: "2026-03-08T08:00:00Z",
              weekEndAt: "2026-03-15T07:00:00Z",
              weekStartLocalDate: "2026-03-08",
              // Stamped as a WEDNESDAY start: the org changed the setting later, and this week is
              // still cut the old way. The block header must say so.
              weekStartDow: 3,
              weekStartTime: "06:00:00",
              tz: TZ,
              hoursWorked: 43,
              hoursRegular: 40,
              hoursOvertime: 3,
              hoursDoubletime: 0,
              hoursPaidLeave: 8,
              hoursUnpaidLeave: 0,
              hoursHoliday: 0,
              hoursOnCall: 0,
              hoursOfService: 51,
              // 🚨 Multi-rate: the OT figure is a DOOR onto this breakdown, and no single week
              // rate is displayed anywhere, because there isn't one.
              weightedAverageRegularRate: 25.4186,
              multiRate: true,
              rateComponents: [
                { positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000001", positionTitle: "Line Cook", rate: 24.375, hours: 30, product: 731.25 },
                { positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000002", positionTitle: "Shift Lead", rate: 28, hours: 13, product: 364 },
              ],
              isFinal: false,
              isBoundaryWeek: true,
              calc: { ...CALC_OK, calc: { ...CALC_OK.calc, weighted_average_regular_rate: 25.4186, incomplete: [{ class: "exempt-status", fact: "the employee's FLSA exemption test result for this period" }] } },
              money: MONEY_OK,
            },
            // A shift crosses this week's start, so it renders in both blocks with the split stated.
            splitAtBoundary: true,
            days: [
              {
                // ── SPRING FORWARD. 7 hours, not 8. The sentence is the SERVER's.
                localWorkDate: "2026-03-08",
                tz: TZ,
                intervals: [
                  {
                    id: "ffffff01-0000-4000-8000-000000000101",
                    employmentId: EMPLOYMENT,
                    positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000001",
                    positionTitle: "Line Cook",
                    workweekId: WORKWEEK,
                    payPeriodId: PERIOD,
                    intervalKind: "worked",
                    hoursCategory: "worked",
                    earningCodeId: "ccccccc1-0000-4000-8000-000000000001",
                    earningCodeName: "Regular",
                    earningCode: "REG",
                    startedAt: "2026-03-08T06:00:00Z",
                    endedAt: "2026-03-08T13:00:00Z",
                    localWorkDate: "2026-03-08",
                    tz: TZ,
                    hours: 7,
                    rate: 24.375,
                    isOvertime: false,
                    roundingAppliedMinutes: 0,
                    rawStartedAt: "2026-03-08T06:00:00Z",
                    rawEndedAt: "2026-03-08T13:00:00Z",
                    sourcePunchIds: [PUNCH_CLOCK_IN.id],
                    attendanceExceptionId: null,
                    isCurrent: true,
                    supersededById: null,
                    calc: CALC_OK,
                    money: MONEY_OK,
                  },
                ],
                punches: [PUNCH_CLOCK_IN],
                totalHours: 7,
                hoursByCategory: { worked: 7, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
                roundingAppliedMinutes: 0,
                dst: {
                  transition: true,
                  sentence:
                    "Daylight saving: clocks moved forward one hour at 2:00 AM America/Los_Angeles. This shift was 7 hours, not the 8 the wall clock suggests.",
                },
                crossesMidnight: false,
                continuesIntoDate: null,
                continuedFromDate: null,
                workdayAttribution: null,
                exceptions: [],
                scheduledHours: 8,
              },
              {
                // ── CROSS-MIDNIGHT, and a 04:00 workday. Hours live HERE, on the clock-in's date.
                localWorkDate: "2026-03-10",
                tz: TZ,
                intervals: [
                  {
                    id: "ffffff01-0000-4000-8000-000000000102",
                    employmentId: EMPLOYMENT,
                    positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000001",
                    positionTitle: "Line Cook",
                    workweekId: WORKWEEK,
                    payPeriodId: PERIOD,
                    intervalKind: "worked",
                    hoursCategory: "worked",
                    earningCodeId: "ccccccc1-0000-4000-8000-000000000001",
                    earningCodeName: "Regular",
                    earningCode: "REG",
                    // 🚨 PAID differs from RAW, which is the whole point of the rounding case:
                    // recorded 6:58 PM–3:03 AM, paid 7:00 PM–3:00 AM. A fixture where the two
                    // pairs are identical renders "Recorded X. Paid X. +1 minute", which reads as
                    // a bug in the surface and hides a real one.
                    startedAt: "2026-03-11T02:00:00Z",
                    endedAt: "2026-03-11T10:00:00Z",
                    localWorkDate: "2026-03-10",
                    tz: TZ,
                    hours: 8,
                    rate: 24.375,
                    isOvertime: false,
                    // Non-zero → the inline sentence on the employee's own timesheet.
                    roundingAppliedMinutes: 1,
                    rawStartedAt: "2026-03-11T01:58:00Z",
                    rawEndedAt: "2026-03-11T10:03:00Z",
                    sourcePunchIds: [PUNCH_CLOCK_IN.id],
                    attendanceExceptionId: null,
                    isCurrent: true,
                    supersededById: null,
                    calc: CALC_OK,
                    money: MONEY_OK,
                  },
                  {
                    // A mid-shift TRANSFER: a second assignment, so the day view names both titles.
                    id: "ffffff01-0000-4000-8000-000000000103",
                    employmentId: EMPLOYMENT,
                    positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000002",
                    positionTitle: "Shift Lead",
                    workweekId: WORKWEEK,
                    payPeriodId: PERIOD,
                    intervalKind: "worked",
                    hoursCategory: "worked",
                    earningCodeId: "ccccccc1-0000-4000-8000-000000000002",
                    earningCodeName: "Overtime",
                    earningCode: "OT",
                    startedAt: "2026-03-11T10:03:00Z",
                    endedAt: "2026-03-11T13:03:00Z",
                    localWorkDate: "2026-03-10",
                    tz: TZ,
                    hours: 3,
                    rate: 28,
                    isOvertime: true,
                    roundingAppliedMinutes: 0,
                    rawStartedAt: "2026-03-11T10:03:00Z",
                    rawEndedAt: "2026-03-11T13:03:00Z",
                    sourcePunchIds: [PUNCH_CLOCK_IN.id],
                    attendanceExceptionId: null,
                    isCurrent: true,
                    supersededById: null,
                    calc: CALC_OK,
                    // Its OWN amount. Reusing the regular line's put $292.50 beside 3 hours at $28
                    // on screen — a figure a reader can see is wrong, which teaches them to distrust
                    // every other figure on the page. Fixtures have to be arithmetically plausible
                    // for a screenshot of one to mean anything.
                    money: { amount: 114.38, moneyWithheld: false, flags: [] },
                  },
                  {
                    // 🚨 THE ADVISORY PREMIUM LINE. Hours show. The amount is ABSENT — not 0, not —.
                    id: "ffffff01-0000-4000-8000-000000000104",
                    employmentId: EMPLOYMENT,
                    positionAssignmentId: null,
                    positionTitle: null,
                    workweekId: WORKWEEK,
                    payPeriodId: PERIOD,
                    intervalKind: "premium_only",
                    hoursCategory: "premium",
                    earningCodeId: "ccccccc1-0000-4000-8000-00000000000a",
                    earningCodeName: "Predictability pay",
                    earningCode: "PREDICT_PAY",
                    startedAt: null,
                    endedAt: null,
                    localWorkDate: "2026-03-10",
                    tz: TZ,
                    hours: 1,
                    rate: null,
                    isOvertime: false,
                    // Rounding NEVER applies to a premium line — it is 1.0 hours by statute.
                    roundingAppliedMinutes: 0,
                    rawStartedAt: null,
                    rawEndedAt: null,
                    sourcePunchIds: [],
                    attendanceExceptionId: "eeeeeee1-0000-4000-8000-000000000001",
                    isCurrent: true,
                    supersededById: null,
                    calc: CALC_OK,
                    money: MONEY_WITHHELD,
                  },
                ],
                punches: [PUNCH_CLOCK_IN],
                totalHours: 12,
                hoursByCategory: { worked: 11, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 1 },
                roundingAppliedMinutes: 1,
                dst: { transition: false, sentence: null },
                crossesMidnight: true,
                continuesIntoDate: "2026-03-11",
                continuedFromDate: null,
                workdayAttribution: { workdayStartLocal: "04:00", evaluatedWorkdayDate: "2026-03-10" },
                exceptions: [EXCEPTION_VIOLATION],
                scheduledHours: 8,
              },
              {
                // ── THE RECIPROCAL DAY. Marker only. The hours are NOT repeated — a week total that
                // double-counts a midnight crossing is the classic bug §9 rule 4 prevents.
                localWorkDate: "2026-03-11",
                tz: TZ,
                intervals: [],
                punches: [],
                totalHours: 0,
                hoursByCategory: { worked: 0, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
                roundingAppliedMinutes: 0,
                dst: { transition: false, sentence: null },
                crossesMidnight: false,
                continuesIntoDate: null,
                continuedFromDate: "2026-03-10",
                workdayAttribution: null,
                exceptions: [],
                scheduledHours: null,
              },
              {
                // Paid leave — counts toward hours of service, not toward FLSA overtime.
                localWorkDate: "2026-03-12",
                tz: TZ,
                intervals: [
                  {
                    id: "ffffff01-0000-4000-8000-000000000105",
                    employmentId: EMPLOYMENT,
                    positionAssignmentId: "bbbbbbb1-0000-4000-8000-000000000001",
                    positionTitle: "Line Cook",
                    workweekId: WORKWEEK,
                    payPeriodId: PERIOD,
                    intervalKind: "leave",
                    hoursCategory: "paid_leave",
                    earningCodeId: "ccccccc1-0000-4000-8000-000000000005",
                    earningCodeName: "Sick",
                    earningCode: "SICK",
                    startedAt: null,
                    endedAt: null,
                    localWorkDate: "2026-03-12",
                    tz: TZ,
                    hours: 8,
                    rate: 24.375,
                    isOvertime: false,
                    roundingAppliedMinutes: 0,
                    rawStartedAt: null,
                    rawEndedAt: null,
                    sourcePunchIds: [],
                    attendanceExceptionId: null,
                    isCurrent: true,
                    supersededById: null,
                    calc: CALC_OK,
                    money: MONEY_OK,
                  },
                ],
                punches: [],
                totalHours: 8,
                hoursByCategory: { worked: 0, paid_leave: 8, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
                roundingAppliedMinutes: 0,
                dst: { transition: false, sentence: null },
                crossesMidnight: false,
                continuesIntoDate: null,
                continuedFromDate: null,
                workdayAttribution: null,
                exceptions: [],
                scheduledHours: 8,
              },
            ],
          },
        ],
        periodTotals: {
          totalHours: 51,
          hoursByCategory: { worked: 43, paid_leave: 8, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 1 },
          hoursOvertime: 3,
          hoursDoubletime: 0,
          premiumLineCount: 1,
          boundaryNote:
            "One workweek straddles this period's edge. Overtime for that week is computed on the whole week and attributed to the period containing the week's end date.",
        },
        attestation: {
          stepId: "99999999-0000-4000-8000-000000000001",
          canAttest: false,
          attestedAt: "2026-03-16T15:20:00Z",
          // 🚨 STORED AS SHOWN. The org has since edited its statement; this is what Dana agreed to,
          // and it must never be retroactively replaced by the current text.
          statementShown:
            "I confirm these hours are complete and accurate, including every meal and rest break I was provided.",
          statementToShow:
            "I confirm these hours are a complete and accurate record of the time I worked, including all meal and rest breaks I was provided.",
        },
        dispute: {
          disputedAt: "2026-03-16T15:20:00Z",
          disputeNote:
            "Wednesday shows 8 hours but I worked until 6, not 4:30. I clocked out on the tablet and it did not take.",
          disputeResolution: null,
          disputeResolvedAt: null,
          disputeResolvedByName: null,
        },
        editHistory: [
          {
            at: "2026-03-16T22:05:00Z",
            byName: "Priya Anand",
            reason: "Employee reported the tablet did not record the clock-out.",
            field: "clock_out",
            originalValue: "4:30 PM PDT",
            newValue: "6:00 PM PDT",
            voidedPunchId: "aaaaaaa1-0000-4000-8000-000000000003",
            replacementPunchId: "aaaaaaa1-0000-4000-8000-00000000000b",
            rateAtTime: 24.375,
          },
        ],
        openExceptions: [EXCEPTION_VIOLATION],
        // 🚨 Recomputed AFTER approval: the banner shows prior vs current, and re-approval is required.
        recomputedSinceApproval: {
          at: "2026-03-18T17:30:00Z",
          byName: "Priya Anand",
          priorTotalHours: 49.5,
          currentTotalHours: 51,
        },
        noTimesheetReason: null,
      },
    },
  },

  hr_timesheet_period_grid: {
    happy: {
      ok: true,
      data: {
        rows: [
          {
            employmentId: EMPLOYMENT,
            employeeDisplayName: "Dana Ruiz",
            employeeNumber: "E-1042",
            departmentName: "Kitchen",
            locationName: "Fremont",
            managerName: "Priya Anand",
            state: "attested",
            openStepId: "99999999-0000-4000-8000-000000000002",
            totalHours: 46,
            hoursByCategory: { worked: 46, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
            hoursOvertime: 5,
            hoursDoubletime: 1,
            premiumLineCount: 0,
            openExceptionCountsByKind: {},
            openExceptionCount: 0,
            hasDispute: false,
            hasAutoClosedPunch: false,
            recomputedSinceApproval: false,
            varianceMinutes: 22,
            scheduledHours: 45.6,
          },
          {
            employmentId: "11111111-1111-4111-8111-111111111112",
            employeeDisplayName: "Sam Okafor",
            employeeNumber: "E-1088",
            departmentName: "Front of house",
            locationName: "Fremont",
            managerName: "Priya Anand",
            state: "disputed",
            openStepId: "99999999-0000-4000-8000-000000000003",
            totalHours: 38.5,
            hoursByCategory: { worked: 38.5, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 1 },
            hoursOvertime: 0,
            hoursDoubletime: 0,
            premiumLineCount: 1,
            openExceptionCountsByKind: { meal_not_provided: 1 },
            openExceptionCount: 1,
            hasDispute: true,
            hasAutoClosedPunch: true,
            recomputedSinceApproval: false,
            // 🚨 null renders as "Not scheduled" — NEVER 0, which reads as perfect adherence.
            varianceMinutes: null,
            scheduledHours: null,
          },
        ],
        page: 1,
        pageSize: 50,
        totalRows: 2,
        hasMore: false,
      },
    },
    empty: { ok: true, data: { rows: [], page: 1, pageSize: 50, totalRows: 0, hasMore: false } },
    edge: {
      ok: true,
      data: {
        rows: [
          {
            employmentId: EMPLOYMENT,
            employeeDisplayName: "Dana Ruiz",
            employeeNumber: "E-1042",
            departmentName: "Kitchen",
            locationName: "Fremont",
            managerName: "Priya Anand",
            state: "approved",
            openStepId: null,
            totalHours: 46,
            hoursByCategory: { worked: 46, paid_leave: 0, unpaid_leave: 0, holiday: 0, on_call: 0, premium: 0 },
            hoursOvertime: 5,
            hoursDoubletime: 1,
            premiumLineCount: 0,
            openExceptionCountsByKind: { unapproved_overtime: 1 },
            openExceptionCount: 1,
            hasDispute: false,
            hasAutoClosedPunch: false,
            // Recomputed after approval — the row must show prior vs current and be re-approved.
            recomputedSinceApproval: true,
            varianceMinutes: -35,
            scheduledHours: 46.6,
          },
        ],
        page: 1,
        pageSize: 50,
        totalRows: 1,
        hasMore: false,
      },
    },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "caller holds timecard_approve nowhere in this pay group",
      user_message: "You do not approve timecards for this pay group.",
      details: { capability: "timecard_approve" },
    },
  },

  hr_attendance_exception_resolve: {
    happy: {
      ok: true,
      data: {
        exception: { ...EXCEPTION_VIOLATION, resolutionState: "corrected", resolvedAt: "2026-04-01T18:00:00Z", resolvedByName: "Priya Anand" },
        // The premium line the resolution wrote. Meal + rest on one day are TWO lines, never merged.
        intervalsWritten: [
          {
            id: "ffffff01-0000-4000-8000-00000000000a",
            hoursCategory: "premium",
            intervalKind: "premium_only",
            earningCode: "MEAL_PREMIUM",
            earningCodeName: "Meal premium",
            hours: 1,
            isOvertime: false,
            roundingAppliedMinutes: 0,
            money: MONEY_OK,
            calc: CALC_OK,
          },
        ],
      },
    },
    empty: { ok: true, data: { exception: { ...EXCEPTION_VIOLATION, resolutionState: "acknowledged" }, intervalsWritten: [] } },
    // 🚨 The refusal that must exist: `excused` on a statutory violation.
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "excused is not a legal resolution for severity=violation",
      user_message:
        "A missed meal break is a statutory violation and cannot be excused. Correct the record, " +
        "or close it with the premium paid.",
      details: { severity: "violation", exception_kind: "meal_not_provided" },
    },
    edge: {
      ok: true,
      data: {
        exception: { ...EXCEPTION_VIOLATION, resolutionState: "corrected" },
        intervalsWritten: [
          { id: "ffffff01-0000-4000-8000-00000000000a", earningCode: "MEAL_PREMIUM", earningCodeName: "Meal premium", hoursCategory: "premium", intervalKind: "premium_only", hours: 1, isOvertime: false, roundingAppliedMinutes: 0, money: MONEY_WITHHELD, calc: CALC_OK },
        ],
      },
    },
  },

  hr_pay_period_transition: {
    happy: {
      ok: true,
      data: { payPeriodId: PERIOD, fromState: "submitted", toState: "approved", disputesOpen: 3, transitionedAt: "2026-04-02T17:00:00Z" },
    },
    // Approving over a preserved disagreement is legitimate AND recorded — the surface says so.
    edge: {
      ok: true,
      data: { payPeriodId: PERIOD, fromState: "locked", toState: "reopened", disputesOpen: 0, transitionedAt: "2026-04-09T17:00:00Z", notice: "Reopening does not un-export and does not re-pay. A delivered export is never regenerated; the fix is an adjustment." },
    },
    empty: { ok: true, data: { payPeriodId: PERIOD, fromState: "open", toState: "submitted", disputesOpen: 0, transitionedAt: "2026-04-01T16:00:00Z" } },
    error: {
      ok: false,
      error: "hr_state_conflict",
      message: "2 employments are still open",
      user_message: "Two timecards are still open. Every timecard must be decided before the period is approved.",
      details: { open_employment_count: 2 },
    },
  },

  hr_time_adjustment_create: {
    happy: {
      ok: true,
      data: {
        adjustmentId: "77777777-0000-4000-8000-000000000001",
        originalPayPeriodId: PERIOD,
        targetPayPeriodId: "33333333-3333-4333-8333-333333333334",
        workflowInstanceId: "88888888-0000-4000-8000-000000000001",
        hoursDelta: 1.5,
      },
    },
    empty: { ok: true, data: { adjustmentId: null, originalPayPeriodId: PERIOD, targetPayPeriodId: null, workflowInstanceId: null, hoursDelta: 0 } },
    // The adjustment lane only exists AFTER lock — before it, the correction is a punch edit.
    error: {
      ok: false,
      error: "hr_state_conflict",
      message: "original period is submitted, not locked/closed",
      user_message: "This period is still open, so correct the punch directly instead of filing an adjustment.",
      details: { state: "submitted" },
    },
    edge: {
      ok: true,
      data: { adjustmentId: "77777777-0000-4000-8000-000000000002", originalPayPeriodId: PERIOD, targetPayPeriodId: "33333333-3333-4333-8333-333333333334", workflowInstanceId: "88888888-0000-4000-8000-000000000002", hoursDelta: -2 },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // APPENDED BY THE TIMESHEET/PUNCH/EXCEPTION LANE (routes 5, 28, 29, 30, 31).
  // Four cases each, same discipline. Nothing below simulates behaviour — each entry is a payload
  // the corresponding RPC could return, chosen for the edges that are expensive to discover late.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The approval grid's HEADER read. It is a `hr_pay_period_*` contract, so the periods lane owns
   * the shape; these four cases exist because route 28 needs the header's own state machine and its
   * "N of M approved" figure, and a missing fixture throws rather than degrading.
   */
  hr_attendance_exception_list: {
    happy: {
      ok: true,
      data: {
        rows: [
          EXCEPTION_VIOLATION,
          {
            ...EXCEPTION_VIOLATION,
            id: "eeeeeee1-0000-4000-8000-000000000011",
            employeeDisplayName: "Sam Okafor",
            employmentId: "11111111-1111-4111-8111-111111111112",
            exceptionKind: "late_arrival",
            severity: "warn",
            varianceMinutes: 18,
            scheduledStartAt: "2026-03-17T16:00:00Z",
            actualStartAt: "2026-03-17T16:18:00Z",
            premiumEarningCodeId: null,
            allowedResolutions: ["acknowledged", "excused", "corrected", "escalated", "closed"],
            message: "Clocked in 18 minutes after the scheduled start of a 9:00 AM shift.",
          },
          {
            ...EXCEPTION_VIOLATION,
            id: "eeeeeee1-0000-4000-8000-000000000012",
            employeeDisplayName: "Ari Bennett",
            exceptionKind: "auto_closed_estimate",
            severity: "warn",
            premiumEarningCodeId: null,
            // 🚨 An estimate never becomes a measurement, however it is resolved.
            isEstimate: true,
            allowedResolutions: ["acknowledged", "excused", "corrected", "escalated", "closed"],
            message:
              "No clock-out was recorded, so the shift was closed automatically at the scheduled end. This end time is an estimate.",
          },
        ],
        page: 1,
        pageSize: 50,
        totalRows: 3,
        hasMore: false,
      },
    },
    // 🚨 The empty state is a SENTENCE the surface prints, never a blank grid.
    empty: { ok: true, data: { rows: [], page: 1, pageSize: 50, totalRows: 0, hasMore: false } },
    // The linked-to-schedule-change state (§2.6) and an unapproved-overtime row carrying the
    // materially different fact that the employee worked AFTER a denial.
    edge: {
      ok: true,
      data: {
        rows: [
          {
            ...EXCEPTION_VIOLATION,
            id: "eeeeeee1-0000-4000-8000-000000000013",
            exceptionKind: "no_show",
            severity: "warn",
            scheduleChangeId: "5c5c5c5c-0000-4000-8000-000000000001",
            premiumEarningCodeId: null,
            allowedResolutions: ["acknowledged", "excused", "corrected", "escalated", "closed"],
            message:
              "The scheduled shift elapsed with no punches. The schedule was changed after publication.",
          },
          {
            ...EXCEPTION_VIOLATION,
            id: "eeeeeee1-0000-4000-8000-000000000014",
            exceptionKind: "unapproved_overtime",
            severity: "warn",
            premiumEarningCodeId: null,
            workedAfterDenial: true,
            allowedResolutions: ["acknowledged", "excused", "corrected", "escalated", "closed"],
            message:
              "6.0 hours of overtime were worked after an overtime request for these dates was denied. The hours are paid.",
          },
        ],
        page: 1,
        pageSize: 50,
        totalRows: 2,
        hasMore: false,
      },
    },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "no read reach on the requested employments",
      user_message: "You can only see attendance exceptions for people who report to you.",
      details: { capability: "time.read" },
    },
  },

  hr_wf_for_target: {
    happy: {
      ok: true,
      data: {
        steps: [
          {
            step_id: "99999999-0000-4000-8000-000000000001",
            instance_id: "88888888-0000-4000-8000-00000000000a",
            flow_key: "timecard_attestation",
            state: "active",
            // The only v1 step that sets it — an employee decides their OWN attestation step.
            allows_self: true,
          },
        ],
      },
    },
    empty: { ok: true, data: { steps: [] } },
    edge: {
      ok: true,
      data: {
        steps: [
          {
            step_id: "99999999-0000-4000-8000-000000000002",
            instance_id: "88888888-0000-4000-8000-00000000000b",
            flow_key: "timecard_approval",
            state: "active",
            allows_self: false,
          },
        ],
      },
    },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "caller cannot read this target's workflow",
      user_message: "You do not have access to this timecard's approval history.",
      details: {},
    },
  },

  hr_wf_decide: {
    happy: {
      ok: true,
      data: { stepId: "99999999-0000-4000-8000-000000000001", decision: "approve", state: "decided" },
    },
    // Attest WITH exception — the engine echoes the words back so the surface can show that the
    // disagreement was recorded, not swallowed.
    edge: {
      ok: true,
      data: {
        stepId: "99999999-0000-4000-8000-000000000001",
        decision: "approve",
        state: "decided",
        dispute_recorded: true,
        dispute_note: "Thursday shows 8 hours but I worked until 6, not 4:30.",
      },
    },
    empty: {
      ok: true,
      data: { stepId: "99999999-0000-4000-8000-000000000001", decision: "reject", state: "decided" },
    },
    // 🚨 The deadline behaviour: the tick auto-CLOSES an undecided step as `not_attested` and flags
    // it to the manager. It NEVER auto-attests, so a late click is refused rather than accepted.
    error: {
      ok: false,
      error: "hr_state_conflict",
      message: "step is not active",
      user_message:
        "The attestation window for this pay period has closed and your manager has been told it was not attested. Ask them to reopen it.",
      details: { state: "closed", closed_as: "not_attested" },
    },
  },

  hr_wf_bulk_decide: {
    happy: {
      ok: true,
      data: {
        outcomes: [
          { step_id: "99999999-0000-4000-8000-000000000002", granted: true, reason: null, detail: null },
          { step_id: "99999999-0000-4000-8000-000000000003", granted: true, reason: null, detail: null },
        ],
      },
    },
    // 🚨 PER-STEP OUTCOMES, NEVER ALL-OR-NOTHING (§6.3). A partial result is the NORMAL result, and
    // each failure carries its own reason so the manager knows which rows still need them.
    edge: {
      ok: true,
      data: {
        outcomes: [
          { step_id: "99999999-0000-4000-8000-000000000002", granted: true, reason: null, detail: null },
          {
            step_id: "99999999-0000-4000-8000-000000000003",
            granted: false,
            reason: "hr_state_conflict",
            detail: "A punch was corrected after this timecard was submitted. Review it again.",
          },
          {
            step_id: "99999999-0000-4000-8000-000000000004",
            granted: false,
            reason: "hr_capability_denied",
            detail: "You do not approve timecards for the Fremont location.",
          },
        ],
      },
    },
    empty: { ok: true, data: { outcomes: [] } },
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "bulk max exceeded",
      user_message: "You can approve up to 50 timecards at once. Narrow the selection and try again.",
      details: { bulk_max: 50 },
    },
  },

  hr_kiosk_claim_pairing: {
    happy: {
      ok: true,
      data: {
        deviceId: "ddddddd1-0000-4000-8000-000000000001",
        deviceSecret: "kdev_5f3a9c1e7b2d4a860f1c8e5b3a7d9042",
        organizationDisplayName: "Harbor Foods",
        locationName: "Fremont",
        trustState: "pending",
      },
    },
    // A failure sentence that leaks NOTHING — not whether the code existed, not whether it expired.
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "pairing code unknown, expired or already claimed",
      user_message: "That code did not work. Ask an administrator for a new pairing code.",
      details: {},
    },
    empty: {
      ok: false,
      error: "hr_validation_error",
      message: "kiosk disabled for this organization",
      user_message: "That code did not work. Ask an administrator for a new pairing code.",
      details: {},
    },
    edge: {
      ok: true,
      data: {
        deviceId: "ddddddd1-0000-4000-8000-000000000002",
        deviceSecret: "kdev_9b1e4c7a3f8d2650e4a7c1b9d3f60285",
        organizationDisplayName: "Harbor Foods",
        locationName: null,
        trustState: "pending",
      },
    },
  },

  hr_kiosk_authenticate: {
    /**
     * 🚨 `serverTime` IS READ FRESH, AND IT IS THE ONE FIELD IN THIS FILE THAT MUST BE.
     *
     * Every other value here is frozen on purpose — a fixture you cannot reason about is not a
     * fixture. `serverTime` is different in kind: its entire meaning is *"the server's clock, now"*,
     * and the kiosk measures its own clock against it and **refuses the punch** beyond
     * `maxClockSkewSeconds` (SPEC-TIME §3.3). Frozen at 2026-03-17, this fixture reports a skew of
     * months, so every kiosk punch built against it hits the clock-wrong refusal and **nothing
     * downstream of authentication is reachable at all** — not the PIN pad's result, not the
     * confirmation, not the replay, not the duplicate card.
     *
     * This is not business logic and it simulates nothing: the getter returns one clock reading,
     * verbatim, exactly as a live server would. (The frozen form is still worth having, and it is
     * what proved the skew refusal renders — see `../../kiosk/FEATURE.md`.)
     */
    happy: {
      ok: true,
      get data() {
        return {
          sessionToken: "ksess_2c9f7a1e5b3d8046",
          expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
          trustState: "trusted",
          serverTime: new Date().toISOString(),
          configVersion: "v3",
          config: {
            requirePhoto: false,
            requireGeo: false,
            maxClockSkewSeconds: 300,
            pinLength: 4,
            confirmDismissSeconds: 5,
            heartbeatSeconds: 60,
            locationName: "Fremont",
          },
        };
      },
    },
    // Untrusted: paired but not yet trusted. No punching until an administrator trusts it.
    empty: {
      ok: true,
      data: {
        sessionToken: null,
        expiresAt: null,
        trustState: "pending",
        serverTime: "2026-03-17T16:00:00Z",
        configVersion: "v3",
        config: { requirePhoto: false, requireGeo: false, maxClockSkewSeconds: 300, pinLength: 4, confirmDismissSeconds: 5, heartbeatSeconds: 60, locationName: "Fremont" },
      },
    },
    // 🚨 Revoked BRICKS the route: full-screen plain language, no PIN pad, no retry loop, and no
    // path to any other HR surface.
    edge: {
      ok: true,
      data: {
        sessionToken: null,
        expiresAt: null,
        trustState: "revoked",
        serverTime: "2026-03-17T16:00:00Z",
        configVersion: "v3",
        config: { requirePhoto: false, requireGeo: false, maxClockSkewSeconds: 300, pinLength: 4, confirmDismissSeconds: 5, heartbeatSeconds: 60, locationName: "Fremont" },
      },
    },
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "device secret mismatch",
      user_message: "This tablet is not set up. Ask an administrator to pair it again.",
      details: {},
    },
  },

  hr_kiosk_session_heartbeat: {
    // Same reasoning as `hr_kiosk_authenticate.happy`: the heartbeat's job is to RE-SYNC the clock,
    // and a heartbeat that hands back a frozen instant re-introduces the skew refusal every minute.
    happy: {
      ok: true,
      get data() {
        return { trustState: "trusted", serverTime: new Date().toISOString(), configVersion: "v3" };
      },
    },
    edge: { ok: true, data: { trustState: "revoked", serverTime: "2026-03-17T16:01:00Z", configVersion: "v3" } },
    empty: { ok: true, data: { trustState: "suspended", serverTime: "2026-03-17T16:01:00Z", configVersion: "v3" } },
    error: { ok: false, error: "hr_validation_error", message: "session invalid", user_message: "This tablet needs to be set up again.", details: {} },
  },

  hr_kiosk_punch: {
    happy: {
      ok: true,
      data: {
        employeeDisplayName: "Dana Ruiz",
        punchKind: "clock_in",
        occurredAtLocal: "8:02 AM",
        tz: TZ,
        replayed: false,
        capturedNotices: [],
        duplicateSuspected: null,
        attestationRequired: false,
      },
    },
    // ONE door: "That's not right" → a manager-attended correction. Never a silent second punch.
    edge: {
      ok: true,
      data: {
        employeeDisplayName: "Dana Ruiz",
        punchKind: "clock_in",
        occurredAtLocal: "8:03 AM",
        tz: TZ,
        replayed: false,
        capturedNotices: ["Photo recorded"],
        duplicateSuspected: {
          previousPunchLocalTime: "8:02 AM",
          message: "You already clocked in at 8:02am.",
        },
        attestationRequired: false,
      },
    },
    empty: {
      ok: true,
      data: { employeeDisplayName: "Dana Ruiz", punchKind: "clock_out", occurredAtLocal: "4:30 PM", tz: TZ, replayed: true, capturedNotices: [], duplicateSuspected: null, attestationRequired: true },
    },
    // 🚨 The lockout wording NEVER reveals whether a PIN exists.
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "pin rejected",
      user_message: "That did not work. Try again, or ask your manager for help.",
      details: {},
    },
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // LANE L3 / HRB-015 — routes 32, 33, 31a and 31b. Appended by the periods/exports/overtime lane.
  //
  // Chosen for the cases that are EXPENSIVE TO DISCOVER LATE: the period that refuses approval
  // because timecards are still open, the reopen that must state it does not re-pay, the
  // adjustment tagged to a locked period and paid in the next one, and — the one that matters most
  // in this whole feature — the overtime row that was worked without approval and is PAID.
  // ═════════════════════════════════════════════════════════════════════════════════════════════

  hr_pay_period_list: {
    happy: {
      ok: true,
      data: {
        rows: [
          {
            id: PERIOD, payGroupId: "44444444-0000-4000-8000-000000000001", payGroupName: "Hourly — Fremont",
            periodStartOn: "2026-03-01", periodEndOn: "2026-03-15", payDate: "2026-03-20",
            sequenceNumber: 6, state: "submitted",
            submittedAt: "2026-03-16T16:00:00Z", approvedAt: null, exportedAt: null, lockedAt: null,
            closedAt: null, reopenedAt: null, reopenReason: null,
            boundaryWorkweekIds: [WORKWEEK, "22222222-2222-4222-8222-222222222223"],
            counts: { employments: 288, approved: 285, open: 0, attested: 285, disputed: 3 },
          },
          {
            id: "33333333-3333-4333-8333-333333333334", payGroupId: "44444444-0000-4000-8000-000000000001",
            payGroupName: "Hourly — Fremont", periodStartOn: "2026-03-16", periodEndOn: "2026-03-31",
            payDate: "2026-04-05", sequenceNumber: 7, state: "open",
            submittedAt: null, approvedAt: null, exportedAt: null, lockedAt: null, closedAt: null,
            reopenedAt: null, reopenReason: null, boundaryWorkweekIds: [],
            counts: { employments: 288, approved: 0, open: 288, attested: 0, disputed: 0 },
          },
          {
            id: "33333333-3333-4333-8333-333333333332", payGroupId: "44444444-0000-4000-8000-000000000002",
            payGroupName: "Salaried — HQ", periodStartOn: "2026-02-16", periodEndOn: "2026-02-28",
            payDate: "2026-03-05", sequenceNumber: 5, state: "locked",
            submittedAt: "2026-03-01T16:00:00Z", approvedAt: "2026-03-02T17:00:00Z",
            exportedAt: "2026-03-02T18:10:00Z", lockedAt: "2026-03-03T09:00:00Z", closedAt: null,
            reopenedAt: null, reopenReason: null, boundaryWorkweekIds: [WORKWEEK],
            counts: { employments: 41, approved: 41, open: 0, attested: 41, disputed: 0 },
          },
        ],
        page: 1, pageSize: 50, totalRows: 3, hasMore: false,
      },
    },
    empty: { ok: true, data: { rows: [], page: 1, pageSize: 50, totalRows: 0, hasMore: false } },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "time.read not held",
      user_message: "You need the time.read capability to see pay periods.",
      details: { capability: "time.read" },
    },
    // A period that was REOPENED. The surface must state that this did not un-export or re-pay.
    edge: {
      ok: true,
      data: {
        rows: [
          {
            id: PERIOD, payGroupId: "44444444-0000-4000-8000-000000000001", payGroupName: "Hourly — Fremont",
            periodStartOn: "2026-03-01", periodEndOn: "2026-03-15", payDate: "2026-03-20",
            sequenceNumber: 6, state: "reopened",
            submittedAt: "2026-03-16T16:00:00Z", approvedAt: "2026-03-17T17:00:00Z",
            exportedAt: "2026-03-17T18:04:11Z", lockedAt: "2026-03-18T09:00:00Z", closedAt: null,
            reopenedAt: "2026-03-19T11:00:00Z",
            reopenReason: "Three clock-outs on 03-12 were recorded against the wrong assignment.",
            boundaryWorkweekIds: [WORKWEEK, "22222222-2222-4222-8222-222222222223"],
            counts: { employments: 288, approved: 288, open: 0, attested: 288, disputed: 1 },
          },
        ],
        page: 1, pageSize: 50, totalRows: 1, hasMore: false,
      },
    },
  },

  hr_pay_period_get: {
    // Approvable: nothing open. THREE disagreements — approval is allowed and the surface says so.
    happy: {
      ok: true,
      data: {
        id: PERIOD, payGroupId: "44444444-0000-4000-8000-000000000001", payGroupName: "Hourly — Fremont",
        periodStartOn: "2026-03-01", periodEndOn: "2026-03-15", payDate: "2026-03-20",
        sequenceNumber: 6, state: "submitted",
        submittedAt: "2026-03-16T16:00:00Z", approvedAt: null, exportedAt: null, lockedAt: null,
        closedAt: null, reopenedAt: null, reopenReason: null,
        boundaryWorkweekIds: [WORKWEEK, "22222222-2222-4222-8222-222222222223"],
        counts: { employments: 288, approved: 285, open: 0, attested: 285, disputed: 3 },
      },
    },
    // NOT approvable: two timecards still open. No boundary weeks — the "no straddle" panel state.
    empty: {
      ok: true,
      data: {
        id: PERIOD, payGroupId: "44444444-0000-4000-8000-000000000001", payGroupName: "Hourly — Fremont",
        periodStartOn: "2026-03-16", periodEndOn: "2026-03-31", payDate: "2026-04-05",
        sequenceNumber: 7, state: "submitted",
        submittedAt: "2026-04-01T16:00:00Z", approvedAt: null, exportedAt: null, lockedAt: null,
        closedAt: null, reopenedAt: null, reopenReason: null, boundaryWorkweekIds: [],
        counts: { employments: 288, approved: 286, open: 2, attested: 286, disputed: 0 },
      },
    },
    error: {
      ok: false,
      error: "not_found",
      message: "pay period not visible to caller",
      user_message: "We could not find that pay period.",
      details: {},
    },
    // LOCKED and exported: the adjustment lane is the only edit door, and reopen is the only exit.
    edge: {
      ok: true,
      data: {
        id: PERIOD, payGroupId: "44444444-0000-4000-8000-000000000001", payGroupName: "Hourly — Fremont",
        periodStartOn: "2026-03-01", periodEndOn: "2026-03-15", payDate: "2026-03-20",
        sequenceNumber: 6, state: "locked",
        submittedAt: "2026-03-16T16:00:00Z", approvedAt: "2026-03-17T17:00:00Z",
        exportedAt: "2026-03-17T18:04:11Z", lockedAt: "2026-03-18T09:00:00Z", closedAt: null,
        reopenedAt: null, reopenReason: null,
        boundaryWorkweekIds: [WORKWEEK, "22222222-2222-4222-8222-222222222223"],
        counts: { employments: 288, approved: 288, open: 0, attested: 288, disputed: 1 },
      },
    },
  },

  hr_time_adjustment_list: {
    happy: {
      ok: true,
      data: {
        rows: [
          {
            id: "77777777-0000-4000-8000-000000000001",
            employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz",
            originalPayPeriodId: PERIOD,
            targetPayPeriodId: "33333333-3333-4333-8333-333333333334",
            targetPeriodLabel: "16–31 March",
            workDate: "2026-03-12", earningCodeId: "55555555-0000-4000-8000-000000000001",
            earningCodeName: "Overtime", hoursDelta: 1.5, amountDelta: 65.25, amountWithheld: false,
            reasonCategoryName: "Missed punch",
            reasonNote: "Clock-out on 03-12 was recorded 90 minutes early; corrected after lock.",
            workflowInstanceId: "88888888-0000-4000-8000-000000000001",
            workflowState: "Awaiting payroll approval",
            createdAt: "2026-03-19T10:12:00Z", createdByName: "Priya Nair",
            exportedInExportId: null,
          },
        ],
        page: 1, pageSize: 50, totalRows: 1, hasMore: false,
      },
    },
    empty: { ok: true, data: { rows: [], page: 1, pageSize: 50, totalRows: 0, hasMore: false } },
    error: {
      ok: false,
      error: "hr_capability_denied",
      message: "time.read not held",
      user_message: "You need the time.read capability to see corrections.",
      details: { capability: "time.read" },
    },
    // 🚨 THE ADVISORY CASE: hours are correct and payable, the AMOUNT IS ABSENT, and `amountWithheld`
    // sits beside it so a null can never be read as a zero.
    edge: {
      ok: true,
      data: {
        rows: [
          {
            id: "77777777-0000-4000-8000-000000000002",
            employmentId: EMPLOYMENT, employeeDisplayName: "Marcus Bell",
            originalPayPeriodId: PERIOD,
            targetPayPeriodId: "33333333-3333-4333-8333-333333333334",
            targetPeriodLabel: "16–31 March",
            workDate: "2026-03-09", earningCodeId: "55555555-0000-4000-8000-000000000004",
            earningCodeName: "Predictability pay", hoursDelta: 1, amountDelta: null,
            amountWithheld: true,
            reasonCategoryName: "Schedule change",
            reasonNote: "Shift moved inside the notice window on 03-09.",
            workflowInstanceId: "88888888-0000-4000-8000-000000000002",
            workflowState: "Approved — rides the next export",
            createdAt: "2026-03-19T14:40:00Z", createdByName: "Priya Nair",
            exportedInExportId: null,
          },
        ],
        page: 1, pageSize: 50, totalRows: 1, hasMore: false,
      },
    },
  },

  hr_overtime_preapproval_list: {
    happy: {
      ok: true,
      data: {
        rows: [
          {
            id: "99999999-0000-4000-8000-000000000001",
            employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: WORKWEEK,
            requestedByName: "Dana Ruiz", requestKind: "advance",
            coversFrom: "2026-03-19T00:00:00Z", coversTo: "2026-03-20T00:00:00Z",
            requestedHours: 4, approvedHours: null, reasonNote: "Inventory count runs past close.",
            state: "requested", workflowInstanceId: "88888888-0000-4000-8000-000000000011",
            decidedAt: null, decidedByName: null, actualOtHours: null, varianceHours: null,
            unapprovedOtFlagged: false, correctiveActionId: null,
            thresholdAxes: ["weekly", "daily"], calc: CALC_OK,
          },
          {
            id: "99999999-0000-4000-8000-000000000002",
            employmentId: EMPLOYMENT, employeeDisplayName: "Marcus Bell", workweekId: WORKWEEK,
            requestedByName: "Priya Nair", requestKind: "advance",
            coversFrom: "2026-03-17T00:00:00Z", coversTo: "2026-03-18T00:00:00Z",
            requestedHours: 6, approvedHours: 4,
            reasonNote: "Coverage for a call-off; capped at four hours.",
            state: "approved", workflowInstanceId: "88888888-0000-4000-8000-000000000012",
            decidedAt: "2026-03-17T15:02:00Z", decidedByName: "Priya Nair",
            actualOtHours: 4, varianceHours: 0, unapprovedOtFlagged: false,
            correctiveActionId: null, thresholdAxes: ["weekly"], calc: CALC_OK,
          },
        ],
        page: 1, pageSize: 50, totalRows: 2, hasMore: false,
      },
    },
    empty: { ok: true, data: { rows: [], page: 1, pageSize: 50, totalRows: 0, hasMore: false } },
    // 🚨 Exempt employees never enter this lane — refused at validate, with the reason NAMED.
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "position assignment is FLSA-exempt",
      user_message:
        "This assignment is exempt from overtime, so there is no overtime to pre-approve.",
      details: { reason: "flsa_exempt" },
    },
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // 🚨 THE MOST IMPORTANT FIXTURE IN THIS FILE.
    //
    // Row 1: overtime worked AFTER A DENIAL. Row 2: overtime nobody asked about. Row 3: worked
    // BEYOND AN APPROVED CAP. All three carry `actualOtHours` intact and `unapprovedOtFlagged`
    // true, and there is NO field anywhere in this shape that could withhold, hold, zero or defer
    // payment — because unapproved overtime is still PAID and no fixture may suggest otherwise.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    edge: {
      ok: true,
      data: {
        rows: [
          {
            id: "99999999-0000-4000-8000-000000000003",
            employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: WORKWEEK,
            requestedByName: "Dana Ruiz", requestKind: "advance",
            coversFrom: "2026-03-18T00:00:00Z", coversTo: "2026-03-19T00:00:00Z",
            requestedHours: 3, approvedHours: null,
            reasonNote: "Asked to stay for the delivery.",
            state: "denied", workflowInstanceId: "88888888-0000-4000-8000-000000000013",
            decidedAt: "2026-03-18T14:00:00Z", decidedByName: "Priya Nair",
            actualOtHours: 3.75, varianceHours: 3.75, unapprovedOtFlagged: true,
            correctiveActionId: null, thresholdAxes: ["weekly", "daily"], calc: CALC_OK,
          },
          {
            id: "99999999-0000-4000-8000-000000000004",
            employmentId: EMPLOYMENT, employeeDisplayName: "Alex Whitfield", workweekId: WORKWEEK,
            requestedByName: "System", requestKind: "retroactive",
            coversFrom: "2026-03-16T00:00:00Z", coversTo: "2026-03-17T00:00:00Z",
            requestedHours: null, approvedHours: null, reasonNote: null,
            state: "auto_flagged", workflowInstanceId: null,
            decidedAt: null, decidedByName: null,
            actualOtHours: 2.25, varianceHours: 2.25, unapprovedOtFlagged: true,
            correctiveActionId: null, thresholdAxes: ["weekly"], calc: CALC_OK,
          },
          {
            id: "99999999-0000-4000-8000-000000000005",
            employmentId: EMPLOYMENT, employeeDisplayName: "Marcus Bell", workweekId: WORKWEEK,
            requestedByName: "Priya Nair", requestKind: "advance",
            coversFrom: "2026-03-17T00:00:00Z", coversTo: "2026-03-18T00:00:00Z",
            requestedHours: 6, approvedHours: 4,
            reasonNote: "Coverage for a call-off; capped at four hours.",
            state: "approved", workflowInstanceId: "88888888-0000-4000-8000-000000000012",
            decidedAt: "2026-03-17T15:02:00Z", decidedByName: "Priya Nair",
            actualOtHours: 5.5, varianceHours: 1.5, unapprovedOtFlagged: true,
            correctiveActionId: "aaaaaaa1-0000-4000-8000-000000000001",
            thresholdAxes: ["weekly", "daily"], calc: CALC_OK,
          },
        ],
        page: 1, pageSize: 50, totalRows: 3, hasMore: false,
      },
    },
  },

  hr_overtime_preapproval_get: {
    happy: {
      ok: true,
      data: {
        id: "99999999-0000-4000-8000-000000000001",
        employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: WORKWEEK,
        requestedByName: "Dana Ruiz", requestKind: "advance",
        coversFrom: "2026-03-19T00:00:00Z", coversTo: "2026-03-20T00:00:00Z",
        requestedHours: 4, approvedHours: null,
        reasonNote: "Inventory count runs past close.",
        state: "requested", workflowInstanceId: "88888888-0000-4000-8000-000000000011",
        decidedAt: null, decidedByName: null, actualOtHours: null, varianceHours: null,
        unapprovedOtFlagged: false, correctiveActionId: null,
        thresholdAxes: ["weekly", "daily"], calc: CALC_OK,
      },
    },
    empty: {
      ok: true,
      data: {
        id: "99999999-0000-4000-8000-000000000009",
        employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: null,
        requestedByName: "Dana Ruiz", requestKind: "advance",
        coversFrom: "2026-03-25T00:00:00Z", coversTo: "2026-03-26T00:00:00Z",
        requestedHours: null, approvedHours: null, reasonNote: null,
        state: "withdrawn", workflowInstanceId: null, decidedAt: null, decidedByName: null,
        actualOtHours: null, varianceHours: null, unapprovedOtFlagged: false,
        correctiveActionId: null, thresholdAxes: [], calc: CALC_OK,
      },
    },
    error: {
      ok: false,
      error: "not_found",
      message: "request not visible to caller",
      user_message: "We could not find that overtime request.",
      details: {},
    },
    // 🚨 WORKED AFTER A DENIAL — a materially different management fact from "nobody asked", and
    // still PAID. The decision panel renders this with the write-up door and the paid sentence.
    edge: {
      ok: true,
      data: {
        id: "99999999-0000-4000-8000-000000000003",
        employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: WORKWEEK,
        requestedByName: "Dana Ruiz", requestKind: "advance",
        coversFrom: "2026-03-18T00:00:00Z", coversTo: "2026-03-19T00:00:00Z",
        requestedHours: 3, approvedHours: null,
        reasonNote: "Asked to stay for the delivery.",
        state: "denied", workflowInstanceId: "88888888-0000-4000-8000-000000000013",
        decidedAt: "2026-03-18T14:00:00Z", decidedByName: "Priya Nair",
        actualOtHours: 3.75, varianceHours: 3.75, unapprovedOtFlagged: true,
        correctiveActionId: null, thresholdAxes: ["weekly", "daily"], calc: CALC_OK,
      },
    },
  },

  hr_overtime_preapproval_create: {
    happy: {
      ok: true,
      data: {
        id: "99999999-0000-4000-8000-000000000010",
        employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: WORKWEEK,
        requestedByName: "Dana Ruiz", requestKind: "advance",
        coversFrom: "2026-03-19T00:00:00Z", coversTo: "2026-03-20T00:00:00Z",
        requestedHours: 4, approvedHours: null, reasonNote: "Raised from an approaching-OT alert.",
        state: "requested", workflowInstanceId: "88888888-0000-4000-8000-000000000014",
        decidedAt: null, decidedByName: null, actualOtHours: null, varianceHours: null,
        unapprovedOtFlagged: false, correctiveActionId: null,
        thresholdAxes: ["weekly"], calc: CALC_OK,
      },
    },
    empty: {
      ok: true,
      data: {
        id: "99999999-0000-4000-8000-000000000011",
        employmentId: EMPLOYMENT, employeeDisplayName: "Dana Ruiz", workweekId: null,
        requestedByName: "Dana Ruiz", requestKind: "standing",
        coversFrom: "2026-03-19T00:00:00Z", coversTo: "2026-04-19T00:00:00Z",
        requestedHours: 0, approvedHours: null, reasonNote: "Standing authorization, no estimate.",
        state: "requested", workflowInstanceId: "88888888-0000-4000-8000-000000000015",
        decidedAt: null, decidedByName: null, actualOtHours: null, varianceHours: null,
        unapprovedOtFlagged: false, correctiveActionId: null, thresholdAxes: [], calc: CALC_OK,
      },
    },
    // 🚨 Exempt is refused AT VALIDATE with the reason named — never a silent no-op.
    error: {
      ok: false,
      error: "hr_validation_error",
      message: "position assignment is FLSA-exempt",
      user_message:
        "This assignment is exempt from overtime, so there is no overtime to pre-approve.",
      details: { reason: "flsa_exempt" },
    },
    // The date has entered a locked period — routed to the adjustment lane, not refused blankly.
    edge: {
      ok: false,
      error: "hr_period_locked",
      message: "covers_from is inside a locked pay period",
      user_message:
        "That date is in a locked pay period. We can record a correction that lands in the next period instead.",
      details: { pay_period_id: PERIOD, state: "locked" },
    },
  },
};
