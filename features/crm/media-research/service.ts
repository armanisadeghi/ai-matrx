// features/crm/media-research/service.ts
//
// Media-list research (Brief 3) — the client half of the workflow around the
// Media List Ranker (aidream `aidream/services/crm/media_list_research.py`).
//
//   previewMediaResearch → `POST /crm/outreach-lists/{list_id}/media-research/preview`
//                          size, brief, target and MAXIMUM cost. Spends nothing.
//   runMediaResearch     → `POST /crm/outreach-lists/{list_id}/media-research/run`
//                          the approved run, streamed as typed `media_research_*` events.
//
// Nothing paid runs until the person presses "Run it" on the preview. Above the
// cap the preview carries a strong warning with one-click smaller options, and
// the run still goes ahead as asked when the person confirms
// (common-docs/policies/validation-offers-never-blocks.md).

import type { components } from "@/types/python-generated/api-types";
import type {
  MediaResearchProgressData,
  MediaResearchResultData,
  MediaResearchRow,
  TypedStreamEvent,
} from "@/types/python-generated/stream-events";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

export type MediaResearchRequest = components["schemas"]["MediaResearchRequest"];
export type MediaResearchPreview = components["schemas"]["MediaResearchPreview"];
export type { MediaResearchProgressData, MediaResearchResultData, MediaResearchRow };

export type MediaResearchEvent =
  | { kind: "progress"; data: MediaResearchProgressData }
  | { kind: "result"; data: MediaResearchResultData };

export async function previewMediaResearch(
  organizationId: string,
  listId: string,
  request: MediaResearchRequest,
): Promise<MediaResearchPreview> {
  const { data } = await apiPost(
    buildPath("/crm/outreach-lists/{list_id}/media-research/preview", { list_id: listId }),
    { request },
    { organizationId },
  );
  return data;
}

/** Narrow one stream envelope to a research event; everything else is the platform's. */
export function asMediaResearchEvent(event: TypedStreamEvent): MediaResearchEvent | null {
  if (event.event !== "data") return null;
  const data = event.data as { type?: string };
  if (data?.type === "media_research_progress") {
    return { kind: "progress", data: data as MediaResearchProgressData };
  }
  if (data?.type === "media_research_result") {
    return { kind: "result", data: data as MediaResearchResultData };
  }
  return null;
}

export interface RunMediaResearchOptions {
  organizationId: string;
  listId: string;
  request: MediaResearchRequest;
  preview: MediaResearchPreview;
  /** The person saw the over-cap warning and went ahead. */
  confirmedOverCap: boolean;
  signal?: AbortSignal;
  onEvent: (event: MediaResearchEvent) => void;
}

/**
 * Run the approved research. Resolves when the stream ends; a refusal (the
 * request changed after the preview, the approved cost is stale) rejects with
 * the server's own sentence. Closing the tab does not stop the server — the
 * answer is stored on the list.
 */
export async function runMediaResearch(
  dispatch: AppDispatch,
  options: RunMediaResearchOptions,
): Promise<void> {
  let streamError: string | null = null;
  const result = await dispatch(
    callApi<"/crm/outreach-lists/{list_id}/media-research/run", "POST">({
      path: "/crm/outreach-lists/{list_id}/media-research/run",
      method: "POST",
      pathParams: { list_id: options.listId },
      scopeOverrides: { organization_id: options.organizationId },
      body: {
        run: {
          request: options.request,
          run_key: options.preview.run_key,
          approved_max_cost_usd: options.preview.cost.max_cost_usd,
          confirmed_over_cap: options.confirmedOverCap,
        },
      },
      stream: true,
      ...(options.signal ? { signal: options.signal } : {}),
      onStreamEvent: (event) => {
        if (event.event === "error") {
          const data = event.data as { user_message?: unknown; message?: unknown };
          streamError =
            (typeof data.user_message === "string" && data.user_message) ||
            (typeof data.message === "string" && data.message) ||
            "The research run stopped with an error.";
          return;
        }
        const parsed = asMediaResearchEvent(event);
        if (parsed) options.onEvent(parsed);
      },
      expectedErrorStatuses: [404, 409],
    }),
  );
  if (result.error) {
    const detail = result.error.serverDetail as
      | { detail?: { message?: unknown } }
      | undefined;
    const message =
      typeof detail?.detail?.message === "string"
        ? detail.detail.message
        : result.error.message;
    throw new Error(message || "The research run could not start.");
  }
  if (streamError) throw new Error(streamError);
}

export const STATUS_LABEL: Record<MediaResearchRow["status"], string> = {
  fit: "Fit",
  soft_fit: "Soft fit",
  research_needed: "Research needed",
  cut: "Cut",
};

export const CONTACT_LABEL: Record<NonNullable<MediaResearchRow["contact_state"]>, string> = {
  verified: "Verified",
  quarantined: "Quarantined",
  unresolved: "Unresolved",
};

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}
