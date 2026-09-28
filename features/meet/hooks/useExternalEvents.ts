"use client";

// features/meet/hooks/useExternalEvents.ts
//
// The person's OWN synced calendar events for the Upcoming list (Meet wave 4).
// One read, straight to `communication.calendar_event` under RLS, scoped to the
// rows whose calendar connection is THIS person's — RLS is the ceiling, never
// the view (a platform admin can read everyone's). Timed events only, in the
// same window Upcoming reads. Off when the person turned the knob off.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  CALENDAR_EVENT_COLUMNS,
  toExternalEvent,
  type ExternalEvent,
} from "@/features/meet/lib/external-events";
import { UPCOMING_WINDOW_DAYS } from "@/features/meet/hooks/useMeetingsDirectory";

const LIMIT = 500;

export interface ExternalEventsState {
  readonly loading: boolean;
  readonly failure: string | null;
  readonly events: readonly ExternalEvent[];
}

export function useExternalEvents(
  userId: string | null,
  enabled: boolean,
  nonce = 0,
): ExternalEventsState {
  const [state, setState] = useState<ExternalEventsState>({
    loading: false,
    failure: null,
    events: [],
  });

  useEffect(() => {
    if (!enabled || userId === null) {
      setState({ loading: false, failure: null, events: [] });
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, failure: null }));
    const from = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const to = new Date(
      Date.now() + UPCOMING_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    void supabase
      .schema("communication")
      .from("calendar_event")
      .select(CALENDAR_EVENT_COLUMNS)
      .or(
        `source_connection_owner_id.eq.${userId},and(source_connection_owner_id.is.null,created_by.eq.${userId})`,
      )
      .is("deleted_at", null)
      .eq("all_day", false)
      .gte("ends_at", from)
      .lte("starts_at", to)
      .order("starts_at", { ascending: true })
      .limit(LIMIT)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setState({ loading: false, failure: error.message, events: [] });
          return;
        }
        const origin =
          typeof window === "undefined" ? undefined : window.location.origin;
        const events = (
          (data ?? []) as unknown as Record<string, unknown>[]
        ).flatMap((row) => {
          const event = toExternalEvent(row, origin);
          return event ? [event] : [];
        });
        setState({ loading: false, failure: null, events });
      });
    return () => {
      live = false;
    };
  }, [userId, enabled, nonce]);

  return state;
}
