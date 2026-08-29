"use client";

// features/agents/mandates/test-run.ts
//
// RUNNING A MANDATE ONCE — the ONE client path for `POST /mandates/{key}/test`,
// plus the transport shapes and the runtime boundary that guards them.
//
// It lives HERE, in the mandates feature, and not in `features/admin/mandates/`
// where it was born, because it now has two callers on two different route
// groups: the admin bench's "Try it now" panel (`(admin)`) and the personal
// Mandate workspace's "Run this job" section (`(core)`). A `(core)` surface
// importing the admin console's 1000-line Supabase service to reach one fetch
// would drag the whole console into the core bundle — and copying the fetch
// instead would be a second implementation of something we own. So the
// function moved down to the shared feature both sides already depend on
// (`features/admin/mandates/service.ts` imports from `features/agents/mandates/`
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
 */
export async function runMandateAdHocTest(
  dispatch: AppDispatch,
  mandateKey: string,
  input: {
    variables: JsonObject;
    userInput?: string | null;
    candidate?: MandateTestCandidate;
  },
): Promise<MandateTestResponse> {
  const body: MandateTestRequest = {
    variables: toJsonRecord(input.variables),
    user_input: input.userInput?.trim() ? input.userInput : null,
    candidate: input.candidate,
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
  if (response.error) throw new Error(response.error.message);
  if (!isMandateTestResult(response.data)) {
    throw new Error("Agent mandate bench returned an invalid run result.");
  }
  return response.data;
}
