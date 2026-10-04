import type { components } from "@ai-matrx/agents/generated/api-types";
import { postJson } from "@/lib/python-client";

export type CalendarRescheduleRequest = components["schemas"]["CalendarEventRescheduleRequest"];
export type CalendarReschedulePreview = components["schemas"]["CalendarReschedulePreview"];
export type CalendarRescheduleResult = components["schemas"]["CalendarRescheduleResult"];
export type CalendarCancelRequest = components["schemas"]["CalendarEventCancelRequest"];
export type CalendarCancelPreview = components["schemas"]["CalendarCancelPreview"];
export type CalendarCancelResult = components["schemas"]["CalendarCancelResult"];
export type CalendarRsvpRequest = components["schemas"]["CalendarEventRsvpRequest"];
export type CalendarRsvpPreview = components["schemas"]["CalendarRsvpPreview"];
export type CalendarRsvpResult = components["schemas"]["CalendarRsvpResult"];

type ExplicitOrganizationRequest<TRequest> = {
  organizationId: string;
  request: TRequest;
};

type CalendarChangeTransport = typeof postJson;

const PATHS = {
  reschedulePreview: "/google-integrations/calendar/reschedule/preview",
  rescheduleConfirm: "/google-integrations/calendar/reschedule/confirm",
  cancelPreview: "/google-integrations/calendar/cancel/preview",
  cancelConfirm: "/google-integrations/calendar/cancel/confirm",
  rsvpPreview: "/google-integrations/calendar/rsvp/preview",
  rsvpConfirm: "/google-integrations/calendar/rsvp/confirm",
} as const;

export function createCalendarChangeService(transport: CalendarChangeTransport = postJson) {
  return {
    async previewCalendarReschedule(
      input: ExplicitOrganizationRequest<CalendarRescheduleRequest>,
    ): Promise<CalendarReschedulePreview> {
      return (await transport<CalendarReschedulePreview, CalendarRescheduleRequest>(
        PATHS.reschedulePreview,
        input.request,
        { organizationId: input.organizationId },
      )).data;
    },
    async confirmCalendarReschedule(
      input: ExplicitOrganizationRequest<CalendarRescheduleRequest>,
    ): Promise<CalendarRescheduleResult> {
      return (await transport<CalendarRescheduleResult, CalendarRescheduleRequest>(
        PATHS.rescheduleConfirm,
        input.request,
        { organizationId: input.organizationId },
      )).data;
    },
    async previewCalendarCancel(
      input: ExplicitOrganizationRequest<CalendarCancelRequest>,
    ): Promise<CalendarCancelPreview> {
      return (await transport<CalendarCancelPreview, CalendarCancelRequest>(
        PATHS.cancelPreview,
        input.request,
        { organizationId: input.organizationId },
      )).data;
    },
    async confirmCalendarCancel(
      input: ExplicitOrganizationRequest<CalendarCancelRequest>,
    ): Promise<CalendarCancelResult> {
      return (await transport<CalendarCancelResult, CalendarCancelRequest>(
        PATHS.cancelConfirm,
        input.request,
        { organizationId: input.organizationId },
      )).data;
    },
    async previewCalendarRsvp(
      input: ExplicitOrganizationRequest<CalendarRsvpRequest>,
    ): Promise<CalendarRsvpPreview> {
      return (await transport<CalendarRsvpPreview, CalendarRsvpRequest>(
        PATHS.rsvpPreview,
        input.request,
        { organizationId: input.organizationId },
      )).data;
    },
    async confirmCalendarRsvp(
      input: ExplicitOrganizationRequest<CalendarRsvpRequest>,
    ): Promise<CalendarRsvpResult> {
      return (await transport<CalendarRsvpResult, CalendarRsvpRequest>(
        PATHS.rsvpConfirm,
        input.request,
        { organizationId: input.organizationId },
      )).data;
    },
  };
}

const calendarChangeService = createCalendarChangeService();

export const {
  previewCalendarReschedule,
  confirmCalendarReschedule,
  previewCalendarCancel,
  confirmCalendarCancel,
  previewCalendarRsvp,
  confirmCalendarRsvp,
} = calendarChangeService;
