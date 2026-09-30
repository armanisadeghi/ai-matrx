// alchemy-organization — THE ORGANIZATION ALCHEMY WORKS IN, decided once for the host and its
// destinations. The same rule every other server-bound request reads (`lib/organization/
// organization-gate.ts` → `lib/api/admin-lane.ts`): in the admin section it is the platform tenant
// (the admin seat never acts as itself and is never asked to choose a workspace); everywhere else it
// is the selected workspace. Reading only the selected workspace hid AI preparation and every
// destination ("Open in a new chat", "Save to Notes", …) on every admin page, where the selected
// workspace is deliberately empty (lane DRILL-EXPLAIN walk, 2026-09-30).
//
// ENTERING OR LEAVING THE ADMIN SECTION IS AN EVENT, NOT A RE-RENDER (lane DRILL-ADOPT,
// VERIFY-DRILL-WAVE2 W2-6). The admin lane is read from the address, so something must notice a
// navigation. `usePathname()` in the app-wide host re-rendered the whole host on EVERY navigation.
// Now one leaf (`AdminLaneWatcher`, renders nothing) holds the pathname; it tells the listeners only
// when the lane actually flips, and the host and the identity port read the lane through
// `useAdminLaneOrganizationId` / `onAdminLaneChange` — a navigation inside one lane costs the leaf alone.

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { adminLaneOrganizationId } from "@/lib/api/admin-lane";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

export function alchemyOrganizationId(state: Parameters<typeof selectOrganizationId>[0]): string | null {
  return adminLaneOrganizationId() ?? selectOrganizationId(state);
}

const listeners = new Set<() => void>();
let lastLane: string | null | undefined;

/** Hear when the admin lane flips (entering or leaving the admin section). */
export function onAdminLaneChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tell the listeners the lane may have moved; they hear only a real flip. */
export function noticeAdminLane(): void {
  const lane = adminLaneOrganizationId();
  if (lane === lastLane) return;
  lastLane = lane;
  for (const listener of [...listeners]) listener();
}

/** The admin lane's organization (the platform tenant in the admin section, else null), re-read only on a flip. */
export function useAdminLaneOrganizationId(): string | null {
  return useSyncExternalStore(onAdminLaneChange, adminLaneOrganizationId, () => null);
}

/** The one leaf that follows navigation: renders nothing, notices a lane flip. */
export function AdminLaneWatcher(): null {
  const pathname = usePathname();
  useEffect(() => {
    noticeAdminLane();
  }, [pathname]);
  return null;
}
