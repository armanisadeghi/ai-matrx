"use client";

// DeferredSingletonCore — the COMPLETE body of the deferred-singleton tree.
//
// This module is loaded ONLY through `app/DeferredSingletonWrapper.tsx`
// (client-side, post-mount, post-idle, via `next/dynamic`). Because the
// wrapper is the sole gate, this file follows the opposite rule of the
// old `DeferredSingletons.tsx`:
//   - EVERY import here is static — no `next/dynamic`, no `await import()`.
//   - EVERY singleton renders directly and unconditionally.
// Do not add a dynamic import or a render gate here; if something must be
// deferred further, that logic belongs in the wrapper (or the widget's own
// file), never in this core.

import { useEffect } from "react";
import { useIdleTask } from "@/utils/idle-scheduler";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { PersistentDOMConnector } from "@/providers/persistance/PersistentDOMConnector";
import OverlayController from "@/features/overlays/OverlayController";
import AuthSessionWatcher from "@/components/layout/AuthSessionWatcher";
import AnnouncementProvider from "@/components/layout/AnnouncementProvider";
import AdminFeatureProvider from "@/features/admin/AdminFeatureProvider";
import LazyMessagingIsland from "@/features/shell/islands/LazyMessagingIsland";
import KgNewSuggestionNotifier from "@/features/kg-suggestions/components/KgNewSuggestionNotifier";
import LiveCaptureIndicator from "@/features/media-capture/components/LiveCaptureIndicator";
import ErrorInspectorBadge from "@/features/admin/error-inspector/ErrorInspectorBadge";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { registerBlobCacheServiceWorker } from "@/features/files/cache/register-service-worker";
import { resolveBaseUrl } from "@/lib/python-client";
import { fetchEntitlementSnapshot } from "@/features/entitlements/service";
import {
  setEntitlementSnapshot,
  clearEntitlements,
} from "@/features/entitlements/state/entitlementsSlice";

export default function DeferredSingletonCore() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);

  // NOTE: global error capture + persistence install live in the WRAPPER
  // (DeferredSingletonWrapper.tsx), not here — they must be running during
  // the boot window, before this deferred core has loaded.

  // Pre-warm the scope tree (features/scopes) on idle. This is the ONLY
  // boot-time fetch in the scope/context system. `ensureScopeTree` is
  // idempotent — status === "ready" short-circuits and in-flight is
  // deduped inside the thunk.
  useIdleTask("ensure-scope-tree", 1, async () => {
    if (!user?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch(ensureScopeTree() as any);
  });

  // Register the blob-cache Service Worker — Layer 2½ of the 3-tier byte
  // cache. Intercepts cloud-files byte URLs (and registered CDN /
  // share-link URLs) and serves them from IndexedDB. Disabled by default
  // in dev (set localStorage.matrx_dev_sw=1 to opt-in for local testing).
  // See features/files/cache/service-worker/src/sw.ts for the SW body.
  useIdleTask("register-blob-cache-sw", 5, async () => {
    if (!user?.id) return;
    try {
      const backendUrl = resolveBaseUrl();
      void registerBlobCacheServiceWorker({
        backendUrl,
        userId: user.id,
      });
    } catch {
      // No backend URL configured (rare boot order) — skip silently;
      // the cache still works in-memory + IDB tiers.
    }
  });

  // Hydrate entitlement state (like adminLevel), keyed on the user id so it
  // also refreshes on in-session login/logout (SPA nav, no reload) and clears
  // on logout. Cheap resolver RPC; fails soft to the free permissive snapshot.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user?.id) {
        dispatch(clearEntitlements());
        return;
      }
      const snapshot = await fetchEntitlementSnapshot();
      if (!cancelled) dispatch(setEntitlementSnapshot(snapshot));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dispatch]);

  return (
    <>
      <PersistentDOMConnector />
      <OverlayController />
      <LazyMessagingIsland />
      <KgNewSuggestionNotifier />
      <AuthSessionWatcher />
      <AnnouncementProvider />
      <AdminFeatureProvider />
      <ErrorInspectorBadge />
      <LiveCaptureIndicator />
    </>
  );
}
