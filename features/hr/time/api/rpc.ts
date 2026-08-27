/**
 * features/hr/time/api/rpc.ts — THE ONE DOOR to the Time & Attendance RPC lane.
 *
 * Every punch, clock-state read, timesheet read, period transition, correction and exception
 * resolution in this feature goes through this module. Two surfaces reaching the same data two
 * ways is a bug — collapse to the direct path.
 *
 * 🚨 WHY `public.hr_*` AND NOT A BROWSER CLIENT POINTED AT `hr`
 * ----------------------------------------------------
 * The `hr` schema is **not exposed to PostgREST**. Verified live 2026-08-26 against
 * `pgrst.db_schemas` on the `authenticator` role. Direct reads against the `hr` schema and
 * `.rpc("hr.x")` reach nothing from a browser, and they fail as PGRST106 rather than as anything a
 * reader would recognise. Adding a schema to that list replaces the whole value and a dropped name
 * is an instant platform-wide PGRST002 outage — a fleet-wide config change, explicitly not a build
 * lane's call (FREEZE §4 D-10 recorded exactly this for `esign`).
 *
 * So the client calls a thin `public.hr_<name>` wrapper over the body in `hr.<name>` — the live
 * platform pattern (`hr_kiosk_authenticate`, `hr_confidential_get`), and exactly what R-L3 U-03
 * ruled: `hr.<name>` in SQL, `hr_<name>` at the call site, never a third form.
 *
 * MOCK LANE
 * ---------
 * The HTTP engine seams (E-11/E-12/E-55/E-56 and the calc endpoints) have the 243-file frozen
 * fixture set behind `lib/api/hr-contract-client.ts`. **The RPC lane has none** — those 243 cover
 * the sixty `/hr/*` HTTP operations only, and a punch is not one of them. So this module carries
 * its own fixture lane, under the same `NEXT_PUBLIC_HR_MOCK=1` flag read in the same single place,
 * and the same four-case discipline (happy · empty · error · edge). It is **not a fake server and
 * simulates no behaviour**: it returns the fixture you asked for, verbatim. Business logic in a
 * mock is how a UI ends up built against a fiction no real endpoint ever produced.
 *
 * An `error` fixture is **thrown, not returned**, so the caller's error path is built at the same
 * time as its happy path.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import { HR_TIME_RPC_FIXTURES } from "./mock/registry";

/**
 * The client-reachable RPC names. Each is a `public.hr_*` wrapper; the real body lives in `hr.*`.
 * Kept as a closed union so a typo is a compile error rather than a runtime PGRST202.
 */
export type HrTimeRpcName =
  // punch lane (SQL-1)
  | "hr_punch_record"
  | "hr_clock_state"
  | "hr_punch_correct"
  | "hr_punch_void"
  | "hr_punch_register"
  // timesheet / period lane (SQL-2)
  | "hr_timesheet_get"
  | "hr_timesheet_period_grid"
  | "hr_pay_period_list"
  | "hr_pay_period_get"
  | "hr_pay_period_transition"
  | "hr_time_adjustment_create"
  | "hr_time_adjustment_list"
  | "hr_attendance_exception_resolve"
  /**
   * 🚨 NAMED BY L3's CLIENT LANE, OWED BY THE SQL LANE — nothing implements this yet.
   *
   * Route 31 (`/hr/time/exceptions`) is a standalone queue, and SPEC-TIME §2.6 specifies its
   * filters (`resolution_state`, `exception_kind`, `severity`, location, department, manager, date
   * range, affects-an-unapproved-period) without naming a contract for them — §1.3 lists the
   * *resolve* RPC and no list RPC. The queue cannot be built without one, so the name is declared
   * here under R-L3 U-03's grammar (`hr.attendance_exception_list` in SQL, `hr_attendance_exception_list`
   * at the call site) rather than left to be invented differently by whoever writes the SQL.
   *
   * Until it lands, route 31 runs on the appended fixture set only.
   */
  | "hr_attendance_exception_list"
  // overtime pre-approval lane (D24a) — the ROW reads and the create.
  // 🚨 The DECISION is `hr_wf_decide` below and nothing else: the workflow engine is the only
  // approval engine (SPEC-TIME §0 law 5). There is no `hr_overtime_preapproval_decide`, and
  // adding one would be a second approvals path.
  | "hr_overtime_preapproval_list"
  | "hr_overtime_preapproval_get"
  | "hr_overtime_preapproval_create"
  // kiosk lane — anon-callable, the token IS the authorization
  | "hr_kiosk_claim_pairing"
  | "hr_kiosk_authenticate"
  | "hr_kiosk_session_open"
  | "hr_kiosk_session_close"
  | "hr_kiosk_session_heartbeat"
  | "hr_kiosk_punch"
  // the one workflow door this lane uses — the decision RPC is the sole writer BY DESIGN
  | "hr_wf_decide"
  | "hr_wf_bulk_decide"
  | "hr_wf_for_target";

export interface HrRpcOptions {
  /** Which fixture the mock lane answers with. Ignored entirely when the flag is off. */
  mockCase?: HrFixtureCase;
  /** Abort signal, passed through to PostgREST. */
  signal?: AbortSignal;
}

/**
 * A typed refusal from the RPC lane, carrying the §1.3 envelope the SQL bodies raise.
 *
 * 🚨 `userMessage` is what a person sees, and it is **verbatim from the server** (SPEC-TIME §2.1:
 * *"the typed error's human sentence, verbatim from the RPC"*). Never substitute a generic
 * sentence: a denial that does not name what was missing is how over-tightening hides
 * (SPEC-ACCESS §4.2), and on the clock surface it is how an hourly employee ends up with nowhere
 * to go.
 */
export class HrRpcError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly details: Record<string, unknown>;
  readonly rpc: HrTimeRpcName;

  constructor(init: {
    rpc: HrTimeRpcName;
    code: string;
    message: string;
    userMessage?: string | null;
    details?: Record<string, unknown> | null;
  }) {
    super(init.message);
    this.name = "HrRpcError";
    this.rpc = init.rpc;
    this.code = init.code;
    this.userMessage = init.userMessage ?? init.message;
    this.details = init.details ?? {};
  }

  /** The period is locked or closed — the caller must offer the adjustment lane, not an edit. */
  get isPeriodLocked(): boolean {
    return this.code === "hr_period_locked";
  }
}

/**
 * The envelope every `hr_*` wrapper actually answers with — **verified against the shipped
 * functions, not assumed.** A refusal is data, not an exception, in SQL:
 *
 * ```jsonc
 * // refusal  — hr._punch_refusal(code, message, details)
 * { "ok": false, "error": { "code": "hr_employment_not_found",
 *                           "message": "That employment record does not exist.",
 *                           "details": {} } }
 * // success  — hr.punch_record
 * { "ok": true, "punch": {…}, "clock_state": {…}, "exceptions": [] }
 * ```
 *
 * 🚨 **Two things an earlier version of this file got wrong, and both silently returned
 * `undefined` rather than failing loudly.** First, there is **no `data` wrapper** on success — the
 * payload keys sit beside `ok`, so unwrapping `envelope.data` yielded nothing for every call in
 * the lane. Second, `error` is an **object**, not a string code, so reading it as a code produced
 * `[object Object]` where a human sentence belonged. Both are fixed here; the shapes above are
 * what the live functions return.
 */
interface HrRpcRefusal {
  code?: string;
  message?: string;
  user_message?: string | null;
  details?: Record<string, unknown> | null;
}

interface HrRpcEnvelope {
  ok: boolean;
  /** Object on a refusal. Tolerated as a string for the mock lane's older fixtures. */
  error?: HrRpcRefusal | string | null;
  message?: string;
  user_message?: string | null;
  details?: Record<string, unknown> | null;
  /** Present only where a function deliberately nests its payload. Most do not. */
  data?: unknown;
  [key: string]: unknown;
}

function isEnvelope(value: unknown): value is HrRpcEnvelope {
  return typeof value === "object" && value !== null && "ok" in value;
}

/**
 * Keys whose VALUES are opaque payloads and must never be key-mapped.
 *
 * 🚨 These are declared wire shapes or free-form jsonb, and renaming inside them corrupts data
 * rather than tidying it. `attestation_response` in particular is SPEC-TIME §3.2's **declared**
 * shape — `prompt_version`, `asked_at`, `count_owed` — and every detector, premium determination
 * and export mapping reads it by those exact names (§14 D9). `calc` and `original_values` are
 * evidence: the calculation record and the pre-edit payload *verbatim*.
 */
const OPAQUE_VALUE_KEYS = new Set([
  "attestation_response",
  "original_values",
  "metadata",
  "details",
  "parameters",
  "resolution",
  "facts",
  "scope",
]);

/**
 * 🚨 **`calc` IS NOT IN THAT SET, AND LISTING IT THERE BROKE EVERY RULE SNAPSHOT IN THE LANE.**
 *
 * The engines emit a **calc block** — `{rule_version_ids, engine_key, engine_version, computed_at,
 * calc}` — where the OUTER four keys are a declared shape `CalcBlock` reads by its camel names, and
 * only the INNER `calc` is the free-form engine payload. Excluding the key `calc` wholesale passed
 * the entire block through unmapped, so `ruleVersionIds`, `engineKey`, `engineVersion` and
 * `computedAt` all read `undefined` — on `AttendanceExceptionRow` and `OvertimePreapprovalRow`
 * among others.
 *
 * That is **AR2 LOCK 6 failing in exactly the way it is written to prevent**: the figure renders and
 * the path to the rule that produced it does not. *"A figure rendered without a path to
 * `rule_version_ids`, `engine_key`, `engine_version` and `calc` is an unfinished surface"* — and the
 * evidence drawer opened empty, silently, on a wage record.
 *
 * So the exclusion is **structural, not by name**: a calc block is recognised by carrying
 * `rule_version_ids`, its own keys are mapped, and only its inner `calc` is left verbatim. See
 * {@link isCalcBlock}.
 */
const CALC_BLOCK_MARKER = "rule_version_ids";

function isCalcBlock(obj: Record<string, unknown>): boolean {
  return CALC_BLOCK_MARKER in obj || "ruleVersionIds" in obj;
}

// ⚠️ `config` is deliberately NOT in that list, and the reason is a bug this file already had.
// `hr._kiosk_device_config` returns `{require_photo, require_geo, max_clock_skew_seconds,
// pin_length, confirm_dismiss_seconds, heartbeat_seconds, location_name}` — a DECLARED shape that
// `KioskDeviceSession["config"]` reads by its camel names. Excluding it left every one of those
// `undefined` on the client, which would have shown up as a kiosk that could not compute skew, read
// its PIN length, or set its heartbeat interval. The rule is: exclude a key only when its value is
// genuinely free-form or is evidence read back by its stored names — never merely because it
// *sounds* like a bag.

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Deep snake_case → camelCase on the RESPONSE only.
 *
 * The SQL bodies build their jsonb in snake_case (`clock_state`, `local_work_date`,
 * `rounding_applied_minutes`) because that is what every other row in the database looks like;
 * `types.ts` declares camelCase because that is what every other object in this repo looks like.
 * The seam has to be somewhere, and **one place is the whole point of this module being the one
 * door** — a per-component `row.local_work_date ?? row.localWorkDate` dance is how two spellings
 * end up half-supported everywhere.
 *
 * Request arguments are **not** mapped: they are `p_`-prefixed positional names the functions
 * declare, and renaming those would break the call rather than the reading.
 */
function camelizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeDeep);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;

  const obj = value as Record<string, unknown>;
  const insideCalcBlock = isCalcBlock(obj);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    // The inner `calc` of a calc block is the engine's own payload and stays verbatim; the block's
    // surrounding keys are a declared shape and must be mapped. Outside a calc block, a key named
    // `calc` is an ordinary field with no special meaning.
    const opaque = OPAQUE_VALUE_KEYS.has(key) || (insideCalcBlock && key === "calc");
    out[toCamel(key)] = opaque ? val : camelizeDeep(val);
  }
  return out;
}

/** Lift a refusal into the typed error, tolerating both the object and legacy string shapes. */
function refusalFrom(rpc: HrTimeRpcName, envelope: HrRpcEnvelope): HrRpcError {
  const err = envelope.error;
  if (err && typeof err === "object") {
    return new HrRpcError({
      rpc,
      code: err.code ?? "hr_validation_error",
      message: err.message ?? `${rpc} refused`,
      userMessage: err.user_message ?? err.message,
      details: err.details,
    });
  }
  return new HrRpcError({
    rpc,
    code: typeof err === "string" && err ? err : "hr_validation_error",
    message: envelope.message ?? `${rpc} refused`,
    userMessage: envelope.user_message ?? envelope.message,
    details: envelope.details,
  });
}

/** Strip the envelope keys and hand back the payload the caller actually asked for. */
function payloadFrom(envelope: HrRpcEnvelope): unknown {
  if ("data" in envelope && envelope.data !== undefined) return envelope.data;
  const { ok: _ok, error: _error, message: _m, user_message: _um, ...rest } = envelope;
  void _ok;
  void _error;
  void _m;
  void _um;
  return rest;
}

/**
 * Serve one fixture.
 *
 * Note the deliberate asymmetry with the live path: fixtures are authored **already camelCase**
 * against `types.ts`, so they are returned untouched, while a live response is snake_case from the
 * SQL body and goes through {@link camelizeDeep}. Both arrive at the caller in one spelling, which
 * is the only property that matters. Do not "fix" this by camelizing the fixtures too — that would
 * mangle the declared jsonb shapes they carry verbatim.
 */
function serveMock<T>(rpc: HrTimeRpcName, mockCase: HrFixtureCase | undefined): T {
  const cases = HR_TIME_RPC_FIXTURES[rpc];
  if (!cases) {
    throw new Error(
      `[hr-time-mock] ${rpc} has no fixtures. Add them under features/hr/time/api/mock/ — four ` +
        `cases (happy · empty · error · edge), the same discipline SPEC-CONTRACTS §6.4 puts on the ` +
        `HTTP lane. Silently falling through to a live call while NEXT_PUBLIC_HR_MOCK=1 is set is ` +
        `worse than failing here.`,
    );
  }
  const selected = mockCase ?? "happy";
  const fixture = cases[selected];
  if (!fixture) {
    throw new Error(`[hr-time-mock] ${rpc} has no "${selected}" fixture.`);
  }
  if (!fixture.ok) {
    throw new HrRpcError({
      rpc,
      code: fixture.error ?? "hr_validation_error",
      message: fixture.message ?? `[hr-time-mock] ${rpc} ${selected}`,
      userMessage: fixture.user_message,
      details: fixture.details,
    });
  }
  return fixture.data as T;
}

interface PostgrestLikeError {
  code?: string;
  message: string;
  hint?: string | null;
  details?: string | null;
}

interface RpcCallResult {
  data: unknown;
  error: PostgrestLikeError | null;
}

/**
 * 🚨 **THIS CAST IS TEMPORARY AND ITS REMOVAL IS THE DRIFT DETECTOR — DO NOT MAKE IT PERMANENT.**
 *
 * `supabase.rpc()` is typed against `Database["public"]["Functions"]`, and the `public.hr_*`
 * wrappers this module calls **do not exist in the live catalog yet** — they are being built now.
 * Without the cast every call resolves to `never` and `pnpm type-check` reports a wall of
 * "Property 'ok' does not exist on type 'never'".
 *
 * The moment the wrappers land and `pnpm db-types` regenerates, `Database["public"]["Functions"]`
 * carries them and **this whole block deletes**, restoring real argument and return typing. That
 * red-then-green transition is exactly the signal SPEC-CONTRACTS §6.3 step 4 is built around; a
 * permanent cast would destroy it. Do not widen it to hide a genuine mismatch — a call whose args
 * disagree with the shipped function must go red.
 */
type RpcQuery = PromiseLike<RpcCallResult> & {
  abortSignal: (signal: AbortSignal) => PromiseLike<RpcCallResult>;
};

interface UntypedRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => RpcQuery;
}

/** The client, seen through the untyped door above. `bind` is avoided: it re-instantiates the
 *  generated `Database` generic and trips TS2589 (excessively deep instantiation). */
const rpcClient = supabase as unknown as UntypedRpcClient;

/**
 * Call one `public.hr_*` RPC. Returns the unwrapped payload; throws {@link HrRpcError} on a typed
 * refusal and a plain `Error` on a transport failure.
 */
export async function callHrTimeRpc<T>(
  rpc: HrTimeRpcName,
  args: Record<string, unknown>,
  opts?: HrRpcOptions,
): Promise<T> {
  if (HR_MOCK_ENABLED) return serveMock<T>(rpc, opts?.mockCase);

  // `hr_*` wrappers live in `public`, which is exposed — see the header. Never point this client at `hr`.
  const query = rpcClient.rpc(rpc, args);
  const { data, error } = await (opts?.signal ? query.abortSignal(opts.signal) : query);

  if (error) {
    throw new HrRpcError({
      rpc,
      code: error.code ?? "hr_rpc_failed",
      message: error.message,
      userMessage: error.message,
      details: { hint: error.hint, details: error.details },
    });
  }

  if (isEnvelope(data)) {
    if (!data.ok) throw refusalFrom(rpc, data);
    return camelizeDeep(payloadFrom(data)) as T;
  }

  return camelizeDeep(data) as T;
}
