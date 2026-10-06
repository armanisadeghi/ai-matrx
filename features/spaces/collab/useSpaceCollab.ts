"use client";

// features/spaces/collab/useSpaceCollab.ts — one co-editing session per open Space (see space-collab.ts).
// Returns the session once its body exists (room copy or seed), whether this member is the host that
// saves, whether the page is offline, and the save cadence (knobs `spaces.collab.snapshot_debounce_ms` /
// `snapshot_max_wait_ms`, read once per page in the page's organization).

import { useEffect, useRef, useState } from "react";

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

import type { SpaceDoc } from "../contract";
import { pageOrganizationId } from "../data/agency-install";
import { SpaceCollabSession, type SpaceMeta } from "./space-collab";
import type { SpaceRoom } from "./useSpaceRoom";

export interface SaveCadence {
  debounceMs: number;
  maxWaitMs: number;
}

const DEBOUNCE_KNOB = { feature: "spaces.collab", key: "snapshot_debounce_ms" } as const;
const MAX_WAIT_KNOB = { feature: "spaces.collab", key: "snapshot_max_wait_ms" } as const;

async function readCadence(spaceId: string, userId: string): Promise<SaveCadence> {
  // The page's own organization: its override governs every member's host, whoever's active org it is.
  const org = await pageOrganizationId(spaceId).catch(() => null);
  const [d, m] = await Promise.all([ensureEffectiveKnob(org, userId, DEBOUNCE_KNOB), ensureEffectiveKnob(org, userId, MAX_WAIT_KNOB)]);
  const debounceMs = Number(d);
  const maxWaitMs = Number(m);
  if (!Number.isFinite(debounceMs) || !Number.isFinite(maxWaitMs)) throw new Error("spaces.collab snapshot knobs are not numbers");
  return { debounceMs, maxWaitMs };
}

export interface SpaceCollab {
  session: SpaceCollabSession | null;
  isHost: boolean;
  offline: boolean;
  cadence: SaveCadence | null;
  /** Live reference for callbacks (the save timer reads it at fire time). */
  hostRef: React.MutableRefObject<boolean>;
}

export function useSpaceCollab(args: {
  spaceId: string;
  /** The stored page once read (undefined while loading; null when missing). */
  snapshot: SpaceDoc | null | undefined;
  userId: string | null;
  name: string;
  canEdit: boolean;
  room: SpaceRoom;
  onMeta: (meta: Partial<SpaceMeta>) => void;
  /** This member just became host: save anything the room holds that is not stored yet. */
  onBecameHost: () => void;
}): SpaceCollab {
  const { spaceId, snapshot, userId, name, canEdit, room } = args;
  const [session, setSession] = useState<SpaceCollabSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [cadence, setCadence] = useState<SaveCadence | null>(null);
  const hostRef = useRef(false);
  // Event-time reads: never effect dependencies (supabase-realtime rule 4).
  const latest = useRef(args);
  latest.current = args;
  const present = useRef<ReadonlySet<string> | null>(null);
  present.current = room.status === "connected" ? new Set(room.viewers.map((v) => v.userId)) : null;
  const elect = useRef<() => void>(() => undefined);

  const ready = snapshot !== undefined && snapshot !== null && !!userId;
  useEffect(() => {
    if (!ready || !snapshot || !userId) return;
    let live = true;
    const s = new SpaceCollabSession({
      spaceId,
      userId,
      name,
      canEdit: latest.current.canEdit,
      onMeta: (m) => latest.current.onMeta(m),
      onPeers: () => elect.current(),
    });
    elect.current = () => {
      const host = live && s.isHost(present.current);
      if (host === hostRef.current) return;
      hostRef.current = host;
      setIsHost(host);
      if (host) latest.current.onBecameHost();
    };
    void s
      .start(snapshot, () => (latest.current.room.viewers.some((v) => v.userId !== userId)))
      .then(() => {
        if (!live) return;
        setSession(s);
        elect.current();
      });
    void readCadence(spaceId, userId).then(
      (c) => live && setCadence(c),
      (e: unknown) => console.error("[spaces] save cadence knobs", e),
    );
    return () => {
      live = false;
      hostRef.current = false;
      elect.current = () => undefined;
      setSession(null);
      setIsHost(false);
      s.destroy();
    };
    // One session per page and person; the snapshot is read once, at join.
  }, [ready, spaceId, userId]);

  useEffect(() => {
    session?.setCanEdit(canEdit);
  }, [session, canEdit]);

  // Presence changed (someone joined, left, or the channel dropped): re-run the election.
  const presenceKey = `${room.status}:${room.viewers.map((v) => v.userId).join(",")}`;
  useEffect(() => {
    elect.current();
  }, [presenceKey, session]);

  // Offline (Notion's indicator) and the resync when the connection comes back.
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  const wasDown = useRef(false);
  const connected = room.status === "connected";
  useEffect(() => {
    if (!session) return;
    if (!connected || !online) {
      wasDown.current = true;
      return;
    }
    if (wasDown.current) {
      wasDown.current = false;
      void session.resync().then(() => elect.current());
    }
  }, [session, connected, online]);

  const offline = !online || (session !== null && (room.status === "reconnecting" || room.status === "disconnected"));
  return { session, isHost, offline, cadence, hostRef };
}
