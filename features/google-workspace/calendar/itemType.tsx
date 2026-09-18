"use client";

/**
 * Calendar Plane C — `calendar_event`'s ONE registration in THE item-presentation
 * registry (one import line and one entry in `registry.tsx`). Everything the
 * record shows as a window, a docked panel, or `/detail/calendar_event/<id>`
 * comes from here, through the same `refineDetail` seam the Google Doc record
 * uses — never a second registry and never a bespoke calendar screen.
 *
 * What the generic registration already gives and this file therefore does NOT:
 * the header and its doors, the Google health strip's producer, the associations
 * section, the history section, the three presentations, the keyboard model and
 * the right-click frame.
 *
 * What it adds, and only this:
 *   * a typed loader over the real table (the generic one is an untyped
 *     `select('*')` for arbitrary table names), applying the projection the
 *     shared health strip needs to find this row's connection at all;
 *   * a curated field list — the generic one would print the `attendees` jsonb,
 *     `version`, `metadata` and both audit columns and lose the five facts PLAN
 *     §4.6 names;
 *   * the attendees section (RSVP state, a door for every attendee who is a
 *     Person here, their open items);
 *   * what a read-only Google grant cannot do, stated rather than offered.
 */

import { CalendarDays } from "lucide-react";

import type { ItemTypeConfig } from "@/features/item-presentation/registry";
import type { EnrichedItem } from "@/features/item-presentation/types";
import type { DetailRecordType } from "@/lib/detail/types";

import {
  CalendarEventAttendeesSection,
  CalendarEventUnavailableSection,
} from "./CalendarEventSections";
import {
  CALENDAR_EVENT_TYPE,
  asCalendarEventRow,
  calendarEventDetailRow,
  calendarEventFields,
  calendarEventWhenText,
  viewerTimeZone,
} from "./record";
import { readCalendarEvent } from "./service";

/** The refinement the registry hands to `resolveItemDetailType`. */
export function refineCalendarEventDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    load: async (id, signal) => {
      const row = await readCalendarEvent(id, signal);
      if (!row) return { notFound: true };
      return { row: calendarEventDetailRow(row) };
    },
    title: (row, seed) => {
      const typed = asCalendarEventRow(row);
      return typed?.title?.trim() || seed?.name?.trim() || "Untitled event";
    },
    fields: (row) => {
      const typed = asCalendarEventRow(row);
      // A row this registration cannot recognise gets NO invented fields; the
      // primitive's own absent state is honest about having nothing to show.
      return typed ? calendarEventFields(typed, new Date(), viewerTimeZone()) : [];
    },
    extraSections: (row) => {
      const typed = asCalendarEventRow(row);
      if (!typed) return [];
      return [
        {
          id: "attendees",
          label: "Attendees",
          content: <CalendarEventAttendeesSection event={typed} />,
        },
        {
          id: "read-only",
          label: "What you cannot change from here",
          content: <CalendarEventUnavailableSection />,
        },
      ];
    },
  };
}

/**
 * The registry entry. `entityToken` is omitted because the item type and the
 * entity token are the same word — `calendar_event` is a registered
 * `platform.entity_types` token (aidream migration 0766, verified live
 * 2026-09-18), which is what gives the record its route, its peek, its
 * associations and its history.
 */
export const CALENDAR_EVENT_ITEM_TYPE: ItemTypeConfig = {
  type: CALENDAR_EVENT_TYPE,
  label: "Calendar event",
  icon: CalendarDays,
  accent: {
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/20",
  },
  // The address the generic machinery reads (the entity registry and the doors);
  // the TYPED read in the refinement above is what actually runs.
  detailSource: {
    table: "calendar_event",
    schemaName: "communication",
    titleField: "title",
  },
  // The card's own read, so an item card an agent emits shows the real title and
  // the real time instead of the model's guess.
  enrich: async (_client, id): Promise<EnrichedItem> => {
    const row = await readCalendarEvent(id, new AbortController().signal);
    if (!row) return { notFound: true };
    return {
      name: row.title,
      about: calendarEventWhenText(row, viewerTimeZone()),
      details: row.location ? [{ label: "Where", value: row.location }] : [],
    };
  },
  refineDetail: refineCalendarEventDetail,
};
