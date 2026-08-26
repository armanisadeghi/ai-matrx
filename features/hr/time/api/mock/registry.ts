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
    happy: {
      ok: true,
      data: {
        sessionToken: "ksess_2c9f7a1e5b3d8046",
        expiresAt: "2026-03-18T04:00:00Z",
        trustState: "trusted",
        serverTime: "2026-03-17T16:00:00Z",
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
    happy: { ok: true, data: { trustState: "trusted", serverTime: "2026-03-17T16:01:00Z", configVersion: "v3" } },
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
};
