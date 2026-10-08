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

import { Suspense, useEffect, useRef } from "react";
import { useWarmup } from "@ai-matrx/agents/react";
import { useIdleTask } from "@ai-matrx/kit/idle-scheduler";
import { whenPrimaryContentShown } from "@/lib/boot/primaryContent";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { PersistentDOMConnector } from "@/providers/persistance/PersistentDOMConnector";
import OverlayController from "@/features/overlays/OverlayController";
import AuthSessionWatcher from "@/components/layout/AuthSessionWatcher";
import PersonTimeZoneCapture from "@/components/layout/PersonTimeZoneCapture";
import { LinkOrganizationWatcher } from "@/features/organizations/components/LinkOrganizationWatcher";
import AnnouncementProvider from "@/components/layout/AnnouncementProvider";
import AdminFeatureProvider from "@/features/admin/AdminFeatureProvider";
import KgNewSuggestionNotifier from "@/features/kg-suggestions/components/KgNewSuggestionNotifier";
import AssistsDock from "@/features/assists/components/AssistsDock";
import CloudBrowserHandoffDeepLink from "@/features/cloud-browser/components/CloudBrowserHandoffDeepLink";
import { TutorialHost } from "@/features/guided-tutorials/TutorialHost";
import LiveCaptureIndicator from "@/features/media-capture/components/LiveCaptureIndicator";
import ErrorInspectorBadge from "@/features/admin/error-inspector/ErrorInspectorBadge";
import NeedsYouAssistProducer from "@/features/capture-ladder/NeedsYouAssistProducer";
import AdminAttentionDock from "@/features/admin/attention/AdminAttentionDock";
import { FirstSignInAgeGateMount } from "@/features/education/compliance/FirstSignInAgeGateMount";
import { DailySpendPopoverMount } from "@/features/admin/spend/DailySpendPopoverMount";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { ensureScopeSkeleton } from "@/features/scopes/redux/thunks/ensureScopeSkeleton";
import { registerBlobCacheServiceWorker } from "@/features/files/cache/register-service-worker";
import { resolveBaseUrl } from "@/lib/python-client";
import { fetchEntitlementSnapshot } from "@/features/entitlements/service";
import { UsageGateBridge } from "@/features/entitlements/usage-gate/UsageGateBridge";
import {
  setEntitlementSnapshot,
  clearEntitlements,
} from "@/features/entitlements/state/entitlementsSlice";
import { UrlPanelManager } from "@/features/window-panels/url-sync/UrlPanelManager";
import { KindLeakSentinel } from "@/features/content-ir/surfaces/KindLeakSentinel";


export default function DeferredSingletonCore() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const organizationId = useAppSelector(selectOrganizationId);

  // WARM-UP (contract: common-docs systems/architecture/warm-cache/CONTRACT.md).
  // Session ready (signed in + an active org) → warm the person's core data;
  // the active org changing for the SAME person → re-warm core + that org.
  // A rehydrate that re-dispatches the same id never changes `organizationId`,
  // so it never re-warms (the same before/after rule as
  // features/mandates/redux/org-switch-cache-middleware.ts). The primitive
  // dedupes per person+org for 60s and is silent when the server says no.
  const warmup = useWarmup();
  const warmedFor = useRef<{ userId: string; organizationId: string } | null>(
    null,
  );
  useEffect(() => {
    if (!warmup || !user?.id || !organizationId) return;
    const before = warmedFor.current;
    if (before?.userId === user.id && before.organizationId === organizationId)
      return;
    warmedFor.current = { userId: user.id, organizationId };
    if (before?.userId === user.id) {
      warmup.warm(
        [{ key: "core" }, { key: "org", id: organizationId }],
        "org_change",
      );
    } else {
      warmup.warm([{ key: "core" }], "session");
    }
  }, [warmup, user?.id, organizationId]);

  // NOTE: global error capture + persistence install live in the WRAPPER
  // (DeferredSingletonWrapper.tsx), not here — they must be running during
  // the boot window, before this deferred core has loaded.

  // Pre-warm the scope tree (features/scopes) on idle. This is the ONLY
  // boot-time fetch in the scope/context system. `ensureScopeTree` is
  // idempotent — status === "ready" short-circuits and in-flight is
  // deduped inside the thunk.
  // THE PAGED TREE (lane SCOPES-TREE-PAGED): the skeleton first (organizations, projects, scope
  // types — what every first paint draws), then the whole tree at idle for the readers that still
  // read every scope. Read switch OFF: the skeleton IS the whole tree and the second task is a no-op.
  // Both wait for the page's own rows (`lib/boot/primaryContent`, lane PAGE-BUNDLE-2): the tree's
  // `custom.context_tree` is ~1.2 s of database work that competed with a table page's first page.
  useIdleTask("ensure-scope-tree", 1, async () => {
    if (!user?.id) return;
    await whenPrimaryContentShown();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await dispatch(ensureScopeSkeleton() as any);
  });
  useIdleTask("ensure-scope-tree-whole", 5, async () => {
    if (!user?.id) return;
    await whenPrimaryContentShown();
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
      // A tier belongs to an organization (DD-047): the snapshot is the
      // organization's, so it re-reads when the person sets or switches one, and
      // hydrates nothing (null) until there is one.
      const snapshot = await fetchEntitlementSnapshot();
      if (!cancelled && snapshot) dispatch(setEntitlementSnapshot(snapshot));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, organizationId, dispatch]);

  return (
    <>
      <PersistentDOMConnector />
      <OverlayController />
      {/* G1: files any `__kind` drawn as raw text (never-raw law). */}
      <KindLeakSentinel />
      {/* Render-free until a usage limit is hit: the usage gate's boot read,
          server notifications, near/over notice and limit dialog. */}
      <UsageGateBridge />
      {/* Render-free. THE reader/writer of `?panels=` — the deep-link channel
          for floating windows (`?panels=notes`, `?panels=vault:<id>`, …).
          Mounted GLOBALLY and unallowlisted: it owns every key that has a
          hydrator in url-sync/initUrlHydration.ts, on every authenticated
          route. It was route-scoped to /marketing/keyword-research from
          2026-08-27 until 2026-08-30, which made every other `?panels=` link
          on every other route a silent no-op — no window, no warning. Never
          re-scope it to one route: a deep link that works only where its
          author happened to test it is the same defect. */}
      <Suspense fallback={null}>
        <UrlPanelManager />
      </Suspense>
      <KgNewSuggestionNotifier />
      <AssistsDock />
      {/* Render-free. Reads `?cloudBrowserHandoff=` — the door a D-14 "your
          browser needs you" notification lands on — and opens the Cloud
          Browser canvas on that exact handoff. Global, because the notice can
          land on any route and the person must never have to go find the
          browser themselves. */}
      <CloudBrowserHandoffDeepLink />
      {/* Reads `?tutorial=` — the door a "Show me how" DM card or tutorial
          email lands on — and runs that guided tutorial on its route. */}
      <Suspense fallback={null}>
        <TutorialHost />
      </Suspense>
      {/* Render-free. Reads `?org=` — the organization every deep link the
          platform emits now names — and honours it against the LIVE membership
          list, announcing a move and refusing a link that is not this
          account's in words. Global, because a notification's door can land on
          any route, and the cold-boot half (appContextPolicy) does not run for
          a link followed while the app is already warm. */}
      <LinkOrganizationWatcher />
      <AuthSessionWatcher />
      <PersonTimeZoneCapture />
      <AnnouncementProvider />
      <AdminFeatureProvider />
      <ErrorInspectorBadge />
      {/* Super-admin only; renders nothing for everyone else, issues no request
          for them, and renders nothing while nothing needs a person. ONE
          floating card for every concern (schedule alarms, provider outages)
          with a per-item mute and a whole-dock snooze — the two separate
          notices it replaced had become furniture (Arman, 2026-09-14). It
          FLOATS: see the component header and styles/shell.css. */}
      <AdminAttentionDock />
      <LiveCaptureIndicator />
      {/* Render-free. Keeps ONE assist row in step with the capture queue; the
          assists dock above does the showing, so this corner holds one draggable
          dock with real close/snooze/never-again controls instead of two
          floating things (Arman, 2026-09-18 — the tray this replaced had none of
          them). Rungs 3 and 4 run in the person's own Chrome through
          matrx-extend minutes or hours after the scrape that raised them, so
          the notice cannot live on /scraper/batch where it was created: it has
          to find the person wherever they are. It reads media.capture_handoff
          directly (there is no outbound channel from the server to a browser).
          common-docs/projects/acquisition-frontier/extension-ladder/CONTRACT.md §8.1. */}
      <NeedsYouAssistProducer />
      {/* Render-free. Asks a signed-in account with no declared age band for
          it ONCE, after they are in the app — never during signup (Arman,
          2026-08-20). Dismissible; re-asks next session. Guests are handled by
          EducationAgeGateMount, where their block actually bites. */}
      {user?.id && <FirstSignInAgeGateMount />}
      {/* Render-free. Raises the floating "spent so far today" window for a
          Super Admin on their first app open each local day (Arman,
          2026-09-11: scare me with the number, never block the code). Cadence
          is the knob platform.spend_popover.times_per_day — 0 turns it off; a
          dismissal ends the day. Internally gated on selectIsSuperAdmin. */}
      {user?.id && <DailySpendPopoverMount />}
    </>
  );
}
