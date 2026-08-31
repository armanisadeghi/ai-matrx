"use client";

// features/mandates/test-run.ts
//
// RUNNING A MANDATE ONCE — the ONE client path for `POST /mandates/{key}/test`,
// plus the transport shapes and the runtime boundary that guards them.
//
// It lives HERE, in the mandates feature, and not in `features/mandates/admin/`
// where it was born, because it now has two callers on two different route
// groups: the admin bench's "Try it now" panel (`(admin)`) and the personal
// Mandate workspace's "Run this job" section (`(core)`). A `(core)` surface
// importing the admin console's 1000-line Supabase service to reach one fetch
// would drag the whole console into the core bundle — and copying the fetch
// instead would be a second implementation of something we own. So the
// function moved down to the shared feature both sides already depend on
// (`features/mandates/admin/service.ts` imports from `features/mandates/`
// today; the arrow keeps pointing the same way).
//
// 🚨 SUPER ADMIN ONLY. The server declares `require_super_admin` on this
// endpoint. Every caller gates on `selectIsSuperAdmin` BEFORE offering the
// affordance — a normal user must never be walked into a guaranteed 403.
//
// No progress UI is possible here: the endpoint returns one completed result
// and exposes no requestId, so there is no stream to adopt. When it learns to
// stream, callers adopt it and render the canonical `LiveRunWindow` — never a
// hand-rolled progress bar.

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { isJsonObject, toJsonRecord, type JsonObject } from "@/types/json";
import type { components } from "@/types/python-generated/api-types";
import { usableServerNotes } from "@/components/official/ServerNotes";

/** Bench transport shapes — aidream's generated OpenAPI contract. */
export type MandateTestCandidate = components["schemas"]["MandateCandidate"];
export type MandateTestResponse = components["schemas"]["MandateTestResult"];
export type MandateTestRequest = components["schemas"]["MandateTestRequest"];

/**
 * ── LOCAL API-TYPE EXTENSION — delete on the next `pnpm db-types` / api-types
 * regeneration ───────────────────────────────────────────────────────────────
 *
 * A Mandate names a job; an Agent OR a Workflow can hold it. When the holder is
 * a WORKFLOW the server runs a child workflow run and reports its identity on
 * the test result:
 *
 *   holder_type  "agent" | "workflow"   (absent ⇒ "agent")
 *   run_id       the CHILD WORKFLOW run id, or null
 *   workflow_id  the workflow definition id, or null
 *
 * `types/python-generated/api-types.ts` is GENERATED and does not carry these
 * fields yet (the aidream half ships in parallel), and hand-editing a generated
 * file is banned. So the three fields are narrowed HERE at ingress with runtime
 * validation — never a cast on the response, never `any` — exactly the seam
 * `./provision-shapes.ts` uses for the wave-1 columns and `./browse/service.ts`
 * uses for the `mnd_*` RPCs. Remove this block (and read the fields off
 * `MandateTestResponse` directly) once the generated types carry them.
 */
export interface MandateRunHolder {
  holderType: "agent" | "workflow";
  /** The CHILD WORKFLOW run id — the door to `/workflows/runs/{run_id}`. */
  runId: string | null;
  workflowId: string | null;
}

/**
 * Read the holder half of a test result. Absent/unknown values answer "agent"
 * with no run — which is exactly what a server that has not shipped the fields
 * yet means, so an old server degrades to today's behaviour instead of lying.
 */
export function readMandateRunHolder(result: unknown): MandateRunHolder {
  if (!isJsonObject(result)) {
    return { holderType: "agent", runId: null, workflowId: null };
  }
  const holderType = result.holder_type === "workflow" ? "workflow" : "agent";
  return {
    holderType,
    runId: typeof result.run_id === "string" && result.run_id ? result.run_id : null,
    workflowId:
      typeof result.workflow_id === "string" && result.workflow_id
        ? result.workflow_id
        : null,
  };
}

/**
 * ── A REFUSAL IS A RESULT, NOT AN ACCIDENT ───────────────────────────────────
 *
 * 🚨 THE DEFECT THIS EXISTS FOR (V3 round 4 § honesty). A refused run —
 * `409 mandate_unfulfilled` (bind a Holder / fix the binding) or
 * `422 mandate_inputs_rejected` (fix the call), the two answers
 * `aidream/api/routers/mandate_errors.py` is the ONE source of — reached the
 * run panels as `new Error(message)`. Every caller caught it, fired a toast and
 * cleared the result panel, so the server's carefully-written sentence lived
 * for a few seconds inside a disappearing bubble and the panel below it went
 * blank. A person who blinked could not read what refused, why, or what to do,
 * and had to run it again to try to catch the toast.
 *
 * So the throw carries the whole refusal — status, machine code, the server's
 * sentence verbatim, any notes it wrote and the request id — and the panels
 * KEEP it on screen until the next run replaces it. The toast, if any, is a
 * courtesy; the panel is the record.
 */
export class MandateRunRefusal extends Error {
  /** HTTP status, or null when the failure never reached an HTTP answer
   * (a dead socket, an unreadable body). */
  readonly status: number | null;
  /** The machine code the door named (`mandate_unfulfilled`,
   * `mandate_inputs_rejected`, …) — null when the body carried none. */
  readonly code: string | null;
  /** The server's own sentences about the refusal, verbatim. */
  readonly notes: string[];
  /** For support: the id the request was logged under. */
  readonly requestId: string | null;

  constructor(init: {
    message: string;
    status?: number | null;
    code?: string | null;
    notes?: readonly unknown[];
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = "MandateRunRefusal";
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.notes = usableServerNotes(init.notes ?? []);
    this.requestId = init.requestId ?? null;
  }
}

/** The machine code a refusal body names. aidream's mandate mapper writes
 * `code`; the global envelope writes `error` — read both rather than guess. */
function refusalCode(serverDetail: unknown): string | null {
  if (!isJsonObject(serverDetail)) return null;
  for (const key of ["code", "error"] as const) {
    const value = serverDetail[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const nested = serverDetail.detail;
  if (isJsonObject(nested)) {
    for (const key of ["code", "error"] as const) {
      const value = nested[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return null;
}

/** Sentences a refusal body carried alongside its message. */
function refusalNotes(serverDetail: unknown): unknown[] {
  if (!isJsonObject(serverDetail)) return [];
  if (Array.isArray(serverDetail.notes)) return serverDetail.notes;
  const nested = serverDetail.detail;
  if (isJsonObject(nested) && Array.isArray(nested.notes)) return nested.notes;
  return [];
}

/**
 * ANY thrown failure of a run, read as something a panel can print. Never
 * invents a sentence: a non-refusal error contributes its own message and
 * nothing else, so "the network died" cannot be mistaken for a server verdict.
 */
export interface MandateRunFailure {
  /** The sentence to print, verbatim. */
  sentence: string;
  status: number | null;
  code: string | null;
  notes: string[];
  requestId: string | null;
  /** True when the SERVER refused — as opposed to a transport/shape failure. */
  refused: boolean;
}

export function describeMandateRunFailure(error: unknown): MandateRunFailure {
  if (error instanceof MandateRunRefusal) {
    return {
      sentence: error.message,
      status: error.status,
      code: error.code,
      notes: error.notes,
      requestId: error.requestId,
      refused: error.status != null && error.status >= 400 && error.status < 500,
    };
  }
  return {
    sentence: error instanceof Error ? error.message : String(error),
    status: null,
    code: null,
    notes: [],
    requestId: null,
    refused: false,
  };
}

/** What a refusal IS, in this product's words — printed above the server's own
 * sentence, never instead of it. Unknown statuses say so rather than guess. */
export function mandateRefusalHeadline(failure: MandateRunFailure): string {
  if (failure.status === 409) return "Refused — nothing fulfils this job yet";
  if (failure.status === 422) return "Refused — the values this run sent";
  if (failure.status === 404) return "Refused — no job by that key";
  if (failure.status === 403) return "Refused — you may not run this";
  if (failure.status != null) return `Refused — HTTP ${failure.status}`;
  return "The run never reached the server";
}

function structuralVerdictValidationErrors(value: unknown): string[] {
  if (!isJsonObject(value)) return ["structural must be an object"];
  const errors: string[] = [];
  if (typeof value.checked !== "boolean") {
    errors.push("structural.checked must be a boolean");
  }
  if (
    !Array.isArray(value.errors) ||
    !value.errors.every((entry) => typeof entry === "string")
  ) {
    errors.push("structural.errors must be an array of strings");
  }
  return errors;
}

/** Explain an open-JSONB contract failure at the field that broke it. */
export function mandateTestResultValidationErrors(value: unknown): string[] {
  if (!isJsonObject(value)) return ["result must be an object"];
  const errors: string[] = [];
  if (typeof value.id !== "string") errors.push("id must be a string");
  if (typeof value.created_at !== "string") {
    errors.push("created_at must be a string");
  }
  if (typeof value.mandate_key !== "string") {
    errors.push("mandate_key must be a string");
  }
  if (!(typeof value.exemplar_id === "string" || value.exemplar_id == null)) {
    errors.push("exemplar_id must be a string or null");
  }
  if (typeof value.candidate_id !== "string") {
    errors.push("candidate_id must be a string");
  }
  if (typeof value.candidate_label !== "string") {
    errors.push("candidate_label must be a string");
  }
  if (typeof value.provenance !== "string") {
    errors.push("provenance must be a string");
  }
  if (typeof value.is_version !== "boolean") {
    errors.push("is_version must be a boolean");
  }
  if (typeof value.output !== "string") errors.push("output must be a string");
  if (typeof value.duration_ms !== "number") {
    errors.push("duration_ms must be a number");
  }
  errors.push(...structuralVerdictValidationErrors(value.structural));
  return errors;
}

/** Runtime boundary for generated test results stored inside open JSONB.
 * `exemplar_id` is null on an AD-HOC run (a "Try it now" run that has no
 * stored test case yet) and a string on every persisted one. */
export function isMandateTestResult(
  value: unknown,
): value is MandateTestResponse {
  return mandateTestResultValidationErrors(value).length === 0;
}

/**
 * Run ONE candidate against inputs typed right now, with no stored test case —
 * the "Try it now" path that makes a cold mandate (no exemplars) benchable at
 * all, and the same path the personal workspace runs a job on. The server
 * persists nothing for an ad-hoc run; the admin bench's
 * `saveAdHocResultAsExemplar` turns a good one into the mandate's first real
 * test case.
 *
 * 🚨 Structured values go in `variables`, NEVER smuggled through `user_input`
 * (THE USER-INPUT LAW) — `user_input` carries only what a human typed.
 *
 * 🚨 `principal` DECIDES WHICH HOLDER RUNS. The server resolves the mandate with
 * exactly the principal it is handed, so omitting it resolves the SYSTEM
 * default and silently ignores the caller's own binding — which makes a
 * "run what fulfils this job for me" affordance a lie the moment the user
 * overrides the Holder (and is the only reason a workflow Holder would never
 * be the thing that runs). The admin bench deliberately omits it: comparing
 * candidates against the system default is its whole job. Any surface that
 * shows a person THEIR resolution must pass THEIR principal.
 */
export async function runMandateAdHocTest(
  dispatch: AppDispatch,
  mandateKey: string,
  input: {
    variables: JsonObject;
    userInput?: string | null;
    candidate?: MandateTestCandidate;
    /** Omitted = resolve the system default. See the law above. */
    principal?: { user_id: string | null; organization_id: string | null };
  },
): Promise<MandateTestResponse> {
  const body: MandateTestRequest = {
    variables: toJsonRecord(input.variables),
    user_input: input.userInput?.trim() ? input.userInput : null,
    candidate: input.candidate,
    ...(input.principal ? { principal: input.principal } : {}),
  };
  const response = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/test",
      method: "POST",
      pathParams: { mandate_key: mandateKey },
      body,
      // One agent run, not a batch — but a slow model on a long prompt still
      // outruns the default connect deadline, and this endpoint sends no
      // headers until the run has finished.
      connectTimeoutMs: 5 * 60_000,
      totalTimeoutMs: null,
    }),
  );
  if (response.error) {
    // The WHOLE refusal travels — a caller that only got a string could not
    // keep the server's verdict on screen, which is the defect this closes.
    throw new MandateRunRefusal({
      message: response.error.message,
      status: response.error.status ?? null,
      code: response.error.code ?? refusalCode(response.error.serverDetail),
      notes: refusalNotes(response.error.serverDetail),
      requestId: response.requestId ?? null,
    });
  }
  if (!isMandateTestResult(response.data)) {
    throw new MandateRunRefusal({
      message: `The server answered 200 with something that is not a run result: ${mandateTestResultValidationErrors(
        response.data,
      ).join("; ")}`,
      requestId: response.requestId ?? null,
    });
  }
  return response.data;
}
