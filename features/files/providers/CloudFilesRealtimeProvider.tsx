/**
 * features/files/providers/CloudFilesRealtimeProvider.tsx
 *
 * Mounts the cloud-files realtime subscription for the current authed user.
 *
 * **Mount this exactly once, globally, in `app/Providers.tsx`.** The five
 * previous per-route mounts (files layout, images layout, code explorer,
 * file-preview window, cloud-files window) were deleted in Phase 0 of the
 * consolidation rebuild — see
 * [docs/FILE_HANDLING_CONSOLIDATION_PLAN.md](../../../docs/FILE_HANDLING_CONSOLIDATION_PLAN.md).
 *
 * Reads `userId` from Redux (`selectUserId`); attaches the Realtime channel
 * on user change and tears it down on sign-out. Callers don't need to pass
 * `userId` — the provider is identity-driven.
 */

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  attachCloudFilesRealtime,
  detachCloudFilesRealtime,
} from "@/features/files/redux/realtime-middleware";
import { loadUserFileTree } from "@/features/files/redux/thunks";
import {
  invalidateAll as invalidateBlobCache,
  setBlobCacheIdentity,
} from "@/features/files/hooks/blob-cache";

export interface CloudFilesRealtimeProviderProps {
  children?: React.ReactNode;
}

export function CloudFilesRealtimeProvider({
  children,
}: CloudFilesRealtimeProviderProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  // Stamp the blob cache (memory + IDB tiers) with the current identity.
  // Sign-out wipes both tiers for the previous user so the next user can
  // never read leftover bytes.
  useEffect(() => {
    if (userId) {
      setBlobCacheIdentity(userId);
    } else {
      // identityUserId was set previously; capture it before clearing.
      // invalidateAll(undefined) only wipes the in-memory tier; the IDB
      // tier sweep happens here via the captured prior id.
      // (No-op when never signed in.)
      setBlobCacheIdentity(null);
      invalidateBlobCache();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      dispatch(detachCloudFilesRealtime());
      return undefined;
    }

    dispatch(attachCloudFilesRealtime(userId));
    // Hydrate the tree immediately. The middleware also fires a reconcile on
    // SUBSCRIBED — calling both is intentional: client perception of "files
    // are ready" must not wait for the realtime channel handshake.
    void dispatch(loadUserFileTree({ userId }));

    return () => {
      dispatch(detachCloudFilesRealtime());
    };
  }, [dispatch, userId]);

  return <>{children ?? null}</>;
}
