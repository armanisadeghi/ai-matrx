"use client";

/**
 * ProjectCreatePanel
 *
 * The chrome-less "create a project" experience, split into two modes:
 *   - **Manual** → the canonical `ProjectFormCore` (name / slug / description /
 *     owner). The single source of truth for the hand-authored form.
 *   - **Use AI** → `AgentRunWrapper` driving the project-creation agent, so the
 *     user can describe what they want and let the agent set it up.
 *
 * This is the body that every surface wraps in its own chrome — do NOT fork it:
 *   - `ProjectFormSheet`     → Dialog (desktop) / Drawer (mobile)
 *   - `CreateProjectWindow`  → draggable WindowPanel (overlay system)
 *   - `/projects/new`        → full-page route
 *
 * Pass `enableAi={false}` to render just the manual form (no mode switcher).
 *
 * Mobile note: the mode switcher is a two-option segmented toggle, not a tab
 * strip — Manual and Use AI are mutually-exclusive entry methods, never two
 * sections of the same content, so it doesn't trip the "no tabs on mobile" rule.
 */

import React, { useCallback, useState } from "react";
import { PencilLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { AgentRunWrapper } from "@/features/agents/components/smart/AgentRunWrapper";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { ProjectFormCore, type ProjectFormCoreProps } from "./ProjectFormCore";

/** The agent that powers the "Use AI" create-project flow. */
export const PROJECT_CREATE_AGENT_ID = "917074a0-fc06-4ff4-9805-4a517e04d08b";
/** Source feature reported by traces for the "Use AI" tab. */
export const PROJECT_CREATE_SOURCE_FEATURE: SourceFeature = "project-create";

export type ProjectCreateMode = "manual" | "ai";

export interface ProjectCreatePanelProps extends ProjectFormCoreProps {
  /** Show the "Use AI" mode + switcher. Default true. */
  enableAi?: boolean;
  /** Which mode is selected on mount. Default "manual". */
  defaultMode?: ProjectCreateMode;
  /**
   * Fired when an AI run finishes (the agent created the project server-side).
   * The panel ALWAYS dispatches the global hierarchy refetch on completion, so
   * every nav-tree-derived project consumer refreshes automatically — this is
   * only for surfaces that self-fetch their own list (e.g. the projects hub)
   * and need a local refresh too. No `Project` object is available here.
   */
  onAiComplete?: () => void;
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  isMobile,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof PencilLine;
  label: string;
  isMobile: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        isMobile && "min-h-[40px]",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export function ProjectCreatePanel({
  enableAi = true,
  defaultMode = "manual",
  isMobile = false,
  onAiComplete,
  ...coreProps
}: ProjectCreatePanelProps) {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<ProjectCreateMode>(defaultMode);

  const handleAiRunComplete = useCallback(() => {
    // Refresh the global hierarchy so every nav-tree-derived project consumer
    // (sidebars, pickers, ProjectList, research) picks up the agent-created
    // project at once. Self-fetching surfaces wire `onAiComplete` for a local
    // refresh on top of this.
    dispatch(
      invalidateAndRefetchFullContext() as unknown as Parameters<
        typeof dispatch
      >[0],
    );
    onAiComplete?.();
  }, [dispatch, onAiComplete]);

  if (!enableAi) {
    return <ProjectFormCore isMobile={isMobile} {...coreProps} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 px-1 pb-3">
        <div className="inline-flex w-full items-center gap-1 rounded-lg bg-muted p-1">
          <ModeButton
            active={mode === "manual"}
            onClick={() => setMode("manual")}
            icon={PencilLine}
            label="Manual"
            isMobile={isMobile}
          />
          <ModeButton
            active={mode === "ai"}
            onClick={() => setMode("ai")}
            icon={Sparkles}
            label="Use AI"
            isMobile={isMobile}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {mode === "manual" ? (
          // Desktop scrolls at this wrapper; the mobile ProjectFormCore owns
          // its own scroll, so don't nest a second scroll area there.
          <div className={cn("h-full min-h-0", !isMobile && "overflow-y-auto")}>
            <ProjectFormCore isMobile={isMobile} {...coreProps} />
          </div>
        ) : (
          // AgentRunner pins its input to the bottom of a full-height,
          // relative container — give it a guaranteed minimum so it still
          // works inside auto-height chrome (e.g. the Dialog).
          <div className="h-full min-h-[460px]">
            <AgentRunWrapper
              agentId={PROJECT_CREATE_AGENT_ID}
              sourceFeature={PROJECT_CREATE_SOURCE_FEATURE}
              onRunComplete={handleAiRunComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
