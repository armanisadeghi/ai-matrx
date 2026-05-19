'use client';

import React from 'react';
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectIsDebugMode,
  selectPromptDebugIndicator,
  selectResourceDebugIndicator,
  selectExecutionStateDebug,
  hidePromptDebugIndicator,
  hideResourceDebugIndicator,
  hideExecutionStateDebug,
} from '@/lib/redux/preferences/adminDebugSlice';
import { DebugIndicator } from './DebugIndicator';
import { ResourceDebugIndicator } from './ResourceDebugIndicator';
import { PromptExecutionDebugPanel } from './PromptExecutionDebugPanel';

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
          runId={resourceDebug.runId}
          onClose={() => dispatch(hideResourceDebugIndicator())}
        />
      )}

      {/* Execution State Debug Panel */}
      {executionStateDebug?.isOpen && executionStateDebug.runId && (
        <PromptExecutionDebugPanel
          runId={executionStateDebug.runId}
          onClose={() => dispatch(hideExecutionStateDebug())}
        />
      )}
    </>
  );
}

