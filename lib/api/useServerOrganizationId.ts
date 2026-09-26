"use client";

// lib/api/useServerOrganizationId.ts — the organization a component binds its
// SERVER requests to: the platform tenant on the admin seat (lib/api/admin-lane.ts),
// the selected workspace everywhere else. Admin surfaces read this instead of
// `selectOrganizationId` so they never wait on — or ask for — the admin's own
// workspace (Arman, 2026-09-26: "No one acts as themselves in admin").

import { useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { adminLaneOrganizationId } from "@/lib/api/admin-lane";

const noSubscription = () => () => {};

export function useServerOrganizationId(): string | null {
  const selected = useAppSelector(selectOrganizationId);
  // The page path cannot change without a remount of the admin tree, so there
  // is nothing to subscribe to; the server snapshot is null (no window).
  const adminLane = useSyncExternalStore(noSubscription, adminLaneOrganizationId, () => null);
  return adminLane ?? selected ?? null;
}
