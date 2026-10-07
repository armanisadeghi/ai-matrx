"use client";

// features/applets-host/AppletForeignKind.tsx — a kind the APPLET's organization owns, rendered for every viewer.
//
// The app's kind registry routes the kinds the viewer can read. A kind owned by the Applet's organization is
// unknown to a viewer from another organization, so the host's `kinds` port reads it THROUGH the Applet
// (`app.applet_kind`, @ai-matrx/applets >= 0.7.0) and its stored web component compiles through the one
// code-runtime binding (`compileStoredComponent`). Anything else renders through `KindInstanceRender`.

import { useEffect, useState, type ComponentType } from "react";
import type { PlatformHost } from "@ai-matrx/applets/platform";
import type { KindInstanceRenderProps } from "@ai-matrx/content-ir-react";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import KindInstanceRender, { kindIsRoutable } from "@/features/content-ir/studio/components/KindInstanceRender";
import { compileStoredComponent } from "@/lib/code-runtime/compile-stored";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

type Resolved = { kind: "shared" } | { kind: "owned"; Component: ComponentType<Record<string, unknown>> } | { kind: "failed"; message: string };

function Shared({ kind, value }: { kind: string; value: unknown }) {
  return <KindInstanceRender kind={kind} value={value as KindInstanceRenderProps["value"]} showRoutingNote={false} variant="bare" />;
}

export function AppletKind({ host, kind, value }: { host: PlatformHost; kind: string; value: unknown }) {
  const routable = kindIsRoutable(kind);
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (routable) return;
    let cancelled = false;
    void (async (): Promise<Resolved> => {
      const [record, definition] = await Promise.all([host.record(), host.kinds.definition(kind)]);
      const owner = definition.ok && definition.data && typeof definition.data === "object" ? (definition.data as { organization_id?: unknown }).organization_id : null;
      if (owner !== record.organizationId) return { kind: "shared" };
      const component = await host.kinds.component(kind, "web");
      if (!component.ok) return { kind: "failed", message: component.error.message };
      if (!component.data) return { kind: "shared" };
      const compiled = compileStoredComponent({
        code: component.data.files[component.data.entry] ?? "",
        origin: `kind:${kind}`,
        sandboxDangerousGlobals: true,
      });
      return compiled.Component ? { kind: "owned", Component: compiled.Component } : { kind: "failed", message: compiled.error ?? `The ${kind} view could not be built.` };
    })().then(
      (next) => {
        if (next.kind === "failed") captureError({ source: "applet", code: "foreign_kind_unbuilt", message: next.message, callSite: `AppletKind:${kind}` });
        if (!cancelled) setResolved(next);
      },
      () => {
        if (!cancelled) setResolved({ kind: "shared" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [host, kind, routable]);

  if (routable) return <Shared kind={kind} value={value} />;
  if (!resolved) return <RegionSkeleton shape="cards" count={1} aria-label="Loading result" />;
  if (resolved.kind === "owned") {
    const { Component } = resolved;
    return <Component data={value} />;
  }
  return <Shared kind={kind} value={value} />;
}
