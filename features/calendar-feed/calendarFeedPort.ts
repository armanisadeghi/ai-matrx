// The person's private calendar links, as records-ui's `calendarFeed` port (lane CAL-FEED-UI).
//
// The four doors are the `users.calendar_feed_*` functions (signed-in callers only; each reads the
// caller from the session and touches only that person's rows). The feed itself is served at
// /api/calendar-feed/<token>.ics (app/api/calendar-feed/[token]/route.ts). A refusal's own sentence
// is thrown as the error message — the screens show it as written.

import type { CalendarFeedMade, CalendarFeedPort, CalendarFeedRow } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";

type Reply = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type LooseUsers = { rpc: (fn: string, args?: Record<string, unknown>) => Reply };

const users = (): LooseUsers => createClient().schema("users") as unknown as LooseUsers;

async function door<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await users().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** The address a calendar app reads for a token. */
export function calendarFeedUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/api/calendar-feed/${token}.ics`;
}

export const CALENDAR_FEED_PORT: CalendarFeedPort = {
  create: ({ organizationId, tableId, viewId, title, timeZone }) =>
    door<CalendarFeedMade>("calendar_feed_create", {
      p_organization_id: organizationId,
      p_table_id: tableId,
      p_view_id: viewId,
      p_title: title,
      p_time_zone: timeZone,
    }),
  rotate: (id) => door<CalendarFeedMade>("calendar_feed_rotate", { p_id: id }),
  revoke: async (id) => {
    await door("calendar_feed_revoke", { p_id: id });
  },
  list: async () => (await door<CalendarFeedRow[] | null>("calendar_feed_list")) ?? [],
  urlFor: (token) => calendarFeedUrl(token),
};
