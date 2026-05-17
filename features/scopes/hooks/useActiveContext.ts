// features/scopes/hooks/useActiveContext.ts
//
// Public hook over the global appContextSlice. Replaces all the ad-hoc
// `useAppSelector((s) => s.appContext.X)` lines scattered across consumer
// features. Returns the bundle; mutations go through the explicit setters
// re-exported on the slice (Surface A only — see FEATURE.md invariant).

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveContextBundle } from "@/features/scopes/redux/selectors/active-context";

export function useActiveContext() {
  return useAppSelector(selectActiveContextBundle);
}
