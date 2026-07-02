"use client";

/**
 * ProTextareaAgentPanel — embedded agent runner for Help with this… / Custom Agent.
 *
 * Custom Agent starts on the full inline agent picker (Mine / Shared / System).
 * After selection, switches to the compact chat-style dropdown + AgentRunner.
 * Help with this… skips straight to the runner (General Chat default).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useConversationDocumentsBridge } from "@/features/agents/hooks/useWorkingDocument";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectWorkingDocContent } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  setWorkingDocContent,
  setWorkingDocEnabled,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  setShowFreeformInput,
  setShowAttachments,
  setShowMicrophone,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProTextareaAgentActionId } from "./proTextareaAgentActions";

interface ProTextareaAgentPanelProps {
  actionId: ProTextareaAgentActionId;
  agentId: string | null;
  agentLabel: string | null;
  onAgentIdChange: (agentId: string) => void;
  onAgentClear: () => void;
  sourceText: string;
  onApplySourceText: (text: string) => void;
  onBack: () => void;
  onCancel: () => void;
}

interface RunControls {
  run: () => void;
  isExecuting: boolean;
  canRun: boolean;
}

const CUSTOM_AGENT_PICKER_CONSUMER_ID = "pro-textarea-custom-agent-picker";

function ProTextareaAgentRunnerSession({
  conversationId,
  surfaceKey,
  sourceText,
  onApplySourceText,
  onControlsChange,
}: {
  conversationId: string;
  surfaceKey: string;
  sourceText: string;
  onApplySourceText: (text: string) => void;
  onControlsChange: (controls: RunControls) => void;
}) {
  const prevStatusRef = useRef<string | undefined>(undefined);
  const dispatch = useAppDispatch();

  useConversationDocumentsBridge(conversationId);

  useEffect(() => {
    dispatch(
      setWorkingDocEnabled({
        conversationId,
        kind: "working",
        enabled: true,
      }),
    );
    dispatch(
      setWorkingDocContent({
        conversationId,
        kind: "working",
        content: sourceText,
      }),
    );
  }, [conversationId, sourceText, dispatch]);

  const status = useAppSelector(selectInstanceStatus(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const workingContent = useAppSelector(
    selectWorkingDocContent(conversationId, "working"),
  );

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "complete" && (prev === "running" || prev === "streaming")) {
      onApplySourceText(workingContent);
    }
  }, [status, workingContent, onApplySourceText]);

  const handleRun = useCallback(() => {
    if (isExecuting) return;
    dispatch(
      setWorkingDocContent({
        conversationId,
        kind: "working",
        content: sourceText,
      }),
    );
    // Canonical send path (no surfaceKey ⇒ never splits ⇒ this continuous
    // conversation can never be orphaned).
    void dispatch(smartExecute({ conversationId }));
  }, [conversationId, dispatch, isExecuting, sourceText]);

  useEffect(() => {
    onControlsChange({
      run: handleRun,
      isExecuting,
      canRun: true,
    });
  }, [handleRun, isExecuting, onControlsChange]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AgentRunner
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        compact
        showSendButton={false}
        className="h-full max-w-none w-full bg-transparent"
      />
    </div>
  );
}

function ProTextareaAgentRunner({
  actionId,
  agentId,
  sourceText,
  onApplySourceText,
  onControlsChange,
}: {
  actionId: ProTextareaAgentActionId;
  agentId: string;
  sourceText: string;
  onApplySourceText: (text: string) => void;
  onControlsChange: (controls: RunControls) => void;
}) {
  const dispatch = useAppDispatch();
  const panelInstanceId = useId();
  const surfaceKey = `pro-textarea:${actionId}:${panelInstanceId}:${agentId}`;

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature: "programmatic",
    apiEndpointMode: "agent",
    autoClearConversation: false,
    config: {
      displayMode: "direct",
      autoRun: false,
      allowChat: true,
      showVariablePanel: true,
      showDefinitionMessages: true,
      showDefinitionMessageContent: false,
      showPreExecutionGate: false,
    },
  });

  // Input-chrome flags live in instance-ui-state (not AgentExecutionConfig);
  // apply them via Redux once the conversation exists.
  useEffect(() => {
    if (!conversationId) return;
    dispatch(setShowFreeformInput({ conversationId, value: true }));
    dispatch(setShowAttachments({ conversationId, value: false }));
    dispatch(setShowMicrophone({ conversationId, value: false }));
  }, [conversationId, dispatch]);

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Starting agent…
      </div>
    );
  }

  return (
    <ProTextareaAgentRunnerSession
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      sourceText={sourceText}
      onApplySourceText={onApplySourceText}
      onControlsChange={onControlsChange}
    />
  );
}

export function ProTextareaAgentPanel({
  actionId,
  agentId,
  agentLabel,
  onAgentIdChange,
  onAgentClear,
  sourceText,
  onApplySourceText,
  onBack,
  onCancel,
}: ProTextareaAgentPanelProps) {
  const [runControls, setRunControls] = useState<RunControls>({
    run: () => {},
    isExecuting: false,
    canRun: false,
  });

  const handleControlsChange = useCallback((controls: RunControls) => {
    setRunControls(controls);
  }, []);

  const isCustomAgentPicker = actionId === "customAgent" && agentId === null;
  const showRunner = agentId !== null;

  const handleBack = () => {
    if (actionId === "customAgent" && agentId) {
      onAgentClear();
      return;
    }
    onBack();
  };

  const pickerLabel = agentLabel?.trim() || "Select an agent";

  return (
    <div
      className={cn(
        "flex w-[min(100vw-2rem,480px)] min-w-[360px] flex-col",
        "h-[550px] min-h-[550px]",
      )}
    >
      {showRunner && (
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <AgentListDropdown
            onSelect={onAgentIdChange}
            label={pickerLabel}
            compact
            noBorder
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {isCustomAgentPicker ? (
          <AgentListInlinePicker
            consumerId={CUSTOM_AGENT_PICKER_CONSUMER_ID}
            onSelect={onAgentIdChange}
            className="h-full"
          />
        ) : showRunner ? (
          <ProTextareaAgentRunner
            key={agentId}
            actionId={actionId}
            agentId={agentId}
            sourceText={sourceText}
            onApplySourceText={onApplySourceText}
            onControlsChange={handleControlsChange}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          {showRunner && (
            <Button
              type="button"
              size="sm"
              disabled={!runControls.canRun || runControls.isExecuting}
              onClick={runControls.run}
            >
              {runControls.isExecuting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Running…
                </>
              ) : (
                "Run"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
