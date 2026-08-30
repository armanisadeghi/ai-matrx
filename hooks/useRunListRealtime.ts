"use client";

// hooks/useRunListRealtime.ts
//
// Transport 1 of the event system: replace setInterval polling of a "my
// runs/jobs" list with Supabase Realtime. One generic primitive for every run
// list — subscribes to owner-scoped INSERT/UPDATE on a run table and fires
// `onChange` so the caller refetches its (often computed) list. The list goes
// live while runs are active and silent when idle — strictly better than a
// fixed-interval poll, which is blind between ticks and wastes calls when
// nothing is happening.
//
// Requirements: `table` is a table in the `supabase_realtime` publication,
// RLS-scoped to its owner (so the `<ownerColumn>=eq.<uid>` filter only ever
// delivers the user's own rows). Mirrors the proven scheduling pattern
// (features/scheduling/hooks/useRunStream.ts).

import { useEffect, useMemo, useRef } from "react";
import { useRealtimeChannel } from "@ai-matrx/data/react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export interface UseRunListRealtimeOptions {
  /** Run table to watch (must be in supabase_realtime). */
  table: string;
  /** Postgres schema `table` lives in. Default `public`. */
  schema?: string;
  /** Fired (debounced) on any INSERT/UPDATE of the user's rows — refetch here. */
  onChange: () => void;
  /** Owner column the table is RLS-scoped + filtered by. Default `user_id`. */
  ownerColumn?: string;
  /** Gate the subscription (e.g. auth readiness). Default true. */
  enabled?: boolean;
  /** Debounce window so bursts (e.g. heartbeats) coalesce. Default 250ms. */
  debounceMs?: number;
}

export function useRunListRealtime({
  table,
  schema = "public",
  onChange,
  ownerColumn = "user_id",
  enabled = true,
  debounceMs = 250,
}: UseRunListRealtimeOptions): void {
  const userId = useAppSelector(selectUserId);
  // Hold onChange in a ref so an unstable callback identity doesn't tear the
  // channel down and rebuild it on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const active =
    enabled && typeof userId === "string" && userId.length > 0;
  // An empty filter (`user_id=eq.`) is malformed and would silently never
  // match, so a missing id turns the subscription OFF rather than watching
  // everything.
  const filter = active ? `${ownerColumn}=eq.${userId}` : "";

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useRef(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChangeRef.current(), debounceMs);
  });
  fire.current = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChangeRef.current(), debounceMs);
  };

  const bindings = useMemo(
    () =>
      (["INSERT", "UPDATE"] as const).map((event) => ({
        event,
        schema,
        table,
        filter,
        onChange: () => fire.current(),
      })),
    [schema, table, filter],
  );

  // Reconnect/backoff, unique topics, teardown and the catch-up refetch on a
  // recovered subscription all live in @ai-matrx/data/react.
  useRealtimeChannel(
    supabase,
    `run-list-${table}-${userId ?? "anon"}`,
    bindings,
    { enabled: active, onReconnect: () => fire.current() },
  );

  useEffect(() => {
    if (!active) return undefined;
    // A backgrounded tab misses events even on a healthy socket; refetch when
    // it regains focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") fire.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);
}
