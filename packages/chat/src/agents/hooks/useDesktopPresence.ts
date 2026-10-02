"use client";

/**
 * useDesktopPresence — reactive view of the matrx-local desktop's online
 * state, backed by the SAME module cache the `desktop-native` capability
 * provider reads (client-capabilities/desktop-presence.ts). One source of
 * truth: what the indicator shows is exactly what the next turn declares.
 *
 * Polls while mounted (the module TTL dedupes concurrent consumers), so the
 * indicator appears/disappears within ~a minute of the desktop engine
 * starting or its heartbeat aging out.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  getCachedDesktopPresence,
  getLiveDesktopInstance,
  subscribeDesktopPresence,
  type DesktopPresence,
} from "@/features/agents/redux/execution-system/client-capabilities/desktop-presence";

const POLL_MS = 60_000;

export function useDesktopPresence(): DesktopPresence | null {
  const presence = useSyncExternalStore(
    subscribeDesktopPresence,
    getCachedDesktopPresence,
    // Server snapshot: presence is a browser-only concern.
    () => null,
  );

  useEffect(() => {
    void getLiveDesktopInstance();
    const timer = setInterval(() => void getLiveDesktopInstance(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return presence;
}
