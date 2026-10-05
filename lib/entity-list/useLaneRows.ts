"use client";

// lib/entity-list/useLaneRows.ts
//
// The read half of a lane-reader list, beside `useLaneParam` (the lane) and `useOrgFilterParam`
// (the organization filter): it loads a type's `<type>_list_lanes` rows (`LaneRow`, see
// laneRows.ts) once per `key`, and says when that read failed — a failed read is never a count of 0.
//
//   const lanes = useLaneRows(() => listWebhookLanes(), "webhooks");
//   const counts = laneCounts(lanes.rows ?? [], OFFERED, orgId);

import { useEffect, useEffectEvent, useState } from "react";
import type { LaneRow } from "./laneRows";

export interface LaneRowsState {
  /** Null until the first read lands (or after it failed). */
  rows: LaneRow[] | null;
  error: string | null;
  reload: () => void;
}

export function useLaneRows(load: () => Promise<LaneRow[]>, key: string): LaneRowsState {
  const [rows, setRows] = useState<LaneRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // The latest `load` without making it a dependency: `key` names what it reads.
  const read = useEffectEvent(() => load());
  useEffect(() => {
    let cancelled = false;
    setError(null);
    read().then(
      (next) => {
        if (!cancelled) setRows(next);
      },
      (err: unknown) => {
        if (cancelled) return;
        setRows(null);
        setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return { rows, error, reload: () => setTick((n) => n + 1) };
}
