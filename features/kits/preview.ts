// features/kits/preview.ts — "what the agent sees": the server renders a binding.
//
// `POST /agents/variable-bindings/preview` {organization_id, binding} →
// {text, row_count, truncated, trace} (PLAN.md § P1). The route is new; until the
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
  const notes = [
    ...stringsFrom(data.notes),
    ...stringsFrom(data.not_delivered),
    ...stringsFrom(data.warnings),
    ...(isRecord(trace) ? [...stringsFrom(trace.notes), ...stringsFrom(trace.not_delivered)] : []),
  ];
  return {
    text: data.text,
    row_count: typeof data.row_count === "number" ? data.row_count : null,
    truncated: data.truncated === true,
    notes,
    trace,
  };
}

export function previewBinding(
  organizationId: string,
  binding: MergeFieldBinding,
): ThunkAction<Promise<PreviewAnswer>, RootState, unknown, UnknownAction> {
  return async (_dispatch, getState) => {
    await waitForAuthReady(getState);
    const state = getState();
    const { headers } = resolveAuth(state);
    let response: Response;
    try {
      response = await fetch(`${resolveBaseUrl(state)}${BINDING_PREVIEW_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organization_id: organizationId, binding }),
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
      const detail =
        isRecord(body) && typeof body.detail === "string"
          ? body.detail
          : isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
            ? body.error.message
            : `HTTP ${response.status}`;
      return { state: "error", message: detail };
    }
    const preview = readPreview(body);
    if (!preview) return { state: "error", message: "The server answered, but not in the shape a preview has." };
    return { state: "ok", preview };
  };
}
