"use client";

/**
 * AgentRunner
 *
 * The universal inner component for agent execution instances.
 * Equivalent of PromptRunner from the old system.
 *
 * Used by ALL display mode shells (modal-full, sidebar, inline, toast, etc.).
 * Each shell provides layout/chrome; AgentRunner provides the core experience.
 *
 * Props: conversationId + optional layout hints (compact, showTitle).
 * ALL behavior config is read from Redux — nothing else is passed as props.
 *
 * Lifecycle:
 *   1. Pre-execution gate: if needsPreExecution → <AgentPreExecutionInput />
 *   2. Auto-run: if autoRun && status is "ready" → dispatch execute
 *   3. Main display: AgentConversationDisplay + SmartAgentInput
 */

import { useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAutoRun,
  selectAllowChat,
  selectNeedsPreExecutionInput,
  selectShouldShowInput,
  selectShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectHasUserInput } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { SmartAgentInput } from "../inputs/smart-input/SmartAgentInput";
import { PreExecutionAgentInput } from "../inputs/PreExecutionAgentInput";
import { AgentConversationDisplay } from "../messages-display/AgentConversationDisplay";
import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

interface AgentRunnerProps {
  conversationId: string;
  compact?: boolean;
  showTitle?: boolean;
  className?: string;
  /** Optional focus surface for auto-clear + new conversation submit (SmartAgentInput). */
  surfaceKey?: string;
  /** Hide the SmartAgentInput send control (external Run button drives execution). */
  showSendButton?: boolean;
}

export function AgentRunner({
  conversationId,
  compact = false,
  showTitle = false,
  className = "",
  surfaceKey,
  showSendButton = true,
}: AgentRunnerProps) {
  const dispatch = useAppDispatch();
  const autoRunFiredRef = useRef(false);

  const autoRun = useAppSelector(selectAutoRun(conversationId));
  const allowChat = useAppSelector(selectAllowChat(conversationId));
  const needsPreExecution = useAppSelector(
    selectNeedsPreExecutionInput(conversationId),
  );
  const shouldShowInput = useAppSelector(selectShouldShowInput(conversationId));
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));
  const status = useAppSelector(selectInstanceStatus(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const hasUserInput = useAppSelector(selectHasUserInput(conversationId));
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );

  // [Track AgentRunner Commit] TEMP — non-invasive render audit. Logs in a
  // useEffect (NOT render body) so it does not defeat React Compiler memoization.
  // Reports WHICH subscribed value changed since the last commit — or
  // "PARENT-DRIVEN (no subscribed value changed)" when nothing changed, which
  // means a parent re-render (not this component's own subscription) drove it.
  const __commitCount = useRef(0);
  const __prev = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    __commitCount.current++;
    const cur: Record<string, unknown> = {
      conversationId,
      autoRun,
      allowChat,
      needsPreExecution,
      shouldShowInput,
      title,
      status,
      isExecuting,
      hasUserInput,
      showVariablePanel,
    };
    const changed = Object.keys(cur).filter(
      (k) => cur[k] !== __prev.current[k],
    );
    __prev.current = cur;
    const what =
      __commitCount.current === 1
        ? "MOUNT"
        : changed.length === 0
          ? "PARENT-DRIVEN (no subscribed value changed)"
          : `changed: ${changed.join(", ")}`;
    console.log(`[Track AgentRunner Commit] #${__commitCount.current} ${what}`);
  });

  // ── Auto-run: fire execution once when conditions are met ──────────────────
  useEffect(() => {
    if (autoRunFiredRef.current) return;
    if (!autoRun) return;
    if (status !== "ready") return;
    if (isExecuting) return;
    if (needsPreExecution) return;

    autoRunFiredRef.current = true;
    dispatch(executeInstance({ conversationId }));
  }, [
    autoRun,
    status,
    isExecuting,
    needsPreExecution,
    conversationId,
    dispatch,
  ]);

  // ── Pre-execution gate ─────────────────────────────────────────────────────
  if (needsPreExecution) {
    return <PreExecutionAgentInput conversationId={conversationId} />;
  }

  // ── Main display ───────────────────────────────────────────────────────────
  // Layout: relative container → conversation fills + scrolls freely behind the
  // input → input panel is absolutely pinned to the bottom, overlaying the
  // conversation. The conversation gets bottom padding equal to a reasonable
  // input height so the last message is never hidden behind the input bar.
  // The input panel itself uses max-h so variables can never overflow the
  // container — they scroll internally instead.
  return (
    <div
      className={`relative h-full max-w-[800px] overflow-hidden bg-background ${className}`}
    >
      {showTitle && title && (
        <div className="absolute top-0 left-0 right-0 z-10 px-4 py-2 border-b border-border bg-background">
          <p className="text-sm font-medium text-foreground truncate">
            {title}
          </p>
        </div>
      )}

      {/* Conversation — fills entire container, scrolls freely under the input */}
      <div
        className={`absolute inset-0 overflow-y-auto bg-background pt-2 ${showTitle && title ? "top-9" : ""} ${shouldShowInput ? "pb-32" : "pb-2"}`}
      >
        <AgentConversationDisplay
          conversationId={conversationId}
          compact={compact}
        />
      </div>

      {/* Input panel — pinned to bottom, grows upward, never taller than 70% of container */}
      {shouldShowInput && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-stretch justify-end px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background/95 to-transparent max-h-[70%] overflow-hidden">
          <ProposedDirectivesZone conversationId={conversationId} />
          <SmartAgentInput
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            compact={compact}
            showSendButton={showSendButton}
          />
        </div>
      )}
    </div>
  );
}
