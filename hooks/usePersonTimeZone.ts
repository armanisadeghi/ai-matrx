"use client";

// hooks/usePersonTimeZone.ts
//
// THE ONE HOOK for "what zone is this person's day in" and "what is today for
// them". Reads the saved zone (`userPreferences.display.timeZone`); while the
// person follows their device (default) the device zone is what's current, and
// the capture component keeps the saved value equal to it. Hydration-safe: the
// server and the hydration pass see UTC, then the real zone.

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import {
  dayKeyInZone,
  resolvePersonTimeZone,
} from "@/lib/time/personTimeZone";

export function usePersonTimeZone(): string {
  const saved = useAppSelector((s) => s.userPreferences?.display?.timeZone);
  const follows = useAppSelector((s) => s.userPreferences?.display?.timeZoneFollowsDevice);
  const device = useViewerTimeZone();
  return resolvePersonTimeZone({ saved, followsDevice: follows, device });
}

/** `YYYY-MM-DD`: today on this person's calendar. */
export function usePersonToday(): string {
  const zone = usePersonTimeZone();
  // Re-read each render; the memo only avoids re-running Intl for one zone/day pair.
  const now = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => dayKeyInZone(zone, new Date(now)), [zone, Math.floor(now / 60000)]);
}
