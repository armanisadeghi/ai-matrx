/**
 * features/residential-egress/hooks/useHomeConnections.ts
 *
 * The person's home connections, live.
 *
 * Shaped deliberately like `features/files/devices/useDevicesAndSync.ts`,
 * because it is the same problem on the same page: a row a daemon writes, a
 * column the browser writes, and a screen that must not lie about which is
 * which.
 *
 * LIVE: `postgres_changes` on `platform.egress_device`, filtered to the
 * caller's own rows. The event is a TRIGGER TO RE-READ, never the row itself —
 * the published column list is aidream's to choose and this surface reads a
 * fixed, credential-free column list under RLS.
 *
 * 🚨 THE TABLE MUST BE IN THE PUBLICATION. A `postgres_changes` binding on an
 * unpublished table joins, reports SUBSCRIBED, and then delivers nothing
 * forever. `platform.egress_device` did not exist yet when this was written
 * (the aidream migration is in flight), so the table must be added to
 * `supabase_realtime` with the migration that creates it — `pnpm
 * check:realtime-publication` is the guard that says so out loud.
 *
 * FALLBACK, ANNOUNCED: while the channel is not connected we poll once a
 * minute and the screen SAYS so. A silent fallback is the failure mode law 4
 * forbids.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defineChannelNamespace,
  subscribeToRealtimeManager,
} from "@ai-matrx/realtime";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";

import { fetchHomeConnections } from "../service";
import type { EgressDeviceRow } from "../types";

/** One place names this channel; a second, different declaration throws. */
const homeConnectionChannel = defineChannelNamespace({
  namespace: "home-connections",
  parts: ["userId"],
  description: "platform.egress_device rows for one person's own computers",
});

/**
 * Poll cadence while the live channel is down. Matched to the devices page
 * beside it so the two halves of one screen never disagree about how fresh
 * they are. Reviewed 2026-09-18.
 */
const POLL_INTERVAL_MS = 60_000;

export type HomeConnectionsLiveStatus = "live" | "polling";

export interface HomeConnections {
  devices: EgressDeviceRow[];
  /** By `app_instance_id`, for pairing a row with the device card it belongs to. */
  byAppInstanceId: Map<string, EgressDeviceRow>;
  /** Rows with no `app_instance_id`, or one no device card claims — a helper-only computer. */
  unmatched: (knownAppInstanceIds: ReadonlySet<string>) => EgressDeviceRow[];
  loading: boolean;
  /** Non-null when the read failed — the screen must say so, not go blank. */
  error: string | null;
  liveStatus: HomeConnectionsLiveStatus;
  refresh: () => Promise<void>;
}

export function useHomeConnections(): HomeConnections {
  const userId = useAppSelector(selectUserId);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authReady = useAppSelector(selectAuthReady);
  const active = authReady && isAuthenticated && Boolean(userId);

  const [devices, setDevices] = useState<EgressDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] =
    useState<HomeConnectionsLiveStatus>("polling");
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await fetchHomeConnections(userId);
      setDevices(rows);
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

  useEffect(() => {
    if (!active) return undefined;
    void loadRef.current?.();
    return undefined;
  }, [active]);

  useEffect(() => {
    if (!active || !userId) return undefined;
    const stop = subscribeToRealtimeManager(() => ({
      topic: homeConnectionChannel.topic({ userId }),
      postgresChanges: [
        {
          event: "*",
          schema: "platform",
          table: "egress_device",
          filter: `created_by=eq.${userId}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          // Only what the badge and the numbers are made of. A fingerprint of
          // the whole row would re-read on every heartbeat write.
          fingerprint: (row) =>
            JSON.stringify([
              row.enabled ?? null,
              row.connected ?? null,
              row.last_seen_at ?? null,
              row.last_used_at ?? null,
              row.bytes_relayed ?? null,
              row.last_error ?? null,
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

  const byAppInstanceId = new Map<string, EgressDeviceRow>();
  for (const device of devices) {
    if (device.app_instance_id) byAppInstanceId.set(device.app_instance_id, device);
  }

  const unmatched = useCallback(
    (knownAppInstanceIds: ReadonlySet<string>) =>
      devices.filter(
        (device) =>
          !device.app_instance_id ||
          !knownAppInstanceIds.has(device.app_instance_id),
      ),
    [devices],
  );

  return {
    devices,
    byAppInstanceId,
    unmatched,
    loading,
    error,
    liveStatus,
    refresh: load,
  };
}
