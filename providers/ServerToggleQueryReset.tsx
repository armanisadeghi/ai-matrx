"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectCustomServerUrl,
  selectServerOverride,
} from "@/lib/redux/slices/adminPreferencesSlice";

/**
 * Bridges the admin server-override toggle into TanStack Query.
 *
 * Why this exists: callApi resolves the backend URL fresh from Redux on every
 * dispatch, so direct API calls already respect the toggle. But TanStack Query
 * caches results under keys that don't include the server, so when an admin
 * flips the sidebar to localhost, any already-cached query keeps serving its
 * production data without ever calling callApi again.
 *
 * Solution: when adminPreferences.serverOverride or customServerUrl changes,
 * invalidate every query in the cache. Active observers refetch immediately
 * (now hitting the new server through callApi), inactive ones refetch the next
 * time they mount.
 *
 * This component renders nothing. Mount it inside both ReactQueryProvider AND
 * StoreProvider — see app/providers.tsx.
 */
export function ServerToggleQueryReset() {
  const queryClient = useQueryClient();
  const serverOverride = useAppSelector(selectServerOverride);
  const customServerUrl = useAppSelector(selectCustomServerUrl);

  // Skip the very first render — we only want to invalidate on transitions,
  // not on initial hydration (which would burn a refetch on every page load).
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    queryClient.invalidateQueries({ refetchType: "active" });
  }, [serverOverride, customServerUrl, queryClient]);

  return null;
}
