"use client";

/**
 * TaskCreatePanel
 *
 * The two-mode "create a task" body, mirroring `ProjectCreatePanel`:
 *   - **Manual** → the canonical `TaskQuickCreateCore` (title / description /
 *     scopes / project / priority / due, plus source-linking).
 *   - **Use AI** → `AgentRunWrapper` driving the task-creation agent.
 *
 * Wrap it in whatever chrome you need (window, dialog, route) — don't fork it.
 * Built on the shared `CreateWithAiTabs` primitive, so switching tabs never
 * resizes or flashes the chrome and the agent is never remounted.
 *
 * The AI tab is gated OFF until `TASK_CREATE_AGENT_ID` is set to a real agent,
 * and is also hidden when a `source` is present (source-linked capture is a
 * manual-only flow). When the AI tab is off, this renders exactly the bare
 * `TaskQuickCreateCore` — no switcher, no behavior change.
 */

import React, { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { loadProjectsWithTasks } from "@/features/tasks/redux/thunks";
import {
  CreateWithAiTabs,
  type CreateWithAiMode,
} from "@/features/agents/components/smart/CreateWithAiTabs";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import {
  TaskQuickCreateCore,
  type TaskQuickCreateCoreProps,
} from "./TaskQuickCreateCore";

/**
 * The agent that powers the "Use AI" create-task flow.
 * TODO: set this to the real task-create agent UUID. Until then the AI tab is
 * hidden (the panel renders just the manual form).
 */
export const TASK_CREATE_AGENT_ID = "";
/** Source feature reported by traces for the "Use AI" tab. */
export const TASK_CREATE_SOURCE_FEATURE: SourceFeature = "task-create";

export type TaskCreateMode = CreateWithAiMode;

export interface TaskCreatePanelProps extends TaskQuickCreateCoreProps {
  /** Show the "Use AI" mode + switcher. Default true (still gated by agent id). */
  enableAi?: boolean;
  /** Which mode is selected on mount. Default "manual". */
  defaultMode?: TaskCreateMode;
  isMobile?: boolean;
  /**
   * Fired when an AI run finishes (the agent created the task server-side).
   * The panel always refreshes the tasks hierarchy on completion; wire this
   * only if the caller also needs a local refresh.
   */
  onAiComplete?: () => void;
}

export function TaskCreatePanel({
  enableAi = true,
  defaultMode = "manual",
  isMobile = false,
  onAiComplete,
  ...coreProps
}: TaskCreatePanelProps) {
  const dispatch = useAppDispatch();

  const handleAiRunComplete = useCallback(() => {
    // The agent wrote the task directly to the DB server-side; force a
    // hierarchy refetch so the tasks list picks it up.
    dispatch(loadProjectsWithTasks({ force: true }));
    onAiComplete?.();
  }, [dispatch, onAiComplete]);

  const aiEnabled = enableAi && !!TASK_CREATE_AGENT_ID && !coreProps.source;

  return (
    <CreateWithAiTabs
      manual={<TaskQuickCreateCore {...coreProps} />}
      agentId={TASK_CREATE_AGENT_ID}
      sourceFeature={TASK_CREATE_SOURCE_FEATURE}
      onAiRunComplete={handleAiRunComplete}
      enableAi={aiEnabled}
      defaultMode={defaultMode}
      isMobile={isMobile}
      // TaskQuickCreateCore owns its own internal layout + scroll areas.
      manualScrolls={false}
    />
  );
}
