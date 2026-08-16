import type { components } from "@/types/python-generated/api-types";
import { BackendApiError } from "@/lib/api/errors";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { postJson } from "@/lib/python-client";
import { isJsonObject } from "@/types/json";

export type OutreachDraft = components["schemas"]["DraftResponse"];
export type OutreachSendResult = components["schemas"]["SendResponse"];

/**
 * What a rejection returns — deliberately lean on the server too: rejecting must
 * not depend on re-rendering a message whose template may be the very thing
 * wrong with it. Hand-typed until the deployed OpenAPI spec carries the route;
 * source of truth: aidream `outreach_single_send/models.py::RejectDraftResponse`.
 */
export interface OutreachRejectResult {
  id: string;
  status: string;
  member_id: string | null;
  /** `done` when the member left the sequence; null when there was no member. */
  member_status: string | null;
  rejected_at: string;
  reason: string | null;
}

export interface OutreachProblem {
  code: string;
  message: string;
  fix: string;
  unresolved: string[];
}

export async function createOutreachDraft(input: {
  outreachListId: string;
  memberId: string;
  templateId: string;
  reputationCaseId?: string;
  backlinkId?: string;
}): Promise<OutreachDraft> {
  const { data } = await apiPost("/outreach/single/drafts", {
    outreach_list_id: input.outreachListId,
    member_id: input.memberId,
    template_id: input.templateId,
    reputation_case_id: input.reputationCaseId ?? null,
    backlink_id: input.backlinkId ?? null,
  });
  return data;
}

export async function approveOutreachDraft(
  draftId: string,
): Promise<OutreachDraft> {
  const { data } = await apiPost(
    buildPath("/outreach/single/drafts/{draft_id}/approve", {
      draft_id: draftId,
    }),
    {},
  );
  return data;
}

export async function sendOutreachDraft(
  draftId: string,
): Promise<OutreachSendResult> {
  const { data } = await apiPost(
    buildPath("/outreach/single/drafts/{draft_id}/send", {
      draft_id: draftId,
    }),
    {},
  );
  return data;
}

/**
 * Reword the AI-written personalization line(s) and re-render this exact draft.
 *
 * THE ONLY EDITABLE PART OF A DRAFT IS THE PART AN AGENT WROTE — the rest is the
 * template rendered over stored records, re-rendered at approve and at send, so
 * hand-edited bytes would be silently reverted or refused as `draft_changed`.
 * Editing the binding keeps ONE deterministic render. The server voids the
 * approval, because the bytes changed.
 *
 * Raw client, not `apiPost`: the deployed OpenAPI spec does not carry this route
 * yet (same honest gap as `bring-up-readiness`). Switch when `pnpm sync-types`
 * picks it up. Source of truth:
 * aidream/aidream/services/outreach_single_send/service.py::revise_personalization
 */
export async function reviseOutreachPersonalization(
  draftId: string,
  fields: Record<string, string>,
): Promise<OutreachDraft> {
  const { data } = await postJson<OutreachDraft>(
    `/outreach/single/drafts/${encodeURIComponent(draftId)}/personalization`,
    { fields },
  );
  return data;
}

/**
 * Cancel this message and take the member out of the sequence (D-W1-13).
 *
 * Not a suppression: nothing is added to any blocklist and the contact record is
 * untouched. Reversible in one click through the campaign workspace's Requeue.
 */
export async function rejectOutreachDraft(
  draftId: string,
  reason?: string,
): Promise<OutreachRejectResult> {
  const { data } = await postJson<OutreachRejectResult>(
    `/outreach/single/drafts/${encodeURIComponent(draftId)}/reject`,
    { reason: reason?.trim() || null },
  );
  return data;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Preserve the server's fix instead of collapsing a governed refusal to 409. */
export function readOutreachProblem(error: unknown): OutreachProblem {
  if (!(error instanceof BackendApiError)) {
    return {
      code: "unexpected_error",
      message: error instanceof Error ? error.message : "The request failed.",
      fix: "Try again. If this keeps happening, open the sending checklist.",
      unresolved: [],
    };
  }
  const detail = isJsonObject(error.details) ? error.details : {};
  return {
    code: typeof detail.code === "string" ? detail.code : error.code,
    message:
      typeof detail.message === "string" ? detail.message : error.userMessage,
    fix:
      typeof detail.fix === "string"
        ? detail.fix
        : "Open the sending checklist and resolve this item.",
    unresolved: stringList(detail.unresolved),
  };
}
