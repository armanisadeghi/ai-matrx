/**
 * features/hr/time/api/types.ts — the RPC-lane contract for Time & Attendance.
 *
 * SPEC-CONTRACTS §2.2 splits HR into two lanes and this file is the **direct** half. Punches,
 * clock state, timesheet reads, period transitions, corrections and exception resolution are
 * ordinary CRUD with a domain idempotency key, so they go **client → Supabase**, never through the
 * Python server (routing ordinary CRUD through aidream is a defect, not a safety measure). The
 * engine half — recompute, the exception scan, the OT evaluator, the calc endpoints — is
 * `lib/api/hr-contract-client.ts` and is not modelled here.
 *
 * 🚨 WHY THESE TYPES ARE HAND-WRITTEN, AND WHAT REPLACES THEM
 * -----------------------------------------------------------
 * The `hr` schema is **not exposed to PostgREST.** Verified live 2026-08-26 against
 * `pgrst.db_schemas` on the `authenticator` role: the list carries 50-odd schemas and `hr` is not
 * among them, so `supabase.schema("hr")` and `.rpc("hr.x")` reach nothing from a browser. Adding a
 * schema to that list replaces the whole value and a dropped name is an instant platform-wide
 * PGRST002 outage — it is a fleet-wide config change and explicitly **not a build lane's call**
 * (FREEZE §4 D-10 recorded exactly this for `esign`).
 *
 * The consequence, and it is the whole reason this file exists: **every RPC this lane calls is a
 * thin `public.hr_<name>` wrapper** over a body in `hr.<name>`. That is the live platform pattern
 * (`hr_kiosk_authenticate`, `hr_confidential_get`) and exactly what R-L3 U-03 ruled — `hr.<name>`
 * in SQL, `hr_<name>` at the call site, never a third form.
 *
 * Those wrappers are being built now, so `Database["public"]["Functions"]` does not yet carry them.
 * These types are therefore written from the specs, and **they are temporary by construction**:
 * when the wrappers land and `pnpm db-types` regenerates, the generated `Returns` types become the
 * source of truth and the diff against this file is the drift detector. Narrowing a generated type
 * to match this file would destroy that signal — fix this file instead.
 *
 * 🚨 THE LAW THIS FILE IS SHAPED BY (SPEC-TIME §0 law 6, §9.2, D1)
 * ----------------------------------------------------------------
 * **No client computes hours, overtime, premiums, rounding, categorization or a weighted average.**
 * Every number below arrives computed. There is no `startedAt`/`endedAt` pair here that a component
 * is invited to subtract — `hours` is always present beside them, because subtracting
 * `ended_at − started_at` in a browser returns 8 for a spring-forward night shift that was 7
 * (fixture `OT-DST-01`), and it is a defect wherever it appears. The one permitted client-side
 * figure is a **preview** total from a `prospective` calc call, visibly labelled as a preview.
 *
 * The native HR mobile app (D1) consumes this identical contract. A behaviour that could only be
 * described by naming a React component is a defect in the build, exactly as it is in the spec.
 */

// ---------------------------------------------------------------------------------------------
// Vocabularies — text + CHECK in Postgres, never enums. Verified live 2026-08-26.
// ---------------------------------------------------------------------------------------------

export type PunchKind =
  | "clock_in"
  | "clock_out"
  | "break_start"
  | "break_end"
  | "meal_start"
  | "meal_end"
  | "transfer";

export type PunchSource = "web" | "kiosk" | "mobile" | "manager_entry" | "import" | "auto_close";

export type ActorType =
  | "employee"
  | "manager"
  | "hr_admin"
  | "kiosk_device"
  | "external_signer"
  | "integration"
  | "automation"
  | "ai_agent"
  | "platform_admin";

export type AttestationKind =
  | "meal_taken"
  | "meal_waived"
  | "meal_interrupted"
  | "rest_taken"
  | "rest_missed"
  | "hours_confirmed";

/** SPEC-TIME §3.1. `transfer` is legal only from `clocked_in` and does not change the state. */
export type ClockPhase =
  | "clocked_out"
  | "clocked_in"
  | "on_paid_break"
  | "on_unpaid_break"
  | "on_meal";

/**
 * The eight UI states of SPEC-TIME §2.1. Five come from the server's clock phase; `attesting`,
 * `offline` and `error` are transport/interaction states the widget is in, not facts about the
 * employee. `blocked` is a **server** fact — it carries a reason and a door.
 */
export type ClockWidgetState = ClockPhase | "attesting" | "blocked" | "offline" | "error";

export type HoursCategory =
  | "worked"
  | "paid_leave"
  | "unpaid_leave"
  | "holiday"
  | "on_call"
  | "premium";

export type IntervalKind =
  | "worked"
  | "paid_break"
  | "unpaid_break"
  | "leave"
  | "holiday"
  | "on_call"
  | "premium_only";

export type PayPeriodState =
  | "open"
  | "submitted"
  | "approved"
  | "exported"
  | "locked"
  | "closed"
  | "reopened";

/**
 * 🚨 Two different state machines, and SPEC-TIME §14 D8 rules that the surface must label them
 * distinctly: the **row** state is this, the **header** state is {@link PayPeriodState}.
 * `submitted` is a period state and is **never** a row state, and there is no `reopened` member —
 * a reopened period leaves its rows `approved` and reopens their workflow steps (R-L3 U-13).
 * Inventing a row-level reopened chip is the mistake this comment exists to prevent.
 */
export type PayPeriodEmploymentState =
  | "open"
  | "attested"
  | "disputed"
  | "approved"
  | "exported"
  | "locked";

export type AttendanceExceptionKind =
  | "late_arrival"
  | "early_departure"
  | "no_show"
  | "unscheduled_work"
  | "missed_punch"
  | "orphan_punch"
  | "auto_closed_estimate"
  | "unapproved_overtime"
  | "worked_through_break"
  | "meal_not_provided"
  | "rest_not_provided"
  | "over_scheduled_hours"
  | "call_off"
  | "left_early_approved"
  | "ip_verification_failed";

export type ExceptionSeverity = "info" | "warn" | "violation";

export type ExceptionResolutionState =
  | "open"
  | "acknowledged"
  | "excused"
  | "corrected"
  | "escalated"
  | "closed";

export type KioskTrustState = "pending" | "trusted" | "suspended" | "revoked";

export type OvertimePreapprovalState =
  | "requested"
  | "approved"
  | "denied"
  | "expired"
  | "withdrawn"
  | "auto_flagged";

// ---------------------------------------------------------------------------------------------
// The calculation block — AR2 LOCK 6
// ---------------------------------------------------------------------------------------------

/**
 * 🚨 **Every computed number carries its rule snapshot.** A figure rendered without a path to
 * `ruleVersionIds`, `engineKey`, `engineVersion` and `calc` is an **unfinished surface**
 * (SPEC-TIME §0 law 2). Every OT, DT and premium figure on screen is a door that opens this.
 */
export interface CalcBlock {
  ruleVersionIds: string[];
  engineKey: string | null;
  engineVersion: string | null;
  computedAt: string | null;
  /** Engine inputs and intermediates. Free-form by design — the drawer renders it, nothing parses it. */
  calc: Record<string, unknown>;
  /** Present on any interval derived from an auto-closed punch, and it NEVER goes away. */
  autoCloseEstimate?: boolean;
  /** Which `hr.auto_close_rule` matched, stamped at close (SPEC-TIME §4.2 ruling). */
  autoCloseRuleId?: string | null;
}

/**
 * A rule the engine could not treat as authoritative. Rendered as a **visible human sentence with
 * a door to the rule** — never swallowed, never collapsed into a tooltip.
 */
export interface CalcFlag {
  code: string;
  class: string;
  ruleId: string | null;
  jurisdictionKey: string | null;
  message: string;
}

/** A required applicability fact the resolver did not have. Rendered, never swallowed. */
export interface IncompleteFact {
  class: string;
  fact: string;
}

/**
 * 🚨 **Money is ABSENT when a contributing rule is advisory** — never a zero, never a dash, never
 * a guess (SPEC-TIME §0 law 4, SPEC-JURISDICTION §7.3 invariant 2). `amount` is therefore nullable
 * everywhere, and `moneyWithheld` sits beside it so a null can never be silently read as a zero.
 * Where this is true the surface shows the **hours**, omits the amount, and renders the flag.
 */
export interface MoneyBearing {
  amount: number | null;
  moneyWithheld: boolean;
  flags: CalcFlag[];
}

// ---------------------------------------------------------------------------------------------
// The punch lane
// ---------------------------------------------------------------------------------------------

/**
 * One raw punch. **Raw is raw** (AD-11 / AR2 LOCK 5): `hr.punch` is immutable except for its three
 * void columns, and a correction is a void plus a new punch. A voided punch is **rendered struck
 * through with the voiding punch as a door, never hidden** — a hidden void is a destroyed record.
 */
export interface PunchRow {
  id: string;
  employmentId: string;
  positionAssignmentId: string | null;
  shiftId: string | null;
  punchKind: PunchKind;
  breakPaid: boolean | null;

  /** The corrected truth. Render it in {@link tz}, never the viewer's browser timezone. */
  occurredAt: string;
  /** What the device claimed. Kept raw forever — the raw claim is a raw fact. */
  deviceReportedAt: string | null;
  serverReceivedAt: string;
  clockSkewAppliedSeconds: number;

  source: PunchSource;
  /** IANA zone stamped at write. A New York manager reviewing a California punch sees California time. */
  tz: string;
  /** The day this punch is attributed to. A cross-midnight shift belongs to its clock-in's date. */
  localWorkDate: string;
  jurisdictionKey: string | null;

  actorType: ActorType;
  actorEmploymentId: string | null;
  actorUserId: string | null;
  actorDeviceId: string | null;
  actorNote: string | null;

  /** Presence only in lists — the coordinates are behind the same gate as any employee image. */
  hasGeo: boolean;
  geoAccuracyM: number | null;
  hasPhoto: boolean;
  photoFileId: string | null;
  /**
   * Shown on the evidence lane to viewers with punch-edit authority, and to an employee for their
   * own punches. **Never** in the directory, never in a list a peer can see, never in an analytics
   * payload (SPEC-TIME §4.7 privacy posture).
   */
  sourceIp: string | null;

  attestationKind: AttestationKind | null;
  /**
   * 🚨 **Authoritative.** `attestationKind` alone is NOT (SPEC-TIME §14 D9). A California clock-out
   * collects a meal answer, a rest answer and an hours confirmation in one dialog; a detector or a
   * renderer keying on `attestationKind = 'meal_waived'` misses every combined attestation and
   * under-reports premiums. Read the axes out of this object.
   */
  attestationResponse: AttestationResponse | Record<string, never>;

  voidedAt: string | null;
  voidedReason: string | null;
  voidedByPunchId: string | null;
  enteredReason: string | null;
  originalValues: Record<string, unknown>;

  /** Set by the register's near-duplicate grouping (§3.4) — a real second punch, flagged for a human. */
  duplicateSuspectedGroup?: string | null;
}

/**
 * The combined clock-out attestation, SPEC-TIME §3.2's declared shape. The card **shows the total
 * it is asking about** — an attestation to an unstated number is not an attestation.
 */
export interface AttestationResponse {
  prompt_version: string;
  asked_at: string;
  answered_at: string;
  meal?: {
    required: boolean;
    provided: boolean;
    taken: boolean;
    /** Offered **only** where the resolved rule permits a waiver for that shift length — absent, not greyed. */
    waived: boolean;
    interrupted: boolean;
  };
  rest?: { count_owed: number; count_taken: number; missed: boolean };
  hours?: {
    confirmed: boolean;
    shown_total_hours: number;
    /** Answering "hours are wrong" NEVER blocks a clock-out. It becomes a disagreement. */
    disagreement_note: string | null;
  };
  /** The remote-worker attestation of §4.7 when `remote_worker_validation = 'attest'`. */
  location?: { statement: string };
  rules?: { rule_version_ids: string[]; jurisdiction_key: string };
}

/**
 * `hr_clock_state` — the single read every clock surface mounts on. The widget **renders this and
 * derives no state of its own** (SPEC-TIME §2.1).
 */
export interface ClockState {
  employmentId: string;
  phase: ClockPhase;
  /** Set only when the server refuses the whole surface. Carries the sentence AND the door. */
  blocked: {
    reason: string;
    /** The door. "No dead ends" — a blocked employee must never be left with nowhere to go. */
    href: string | null;
    hrefLabel: string | null;
  } | null;

  localWorkDate: string;
  tz: string;
  /** Server-computed. The client never subtracts timestamps to produce these. */
  elapsedWorkedMinutes: number;
  elapsedBreakMinutes: number;
  dayTotalHours: number;

  openChain: PunchRow[];
  lastPunchAt: string | null;

  /** Whether a clock-out will present the attestation card, and what it may legally ask. */
  attestation: {
    requiredAtClockOut: boolean;
    promptVersion: string | null;
    mealRuleResolved: boolean;
    /** e.g. 30 — displayed as "30 minutes required in California". Null where no rule resolved. */
    mealMinimumMinutes: number | null;
    /** Absent where the resolved rule permits no waiver for this shift length. */
    mealWaiverOffered: boolean;
    restBreaksOwed: number | null;
  };

  /** Capture posture, so the surface can say so BEFORE the punch (SPEC-TIME §4.9, ruled). */
  capture: { geoRequested: boolean; photoRequested: boolean; maxGeoAccuracyM: number | null };

  openExceptions: AttendanceExceptionRow[];
  /** Which kinds the server will accept right now. The button's absence is courtesy; the refusal is the contract. */
  allowedKinds: PunchKind[];
}

/** What `hr_punch_record` answers with. A replay is a **success path**, not an error. */
export interface PunchRecordResult {
  punch: PunchRow;
  clockState: ClockState;
  exceptionsRaised: AttendanceExceptionRow[];
  /** True when the idempotency key collided. The UI shows the SAME confirmation, never an error. */
  replayed: boolean;
}

// ---------------------------------------------------------------------------------------------
// The computed lane
// ---------------------------------------------------------------------------------------------

/** One computed interval. `hours` is the server's answer; nothing here is derived in the browser. */
export interface WorkIntervalRow {
  id: string;
  employmentId: string;
  positionAssignmentId: string | null;
  positionTitle: string | null;
  workweekId: string;
  payPeriodId: string | null;
  intervalKind: IntervalKind;
  hoursCategory: HoursCategory;

  earningCodeId: string;
  /** 🚨 The label is ALWAYS this, never the enum token (LAW 3a: no cell prints a type name). */
  earningCodeName: string;
  earningCode: string;

  startedAt: string | null;
  endedAt: string | null;
  localWorkDate: string;
  tz: string;

  hours: number;
  rate: number | null;
  isOvertime: boolean;

  /**
   * How far the neutral rounding rule moved the raw pair. Non-zero means the cell carries a marker
   * and — on the employee's own timesheet — an **inline** sentence, not a hover:
   * *"Recorded 7:58–4:03. Paid 8:00–4:00. +1 minute."* An employee attesting to hours they cannot
   * see the derivation of is attesting to nothing.
   */
  roundingAppliedMinutes: number;
  rawStartedAt: string | null;
  rawEndedAt: string | null;

  sourcePunchIds: string[];
  /** For a `premium_only` line: the exception that produced it, as a door. */
  attendanceExceptionId: string | null;

  isCurrent: boolean;
  supersededById: string | null;

  calc: CalcBlock;
  money: MoneyBearing;
}

/** One (rate, hours) pair behind a weighted average. A single week rate is NEVER displayed. */
export interface RateComponent {
  positionAssignmentId: string | null;
  positionTitle: string | null;
  rate: number;
  hours: number;
  product: number;
}

/**
 * The OT unit (AR 1.5) — **not** the calendar week and **not** the pay period. `weekStartDow` and
 * `weekStartTime` are **stamped**, because an org that changed the setting later has weeks cut both
 * ways in its history, and the block header names the stamped values for exactly that reason.
 */
export interface WorkweekRow {
  id: string;
  employmentId: string;
  payGroupId: string;
  weekStartAt: string;
  weekEndAt: string;
  weekStartLocalDate: string;
  weekStartDow: number;
  weekStartTime: string;
  tz: string;

  hoursWorked: number;
  hoursRegular: number;
  hoursOvertime: number;
  hoursDoubletime: number;
  hoursPaidLeave: number;
  hoursUnpaidLeave: number;
  hoursHoliday: number;
  hoursOnCall: number;
  /** Tracked separately because ACA counts paid leave and FLSA does not. */
  hoursOfService: number;

  /** The FLSA multi-rate answer. A **door**, never a bare number. */
  weightedAverageRegularRate: number | null;
  /** True when the week spans more than one position assignment or rate. */
  multiRate: boolean;
  rateComponents: RateComponent[];

  isFinal: boolean;
  /** True when this week straddles the period edge; OT is attributed to the week's END date. */
  isBoundaryWeek: boolean;
  calc: CalcBlock;
  money: MoneyBearing;
}

/**
 * A day on a timesheet. 🚨 **Raw and computed are NEVER conflated** (AD-11): `intervals` and
 * `punches` are two separate blocks and the surface never interleaves them.
 */
export interface TimesheetDay {
  localWorkDate: string;
  tz: string;
  intervals: WorkIntervalRow[];
  punches: PunchRow[];
  totalHours: number;
  hoursByCategory: Record<HoursCategory, number>;
  roundingAppliedMinutes: number;

  /** SPEC-TIME §9. Every one of these is a server fact the renderer prints, never re-derives. */
  dst: {
    transition: boolean;
    /** e.g. "Daylight saving: clocks moved forward one hour at 2:00 AM America/Los_Angeles. This shift was 7 hours." */
    sentence: string | null;
  };
  crossesMidnight: boolean;
  continuesIntoDate: string | null;
  /** Reciprocal marker. The hours are **not** repeated here — a week total that double-counts a midnight crossing is the classic bug. */
  continuedFromDate: string | null;
  /** Where `workday_start_local ≠ 00:00`, daily OT was evaluated over a different window than this column. */
  workdayAttribution: { workdayStartLocal: string; evaluatedWorkdayDate: string } | null;

  exceptions: AttendanceExceptionRow[];
  scheduledHours: number | null;
}

/** A week block on a timesheet. A period spanning three workweeks renders three of these. */
export interface TimesheetWeek {
  workweek: WorkweekRow;
  days: TimesheetDay[];
  /** Set where a shift spans `week_start_at`; the split is stated and OT is computed on the whole week. */
  splitAtBoundary: boolean;
}

/** The employee's preserved disagreement. Never overwritten, never cleared by an approval. */
export interface TimesheetDispute {
  disputedAt: string;
  /** The employee's own words. Nothing and nobody can edit this. */
  disputeNote: string;
  /** The manager's SEPARATE, separately-labelled field. Never a footnote on the employee's value. */
  disputeResolution: string | null;
  disputeResolvedAt: string | null;
  disputeResolvedByName: string | null;
}

export interface TimesheetEditHistoryEntry {
  at: string;
  byName: string;
  reason: string;
  field: string;
  originalValue: string | null;
  newValue: string | null;
  voidedPunchId: string | null;
  replacementPunchId: string | null;
  rateAtTime: number | null;
}

/** `hr_timesheet_get` — the single read behind routes 5 and 29. */
export interface Timesheet {
  employmentId: string;
  employeeDisplayName: string;
  payPeriod: PayPeriodRow;
  rowState: PayPeriodEmploymentState;

  weeks: TimesheetWeek[];
  /** Display-only sum of days. Carries a note where a boundary week's OT is attributed elsewhere. */
  periodTotals: {
    totalHours: number;
    hoursByCategory: Record<HoursCategory, number>;
    hoursOvertime: number;
    hoursDoubletime: number;
    premiumLineCount: number;
    boundaryNote: string | null;
  };

  attestation: {
    /** Enabled only when the `timecard_attestation` step is active and resolved to this employee. */
    stepId: string | null;
    canAttest: boolean;
    attestedAt: string | null;
    /** 🚨 Stored **as shown**. An org editing the statement later must not retroactively change what somebody agreed to. */
    statementShown: string | null;
    /** The current org text, for a step not yet decided. */
    statementToShow: string | null;
  };
  dispute: TimesheetDispute | null;
  editHistory: TimesheetEditHistoryEntry[];
  openExceptions: AttendanceExceptionRow[];

  /** The intervals were superseded after this period was approved. Banner shows prior vs current. */
  recomputedSinceApproval: {
    at: string;
    byName: string | null;
    priorTotalHours: number;
    currentTotalHours: number;
  } | null;

  /** Explicit sentence, not an empty grid: salaried-exempt or a gated worker class. */
  noTimesheetReason: string | null;
}

// ---------------------------------------------------------------------------------------------
// Periods, the approval grid, exceptions
// ---------------------------------------------------------------------------------------------

export interface PayPeriodRow {
  id: string;
  payGroupId: string;
  payGroupName: string;
  periodStartOn: string;
  periodEndOn: string;
  payDate: string | null;
  sequenceNumber: number;
  state: PayPeriodState;
  submittedAt: string | null;
  approvedAt: string | null;
  exportedAt: string | null;
  lockedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  /** The workweeks straddling this period's edges — rendered as a named panel, in words. */
  boundaryWorkweekIds: string[];
  counts: {
    employments: number;
    approved: number;
    open: number;
    attested: number;
    disputed: number;
  };
}

/** One row of the approval grid. Cells show the **computed** value; raw opens beside it. */
export interface PeriodGridRow {
  employmentId: string;
  employeeDisplayName: string;
  employeeNumber: string | null;
  departmentName: string | null;
  locationName: string | null;
  managerName: string | null;

  state: PayPeriodEmploymentState;
  openStepId: string | null;

  totalHours: number;
  hoursByCategory: Record<HoursCategory, number>;
  hoursOvertime: number;
  hoursDoubletime: number;
  premiumLineCount: number;

  openExceptionCountsByKind: Partial<Record<AttendanceExceptionKind, number>>;
  openExceptionCount: number;
  hasDispute: boolean;
  hasAutoClosedPunch: boolean;
  recomputedSinceApproval: boolean;

  /**
   * 🚨 Signed, and **`null` means "Not scheduled"** — never `0`, which would read as perfect
   * adherence (SPEC-TIME §6.2). The renderer must print the words, not the number.
   */
  varianceMinutes: number | null;
  scheduledHours: number | null;
}

export interface AttendanceExceptionRow {
  id: string;
  employmentId: string;
  employeeDisplayName: string | null;
  exceptionKind: AttendanceExceptionKind;
  severity: ExceptionSeverity;
  resolutionState: ExceptionResolutionState;
  detectedAt: string;
  localWorkDate: string;
  tz: string;

  varianceMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;

  punchId: string | null;
  shiftId: string | null;
  workIntervalId: string | null;
  /** The post-publish schedule change that caused this, as a door. */
  scheduleChangeId: string | null;
  /** The write-up this was cited in. One-way evidence; resolving the exception never edits it. */
  correctiveActionId: string | null;

  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  premiumEarningCodeId: string | null;

  /**
   * 🚨 The server's own list of what it will accept. `excused` is **absent** on
   * `severity='violation'` — a statutory-premium exception cannot be excused into nonexistence and
   * an org cannot configure that away (SPEC-TIME §2.6). The UI renders these, never a hardcoded set.
   */
  allowedResolutions: ExceptionResolutionState[];
  message: string;
  /** Set on `auto_closed_estimate` / `orphan_punch`: an estimate never becomes a measurement. */
  isEstimate: boolean;
  /** Set on `unapproved_overtime`: whether a request had been raised AND denied, which is a materially different fact. */
  workedAfterDenial: boolean | null;
}

// ---------------------------------------------------------------------------------------------
// Overtime pre-approval (D24a)
// ---------------------------------------------------------------------------------------------

/**
 * 🚨 **Unapproved overtime is still PAID.** Nothing on this object may gate, delay, reduce or
 * condition payment — pre-approval is a *management* control over whether overtime is **incurred**,
 * never a payroll control over whether it is **paid** (SPEC-TIME §4.4). A denial is notified and
 * recorded; working anyway is paid, and the surface says so to the manager at decision time.
 */
export interface OvertimePreapprovalRow {
  id: string;
  employmentId: string;
  employeeDisplayName: string;
  workweekId: string | null;
  requestedByName: string;
  requestKind: "advance" | "retroactive" | "standing";
  coversFrom: string;
  coversTo: string;
  requestedHours: number | null;
  /** Below `requestedHours` when the manager approved with a cap. The cap is what intervals match against. */
  approvedHours: number | null;
  reasonNote: string | null;
  state: OvertimePreapprovalState;
  workflowInstanceId: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  actualOtHours: number | null;
  varianceHours: number | null;
  unapprovedOtFlagged: boolean;
  correctiveActionId: string | null;
  /** The jurisdiction-resolved thresholds this request would cross — weekly AND daily and 7th-day. */
  thresholdAxes: string[];
  calc: CalcBlock;
}

// ---------------------------------------------------------------------------------------------
// Kiosk
// ---------------------------------------------------------------------------------------------

export interface KioskPairingResult {
  deviceId: string;
  /** 🚨 Returned **once** and never re-readable. Store it on the device immediately. */
  deviceSecret: string;
  organizationDisplayName: string;
  locationName: string | null;
  trustState: KioskTrustState;
}

export interface KioskDeviceSession {
  sessionToken: string;
  expiresAt: string;
  trustState: KioskTrustState;
  /** The server clock, for skew computation. Held for the session and re-synced on every heartbeat. */
  serverTime: string;
  configVersion: string;
  config: {
    requirePhoto: boolean;
    requireGeo: boolean;
    maxClockSkewSeconds: number;
    pinLength: number;
    confirmDismissSeconds: number;
    heartbeatSeconds: number;
    locationName: string | null;
  };
}

/**
 * What a kiosk punch answers with. 🚨 **Display name and punch result ONLY** — never a roster,
 * never another HR field. There is no employee list anywhere on the kiosk: a list is a roster
 * disclosure.
 */
export interface KioskPunchResult {
  employeeDisplayName: string;
  punchKind: PunchKind;
  occurredAtLocal: string;
  tz: string;
  replayed: boolean;
  /** "Photo recorded" / "Location recorded" — the confirmation states what was captured (§4.9). */
  capturedNotices: string[];
  /** A real second punch was suspected. ONE door: "That's not right" → a manager-attended correction. */
  duplicateSuspected: { previousPunchLocalTime: string; message: string } | null;
  attestationRequired: boolean;
}

export interface KioskDeviceRow {
  id: string;
  deviceName: string;
  locationId: string | null;
  locationName: string | null;
  trustState: KioskTrustState;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  clockSkewSeconds: number;
  maxClockSkewSeconds: number;
  requirePhoto: boolean;
  requireGeo: boolean;
  pairingCodeExpiresAt: string | null;
  pairingClaimedAt: string | null;
  registeredByName: string | null;
}

// ---------------------------------------------------------------------------------------------
// Paging — LAW 3: a list a caller treats as complete is never a capped fetch
// ---------------------------------------------------------------------------------------------

export interface PageRequest {
  page: number;
  pageSize: number;
  sort?: { column: string; direction: "asc" | "desc" }[];
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pageSize: number;
  totalRows: number;
  hasMore: boolean;
}
