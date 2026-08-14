"use client";

import React from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsDebugMode,
  selectPromptDebugIndicator,
  selectResourceDebugIndicator,
  selectExecutionStateDebug,
  hidePromptDebugIndicator,
  hideResourceDebugIndicator,
  hideExecutionStateDebug,
} from "@/lib/redux/preferences/adminDebugSlice";
import { DebugIndicator } from "./DebugIndicator";
import { ResourceDebugIndicator } from "./ResourceDebugIndicator";
import { AgentExecutionDebugPanel } from "./AgentExecutionDebugPanel";

/**
 * Centralized manager for all debug indicators
 * Place this at the app layout level so indicators float above everything
 */
export function DebugIndicatorManager() {
  const dispatch = useAppDispatch();
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const promptDebug = useAppSelector(selectPromptDebugIndicator);
  const resourceDebug = useAppSelector(selectResourceDebugIndicator);
  const executionStateDebug = useAppSelector(selectExecutionStateDebug);

  // Only render if debug mode is enabled
  if (!isDebugMode) return null;

  return (
    <>
      {/* Prompt Debug Indicator */}
      {promptDebug?.isOpen && promptDebug.data && (
        <DebugIndicator
          debugData={promptDebug.data}
          onClose={() => dispatch(hidePromptDebugIndicator())}
        />
      )}

      {/* Resource Debug Indicator */}
      {resourceDebug?.isOpen && resourceDebug.runId && (
        <ResourceDebugIndicator
          conversationId={resourceDebug.runId}
          onClose={() => dispatch(hideResourceDebugIndicator())}
        />
      )}

      {/* Execution State Debug Panel.
          `AgentExecutionDebugPanel` is the built-but-never-mounted successor to
          `PromptExecutionDebugPanel`: same execution-system selectors, same
          close contract, and a strict superset of sections (streaming,
          model-settings, assembled-request, ui-state). `instanceId` is the same
          value the slice still stores as `runId`. */}
      {executionStateDebug?.isOpen && executionStateDebug.runId && (
        <AgentExecutionDebugPanel
          instanceId={executionStateDebug.runId}
          onClose={() => dispatch(hideExecutionStateDebug())}
        />
      )}
    </>
  );
}
