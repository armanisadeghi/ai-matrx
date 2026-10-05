// features/mandates/test-run.ts — the admin bench's ad-hoc run. The shapes and refusal helpers moved
// into @ai-matrx/chat (mandates/test-run-core); this file keeps the one call that needs the app's API thunk.

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { toJsonRecord, type JsonObject } from "@/types/json";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import {
  MandateRunRefusal,
  isMandateTestResult,
  mandateTestResultValidationErrors,
  refusalCode,
  refusalNotes,
  type MandateTestCandidate,
  type MandateTestRequest,
  type MandateTestResponse,
} from "@ai-matrx/chat/mandates/test-run-core";

export * from "@ai-matrx/chat/mandates/test-run-core";

/**
 * Run ONE candidate against inputs typed right now, with no stored test case —
 * the "Try it now" path that makes a cold mandate (no exemplars) benchable at
 * all, and the same path the own organization runs a job on. The server
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
  mandateKey: AnyMandateKey,
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
