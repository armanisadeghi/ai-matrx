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
// Requirements: `table` is a public-schema table in the `supabase_realtime`
// publication, RLS-scoped to its owner (so the `<ownerColumn>=eq.<uid>` filter
// only ever delivers the user's own rows). Mirrors the proven scheduling
// pattern (features/scheduling/hooks/useRunStream.ts).

import { useEffect, useRef } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

export interface UseRunListRealtimeOptions {
  /** Public-schema run table to watch (must be in supabase_realtime). */
  table: string;
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

  useEffect(() => {
    // Guard hard against a missing/empty id — an empty filter (`user_id=eq.`)
    // is malformed and would silently never match.
    if (!enabled || typeof userId !== "string" || userId.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), debounceMs);
    };
    const filter = `${ownerColumn}=eq.${userId}`;
    const channel = supabase
      .channel(`run-list-${table}-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, fire)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, fire)
      .subscribe((status) => {
        // Realtime can drop silently (network blip, server restart). On a
        // recovered subscription, refetch once so the list can't stay frozen
        // on a status the missed events would have changed.
        if (status === "SUBSCRIBED") fire();
      });

    // A backgrounded tab also misses events; refetch when it regains focus.
    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, table, ownerColumn, debounceMs]);
}
