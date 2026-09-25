/**
 * "What the agent will see" for a custom-data variable binding.
 *
 * aidream `POST /agents/variable-bindings/preview`
 * `{ organization_id, binding, variable_name? }` → `{ text, present, row_count,
 * total_rows, truncated, override_policy, absent_reason, notes, withheld, trace }`
 * (aidream `api/routers/agent_variable_bindings.py`; data-kits PLAN § P1). The
 * server resolves the binding exactly as a run would, under the caller's own
 * principal, so the editor shows the real text — never a client-side imitation.
 *
 * CONTRACT NOTE: the route is on aidream main but not yet in this repo's
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
      /** False when `text` is a named absence rather than data. */
      present: boolean;
      rowCount: number | null;
      totalRows: number | null;
      truncated: boolean;
      absentReason: string | null;
      /** Cap, template and freshness notes, shown as the server words them. */
      notes: string[];
      /** Field keys masked for this person — named, never shown. */
      withheld: string[];
    }
  | { state: "unavailable" }
  | { state: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export async function previewVariableBinding(
  organizationId: string,
  binding: CustomDataBinding,
  options: { variableName?: string; signal?: AbortSignal } = {},
): Promise<VariableBindingPreview> {
  const { variableName, signal } = options;
  try {
    const { data } = await postJson<unknown>(
      "/agents/variable-bindings/preview",
      {
        organization_id: organizationId,
        binding,
        ...(variableName ? { variable_name: variableName } : {}),
      },
      // The X-Organization-Id header must name the SAME organization as the
      // body — pass it explicitly rather than letting the transport resolve one.
      { signal, captureErrors: false, organizationId },
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
      present: data.present !== false,
      rowCount: typeof data.row_count === "number" ? data.row_count : null,
      totalRows: typeof data.total_rows === "number" ? data.total_rows : null,
      truncated: data.truncated === true,
      absentReason:
        typeof data.absent_reason === "string" ? data.absent_reason : null,
      notes: stringList(data.notes),
      withheld: stringList(data.withheld),
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
