/**
 * features/hr/time/api/rpc.ts — THE ONE DOOR to the Time & Attendance RPC lane.
 *
 * Every punch, clock-state read, timesheet read, period transition, correction and exception
 * resolution in this feature goes through this module. Two surfaces reaching the same data two
 * ways is a bug — collapse to the direct path.
 *
 * 🚨 WHY `public.hr_*` AND NOT `supabase.schema("hr")`
 * ----------------------------------------------------
 * The `hr` schema is **not exposed to PostgREST**. Verified live 2026-08-26 against
 * `pgrst.db_schemas` on the `authenticator` role. `supabase.schema("hr").from(...)` and
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

/** The envelope every `hr_*` wrapper answers with. A refusal is data, not an exception, in SQL. */
interface HrRpcEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  user_message?: string | null;
  details?: Record<string, unknown> | null;
}

function isEnvelope(value: unknown): value is HrRpcEnvelope<unknown> {
  return typeof value === "object" && value !== null && "ok" in value;
}

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

  // `hr_*` wrappers live in `public`, which is exposed — see the header. No `.schema("hr")` here.
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
    if (!data.ok) {
      throw new HrRpcError({
        rpc,
        code: data.error ?? "hr_validation_error",
        message: data.message ?? `${rpc} refused`,
        userMessage: data.user_message,
        details: data.details,
      });
    }
    return data.data as T;
  }

  return data as T;
}
