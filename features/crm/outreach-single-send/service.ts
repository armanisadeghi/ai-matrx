import type { components } from "@/types/python-generated/api-types";
import { BackendApiError } from "@/lib/api/errors";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { isJsonObject } from "@/types/json";

export type OutreachDraft = components["schemas"]["DraftResponse"];
export type OutreachSendResult = components["schemas"]["SendResponse"];

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
