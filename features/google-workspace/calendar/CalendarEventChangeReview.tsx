"use client";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { ConfirmOptions } from "@/components/dialogs/confirm/ConfirmDialogHost";

import type { StorageDoor } from "./calendarCreateRecovery";
import {
  confirmCalendarCancel,
  confirmCalendarReschedule,
  confirmCalendarRsvp,
  previewCalendarCancel,
  previewCalendarReschedule,
  previewCalendarRsvp,
  type CalendarCancelPreview,
  type CalendarCancelRequest,
  type CalendarCancelResult,
  type CalendarReschedulePreview,
  type CalendarRescheduleRequest,
  type CalendarRescheduleResult,
  type CalendarRsvpPreview,
  type CalendarRsvpRequest,
  type CalendarRsvpResult,
} from "./calendarChangeService";
import {
  readCalendarEventSource,
  type CalendarEventSourceRequest,
  type CalendarEventSourceResult,
} from "./calendarEventSourceService";
import type { SelectedCalendar, SelectedEvent } from "./selectedCalendarService";

export interface CalendarEventChangeTransport {
  readSource(input: {
    organizationId: string;
    request: CalendarEventSourceRequest;
  }): Promise<CalendarEventSourceResult>;
  previewReschedule(input: {
    organizationId: string;
    request: CalendarRescheduleRequest;
  }): Promise<CalendarReschedulePreview>;
  confirmReschedule(input: {
    organizationId: string;
    request: CalendarRescheduleRequest;
  }): Promise<CalendarRescheduleResult>;
  previewCancel(input: {
    organizationId: string;
    request: CalendarCancelRequest;
  }): Promise<CalendarCancelPreview>;
  confirmCancel(input: {
    organizationId: string;
    request: CalendarCancelRequest;
  }): Promise<CalendarCancelResult>;
  previewRsvp(input: {
    organizationId: string;
    request: CalendarRsvpRequest;
  }): Promise<CalendarRsvpPreview>;
  confirmRsvp(input: {
    organizationId: string;
    request: CalendarRsvpRequest;
  }): Promise<CalendarRsvpResult>;
}

export interface CalendarEventChangeReviewProps {
  actorId: string;
  organizationId: string;
  connectionId: string;
  accountLabel: string;
  calendar: SelectedCalendar;
  events?: SelectedEvent[];
  transport?: CalendarEventChangeTransport;
  storage?: StorageDoor;
  confirmAction?: (options: ConfirmOptions) => Promise<boolean>;
}

export const calendarEventChangeTransport: CalendarEventChangeTransport = {
  readSource: readCalendarEventSource,
  previewReschedule: previewCalendarReschedule,
  confirmReschedule: confirmCalendarReschedule,
  previewCancel: previewCalendarCancel,
  confirmCancel: confirmCalendarCancel,
  previewRsvp: previewCalendarRsvp,
  confirmRsvp: confirmCalendarRsvp,
};

export function CalendarEventChangeReview(
  _props: CalendarEventChangeReviewProps,
) {
  void confirm;
  return null;
}
