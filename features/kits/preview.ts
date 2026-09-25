// features/kits/preview.ts — "what the agent sees": the server renders a binding.
//
// `POST /agents/variable-bindings/preview` {organization_id, binding} →
// {text, present, row_count, total_rows, truncated, override_policy, absent_reason,
// notes, withheld, trace} (aidream `api/routers/agent_variable_bindings.py`). The route is new; until the
// generated API types carry it (`pnpm sync-types` from the aidream checkout), it is
// called through the same auth + base-URL plumbing `callApi` uses, and its answer is
// READ DEFENSIVELY. A 404 is a STATE ("the server binding is not deployed yet"),
// never a fake preview.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { resolveAuth, resolveBaseUrl, waitForAuthReady } from "@/lib/api/call-api";
import { BINDING_PREVIEW_PATH } from "./constants";
import type { BindingPreview, MergeFieldBinding } from "./types";

export type PreviewAnswer =
  | { state: "ok"; preview: BindingPreview }
  | { state: "not_deployed"; message: string }
  | { state: "error"; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringsFrom(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : isRecord(x) && typeof x.message === "string" ? x.message : null))
    .filter((x): x is string => !!x);
}

/** Read the answer without trusting its shape; every "not delivered" note is kept. */
export function readPreview(body: unknown): BindingPreview | null {
  if (!isRecord(body)) return null;
  const data = isRecord(body.data) ? body.data : body;
  if (typeof data.text !== "string") return null;
  const trace = data.trace;
  const notes = stringsFrom(data.notes);
  return {
    text: data.text,
    present: data.present !== false,
    row_count: typeof data.row_count === "number" ? data.row_count : null,
    total_rows: typeof data.total_rows === "number" ? data.total_rows : null,
    truncated: data.truncated === true,
    absent_reason: typeof data.absent_reason === "string" && data.absent_reason ? data.absent_reason : null,
    notes,
    withheld: stringsFrom(data.withheld),
    trace,
  };
}

/** The server's own sentence for a refusal: `detail` (string or FastAPI's list), or the envelope's message. */
function refusalSentence(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const d = body.detail;
  if (typeof d === "string" && d) return d;
  if (Array.isArray(d)) {
    const parts = d
      .map((x) => (isRecord(x) ? `${Array.isArray(x.loc) ? x.loc.join(".") + ": " : ""}${String(x.msg ?? "")}` : String(x)))
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (isRecord(d) && typeof d.message === "string") return d.message;
  if (isRecord(body.error) && typeof body.error.message === "string") return body.error.message;
  if (typeof body.message === "string") return body.message;
  return null;
}

export function previewBinding(
  organizationId: string,
  binding: MergeFieldBinding,
  variableName?: string,
): ThunkAction<Promise<PreviewAnswer>, RootState, unknown, UnknownAction> {
  return async (_dispatch, getState) => {
    await waitForAuthReady(getState);
    const state = getState();
    const { headers } = resolveAuth(state);
    let response: Response;
    try {
      response = await fetch(`${resolveBaseUrl(state)}${BINDING_PREVIEW_PATH}`, {
        method: "POST",
        // The server's auth middleware reads the organization from this header; the body
        // names it too (the route's own contract). Both carry the one the person SET.
        headers: { ...headers, "X-Organization-Id": organizationId },
        body: JSON.stringify({ organization_id: organizationId, binding, ...(variableName ? { variable_name: variableName } : {}) }),
      });
    } catch (err) {
      return { state: "error", message: `The server could not be reached: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (response.status === 404 || response.status === 405) {
      return {
        state: "not_deployed",
        message:
          "The server's data-binding preview is not deployed yet, so this cannot show the text the agent will read. The connection itself is saved on the agent.",
      };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      return { state: "error", message: `${refusalSentence(body) ?? "The server refused the preview"} (HTTP ${response.status})` };
    }
    const preview = readPreview(body);
    if (!preview) return { state: "error", message: "The server answered, but not in the shape a preview has." };
    return { state: "ok", preview };
  };
}
