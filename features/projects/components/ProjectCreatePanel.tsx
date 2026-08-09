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

import React, { useCallback, useEffect } from "react";
import {
  logProjectCreateAiStage,
  PROJECT_CREATE_AGENT_ID,
  PROJECT_CREATE_SLOT_KEY,
  PROJECT_CREATE_SOURCE_FEATURE,
} from "@/features/projects/debug/projectCreateAiDebug";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { FileJson } from "lucide-react";
import { useDispatchThunk } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import {
  CreateWithAiTabs,
  type CreateWithAiMode,
} from "@/features/agents/components/smart/CreateWithAiTabs";
import { ProjectFormCore, type ProjectFormCoreProps } from "./ProjectFormCore";
import { ProjectImportJsonPanel } from "./ProjectImportJsonPanel";

export { PROJECT_CREATE_AGENT_ID, PROJECT_CREATE_SOURCE_FEATURE };

export type ProjectCreateMode = CreateWithAiMode;

export interface ProjectCreatePanelProps extends ProjectFormCoreProps {
  /** Show the "Use AI" mode + switcher. Default true. */
  enableAi?: boolean;
  /** Show the "Paste JSON" import tab. Default true. */
  enableJsonImport?: boolean;
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
  enableJsonImport = true,
  defaultMode = "manual",
  isMobile = false,
  onAiComplete,
  ...coreProps
}: ProjectCreatePanelProps) {
  const dispatchThunk = useDispatchThunk();

  // The AI tab's agent is the `projects.create_assistant` slot — the user's
  // own binding wins. While resolving (first mount only; 5-min cache) or on a
  // resolution failure the AI mode stays off and the manual form carries the
  // panel; failures are already screamed by useAgentSlot, never silently
  // patched with a hardcoded id.
  const { slot: createSlot, error: createSlotError } = useAgentSlot(
    PROJECT_CREATE_SLOT_KEY,
  );
  const aiAgentId = createSlot?.agentId ?? null;

  useEffect(() => {
    logProjectCreateAiStage("panel mounted", {
      slotKey: PROJECT_CREATE_SLOT_KEY,
      resolvedAgentId: aiAgentId,
      slotError: createSlotError,
      sourceFeature: PROJECT_CREATE_SOURCE_FEATURE,
      enableAi,
      defaultMode,
    });
  }, [aiAgentId, createSlotError, defaultMode, enableAi]);

  const handleAiRunComplete = useCallback(() => {
    // Refresh the global hierarchy so every nav-tree-derived project consumer
    // (sidebars, pickers, ProjectList, research) picks up the agent-created
    // project at once. Self-fetching surfaces wire `onAiComplete` for a local
    // refresh on top of this.
    void dispatchThunk(invalidateAndRefetchFullContext());
    onAiComplete?.();
  }, [dispatchThunk, onAiComplete]);

  const handleJsonCreated = useCallback(
    (info: { projectId: string; slug?: string }) => {
      void dispatchThunk(invalidateAndRefetchFullContext());
      onAiComplete?.();
      void info;
    },
    [dispatchThunk, onAiComplete],
  );

  return (
    <CreateWithAiTabs
      manual={<ProjectFormCore isMobile={isMobile} {...coreProps} />}
      agentId={aiAgentId ?? ""}
      sourceFeature={PROJECT_CREATE_SOURCE_FEATURE}
      onAiRunComplete={handleAiRunComplete}
      enableAi={enableAi && aiAgentId !== null}
      defaultMode={defaultMode}
      isMobile={isMobile}
      manualScrolls={false}
      headerClassName="px-4 pt-4 pb-3"
      bodyClassName="min-h-[560px]"
      manualPaneClassName="p-4 pt-1"
      aiPaneClassName="bg-background"
      extraTabs={
        enableJsonImport
          ? [
              {
                id: "json",
                label: "Paste JSON",
                icon: FileJson,
                className: "p-4 pt-1",
                scrolls: false,
                content: (
                  <ProjectImportJsonPanel
                    initialOrgId={coreProps.initialOrgId ?? null}
                    initialOrgSlug={coreProps.initialOrgSlug ?? null}
                    orgLocked={coreProps.orgLocked ?? false}
                    isMobile={isMobile}
                    onCreated={handleJsonCreated}
                    onClose={coreProps.onClose}
                  />
                ),
              },
            ]
          : []
      }
    />
  );
}
