/**
 * "What the agent will see" for a custom-data variable binding.
 *
 * aidream `POST /agents/variable-bindings/preview` `{ organization_id, binding }`
 * → `{ text, row_count, truncated, trace }` (data-kits PLAN § P1, DYN-24). The
 * server resolves the binding exactly as a run would, under the caller's own
 * principal, so the editor shows the real text — never a client-side imitation.
 *
 * CONTRACT NOTE: the route is being built in aidream right now and is not yet in
 * `types/python-generated/api-types.ts`, so `apiPost` cannot name it. Until the
 * next `pnpm sync-types` carries it, this calls the canonical raw transport and
 * VALIDATES the response at ingress (no asserted type). When the route lands in
 * the contract, switch to `apiPost("/agents/variable-bindings/preview", …)`.
 *
 * A 404/405 means "this server does not have the route yet" — a STATE the
 * editor shows calmly, never an error.
 */

import { postJson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";

export type VariableBindingPreview =
  | {
      state: "ready";
      text: string;
      rowCount: number | null;
      truncated: boolean;
    }
  | { state: "unavailable" }
  | { state: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function previewVariableBinding(
  organizationId: string,
  binding: CustomDataBinding,
  signal?: AbortSignal,
): Promise<VariableBindingPreview> {
  try {
    const { data } = await postJson<unknown>(
      "/agents/variable-bindings/preview",
      { organization_id: organizationId, binding },
      { signal, captureErrors: false },
    );
    if (!isRecord(data) || typeof data.text !== "string") {
      return {
        state: "error",
        message:
          "The server answered the preview in a shape this page does not read.",
      };
    }
    return {
      state: "ready",
      text: data.text,
      rowCount: typeof data.row_count === "number" ? data.row_count : null,
      truncated: data.truncated === true,
    };
  } catch (err) {
    if (
      err instanceof BackendApiError &&
      (err.status === 404 || err.status === 405)
    ) {
      return { state: "unavailable" };
    }
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return {
      state: "error",
      message:
        err instanceof BackendApiError
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : "The preview could not be loaded.",
    };
  }
}
