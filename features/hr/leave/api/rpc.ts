/**
 * features/hr/leave/api/rpc.ts — THE ONE DOOR to the Leave & PTO RPC lane.
 *
 * Every balance read, request preview, submit, cancel and ledger read in this feature goes
 * through this module. Two surfaces reaching the same data two ways is a bug.
 *
 * 🚨 WHY `public.hr_*` AND NOT A BROWSER CLIENT POINTED AT `hr`
 * ------------------------------------------------------------
 * The `hr` schema is **not exposed to PostgREST** (`features/hr/types.ts` header, verified
 * live). `.rpc("hr.x")` reaches nothing from a browser and fails as PGRST106. So the client
 * calls a thin `public.hr_<name>` wrapper over the body in `hr.<name>` — `hr.<name>` in SQL,
 * `hr_<name>` at the call site, never a third form.
 *
 * 🚨 THIS LANE'S REFUSAL DIALECT IS `granted`, NOT `ok`
 * -----------------------------------------------------
 * `features/hr/time/api/rpc.ts` unwraps `{ok:true, …}` / `{ok:false, error:{…}}`. The leave
 * doors do NOT speak that dialect. Read live 2026-08-27, every one of them answers:
 *
 * ```jsonc
 * { "granted": false, "reason": "no_working_record_grant", "detail": "…" }   // refusal
 * { "granted": true,  "policies": [...], "requests": [...] }                 // success
 * ```
 *
 * There is no `ok` key and no `error` object anywhere in `hr.my_time_off`,
 * `hr.leave_request_preview`, `hr.leave_request_submit`, `hr.leave_request_cancel` or
 * `hr.leave_ledger_view`. A transport that tested `ok` would read **every refusal as a
 * success** and hand the surface an envelope with no policies in it — which renders as
 * "you have no leave" rather than "you are not allowed to see this". So this module tests
 * `granted`, and a refusal comes back as `HrDenied` DATA, never as a thrown exception.
 *
 * `HrResult<T>` / `HrDenied` / `HrFailed` are the repo's canonical result types
 * (`features/hr/types.ts`); nothing is re-declared here.
 *
 * ♻️ WHAT IS FORKED FROM THE TIME LANE, AND WHY
 * ---------------------------------------------
 * `camelizeDeep`, `toCamel` and the opaque-key discipline below are the time lane's rule,
 * restated. They are **module-private there** (not exported), and this lane may not edit
 * that file. `HrRpcOptions` IS exported and is imported rather than re-declared. When the
 * time lane exports its mapper, delete this copy and import it — one seam, one place.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import type { HrRpcOptions } from "@/features/hr/time/api/rpc";
import type { HrDenied, HrFailed, HrResult } from "@/features/hr/types";

/**
 * The client-reachable RPC names, as a closed union so a typo is a compile error rather
 * than a runtime PGRST202. All five verified live in `pg_proc` on 2026-08-27, granted to
 * `authenticated`.
 */
export type HrLeaveRpcName =
  | "hr_my_time_off"
  | "hr_leave_request_preview"
  | "hr_leave_request_submit"
  | "hr_leave_request_cancel"
  | "hr_leave_ledger_view";

/**
 * Keys whose VALUES are free-form or are evidence read back by their stored names, and so
 * must never be key-mapped.
 *
 * The rule (time lane, verbatim): *exclude a key only when its value is genuinely free-form
 * or is evidence read back by its stored names — never merely because it sounds like a bag.*
 *
 * ⚠️ `blackout_rules`, `conflict_check`, `span`, `figures` and `day_parts` are deliberately
 * NOT here. Every one of them is a DECLARED shape (SPEC-LEAVE §2.4 / §4.2 / §5) that this
 * feature reads by its camel names — excluding them would leave `recurringAnnual`,
 * `blackoutsHit`, `totalHours`, `accruedToDate` and the rest `undefined` on screen, which
 * is the exact failure the time lane's header records.
 */
const OPAQUE_VALUE_KEYS = new Set(["detail", "details", "metadata", "parameters", "facts"]);

/**
 * 🚨 THE `calc` EXCLUSION IS STRUCTURAL, NEVER BY NAME.
 *
 * An engine emits an evidence block — the outer keys (`rule_version_ids`, `engine_key`,
 * `engine_version`, `computed_at`) are a DECLARED shape the rule door reads by its camel
 * names, and only the INNER `calc` is the engine's own free-form payload. Excluding the key
 * `calc` wholesale would pass the whole block through unmapped and `engineKey` would read
 * `undefined` — a figure rendered with no path to the rule that produced it.
 *
 * 🚨 AND THE LEAVE LEDGER PROVES THE MARKER CANNOT BE `rule_version_ids` ALONE.
 * `hr.leave_ledger_view` selects `engine_key`, `engine_version` and `calc` and does **not**
 * select `rule_version_ids`. Testing only for `rule_version_ids` would therefore camelize
 * INSIDE a stored calc payload on every ledger row — silently rewriting the evidence a wage
 * claim is answered with. So an evidence block is recognised by carrying EITHER marker.
 */
function isEvidenceBlock(obj: Record<string, unknown>): boolean {
  return (
    "rule_version_ids" in obj ||
    "ruleVersionIds" in obj ||
    "engine_key" in obj ||
    "engineKey" in obj
  );
}

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Deep snake_case → camelCase on the RESPONSE only.
 *
 * The SQL bodies build jsonb in snake_case; `types.ts` declares camelCase. The seam has to
 * be somewhere and one place is the whole point of this module being the one door — a
 * per-component `row.hours_delta ?? row.hoursDelta` dance is how two spellings end up
 * half-supported everywhere.
 *
 * Request arguments are **not** mapped: they are `p_`-prefixed names the functions declare,
 * and `p_day_parts` is read inside SQL as `x->>'date'` / `x->>'hours'` — already flat.
 */
function camelizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeDeep);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;

  const obj = value as Record<string, unknown>;
  const insideEvidenceBlock = isEvidenceBlock(obj);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const opaque = OPAQUE_VALUE_KEYS.has(key) || (insideEvidenceBlock && key === "calc");
    out[toCamel(key)] = opaque ? val : camelizeDeep(val);
  }
  return out;
}

/** Postgres classes that mean "the caller has no standing", not "the server broke". */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

function denied(reason: string, detail: string | null, payload: Record<string, unknown>): HrDenied {
  return {
    ok: false,
    kind: "denied",
    reason,
    detail,
    auditId: typeof payload.auditId === "string" ? payload.auditId : null,
    field: typeof payload.field === "string" ? payload.field : null,
    door: typeof payload.door === "string" ? payload.door : null,
    payload,
  };
}

function failed(message: string, code: string | null): HrFailed {
  return { ok: false, kind: "failed", message, code };
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
 * 🚨 **THIS CAST IS TEMPORARY AND ITS REMOVAL IS THE DRIFT DETECTOR.**
 * `supabase.rpc()` is typed against `Database["public"]["Functions"]`. The five `hr_leave_*`
 * wrappers exist live but are not yet in the checked-in generated catalog, so without the
 * cast every call resolves to `never`. The moment `pnpm db-types` regenerates with them,
 * this block deletes and real argument typing returns. Do not widen it to hide a mismatch.
 */
type RpcQuery = PromiseLike<RpcCallResult> & {
  abortSignal: (signal: AbortSignal) => PromiseLike<RpcCallResult>;
};

interface UntypedRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => RpcQuery;
}

const rpcClient = supabase as unknown as UntypedRpcClient;

/** The mock lane has no leave fixtures yet — fail loudly rather than fall through to live. */
function refuseMock(rpc: HrLeaveRpcName, mockCase: HrFixtureCase | undefined): never {
  throw new Error(
    `[hr-leave-mock] ${rpc} has no "${mockCase ?? "happy"}" fixture. The leave RPC lane ships ` +
      `no fixture set — the doors are live. Silently falling through to a live call while ` +
      `NEXT_PUBLIC_HR_MOCK=1 is set is worse than failing here.`,
  );
}

/**
 * Call one `public.hr_leave_*` RPC and hand back the camelized payload as `HrResult`.
 *
 * A refusal is DATA (`HrDenied`) and a breakage is `HrFailed`. Neither throws: SPEC-LEAVE's
 * surfaces render a refusal in place, and an exception would unmount the page instead.
 */
export async function callHrLeaveRpc(
  rpc: HrLeaveRpcName,
  args: Record<string, unknown>,
  opts?: HrRpcOptions,
): Promise<HrResult<Record<string, unknown>>> {
  if (HR_MOCK_ENABLED) refuseMock(rpc, opts?.mockCase);

  const query = rpcClient.rpc(rpc, args);
  let data: unknown;
  let error: PostgrestLikeError | null;
  try {
    ({ data, error } = await (opts?.signal ? query.abortSignal(opts.signal) : query));
  } catch (cause) {
    return failed(
      "We could not reach the time-off service. Check your connection and try again.",
      cause instanceof Error ? cause.name : null,
    );
  }

  if (error) {
    if (error.code === PG_INSUFFICIENT_PRIVILEGE) {
      return denied("no_standing", null, {});
    }
    // Never the raw Postgres sentence as page text — `HrError` shows `message` to a person.
    return failed(
      "That time-off request did not go through. Try again, or ask an administrator for help.",
      error.code ?? null,
    );
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return failed("The time-off service answered with something we could not read.", null);
  }

  const envelope = camelizeDeep(data) as Record<string, unknown>;

  if (envelope.granted !== true) {
    const reason = typeof envelope.reason === "string" ? envelope.reason : "not_reachable";
    const detail = typeof envelope.detail === "string" ? envelope.detail : null;
    return denied(reason, detail, envelope);
  }

  return { ok: true, data: envelope };
}
