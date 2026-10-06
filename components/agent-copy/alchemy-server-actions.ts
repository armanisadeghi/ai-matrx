/**
 * The Alchemy host `serverActions` port (Applets CONTRACTS §6): an Action with
 * `runs: "server"` runs through aidream's ONE server-action door,
 * `POST /actions/run` (aidream `aidream/api/routers/actions.py`), over the app's
 * one Python call path (`callApi`: auth, organization — asked for when none is
 * selected — and the active server).
 *
 * The server's answer comes back as it is: `applied`, `proposed` (an `ask`
 * Action an agent started; the person confirms it through `/directives/confirm`)
 * or `refused`. A refusal the server states by name (unknown action, a caller
 * it does not allow, a manual Action an agent started) is a `refused` answer
 * with the server's sentence; a call that never reached an answer rejects with
 * its message, which the runner shows as a retryable failure.
 */

import type { Json, ServerActionPort } from "@ai-matrx/alchemy/ports";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

function serverSentence(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const body = detail as Record<string, unknown>;
  for (const key of ["user_message", "message"] as const) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const nested = body.detail;
  return nested && typeof nested === "object" ? serverSentence(nested) : null;
}

export function createServerActionPort(dispatch: AppDispatch): ServerActionPort {
  return {
    async run(request) {
      const input =
        request.input && typeof request.input === "object" && !Array.isArray(request.input)
          ? (request.input as Record<string, unknown>)
          : { value: request.input };
      const response = await dispatch(
        callApi({
          path: "/actions/run",
          method: "POST",
          body: {
            name: request.name,
            input,
            by: request.by,
            ...(request.surface_name ? { surface_name: request.surface_name } : {}),
            // With a surface the declared Action's policy wins; `manual` needs no body policy
            // (a non-person caller was already refused by the runner).
            ...(request.policy && request.policy !== "manual" ? { policy: request.policy } : {}),
          },
        }),
      );
      if (response.error) {
        const status = response.error.status;
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 401) {
          return {
            status: "refused",
            message: serverSentence(response.error.serverDetail) ?? response.error.message,
            receipts: [],
          };
        }
        throw new Error(response.error.message);
      }
      const data = response.data as {
        status?: unknown;
        message?: unknown;
        receipts?: unknown;
        proposal?: unknown;
      } | null;
      if (
        !data ||
        (data.status !== "applied" && data.status !== "proposed" && data.status !== "refused") ||
        typeof data.message !== "string"
      ) {
        throw new Error(`POST /actions/run did not answer with a run result for "${request.name}".`);
      }
      return {
        status: data.status,
        message: data.message,
        receipts: Array.isArray(data.receipts) ? (data.receipts as Json[]) : [],
        ...(data.proposal ? { proposal: data.proposal as Json } : {}),
      };
    },
  };
}
