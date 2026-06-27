"use client";

// `DeferredSingletons` mounts inside `app/Providers.tsx` and only renders
// after `useIdleReady()` resolves true (post page-idle). It is a thin
// client-component wrapper — every leaf widget below is responsible for
// dynamic-loading its own heavy body internally. Wrapping leaf widgets
// in `next/dynamic` from THIS file is the wrong layer (every consumer of
// the widget would have to repeat the dance) and, when the parent is a
// Server Component, is invalid. The right pattern lives in each leaf
// widget's own file: a tiny `"use client"` shell that `dynamic()`s an
// `*Impl.tsx` sibling with the heavy body.
//
// Build-time rule: this file is in the static dep graph of every
// authenticated route, so every static import here is parsed for every
// page entry. Keep it minimal:
//   - Type-only imports use `import type` (erased at compile).
//   - Never import from a barrel `index.ts` — go to the source file.
//   - Anything used only inside an idle callback must be `await import()`
//     inside that callback so its module is not in this file's static
//     graph at all (`brokerActions`, `fetchFullContext` below).

// Side-effect import: schedules the bundle-leak guard's boot-end macrotask
// during the CLIENT boot bundle. This MUST live in a `"use client"` module
// — the previous mount in `app/Providers.tsx` was server-only (Providers
// is a Server Component, side-effect imports of non-`"use client"`
// modules don't ship to the client bundle). Without this, the guard
// module first evaluates inside the lazy window-panels chunk, in the
// same synchronous turn as the registry/OverlaySurface modules — by the
// time their assertion microtasks run, the guard's `setTimeout(0)`
// hasn't fired yet, so `bootInProgress` is still true and we get false-
// positive alarms on legitimate lazy loads.
import "@/features/window-panels/utils/lazy-bundle-guard";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useIdleReady, useIdleTask } from "@/utils/idle-scheduler";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { OverlayState } from "@/lib/redux/slices/overlaySlice";
import { selectOpenInstances } from "@/lib/redux/slices/overlaySlice";
import {
  selectUser,
  selectIsSuperAdmin,
} from "@/lib/redux/selectors/userSelectors";
import { PersistentDOMConnector } from "@/providers/persistance/PersistentDOMConnector";
import OverlayController from "@/features/overlays/OverlayController";
import LegacyPromptOverlaysController from "@/features/prompts/components/results-display/LegacyPromptOverlaysController";
import { AudioRecoveryToast } from "@/features/audio/components/AudioRecoveryToast";
import AuthSessionWatcher from "@/components/layout/AuthSessionWatcher";
import AnnouncementProvider from "@/components/layout/AnnouncementProvider";
import AdminFeatureProvider from "@/features/admin/AdminFeatureProvider";

const LazyMessagingIsland = dynamic(
  () => import("@/features/shell/islands/LazyMessagingIsland"),
  { ssr: false, loading: () => null },
);

// Global "you have a new knowledge-graph suggestion" nudge. Returns null until
// it has something genuinely new (unacknowledged) to say, then fires a single
// delayed sonner toast. Kept out of this file's static graph via next/dynamic.
const LazyKgNewSuggestionNotifier = dynamic(
  () => import("@/features/kg-suggestions/components/KgNewSuggestionNotifier"),
  { ssr: false, loading: () => null },
);

// Admin-only floating chip that appears the moment a Supabase error is captured
// anywhere in the app and opens the Error Inspector. Self-gates on admin + on
// having at least one captured error, so it renders nothing for everyone else.
const LazyErrorInspectorBadge = dynamic(
  () => import("@/features/admin/error-inspector/ErrorInspectorBadge"),
  { ssr: false, loading: () => null },
);

// Selector that returns true if ANY overlay instance is currently open.
// Used by OverlayControllerGate below to defer mounting OverlayController
// (and its Impl chunk's 111-window lazy graph) until the user actually
// opens their first overlay. The selector reads only the slice's state,
// so it doesn't trigger any window-panel module to be parsed.
function selectAnyOverlayOpen(state: { overlays: OverlayState }): boolean {
  const overlays = state.overlays?.overlays;
  if (!overlays) return false;
  for (const bucket of Object.values(overlays)) {
    for (const inst of Object.values(bucket)) {
      if (inst.isOpen) return true;
    }
  }
  return false;
}

/**
 * Mounts the OverlayController shell only when at least one overlay is
 * actually open. Combined with the `next/dynamic` boundary inside the
 * shell (`features/overlays/OverlayController.tsx` → Impl chunk), this
 * means the Impl's parse cost + every window-component chunk stay out
 * of the page entirely until the user opens their first overlay.
 *
 * Why the gate matters: the shell is tiny and could be mounted
 * unconditionally, but mounting it would cause `next/dynamic` to start
 * preloading the Impl chunk on idle (loadableGenerated.modules). The
 * gate prevents that prefetch until the first dispatch.
 */
// function OverlayControllerGate() {
//   const hasAny = useAppSelector(selectAnyOverlayOpen);
//   const createProjectInstances = useAppSelector((s) =>
//     selectOpenInstances(s, "createProjectWindow"),
//   );

//   useEffect(() => {
//     if (hasAny) {
//       console.log(
//         "[Track New Project] 6, DeferredSingletons.tsx — OverlayControllerGate: overlay open, mounting OverlayController",
//       );
//     }
//   }, [hasAny]);

//   useEffect(() => {
//     if (createProjectInstances.length > 0) {
//       console.log(
//         "[Track New Project] 7, DeferredSingletons.tsx — OverlayControllerGate: createProjectWindow instance(s) in Redux",
//         {
//           count: createProjectInstances.length,
//           instanceIds: createProjectInstances.map((i) => i.instanceId),
//         },
//       );
//     }
//   }, [createProjectInstances]);

//   if (!hasAny) return null;
//   return <OverlayController />;
// }

// ─── Static system broker descriptors (data only) ─────────────────────────

const SYSTEM_BROKERS = [
  {
    source: "system",
    sourceId: "global",
    mappedItemId: "user",
    brokerId: "GLOBAL_USER_OBJECT",
  },
  {
    source: "system",
    sourceId: "global",
    mappedItemId: "userId",
    brokerId: "GLOBAL_USER_ID",
  },
  {
    source: "system",
    sourceId: "global",
    mappedItemId: "userName",
    brokerId: "GLOBAL_USER_NAME",
  },
  {
    source: "system",
    sourceId: "global",
    mappedItemId: "userProfileImage",
    brokerId: "GLOBAL_USER_PROFILE_IMAGE",
  },
];

export default function DeferredSingletons() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  // Broker registration + initial values. The broker slice (and its
  // reducer barrel) is part of the root reducer's compile unit anyway,
  // so lazy-importing here keeps it out of *this* entry's static graph
  // without adding meaningful runtime cost.
  // Note the direct `/slice` path — `@/lib/redux/brokerSlice` is a
  // barrel-of-barrels (re-exports selectors/hooks/thunks/utils) and must
  // not be used in this file's compile graph.
  useIdleTask("broker-registration", 5, async () => {
    const { brokerActions } = await import("@/lib/redux/brokerSlice/slice");
    dispatch(brokerActions.addOrUpdateRegisterEntries(SYSTEM_BROKERS));
  });

  useIdleTask("broker-values", 5, async () => {
    if (!user?.id) return;
    const { brokerActions } = await import("@/lib/redux/brokerSlice/slice");

    dispatch(
      brokerActions.setValue({ brokerId: "GLOBAL_USER_OBJECT", value: user }),
    );
    dispatch(
      brokerActions.setValue({ brokerId: "GLOBAL_USER_ID", value: user.id }),
    );

    const userName =
      user.userMetadata?.fullName ||
      user.userMetadata?.name ||
      user.userMetadata?.preferredUsername ||
      user.email;
    dispatch(
      brokerActions.setValue({ brokerId: "GLOBAL_USER_NAME", value: userName }),
    );

    const profileImage =
      user.userMetadata?.avatarUrl || user.userMetadata?.picture || null;
    dispatch(
      brokerActions.setValue({
        brokerId: "GLOBAL_USER_PROFILE_IMAGE",
        value: profileImage,
      }),
    );
    // Reflects the highest-bar (Super Admin) since admin levels shipped.
    // Broker name preserved for back-compat with downstream gates.
    dispatch(
      brokerActions.setValue({
        brokerId: "GLOBAL_USER_IS_ADMIN",
        value: isSuperAdmin,
      }),
    );
  });

  // Pre-warm the scope tree (features/scopes) on idle. This is the ONLY
  // boot-time fetch in the scope/context system. `ensureScopeTree` is
  // idempotent — status === "ready" short-circuits and in-flight is
  // deduped inside the thunk.
  //
  // The legacy `fetch-full-context` idle task (which fired
  // `fetchFullContext()` from features/agent-context/redux/hierarchyThunks)
  // was removed here on 2026-05-16 as part of Phase 2 of the scopes
  // rebuild. Consumers of the legacy hierarchy/projects/tasks slices that
  // still need data fetch it on demand via `useNavTree()` — that hook is
  // idempotent and self-fetches when `status === "idle"`. See
  // features/scopes/FEATURE.md §"Current work".
  useIdleTask("ensure-scope-tree", 1, async () => {
    if (!user?.id) return;
    const { ensureScopeTree } =
      await import("@/features/scopes/redux/thunks/ensureScopeTree");
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
    const [{ registerBlobCacheServiceWorker }, { resolveBaseUrl }] =
      await Promise.all([
        import("@/features/files/cache/register-service-worker"),
        import("@/lib/python-client"),
      ]);
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

  const ready = useIdleReady();

  if (!ready) return null;

  return (
    <>
      <PersistentDOMConnector />
      <OverlayController />
      <LegacyPromptOverlaysController />
      <LazyMessagingIsland />
      <AudioRecoveryToast />
      <LazyKgNewSuggestionNotifier />
      <AuthSessionWatcher />
      <AnnouncementProvider />
      <AdminFeatureProvider />
      <LazyErrorInspectorBadge />
    </>
  );
}
