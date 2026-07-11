"use client";

/**
 * features/surfaces/components/bind/SurfaceBoundAgentsList.tsx
 *
 * Drop-in "agents on this surface" list. Sections with agents only:
 *   Public · Mine · Org names · Shared with me
 *
 * Compact single-line rows: Play · name · Settings · Detach (when bound here).
 */

import { useEffect, useState } from "react";
import { Loader2, Play, Plus, Settings, Unlink } from "lucide-react";
import { toast } from "sonner";

import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";
import { useOpenSurfaceAgentBindWindow } from "@/features/overlays/openers/surfaceAgentBindWindow";
import { useOpenAgentSettingsWindow } from "@/features/overlays/openers/agentSettingsWindow";
import { unbindAgentFromSurface } from "@/features/surfaces/services/bind-agent-to-surface.service";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { SurfaceBoundAgentEntry } from "@/features/surfaces/services/surface-bound-agents.service";

export interface SurfaceBoundAgentsListProps {
  surfaceName: string;
  /** Human label shown in the bind / settings windows (e.g. "PDF Extractor"). */
  surfaceLabel: string;
  /**
   * Called when the user hits Play. Surfaces build their own
   * `applicationScope` + launch options here.
   */
  onRunAgent: (agentId: string) => void | Promise<void>;
  /** Disable Run buttons (e.g. no document content yet). */
  runDisabled?: boolean;
  /** Hide the whole block when empty and not loading. Default false. */
  hideWhenEmpty?: boolean;
  /** Pass through to `useSurfaceBoundAgents`. */
  isEditable?: boolean;
  includeDefaults?: boolean;
  className?: string;
  /** Override the empty-state copy. */
  emptyMessage?: string;
  /** Override the add-button label. */
  addLabel?: string;
}

export function SurfaceBoundAgentsList({
  surfaceName,
  surfaceLabel,
  onRunAgent,
  runDisabled = false,
  hideWhenEmpty = false,
  isEditable = false,
  includeDefaults = true,
  className,
  emptyMessage = "No agents bound yet. Add one to run it here.",
  addLabel = "Add custom agent",
}: SurfaceBoundAgentsListProps) {
  const openBind = useOpenSurfaceAgentBindWindow();
  const openSettings = useOpenAgentSettingsWindow();
  const { sections, loading, hasAgents, refresh } = useSurfaceBoundAgents(
    surfaceName,
    { isEditable, includeDefaults },
  );

  const [detachTarget, setDetachTarget] =
    useState<SurfaceBoundAgentEntry | null>(null);
  const [detachBusy, setDetachBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = () => {
    openBind({
      surfaceName,
      surfaceLabel,
      onBound: () => {
        void refresh();
      },
    });
  };

  if (hideWhenEmpty && !loading && !hasAgents) return null;

  const visibleSections = sections.filter((s) => s.agents.length > 0);

  return (
    <div className={cn("space-y-3", className)}>
      {loading && !hasAgents && (
        <div className="flex items-center justify-center gap-2 py-4 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading agents…
        </div>
      )}

      {!loading && !hasAgents && (
        <p className="rounded-md border border-dashed border-border px-2.5 py-3 text-center text-[10px] text-muted-foreground">
          {emptyMessage}
        </p>
      )}

      {visibleSections.map((section) => (
        <div key={section.key} className="space-y-1">
          <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.agents.map((a) => (
              <div
                key={`${section.key}:${a.agentId}`}
                className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-1.5"
              >
                <button
                  type="button"
                  title={`Run ${a.name}`}
                  aria-label={`Run ${a.name}`}
                  disabled={runDisabled}
                  onClick={() => void onRunAgent(a.agentId)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Play className="h-3 w-3 fill-current" />
                </button>
                <p className="min-w-0 flex-1 truncate text-xs font-medium leading-none">
                  {a.name}
                </p>
                <button
                  type="button"
                  title={`Settings for ${a.name}`}
                  aria-label={`Settings for ${a.name}`}
                  onClick={() =>
                    openSettings({
                      initialAgentId: a.agentId,
                      surfaceName,
                      surfaceLabel,
                    })
                  }
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Settings className="h-3 w-3" />
                </button>
                {a.canDetach && (
                  <button
                    type="button"
                    title={`Remove ${a.name} from ${surfaceLabel}`}
                    aria-label={`Remove ${a.name} from ${surfaceLabel}`}
                    onClick={() => setDetachTarget(a)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-2 text-[10px] text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" />
        <span>{addLabel}</span>
      </button>

      <ConfirmDialog
        open={!!detachTarget}
        onOpenChange={(open) => {
          if (!open && !detachBusy) setDetachTarget(null);
        }}
        title="Remove from surface"
        description={
          <>
            Remove <b>{detachTarget?.name}</b> from <b>{surfaceLabel}</b>? It
            will no longer appear here or in this surface&apos;s context menu.
          </>
        }
        confirmLabel="Remove"
        variant="destructive"
        busy={detachBusy}
        onConfirm={async () => {
          if (!detachTarget) return;
          setDetachBusy(true);
          try {
            await unbindAgentFromSurface({
              agentId: detachTarget.agentId,
              surfaceName,
            });
            toast.success(`Removed from ${surfaceLabel}`);
            setDetachTarget(null);
            void refresh();
          } catch (e) {
            toast.error(
              e instanceof Error ? e.message : "Could not remove agent",
            );
          } finally {
            setDetachBusy(false);
          }
        }}
      />
    </div>
  );
}
