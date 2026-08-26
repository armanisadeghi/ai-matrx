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
  ClockState,
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

/** The single read every clock surface mounts on. The widget derives no state of its own. */
export function getClockState(employmentId: string, opts?: HrRpcOptions): Promise<ClockState> {
  return callHrTimeRpc<ClockState>("hr_clock_state", { p_employment_id: employmentId }, opts);
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
    { p_filters: filters, p_page: page },
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
    { p_pay_period_id: payPeriodId, p_filters: filters, p_page: page },
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
