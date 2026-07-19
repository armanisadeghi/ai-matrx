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
import { Braces, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  fetchRelatedSurfaces,
  getSurfaceDisplayLabel,
  type RelatedSurfaceRef,
} from "@/features/surfaces/runtime/fetchRelatedSurfaces";
import { SurfaceBoundAgentsList } from "@/features/surfaces/components/bind/SurfaceBoundAgentsList";
import { Badge } from "@/components/ui/badge";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { useOpenSurfaceContextWindow } from "@/features/overlays/openers/surfaceContextWindow";
import { useOpenSurfaceContextInspector } from "@/features/overlays/openers/surfaceContextInspector";

export interface SurfaceAgentsPanelImplProps {
  className?: string;
  onRequestClose?: () => void;
}

export default function SurfaceAgentsPanelImpl({
  className,
  onRequestClose,
}: SurfaceAgentsPanelImplProps) {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const { launchAgent } = useAgentLauncher();
  const isAdmin = useAppSelector(selectIsAdmin);
  const openSurfaceContext = useOpenSurfaceContextWindow();
  const openSurfaceContextAdmin = useOpenSurfaceContextInspector();

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
    surfaceName: string;
    parent: RelatedSurfaceRef | null;
    children: RelatedSurfaceRef[];
  } | null>(null);
  const [relatedError, setRelatedError] = useState<{
    surfaceName: string;
    message: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("self");

  useEffect(() => {
    let cancelled = false;
    if (!primaryName) return;
    void (async () => {
      try {
        const r = await fetchRelatedSurfaces(primaryName);
        if (cancelled) return;
        setRelated({
          surfaceName: primaryName,
          parent: r.parent,
          children: r.children,
        });
        setRelatedError(null);
      } catch (e) {
        if (cancelled) return;
        setRelatedError({
          surfaceName: primaryName,
          message:
            e instanceof Error ? e.message : "Could not load related surfaces",
        });
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
      if (hasLiveScope && runtime) {
        applicationScope = (await runtime.getScope()) as Record<
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

  const currentRelated = related?.surfaceName === primaryName ? related : null;
  const currentRelatedError =
    relatedError?.surfaceName === primaryName ? relatedError.message : null;
  const tabs: Array<{ id: string; label: string; surfaceName: string }> = [];
  if (primaryName) {
    tabs.push({ id: "self", label: primaryLabel, surfaceName: primaryName });
  }
  if (currentRelated?.parent) {
    tabs.push({
      id: `parent:${currentRelated.parent.name}`,
      label: `↑ ${currentRelated.parent.label}`,
      surfaceName: currentRelated.parent.name,
    });
  }
  for (const c of currentRelated?.children ?? []) {
    tabs.push({
      id: `child:${c.name}`,
      label: c.label,
      surfaceName: c.name,
    });
  }

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0] ?? null;

  const contextActions = (
    <div className="space-y-2 border-b border-border pb-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-foreground">
          {primaryLabel}
        </p>
        {!primaryName && (
          <Badge variant="outline" className="shrink-0 text-[9px]">
            Unregistered
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            openSurfaceContext({
              surfaceName: primaryName ?? "",
              surfaceLabel: primaryLabel,
              isEditable: runtime?.isEditable === true,
            });
            onRequestClose?.();
          }}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Braces className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">
              Surface Context
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              Live page values
            </span>
          </span>
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              openSurfaceContextAdmin({
                surfaceName: primaryName,
                isEditable: runtime?.isEditable === true,
                preferRuntime: true,
              });
              onRequestClose?.();
            }}
            className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-violet-500" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                Surface Context Admin
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                Contract, provenance &amp; settings
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );

  if (!primaryName) {
    return (
      <div className={cn("flex flex-col gap-3 p-3", className)}>
        {contextActions}
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            No surface registered for this page
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            The context window is still available, but it will remain empty
            until this route registers a manifest or live surface runtime.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      {contextActions}

      {currentRelatedError && (
        <p className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
          {currentRelatedError}
        </p>
      )}

      {currentRelated === null && !currentRelatedError && (
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
