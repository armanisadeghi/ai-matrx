"use client";

// features/mandates/record-next/owner-service.ts
//
// THE OWNER'S DOORS on the level-aware mandate record (person / organization
// seats). Owner model: common-docs/systems/intelligence/mandates/MANDATE-SYSTEM.md §2–§3 —
// an organization or a user creates SOFT mandates and owns them.
//
//   GET   /mandates/{key}/definition-rights  what THIS viewer may do (edit /
//                                            remove) and why not, in words.
//                                            The pencils read it; they never
//                                            re-derive the rule.
//   PATCH /mandates/{key}/definition         name, description, output format,
//                                            output constraints (owner or
//                                            super admin).
//   POST  /mandates/{key}/try                run it once AS the caller, with
//                                            the binding that runs for them or
//                                            a named agent/workflow they can
//                                            see. Paid work, charged to them.
//
// The goal and described inputs keep their existing doors (PATCH /goal,
// /draft-inputs), which the server now opens to the owner too.

import { callApi } from "@/lib/api/call-api";
import { parseCallApiError } from "@/lib/api/errors";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";
import { invalidateMandateCache } from "@/features/mandates/service";
import {
  MandateRunRefusal,
  isMandateTestResult,
  mandateTestResultValidationErrors,
  refusalCode,
  refusalNotes,
  type MandateTestResponse,
} from "@/features/mandates/test-run";
import type { JsonObject } from "@/types/json";

export type MandateDefinitionRights = components["schemas"]["DefinitionRights"];
export type MandateTryCandidate = components["schemas"]["MemberTryCandidate"];

export async function fetchDefinitionRights(
  dispatch: AppDispatch,
  mandateKey: string,
): Promise<MandateDefinitionRights> {
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/definition-rights",
      method: "GET",
      pathParams: { mandate_key: mandateKey },
    }),
  );
  if (result.error) throw new Error(parseCallApiError(result.error).userMessage);
  return result.data as MandateDefinitionRights;
}

export interface OwnerDefinitionPatch {
  label?: string;
  description?: string;
  outputKind?: string | null;
  outputConstraints?: string;
}

export async function patchOwnerDefinition(
  dispatch: AppDispatch,
  mandateKey: string,
  patch: OwnerDefinitionPatch,
  /** Organization seat: the route organization — a write needs one, and on
   * that seat it is the page's own, never whatever the header last held. */
  organizationId?: string | null,
): Promise<void> {
  const body: components["schemas"]["MandateDefinitionPatch"] = {
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.outputKind !== undefined ? { output_kind: patch.outputKind ?? "" } : {}),
    ...(patch.outputConstraints !== undefined
      ? { output_constraints: patch.outputConstraints }
      : {}),
  };
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/definition",
      method: "PATCH",
      pathParams: { mandate_key: mandateKey },
      body,
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
    }),
  );
  if (result.error) throw new Error(parseCallApiError(result.error).userMessage);
  invalidateMandateCache(mandateKey);
}

/**
 * Run the mandate once as the caller. A refusal (404 / 403 / 409 / 422) comes
 * back as a `MandateRunRefusal` carrying the server's own sentence, so the
 * panel keeps it on screen (the same honesty class as the admin bench).
 *
 * `organizationId` is the organization the run happens in; an organization
 * seat passes its route organization, and it redirects the whole request
 * context (`scopeOverrides`), never only a body field.
 */
export async function runMandateTry(
  dispatch: AppDispatch,
  mandateKey: string,
  input: {
    variables: JsonObject;
    userInput: string | null;
    candidate: MandateTryCandidate;
    organizationId?: string | null;
  },
): Promise<MandateTestResponse> {
  const result = await dispatch(
    callApi({
      path: "/mandates/{mandate_key}/try",
      method: "POST",
      pathParams: { mandate_key: mandateKey },
      body: {
        variables: input.variables,
        user_input: input.userInput,
        candidate: input.candidate,
      },
      ...(input.organizationId
        ? { scopeOverrides: { organization_id: input.organizationId } }
        : {}),
      // One run; this endpoint sends nothing until it has finished.
      connectTimeoutMs: 5 * 60_000,
      totalTimeoutMs: null,
    }),
  );
  if (result.error) {
    throw new MandateRunRefusal({
      message: parseCallApiError(result.error).userMessage,
      status: result.error.status ?? null,
      code: result.error.code ?? refusalCode(result.error.serverDetail),
      notes: refusalNotes(result.error.serverDetail),
      requestId: result.requestId ?? null,
    });
  }
  if (!isMandateTestResult(result.data)) {
    throw new MandateRunRefusal({
      message: `The server answered with something that is not a run result: ${mandateTestResultValidationErrors(
        result.data,
      ).join("; ")}`,
      requestId: result.requestId ?? null,
    });
  }
  return result.data;
}
