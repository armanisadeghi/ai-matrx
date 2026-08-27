/**
 * features/hr/time/api/service.ts — the typed service surface for Time & Attendance.
 *
 * 🚨 **THE CLIENT-AGNOSTIC CONTRACT (D1, SPEC-TIME §0 law 6).** Every function here is a thin,
 * typed call onto a `public.hr_*` RPC and nothing more. The later native HR mobile app is a
 * committed client and will call the **identical** RPCs — so this module is a re-skin boundary, not
 * a place for behaviour. **A behaviour that could only be described by naming a React component is
 * a defect in the build, exactly as it is in the spec.** If you find yourself writing a rule here,
 * it belongs in the RPC.
 *
 * 🚨 **NO CLIENT COMPUTES HOURS** (§9.2, L3-74). Nothing in this file — or anything that calls it —
 * subtracts timestamps, multiplies a rate, sums a week, rounds an interval, assigns a category or
 * derives a weighted average. Those numbers arrive computed and snapshot-backed. The single
 * permitted client-side figure anywhere in this lane is a **preview** total from a `prospective`
 * calc call, visibly labelled as a preview.
 */

"use client";

import { callHrTimeRpc, type HrRpcOptions } from "./rpc";
import type {
  AttendanceExceptionRow,
  ClockChainPunch,
  ClockPhase,
  ClockState,
  ClockStateException,
  ExceptionResolutionState,
  KioskDeviceSession,
  KioskPairingResult,
  KioskPunchResult,
  Paged,
  PayPeriodState,
  PeriodGridRow,
  PunchKind,
  PunchRecordResult,
  PunchRow,
  PunchSource,
  Timesheet,
  PageRequest,
} from "./types";

/**
 * 🚨 THE WIRE SHAPE OF A JSONB BAG IS NOT THE CLIENT'S SHAPE — FIXED AFTER A LIVE READ.
 *
 * `rpc.ts` camelizes RESPONSES and deliberately leaves REQUEST arguments alone, because those are
 * `p_`-prefixed positional names the functions declare. That reasoning is correct for the argument
 * NAMES and wrong for the *contents* of the two jsonb bags: `p_filters` and `p_page` are read
 * INSIDE the SQL by their own keys, and those keys are snake_case.
 *
 * Verified live 2026-08-26 against `hr.punch_register` / `hr.timesheet_period_grid` /
 * `hr.attendance_exception_list`:
 *   • filters are read as `employment_ids`, `organization_id`, `punch_kinds`, `from`, `to`, …
 *   • paging is read as **`limit` / `offset`** — not `page` / `pageSize`.
 *
 * So a client sending `{employmentIds, includeVoided}` and `{page: 2, pageSize: 50}` had **every
 * filter silently ignored and every request served as page one**. Nothing errored; the surface just
 * showed the wrong rows, which is the worst way for this to fail on an evidence lane.
 *
 * These two helpers are the seam, in the one module that assembles the call.
 */
function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function snakeizeBag(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeizeBag);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[snakeKey(k)] = snakeizeBag(v);
  }
  return out;
}

/** `{page, pageSize, sort}` → the `{limit, offset, sort}` the SQL actually reads. */
function toWirePage(page: PageRequest): Record<string, unknown> {
  return {
    limit: page.pageSize,
    offset: Math.max(0, (page.page - 1) * page.pageSize),
    ...(page.sort ? { sort: snakeizeBag(page.sort) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Punch lane
// ---------------------------------------------------------------------------------------------

export interface RecordPunchInput {
  employmentId: string;
  kind: PunchKind;
  /** The instant of the intent. The server corrects for device skew and stamps the truth. */
  occurredAt: string;
  source: PunchSource;
  /**
   * Minted once per user intent by `mintPunchIdempotencyKey` and **reused on every retry**. That
   * reuse is what makes a double tap and a flaky network produce one punch.
   */
  idempotencyKey: string;
  /** Set on the kiosk lane only; a long-lived device secret never rides a punch request (§14 D1). */
  kioskSessionId?: string | null;
  geo?: { lat: number; lng: number; accuracyM: number } | null;
  photoFileId?: string | null;
  /** The combined clock-out answer set. Detectors read the jsonb, never `attestation_kind` alone. */
  attestation?: Record<string, unknown> | null;
}

/**
 * The only punch writer a client may call. A refusal arrives as an {@link HrRpcError} whose
 * `userMessage` is rendered **verbatim** — never replaced with a generic sentence.
 */
export function recordPunch(
  input: RecordPunchInput,
  opts?: HrRpcOptions,
): Promise<PunchRecordResult> {
  return callHrTimeRpc<PunchRecordResult>(
    "hr_punch_record",
    {
      p_employment_id: input.employmentId,
      p_kind: input.kind,
      p_occurred_at: input.occurredAt,
      p_source: input.source,
      p_idempotency_key: input.idempotencyKey,
      p_kiosk_session_id: input.kioskSessionId ?? null,
      p_geo: input.geo ?? null,
      p_photo_file_id: input.photoFileId ?? null,
      p_attestation: input.attestation ?? null,
    },
    opts,
  );
}

/**
 * 🚨 **MAPPED, NOT CAST — THIS IS THE G2 F6 FIX.**
 *
 * Every other call in this file hands `callHrTimeRpc<T>` a type parameter, which camelizes the
 * payload and **casts** it. A cast cannot fail, so when `hr.clock_state` shipped with different
 * field names than the spec had guessed, nothing went red: `blocked.reason` and `blocked.href` were
 * simply `undefined`, and a blocked employee was shown *"Ask your manager…"* while the server had
 * sent them a worded reason **and** a door.
 *
 * So this one read is mapped by hand, field by field, from the shape verified live against the
 * function body. Two properties follow, and both are the point:
 *   • a field the server stops sending becomes a **visible** default here, in one place, instead of
 *     an `undefined` that renders as a blank paragraph three components away;
 *   • nothing is invented. Where the server sends nothing — a day total, a capture posture — this
 *     mapper does not manufacture one, because a fabricated number on a time clock is the defect
 *     the whole lane is built to avoid.
 */
function mapClockState(raw: unknown): ClockState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = <T>(key: string, fallback: T): T => (r[key] === undefined || r[key] === null ? fallback : (r[key] as T));

  const blockedRaw = r.blocked as Record<string, unknown> | null | undefined;
  const minimums = (r.jurisdictionMinimums ?? {}) as Record<string, unknown>;

  return {
    employmentId: pick<string>("employmentId", ""),
    organizationId: pick<string | null>("organizationId", null),
    // 🚨 The wire calls it `state`. `phase` was this file's invention.
    phase: pick<ClockPhase>("state", "clocked_out"),
    blocked: blockedRaw
      ? {
          reasonCode: (blockedRaw.reasonCode as string | null) ?? null,
          /*
            The server always words this. The fallback exists only so a future envelope change
            cannot produce a silent empty paragraph — it is a loud placeholder, not a substitute.
          */
          message:
            typeof blockedRaw.message === "string" && blockedRaw.message.trim()
              ? blockedRaw.message
              : "The time clock is not available for you right now, and the server did not say why.",
          door: (blockedRaw.door as string | null) ?? null,
        }
      : null,

    localWorkDate: pick<string | null>("localWorkDate", null),
    tz: pick<string | null>("tz", null),
    workLocationId: pick<string | null>("workLocationId", null),
    jurisdictionKey: pick<string | null>("jurisdictionKey", null),
    positionAssignmentId: pick<string | null>("positionAssignmentId", null),

    elapsedWorkedMinutes: pick<number>("elapsedWorkedMinutes", 0),
    elapsedBreakMinutes: pick<number>("elapsedBreakMinutes", 0),
    currentSegmentStartedAt: pick<string | null>("currentSegmentStartedAt", null),

    openChain: pick<ClockChainPunch[]>("openChain", []),
    attestationRequiredAtClockOut: pick<boolean>("attestationRequiredAtClockOut", false),

    jurisdictionMinimums: {
      asOf: (minimums.asOf as string | null) ?? null,
      resolved: (minimums.resolved as Record<string, unknown>) ?? {},
      advisory: (minimums.advisory as unknown[]) ?? [],
      incomplete: (minimums.incomplete as unknown[]) ?? [],
      noRule: (minimums.noRule as unknown[]) ?? [],
    },

    openExceptions: pick<ClockStateException[]>("openExceptions", []),
    allowedKinds: pick<PunchKind[]>("allowedKinds", []),
    statesThisEndpointCannotReturn: pick<string[]>("statesThisEndpointCannotReturn", []),
  };
}

/** The single read every clock surface mounts on. The widget derives no state of its own. */
export async function getClockState(
  employmentId: string,
  opts?: HrRpcOptions,
): Promise<ClockState> {
  const raw = await callHrTimeRpc<unknown>(
    "hr_clock_state",
    { p_employment_id: employmentId },
    opts,
  );
  return mapClockState(raw);
}

export interface PunchCorrectionResult {
  voidedPunchIds: string[];
  replacementPunchIds: string[];
  recomputedWorkweekIds: string[];
  exceptionsOpened: AttendanceExceptionRow[];
  exceptionsClosed: string[];
  /** Always equals the punch count — one reasoned action, N audit trails (§4.1, ruled). */
  auditTrailCount: number;
  /** Always true. A silently edited timecard is a wage claim; this is not org-overridable. */
  employeeNotified: boolean;
  requiresReapproval: boolean;
}

/**
 * Void + replacement. Never an edit — `hr.punch` is immutable except for its three void columns.
 *
 * Takes an **array** deliberately: SPEC-TIME §4.1's ruling is that a manager fixing the same
 * clock-in error across nine days performs one reasoned action with one reason and nine audit
 * trails, never one quiet action with one audit trail.
 */
export function correctPunches(
  punchIds: string[],
  newValues: Record<string, unknown>,
  reason: string,
  opts?: HrRpcOptions,
): Promise<PunchCorrectionResult> {
  return callHrTimeRpc<PunchCorrectionResult>(
    "hr_punch_correct",
    { p_punch_ids: punchIds, p_new_values: newValues, p_reason: reason },
    opts,
  );
}

/** Void with no replacement — the duplicate-punch case. */
export function voidPunch(
  punchId: string,
  reason: string,
  opts?: HrRpcOptions,
): Promise<PunchCorrectionResult> {
  return callHrTimeRpc<PunchCorrectionResult>(
    "hr_punch_void",
    { p_punch_id: punchId, p_reason: reason },
    opts,
  );
}

export interface PunchRegisterFilters {
  employmentIds?: string[];
  locationIds?: string[];
  departmentIds?: string[];
  from?: string;
  to?: string;
  punchKinds?: PunchKind[];
  sources?: PunchSource[];
  includeVoided?: boolean;
  duplicateSuspectedOnly?: boolean;
  orphanOnly?: boolean;
}

/**
 * The raw evidence lane. **Raw punches only** — no interval, no rounded figure, no total ever
 * appears on the surface this feeds; that is the entire point of it existing separately (AD-11).
 * Fully paginated: a capped fetch on a list a caller treats as complete is a defect (LAW 3).
 */
export function getPunchRegister(
  filters: PunchRegisterFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<PunchRow>> {
  return callHrTimeRpc<Paged<PunchRow>>(
    "hr_punch_register",
    { p_filters: snakeizeBag(filters), p_page: toWirePage(page) },
    opts,
  );
}

// ---------------------------------------------------------------------------------------------
// Timesheet, period, adjustment, exception
// ---------------------------------------------------------------------------------------------

/** The single read behind the employee's own timesheet and the manager's per-person detail. */
export function getTimesheet(
  employmentId: string,
  payPeriodId: string,
  opts?: HrRpcOptions,
): Promise<Timesheet> {
  return callHrTimeRpc<Timesheet>(
    "hr_timesheet_get",
    { p_employment_id: employmentId, p_pay_period_id: payPeriodId },
    opts,
  );
}

export interface PeriodGridFilters {
  payGroupId?: string;
  locationIds?: string[];
  departmentIds?: string[];
  managerEmploymentIds?: string[];
  rowStates?: string[];
  hasOpenException?: boolean;
  exceptionKinds?: string[];
  hasOvertime?: boolean;
  hasPremium?: boolean;
  hasDispute?: boolean;
  /** Beyond `hr.time_and_attendance.variance_warn_minutes` — the knob, never a constant. */
  varianceBeyondWarn?: boolean;
  hasAutoClosedPunch?: boolean;
  recomputedSinceApproval?: boolean;
  search?: string;
}

/** The approval grid. One call, fully paginated. */
export function getPeriodGrid(
  payPeriodId: string,
  filters: PeriodGridFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<PeriodGridRow>> {
  return callHrTimeRpc<Paged<PeriodGridRow>>(
    "hr_timesheet_period_grid",
    { p_pay_period_id: payPeriodId, p_filters: snakeizeBag(filters), p_page: toWirePage(page) },
    opts,
  );
}

export interface PeriodTransitionResult {
  payPeriodId: string;
  fromState: PayPeriodState;
  toState: PayPeriodState;
  /** Approving over a preserved disagreement is legitimate AND recorded — say so in words. */
  disputesOpen: number;
  transitionedAt: string;
  notice?: string;
}

/**
 * The period state machine, actor-stamped. Legal set:
 * `open → submitted → approved → exported → locked → closed`, plus `locked → reopened → approved`.
 *
 * 🚨 Reopening **does not un-export and does not re-pay**: a delivered export is never regenerated,
 * because regenerating in place double-pays. The fix is an adjustment. The surface must say that in
 * plain words, and the server returns it as `notice`.
 */
export function transitionPayPeriod(
  payPeriodId: string,
  toState: PayPeriodState,
  reason: string | null,
  opts?: HrRpcOptions,
): Promise<PeriodTransitionResult> {
  return callHrTimeRpc<PeriodTransitionResult>(
    "hr_pay_period_transition",
    { p_pay_period_id: payPeriodId, p_to_state: toState, p_reason: reason },
    opts,
  );
}

export interface CreateTimeAdjustmentInput {
  employmentId: string;
  originalPayPeriodId: string;
  workDate: string;
  earningCodeId: string;
  hoursDelta: number;
  amountDelta?: number;
  reasonCategoryId?: string | null;
  reasonNote: string;
}

/**
 * The post-lock correction lane. Refuses unless the original period is `locked` or `closed` — a
 * period that is still open is corrected by editing the punch, not by an adjustment. The adjustment
 * rides the **next** export, tagged to the **original** period; the locked period is never
 * rewritten.
 */
export function createTimeAdjustment(
  input: CreateTimeAdjustmentInput,
  opts?: HrRpcOptions,
): Promise<{
  adjustmentId: string | null;
  originalPayPeriodId: string;
  targetPayPeriodId: string | null;
  workflowInstanceId: string | null;
  hoursDelta: number;
}> {
  return callHrTimeRpc(
    "hr_time_adjustment_create",
    {
      p_employment_id: input.employmentId,
      p_original_pay_period_id: input.originalPayPeriodId,
      p_work_date: input.workDate,
      p_earning_code_id: input.earningCodeId,
      p_hours_delta: input.hoursDelta,
      p_amount_delta: input.amountDelta ?? 0,
      p_reason_category_id: input.reasonCategoryId ?? null,
      p_reason_note: input.reasonNote,
    },
    opts,
  );
}

/**
 * Resolve one exception.
 *
 * 🚨 The caller renders the actions from the row's own `allowedResolutions`, **never a hardcoded
 * list**: `excused` is absent on `severity='violation'` because a statutory-premium exception
 * cannot be excused into nonexistence, and an org cannot configure that away. The server refuses it
 * too — the control's absence is courtesy, the refusal is the contract.
 */
export function resolveAttendanceException(
  exceptionId: string,
  resolutionState: ExceptionResolutionState,
  note: string | null,
  premiumEarningCodeId: string | null,
  opts?: HrRpcOptions,
): Promise<{ exception: AttendanceExceptionRow; intervalsWritten: unknown[] }> {
  return callHrTimeRpc(
    "hr_attendance_exception_resolve",
    {
      p_exception_id: exceptionId,
      p_resolution_state: resolutionState,
      p_note: note,
      p_premium_earning_code_id: premiumEarningCodeId,
    },
    opts,
  );
}

// ---------------------------------------------------------------------------------------------
// Kiosk — anon-callable. The token IS the authorization; RLS admits the kiosk nowhere.
// ---------------------------------------------------------------------------------------------

/** The ONLY way a device secret is ever minted. The secret is returned once and never re-readable. */
export function claimKioskPairing(
  pairingCode: string,
  deviceFingerprint: string,
  opts?: HrRpcOptions,
): Promise<KioskPairingResult> {
  return callHrTimeRpc<KioskPairingResult>(
    "hr_kiosk_claim_pairing",
    { p_pairing_code: pairingCode, p_device_fingerprint: deviceFingerprint },
    opts,
  );
}

/** Exchange the long-lived secret for a DEVICE session (TTL in hours) plus the server clock. */
export function authenticateKioskDevice(
  deviceId: string,
  deviceSecret: string,
  opts?: HrRpcOptions,
): Promise<KioskDeviceSession> {
  return callHrTimeRpc<KioskDeviceSession>(
    "hr_kiosk_authenticate",
    { p_device_id: deviceId, p_device_secret: deviceSecret },
    opts,
  );
}

/**
 * Lets a wall tablet learn it was revoked without waiting for a punch. Called on the idle screen at
 * the configured interval; `suspended`/`revoked` **bricks** the route immediately.
 */
export function heartbeatKioskSession(
  sessionToken: string,
  opts?: HrRpcOptions,
): Promise<{ trustState: string; serverTime: string; configVersion: string }> {
  return callHrTimeRpc("hr_kiosk_session_heartbeat", { p_session_token: sessionToken }, opts);
}

export interface KioskPunchInput {
  sessionToken: string;
  employeePin: string;
  kind: PunchKind;
  deviceReportedAt: string;
  idempotencyKey: string;
  photoFileId?: string | null;
  geo?: { lat: number; lng: number; accuracyM: number } | null;
  attestation?: Record<string, unknown> | null;
}

/**
 * The kiosk punch. Validates the session and the PIN, then delegates to `hr.punch_record` — which
 * remains the only writer of `hr.punch` (§14 D1).
 *
 * 🚨 Returns the employee's **display name and the punch result only** — never a roster, never
 * another HR field. There is **no optimistic UI on the kiosk**: the confirmation card appears only
 * after the server answered, because a card that appears first lets a worker walk away unpunched.
 */
export function kioskPunch(input: KioskPunchInput, opts?: HrRpcOptions): Promise<KioskPunchResult> {
  return callHrTimeRpc<KioskPunchResult>(
    "hr_kiosk_punch",
    {
      p_session_token: input.sessionToken,
      p_employee_pin: input.employeePin,
      p_kind: input.kind,
      p_device_reported_at: input.deviceReportedAt,
      p_idempotency_key: input.idempotencyKey,
      p_photo_file_id: input.photoFileId ?? null,
      p_geo: input.geo ?? null,
      p_attestation: input.attestation ?? null,
    },
    opts,
  );
}
