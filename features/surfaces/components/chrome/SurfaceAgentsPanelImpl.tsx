"use client";

/**
 * features/surfaces/components/chrome/SurfaceAgentsPanelImpl.tsx
 *
 * Heavy Agents chrome body — loaded ONLY after the user opens the header
 * button (`next/dynamic({ ssr: false })` + conditional render).
 *
 * THE NAMING LAW: every surface label rendered here comes from
 * `getSurfaceDisplayLabel` (manifest-owned). Hierarchy comes synchronously
 * from the manifest registry (`getRelatedSurfaces`) — the full ancestry is
 * rendered as a breadcrumb (Brand › Site › [Page]) with children below.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Braces, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";

import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { getRelatedSurfaces } from "@/features/surfaces/runtime/fetchRelatedSurfaces";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
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

  const primaryLabel = primaryName
    ? getSurfaceDisplayLabel(primaryName)
    : "This page";

  // Synchronous, registry-backed — no fetch, no race, no error state.
  const related = getRelatedSurfaces(primaryName);

  // Which surface's agents are listed. Defaults to the page's own surface.
  const [activeSurface, setActiveSurface] = useState<string | null>(null);
  const activeName = activeSurface ?? primaryName;
  const activeLabel = activeName ? getSurfaceDisplayLabel(activeName) : null;

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
          displayMode: "flexible-panel",
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

  const contextActions = (
    <div className="space-y-2 border-b border-border pb-2">
      <div className="min-w-0">
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
        {primaryName && (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {primaryName}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            openSurfaceContext({
              surfaceName: primaryName ?? "",
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

  const breadcrumb = [...related.ancestry, related.self].filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      {contextActions}

      {/* Hierarchy breadcrumb — full ancestry, root first, self last. */}
      {breadcrumb.length > 1 && (
        <nav
          aria-label="Surface hierarchy"
          className="flex flex-wrap items-center gap-0.5 border-b border-border pb-2"
        >
          {breadcrumb.map((ref, i) => {
            const isSelf = ref.kind === "self";
            const isActive = activeName === ref.name;
            return (
              <span key={ref.name} className="flex items-center gap-0.5">
                {i > 0 && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveSurface(ref.name)}
                  title={ref.name}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] transition-colors",
                    isSelf ? "font-semibold" : "font-normal",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {ref.label}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      {/* Child surfaces of the current page's surface. */}
      {related.children.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Child surfaces
          </span>
          {related.children.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setActiveSurface(c.name)}
              title={c.name}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] transition-colors",
                activeName === c.name
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {activeName && (
        <div className="min-w-0">
          {activeName !== primaryName && activeLabel && (
            <p className="mb-1 text-[10px] text-muted-foreground">
              Agents on <span className="font-medium">{activeLabel}</span>
            </p>
          )}
          <SurfaceBoundAgentsList
            key={activeName}
            surfaceName={activeName}
            isEditable={
              runtime?.surfaceName === activeName
                ? (runtime.isEditable ?? false)
                : false
            }
            onRunAgent={(agentId) => handleRun(activeName, agentId)}
          />
        </div>
      )}
    </div>
  );
}
