"use client";

// features/applets-host/AppletHostMount.tsx — THE WEB HOST FOR ONE APPLET AT /apps/<slug>.
//
// An Applet is a database record (`app.definition`: files, entry, pages, sources, mandates). This
// component builds its `AppletHost` with `@ai-matrx/applets/platform` over the viewer's OWN clients —
// the browser supabase client (row security decides every read and write), the agents intelligence
// port on the app's transport, the active organization (where jobs run; never a read filter), and the
// browser history for its pages (pushState: no server round trip, no remount) — then compiles and renders
// it full-bleed with `mountAppletAsync`. Mounted by the route's LAYOUT, so it outlives page changes.
// No Applet code lives in this repo.

import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createPlatformHost, type PlatformHost } from "@ai-matrx/applets/platform";
import { mountAppletAsync } from "@ai-matrx/applets/frame";
import { createIntelligencePort } from "@ai-matrx/agents/intelligence";
import { liveValues } from "@ai-matrx/alchemy/surface";
import { EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { AppWindow } from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { useAppStore } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { provideStoredComponentScopeModules } from "@/lib/code-runtime/stored-scope";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import type { KindInstanceRenderProps } from "@ai-matrx/content-ir-react";

/** What every Applet may import beside its own files (the record adds its own entries). */
const HOST_SCOPE = {
  entries: ["react", "lucide-react", "@ai-matrx/design-system/controls", "@ai-matrx/applets/react"],
  shadowDangerousGlobals: true,
};

type NavLocation = { path: string[]; params: Record<string, string> };

function locationOf(slug: string, pathname: string, search: string): NavLocation {
  const root = `/apps/${slug}`;
  const rest = pathname.startsWith(root) ? pathname.slice(root.length) : "";
  const params: Record<string, string> = {};
  new URLSearchParams(search).forEach((v, k) => {
    params[k] = v;
  });
  return { path: rest.split("/").filter(Boolean).map(decodeURIComponent), params };
}

function renderKind(kind: string, value: unknown) {
  return (
    <KindInstanceRender
      kind={kind}
      value={value as KindInstanceRenderProps["value"]}
      showRoutingNote={false}
      variant="bare"
    />
  );
}

/** Same URL inside the Applet, without a server round trip or a remount (Next syncs usePathname). */
function pushAppletUrl(url: string) {
  if (`${window.location.pathname}${window.location.search}` === url) return;
  window.history.pushState(null, "", url);
}

type Mounted = { Component: ComponentType } | { error: string };

export function AppletHostMount({ appletId, slug }: { appletId: string; slug: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const store = useAppStore();
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const navListeners = useRef(new Set<(location: NavLocation) => void>());

  // One host per Applet, kept for the page's life: switching organization must not remount the Applet
  // (a running job would die with it). Jobs read the organization at the moment they start (below).
  useEffect(() => {
    let cancelled = false;
    const listeners = navListeners.current;
    // The organization the agents transport stamps when the store has none selected: the one this
    // Applet's job runs in (set below). Every run also carries it as its own header.
    let jobOrganizationId: string | null = null;
    const transportOptions = {
      source: "applets",
      get organizationId() {
        return jobOrganizationId ?? undefined;
      },
    };
    const host: PlatformHost = createPlatformHost({
      appletId,
      supabase,
      agents: createIntelligencePort({ transport: createMatrxTransport(store.getState, transportOptions) }),
      activeOrganizationId: selectActiveOrganizationId(store.getState()),
      nav: {
        async go(to) {
          const tail = to === "/" || to === "" ? "" : to.startsWith("/") ? to : `/${to}`;
          pushAppletUrl(`/apps/${slug}${tail}`);
        },
        async current() {
          return locationOf(slug, window.location.pathname, window.location.search);
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      // The page's live values (ALC-18): the Applet's surface answers an unset value from them.
      surfaces: { live: liveValues },
      reportError(err) {
        captureError({ source: "applet", code: err.code, message: err.message, callSite: err.where, raw: { appletId, slug, diagnostic: err.diagnostic } });
      },
    });
    // Which organization a job runs in. The Applet belongs to an organization the way a table row does:
    // a member of it runs the Applet's jobs there (entity-bound, like `ensureOrganizationContext`'s
    // `organizationId`). Anyone else runs them in the organization they selected; with none selected the
    // organization gate asks them, and the run continues with their choice — never a guess.
    const startRun = host.intelligence.run;
    host.intelligence.run = async (req) => {
      let organizationId: string;
      try {
        const [record, viewer] = await Promise.all([host.record(), host.viewer()]);
        const bound = viewer.organizationIds.includes(record.organizationId) ? record.organizationId : null;
        organizationId = await ensureOrganizationContext(bound ? { organizationId: bound } : {});
        jobOrganizationId = organizationId;
      } catch {
        return { ok: false, error: { code: "organization_required", message: "Choose an organization to run this job in.", retryable: true } };
      }
      return startRun({ ...req, organizationId });
    };
    provideStoredComponentScopeModules();
    void host
      .record()
      .then((record) => mountAppletAsync(record, host, HOST_SCOPE, { renderKind }))
      .then(
        (result) => {
          if (cancelled) return;
          setMounted(result.ok ? { Component: result.Component } : { error: result.error.message });
        },
        (err: unknown) => {
          if (cancelled) return;
          const message = err && typeof err === "object" && "message" in err ? String(err.message) : "This app could not be opened.";
          setMounted({ error: message });
        },
      );
    return () => {
      cancelled = true;
      host.dispose();
    };
  }, [appletId, slug, store]);

  // Route changes the browser makes (back, forward, a link) reach the Applet's pages.
  useEffect(() => {
    const location = locationOf(slug, pathname, search);
    for (const listener of navListeners.current) listener(location);
  }, [slug, pathname, search]);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <RegionSkeleton shape="cards" count={6} aria-label="Opening app" />
      </div>
    );
  }
  if ("error" in mounted) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <EmptyState icon={<AppWindow />} title="This app could not open" line={mounted.error} />
      </div>
    );
  }
  const { Component } = mounted;
  return <Component />;
}
