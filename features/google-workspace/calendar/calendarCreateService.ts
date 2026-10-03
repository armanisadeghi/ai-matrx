import type { components } from "@ai-matrx/agents/generated/api-types";
import { postJson } from "@/lib/python-client";

export type CalendarCreateRequest = components["schemas"]["CalendarEventCreateIntentRequest"];
export type CalendarCreateIntent = components["schemas"]["CalendarEventCreateIntentPreview"];
export type CalendarCreateResult = components["schemas"]["CalendarEventCreateIntentResult"];

const PREVIEW_PATH = "/google-integrations/calendar/create/preview";

export async function previewCalendarCreate(
  request: CalendarCreateRequest,
): Promise<CalendarCreateIntent> {
  return (await postJson<CalendarCreateIntent, CalendarCreateRequest>(PREVIEW_PATH, request, {
    organizationId: request.organization_id,
  })).data;
}

export async function confirmCalendarCreate(input: {
  intentId: string;
  organizationId: string;
}): Promise<CalendarCreateResult> {
  return (await postJson<CalendarCreateResult>(
    `/google-integrations/calendar/create/confirm/${encodeURIComponent(input.intentId)}`,
    undefined,
    { organizationId: input.organizationId },
  )).data;
}
