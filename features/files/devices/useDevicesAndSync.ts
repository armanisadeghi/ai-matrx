/**
 * features/files/devices/useDevicesAndSync.ts
 *
 * Devices, their mappings, and live state.
 *
 * LIVE: `files.sync_mappings` is in the `supabase_realtime` publication with an
 * explicit 17-column list that carries every status column and NO
 * `local_path`, `local_path_display`, `state_reason` or `knobs` — paths never
 * ride the wire (SPEC-SERVER §6.2). So a realtime event tells us a row moved;
 * we re-read the row under RLS to get the rest. That is one round trip per
 * change on a table with a handful of rows per person.
 *
 * FALLBACK, ANNOUNCED: when the channel is not connected we poll, and the
 * screen SAYS so — "Live updates unavailable, checking every minute" is the
 * engine's own sentence for the same condition (D9, SCOPE 8). A silent
 * fallback is the failure mode law 4 forbids.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribeToRealtimeManager,
  defineChannelNamespace,
} from "@ai-matrx/realtime";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";

import { fetchDevices, fetchMappings } from "./service";
import type { DeviceRow, SyncMappingRow } from "./types";

/** One place names this channel; a second, different declaration throws. */
const syncMappingChannel = defineChannelNamespace({
  namespace: "sync-mappings",
  parts: ["userId"],
  description: "files.sync_mappings rows for one user's devices",
});

/**
 * Poll cadence while the live channel is down. The engine's own degraded
 * cadence is one minute (D9) and the screen quotes that sentence, so the
 * browser matches it rather than inventing a second number. Reviewed
 * 2026-09-15.
 */
const POLL_INTERVAL_MS = 60_000;

export type LiveStatus = "live" | "polling";

export interface DevicesAndSync {
  devices: DeviceRow[];
  mappings: SyncMappingRow[];
  loading: boolean;
  /** Non-null when the read failed — the screen must say so, not go blank. */
  error: string | null;
  liveStatus: LiveStatus;
  refresh: () => Promise<void>;
}

export function useDevicesAndSync(): DevicesAndSync {
  const userId = useAppSelector(selectUserId);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authReady = useAppSelector(selectAuthReady);
  const active = authReady && isAuthenticated && Boolean(userId);

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [mappings, setMappings] = useState<SyncMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("polling");
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [deviceRows, mappingRows] = await Promise.all([
        fetchDevices(userId),
        fetchMappings(),
      ]);
      setDevices(deviceRows);
      setMappings(mappingRows);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // The realtime callbacks outlive any one render, so they reach the loader
  // through a ref rather than closing over a stale one.
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // First read. It goes through the ref for the same reason the live callbacks
  // do — the effect above has already pointed it at the current loader, and
  // the ref keeps this effect from re-running on every new `load` identity.
  useEffect(() => {
    if (!active) return undefined;
    void loadRef.current?.();
    return undefined;
  }, [active]);

  // Live updates. The published column list excludes the path columns, so an
  // event is a trigger to re-read, never the row itself.
  useEffect(() => {
    if (!active || !userId) return undefined;
    const stop = subscribeToRealtimeManager(() => ({
      topic: syncMappingChannel.topic({ userId }),
      postgresChanges: [
        {
          event: "*",
          schema: "files",
          table: "sync_mappings",
          filter: `user_id=eq.${userId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          fingerprint: (row) =>
            JSON.stringify([
              row.state ?? null,
              row.desired_state ?? null,
              row.direction ?? null,
              row.last_seen_at ?? null,
              row.deleted_at ?? null,
            ]),
          onChange: () => {
            void loadRef.current?.();
          },
        },
      ],
      // Reconnect, tab wake, network restore and queue overflow all land here.
      onBackfill: () => {
        void loadRef.current?.();
      },
      onStatusChange: (status) => {
        setLiveStatus(status === "connected" ? "live" : "polling");
      },
    }));
    return stop;
  }, [active, userId]);

  // The announced fallback. It runs only while the channel is not connected,
  // so a healthy tab makes no extra requests.
  useEffect(() => {
    if (!active || liveStatus === "live") return undefined;
    const timer = setInterval(() => {
      void loadRef.current?.();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, liveStatus]);

  return { devices, mappings, loading, error, liveStatus, refresh: load };
}
