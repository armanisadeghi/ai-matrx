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

import React, { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import {
  CreateWithAiTabs,
  type CreateWithAiMode,
} from "@/features/agents/components/smart/CreateWithAiTabs";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { ProjectFormCore, type ProjectFormCoreProps } from "./ProjectFormCore";

/** The agent that powers the "Use AI" create-project flow. */
export const PROJECT_CREATE_AGENT_ID = "917074a0-fc06-4ff4-9805-4a517e04d08b";
/** Source feature reported by traces for the "Use AI" tab. */
export const PROJECT_CREATE_SOURCE_FEATURE: SourceFeature = "project-create";

export type ProjectCreateMode = CreateWithAiMode;

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

export function ProjectCreatePanel({
  enableAi = true,
  defaultMode = "manual",
  isMobile = false,
  onAiComplete,
  ...coreProps
}: ProjectCreatePanelProps) {
  console.log(
    "[Track New Project] 15, ProjectCreatePanel.tsx — component render",
  );
  const dispatch = useAppDispatch();

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

  return (
    <CreateWithAiTabs
      manual={<ProjectFormCore isMobile={isMobile} {...coreProps} />}
      agentId={PROJECT_CREATE_AGENT_ID}
      sourceFeature={PROJECT_CREATE_SOURCE_FEATURE}
      onAiRunComplete={handleAiRunComplete}
      enableAi={enableAi}
      defaultMode={defaultMode}
      isMobile={isMobile}
    />
  );
}
