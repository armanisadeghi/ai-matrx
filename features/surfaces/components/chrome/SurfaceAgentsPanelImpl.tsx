"use client";

/**
 * features/surfaces/components/chrome/SurfaceAgentsPanelImpl.tsx
 *
 * Heavy Agents chrome body — loaded ONLY after the user opens the header
 * button (`next/dynamic({ ssr: false })` + conditional render). Fetches
 * bound agents + parent/child related surfaces on mount of THIS panel, never
 * from the thin header shell.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  fetchRelatedSurfaces,
  getSurfaceDisplayLabel,
  type RelatedSurfaceRef,
} from "@/features/surfaces/runtime/fetchRelatedSurfaces";
import { SurfaceBoundAgentsList } from "@/features/surfaces/components/bind/SurfaceBoundAgentsList";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { cn } from "@/lib/utils";

export interface SurfaceAgentsPanelImplProps {
  className?: string;
}

export default function SurfaceAgentsPanelImpl({
  className,
}: SurfaceAgentsPanelImplProps) {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const { launchAgent } = useAgentLauncher();

  const routeSurface = surfaceFromPathname(pathname);
  // Prefer the page's registered runtime surface when it matches the route
  // (or when the route has no mapping yet).
  const primaryName =
    runtime?.surfaceName &&
    (!routeSurface || runtime.surfaceName === routeSurface)
      ? runtime.surfaceName
      : (routeSurface ?? runtime?.surfaceName ?? null);

  const primaryLabel =
    runtime?.surfaceLabel?.trim() ||
    (primaryName ? getSurfaceDisplayLabel(primaryName) : "This page");

  const [related, setRelated] = useState<{
    parent: RelatedSurfaceRef | null;
    children: RelatedSurfaceRef[];
  } | null>(null);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("self");

  useEffect(() => {
    let cancelled = false;
    setRelated(null);
    setRelatedError(null);
    setActiveTab("self");
    if (!primaryName) return;
    void (async () => {
      try {
        const r = await fetchRelatedSurfaces(primaryName);
        if (cancelled) return;
        setRelated({ parent: r.parent, children: r.children });
      } catch (e) {
        if (cancelled) return;
        setRelatedError(
          e instanceof Error ? e.message : "Could not load related surfaces",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryName]);

  const handleRun = async (surfaceName: string, agentId: string) => {
    try {
      let applicationScope: Record<string, unknown> = {};
      const hasLiveScope = !!runtime && runtime.surfaceName === surfaceName;
      if (hasLiveScope) {
        applicationScope = (await runtime!.getScope()) as Record<
          string,
          unknown
        >;
      } else {
        toast.message("Running without live page context", {
          description:
            "List and bind work; this surface has not registered a live scope yet.",
        });
      }

      await launchAgent(agentId, {
        surfaceKey: `surface-chrome:${surfaceName}:${agentId}`,
        sourceFeature: "surface-chrome",
        config: {
          displayMode: "modal-full",
          allowChat: true,
          showVariablePanel: true,
        },
        runtime: {
          surfaceName,
          applicationScope,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not run agent");
    }
  };

  const tabs: Array<{ id: string; label: string; surfaceName: string }> = [];
  if (primaryName) {
    tabs.push({ id: "self", label: primaryLabel, surfaceName: primaryName });
  }
  if (related?.parent) {
    tabs.push({
      id: `parent:${related.parent.name}`,
      label: `↑ ${related.parent.label}`,
      surfaceName: related.parent.name,
    });
  }
  for (const c of related?.children ?? []) {
    tabs.push({
      id: `child:${c.name}`,
      label: c.label,
      surfaceName: c.name,
    });
  }

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0] ?? null;

  if (!primaryName) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>
        <p className="font-medium text-foreground">No surface for this page</p>
        <p className="mt-1 text-xs leading-relaxed">
          This route is not mapped to a surface yet. Register a manifest and add
          it to the route map so agents can bind here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      <p className="truncate text-sm font-semibold text-foreground">
        {primaryLabel}
      </p>

      {relatedError && (
        <p className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
          {relatedError}
        </p>
      )}

      {related === null && !relatedError && (
        <div className="flex items-center gap-2 py-2 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      )}

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] transition-colors",
                active?.id === t.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {active && (
        <SurfaceBoundAgentsList
          key={active.surfaceName}
          surfaceName={active.surfaceName}
          surfaceLabel={active.label}
          isEditable={
            runtime?.surfaceName === active.surfaceName
              ? (runtime.isEditable ?? false)
              : false
          }
          onRunAgent={(agentId) => handleRun(active.surfaceName, agentId)}
        />
      )}
    </div>
  );
}
