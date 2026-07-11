"use client";

/**
 * features/surfaces/components/bind/SurfaceBoundAgentsList.tsx
 *
 * The drop-in "agents on this surface" list used by product surfaces
 * (PDF Widgets is the reference). Lists agents bound to `surfaceName`,
 * offers Run / Settings per row, and an "Add custom agent" button that
 * opens the canonical `surfaceAgentBindWindow`. Settings opens
 * `agentSettingsWindow` with `surfaceName` so the Surface bindings tab
 * appears for in-context mapping edits.
 *
 * Surfaces own launch semantics (scope building, display mode) via
 * `onRunAgent`. This component owns bind/list/refresh only.
 */

import { useEffect, useMemo } from "react";
import { Loader2, Play, Plus, Settings } from "lucide-react";

import { useSurfaceBoundAgents } from "@/features/surfaces/hooks/useSurfaceBoundAgents";
import { useOpenSurfaceAgentBindWindow } from "@/features/overlays/openers/surfaceAgentBindWindow";
import { useOpenAgentSettingsWindow } from "@/features/overlays/openers/agentSettingsWindow";
import { cn } from "@/lib/utils";

export interface SurfaceBoundAgentRow {
  agentId: string;
  name: string;
  bindingId: string;
  sectionLabel: string;
}

export interface SurfaceBoundAgentsListProps {
  surfaceName: string;
  /** Human label shown in the bind window (e.g. "PDF Widgets"). */
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
  /** Override the section heading. */
  heading?: string;
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
  heading = "Agents on this surface",
  emptyMessage = "No agents bound yet. Add one to run it here.",
  addLabel = "Add custom agent",
}: SurfaceBoundAgentsListProps) {
  const openBind = useOpenSurfaceAgentBindWindow();
  const openSettings = useOpenAgentSettingsWindow();
  const { sections, loading, hasAgents, refresh } = useSurfaceBoundAgents(
    surfaceName,
    { isEditable, includeDefaults },
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Flat list: one row per agentId (first section wins). Context menus keep
  // sectioned lists; a duplicate key here was from the same binding landing
  // in both "My agents" and an org bucket before that was fixed.
  const agents = useMemo(() => {
    const seen = new Set<string>();
    const out: SurfaceBoundAgentRow[] = [];
    for (const s of sections) {
      for (const a of s.agents) {
        if (seen.has(a.agentId)) continue;
        seen.add(a.agentId);
        out.push({ ...a, sectionLabel: s.label });
      }
    }
    return out;
  }, [sections]);

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

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {heading}
      </p>

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

      {agents.map((a) => (
        <div
          key={a.agentId}
          className="flex items-center gap-2 px-2.5 py-2 bg-card border border-border rounded-md"
        >
          <button
            type="button"
            title={`Run ${a.name}`}
            aria-label={`Run ${a.name}`}
            disabled={runDisabled}
            onClick={() => void onRunAgent(a.agentId)}
            className="shrink-0 w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium leading-tight truncate">
              {a.name}
            </p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 truncate">
              {a.sectionLabel}
            </p>
          </div>
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
            className="shrink-0 w-7 h-7 rounded-md text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        className="flex w-full items-center justify-center gap-1 px-2.5 py-2 bg-muted/30 border border-dashed border-border rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
      >
        <Plus className="w-3 h-3" />
        <span>{addLabel}</span>
      </button>
    </div>
  );
}
