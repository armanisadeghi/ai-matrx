"use client";

// features/applets-host/AppletHostMount.tsx — THE WEB HOST FOR ONE APPLET AT /apps/<slug>.
//
// An Applet is a database record (`app.definition`: files, entry, pages, sources, mandates). This
// component builds its `AppletHost` with `@ai-matrx/applets/platform` over the viewer's OWN clients —
// the browser supabase client (row security decides every read and write), the agents intelligence
// port on the app's transport (each job's stream also adopted into the execution system, so it renders
// through the one live-run pipeline), the active organization (reported; never a read filter), and the
// browser history for its pages (pushState: no server round trip, no remount) — then compiles and renders
// it full-bleed with `mountAppletAsync`. Mounted by the route's LAYOUT, so it outlives page changes.
// No Applet code lives in this repo.

import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createPlatformHost, type PlatformHost } from "@ai-matrx/applets/platform";
import { holdWrites, type HeldWrite } from "@ai-matrx/applets/preview";
import { mountAppletAsync } from "@ai-matrx/applets/frame";
import { createIntelligencePort } from "@ai-matrx/agents/intelligence";
import { liveValues } from "@ai-matrx/alchemy/surface";
import type { MatrxTransport } from "@ai-matrx/agents/matrx";
import type { JobRunView } from "@ai-matrx/applets";
import { adoptForeignStream } from "@ai-matrx/chat/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { AppWindow } from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { useAppStore } from "@/lib/redux/hooks";
import type { AppStore } from "@/lib/redux/store";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { AppletRunOutput } from "@/features/applets-host/AppletRunOutput";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { provideStoredComponentScopeModules } from "@/lib/code-runtime/stored-scope";
import { ensureOrganizationContext } from "@/lib/organization/organization-gate";
import { AppletKind } from "@/features/applets-host/AppletForeignKind";

/** What every Applet may import beside its own files (the record adds its own entries). */
const HOST_SCOPE = {
  entries: ["react", "lucide-react", "@ai-matrx/design-system/controls", "@ai-matrx/applets/react"],
  shadowDangerousGlobals: true,
};

type NavLocation = { path: string[]; params: Record<string, string> };

function locationOf(root: string, pathname: string, search: string): NavLocation {
  const rest = pathname.startsWith(root) ? pathname.slice(root.length) : "";
  const params: Record<string, string> = {};
  new URLSearchParams(search).forEach((v, k) => {
    params[k] = v;
  });
  return { path: rest.split("/").filter(Boolean).map(decodeURIComponent), params };
}

function renderRun(run: JobRunView) {
  return <AppletRunOutput run={run} />;
}

/**
 * Every job an Applet starts is a mandate run whose NDJSON body the agents port reads for the frame's
 * `useJob` state. The same body is TEED into the execution system (`adoptForeignStream`, under the server's
 * `X-Request-ID` — the RunRef's requestId), so `<JobOutput>` renders it through the one live-run pipeline.
 * One wire, two readers; nothing is parsed here.
 */
function adoptAppletRunStreams(base: MatrxTransport, store: AppStore): MatrxTransport {
  return {
    async fetch(path, init) {
      const response = await base.fetch(path, init);
      // A job's start (`/ai/mandates/<key>`) and every later turn of its conversation (`/ai/conversations/<id>`,
      // `useConversation`) render through the same pipeline; `/resume` and other sub-paths are not turns.
      const turn = path.startsWith("/ai/mandates/") || /^\/ai\/conversations\/[^/]+$/.test(path);
      if (init.method !== "POST" || !turn || !response.ok || !response.body) return response;
      const [forJob, forPipeline] = response.body.tee();
      const consume = store.dispatch(adoptForeignStream({ preferServerIds: true }));
      const ids = { requestId: response.headers.get("X-Request-ID"), conversationId: response.headers.get("X-Conversation-ID") };
      void consume(new Response(forPipeline, { status: response.status, statusText: response.statusText, headers: response.headers }), ids);
      return new Response(forJob, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  };
}

/** Same URL inside the Applet, without a server round trip or a remount (Next syncs usePathname). */
function pushAppletUrl(url: string) {
  if (`${window.location.pathname}${window.location.search}` === url) return;
  window.history.pushState(null, "", url);
}

type Mounted = { Component: ComponentType } | { error: string };

/**
 * PREVIEW MODE (BUILD-LOOP §4): the builder mounts the Applet with live reads and HELD writes
 * (`holdWrites` — nothing reaches the store until the person accepts), page changes stay inside the
 * preview (no URL change), and every compile or runtime error is handed to the builder for "Fix it".
 */
export interface AppletPreviewOptions {
  onHeld?: (writes: HeldWrite[]) => void;
  onError?: (error: { where: string; message: string }) => void;
}

export function AppletHostMount({
  appletId,
  slug,
  basePath = `/apps/${slug}`,
  preview,
}: {
  appletId: string;
  slug: string;
  /** Where the Applet's pages live in the URL (default `/apps/<slug>`). */
  basePath?: string;
  preview?: AppletPreviewOptions;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const store = useAppStore();
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const navListeners = useRef(new Set<(location: NavLocation) => void>());
  // The builder's callbacks change every render; the host reads the newest through this ref.
  const previewRef = useRef(preview);
  useEffect(() => {
    previewRef.current = preview;
  });
  const isPreview = preview != null;

  // One host per Applet, kept for the page's life: switching organization must not remount the Applet
  // (a running job would die with it). Jobs read the organization at the moment they start (below).
  useEffect(() => {
    let cancelled = false;
    const listeners = navListeners.current;
    const transportOptions = { source: "applets" };
    let previewLocation: NavLocation = { path: [], params: {} };
    const host: PlatformHost = createPlatformHost({
      appletId,
      supabase,
      agents: createIntelligencePort({ transport: adoptAppletRunStreams(createMatrxTransport(store.getState, transportOptions), store) }),
      activeOrganizationId: selectActiveOrganizationId(store.getState()),
      // A member of the Applet's organization runs jobs there (the package decides); anyone else is
      // asked by the organization gate, and the run continues with their choice — never a guess.
      resolveOrganization: async () => {
        try {
          return await ensureOrganizationContext({});
        } catch {
          return null;
        }
      },
      nav: {
        async go(to) {
          const tail = to === "/" || to === "" ? "" : to.startsWith("/") ? to : `/${to}`;
          if (isPreview) {
            previewLocation = locationOf(basePath, `${basePath}${tail.split("?")[0] ?? ""}`, tail.split("?")[1] ?? "");
            for (const listener of listeners) listener(previewLocation);
            return;
          }
          pushAppletUrl(`${basePath}${tail}`);
        },
        async current() {
          if (isPreview) return previewLocation;
          return locationOf(basePath, window.location.pathname, window.location.search);
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      // The page's live values (ALC-18): the Applet's surface answers an unset value from them.
      surfaces: { live: liveValues },
      reportError(err) {
        previewRef.current?.onError?.({ where: err.where, message: err.message });
        captureError({ source: "applet", code: err.code, message: err.message, callSite: err.where, raw: { appletId, basePath, diagnostic: err.diagnostic } });
      },
    });
    provideStoredComponentScopeModules();
    // Preview: the same host with its data port wrapped — reads stay live, writes are held in memory.
    const held = isPreview ? holdWrites(host.data) : null;
    const stopHeld = held ? held.onHeld((writes) => previewRef.current?.onHeld?.(writes)) : null;
    const channel: PlatformHost = held ? { ...host, data: held } : host;
    void host
      .record()
      .then((record) =>
        mountAppletAsync(record, channel, HOST_SCOPE, {
          // The app's kind registry, or — for a kind the Applet's organization owns — the Applet's own read.
          renderKind: (kind: string, value: unknown) => <AppletKind host={host} kind={kind} value={value} />,
          renderRun,
          // Where an Applet has no room to stream inline: the floating run window, one per job.
          openRun(run) {
            if (!run.ref) return;
            store.dispatch(
              openLiveRunWindowAction({
                instanceId: `applet:${appletId}:${run.ref.mandateKey}`,
                requestId: run.ref.requestId,
                label: run.label ?? null,
              }),
            );
          },
        }),
      )
      .then(
        (result) => {
          if (cancelled) return;
          if (!result.ok) previewRef.current?.onError?.({ where: "compile", message: result.error.message });
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
      stopHeld?.();
      host.dispose();
    };
  }, [appletId, basePath, store, isPreview]);

  // Route changes the browser makes (back, forward, a link) reach the Applet's pages.
  useEffect(() => {
    if (isPreview) return;
    const location = locationOf(basePath, pathname, search);
    for (const listener of navListeners.current) listener(location);
  }, [basePath, pathname, search, isPreview]);

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
