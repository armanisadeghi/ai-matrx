import type { components } from "@ai-matrx/agents/generated/api-types";
import { postJson } from "@/lib/python-client";

export type CalendarEventSourceRequest = components["schemas"]["CalendarEventSourceRequest"];
export type CalendarEventSourceResult = components["schemas"]["CalendarEventSourceResult"];

const SOURCE_PATH = "/google-integrations/calendar/event/source";

export async function readCalendarEventSource(input: {
  organizationId: string;
  request: CalendarEventSourceRequest;
}): Promise<CalendarEventSourceResult> {
  return (await postJson<CalendarEventSourceResult, CalendarEventSourceRequest>(
    SOURCE_PATH,
    input.request,
    { organizationId: input.organizationId },
  )).data;
}
