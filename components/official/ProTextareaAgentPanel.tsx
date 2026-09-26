"use client";

/**
 * ProTextareaAgentPanel — embedded agent runner for Help with this… / Custom Agent.
 *
 * Custom Agent starts on the full inline agent picker (Mine / Shared / System).
 * After selection, switches to the compact chat-style dropdown + AgentRunner.
 * Help with this… skips straight to the runner on its MANDATE: the job is
 * resolved for display (`useMandate`) and the run goes through the server's
 * mandate door (`/ai/mandates/{key}`), which decides the Holder. The host's
 * items ride as the job's offered values + context entries, never as user
 * text. Picking another agent in the dropdown runs THAT agent directly.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AgentListDropdown,
  AgentListInlinePicker,
} from "@ai-matrx/agents/catalog/react";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useConversationDocumentsBridge } from "@/features/agents/hooks/useWorkingDocument";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { textInputVariable } from "@/features/agents/utils/text-input-variable";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { setHostVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectLatestAnswerText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
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
import { useMandate } from "@/features/mandates/useMandate";
import { useMandateDisplayName } from "@/features/mandates/useMandateDisplayName";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import {
  proTextareaRunValues,
  type ProTextareaAgentActionId,
  agentRunResult,
} from "./proTextareaAgentActions";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ProTextareaAgentPanelProps {
  actionId: ProTextareaAgentActionId;
  /** An agent the PERSON chose. Wins over `mandateKey` when set. */
  agentId: string | null;
  /** The JOB this action runs when the person has not chosen an agent. */
  mandateKey: AnyMandateKey | null;
  /** The host's items — offered values + context by mandate, context by agent. */
  contextItems?: SessionContextItem[];
  agentLabel: string | null;
  onAgentIdChange: (agentId: string) => void;
  onAgentClear: () => void;
  sourceText: string;
  onApplySourceText: (text: string) => void;
  onBack: () => void;
  onCancel: () => void;
  /** Host product feature — never chrome. Required for conversation provenance. */
  sourceFeature: SourceFeature;
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

  const store = useAppStore();
  // THE RESULT, read the way Clean up reads it: the run's COMMITTED final
  // answer (selectLatestAnswerText). An agent that edited the working document
  // hands back the document; one that ANSWERED with the revised text hands
  // back its answer. Reading only the working document lost every
  // answer-shaped result ("identical", verify-RC-B5 r3).
  const answer = useAppSelector(selectLatestAnswerText(conversationId));
  // A run this panel saw start (any live status), not yet handed back.
  const pendingRun = useRef(false);
  useEffect(() => {
    if (status === "running" || status === "streaming") pendingRun.current = true;
    if (status !== "complete" || !pendingRun.current) return;
    // Wait for the answer (or a changed document) before handing anything back.
    if (!answer.trim() && workingContent === sourceText) return;
    pendingRun.current = false;
    onApplySourceText(agentRunResult(sourceText, workingContent, answer));
  }, [status, workingContent, onApplySourceText, sourceText, answer]);

  // THE PAYLOAD, bound the way Clean up binds it: the text rides as DATA in
  // the agent's declared text variable (the one rule, textInputVariable) —
  // shown in the variable panel as soon as the agent's variables load, and
  // bound again at Run. Without it a custom agent ran on its stock sample
  // ("Translate for customers" translated a default sentence, verify-RC-B5 r3).
  const definitions = useAppSelector(selectInstanceVariableDefinitions(conversationId));
  const bindSourceText = useCallback(() => {
    const target = textInputVariable(selectInstanceVariableDefinitions(conversationId)(store.getState()));
    if (target) {
      dispatch(setHostVariableValues({ conversationId, values: { [target.name]: sourceText } }));
    }
  }, [conversationId, dispatch, sourceText, store]);
  useEffect(() => {
    if (definitions.length > 0) bindSourceText();
  }, [definitions, bindSourceText]);

  const handleRun = useCallback(() => {
    if (isExecuting) return;
    dispatch(
      setWorkingDocContent({
        conversationId,
        kind: "working",
        content: sourceText,
      }),
    );
    bindSourceText();
    // Canonical send path (no surfaceKey ⇒ never splits ⇒ this continuous
    // conversation can never be orphaned).
    void dispatch(smartExecute({ conversationId }));
  }, [conversationId, dispatch, isExecuting, sourceText, bindSourceText]);

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
  mandateKey,
  contextItems,
  sourceFeature,
  sourceText,
  onApplySourceText,
  onControlsChange,
}: {
  actionId: ProTextareaAgentActionId;
  /** Display identity; with `mandateKey` the server still picks the Holder. */
  agentId: string;
  mandateKey: AnyMandateKey | null;
  contextItems: readonly SessionContextItem[];
  sourceFeature: SourceFeature;
  sourceText: string;
  onApplySourceText: (text: string) => void;
  onControlsChange: (controls: RunControls) => void;
}) {
  const dispatch = useAppDispatch();
  const panelInstanceId = useId();
  const surfaceKey = `pro-textarea:${actionId}:${panelInstanceId}:${mandateKey ?? "agent"}:${agentId}`;

  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey,
    sourceFeature,
    // THE MANDATE DOOR: with a key, turn 1 POSTs /ai/mandates/{key} and the
    // server resolves the Holder, its settings and the consumption map.
    ...(mandateKey ? { mandateKey } : {}),
    runtime: proTextareaRunValues(contextItems, mandateKey !== null),
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

const NO_CONTEXT_ITEMS: readonly SessionContextItem[] = [];

export function ProTextareaAgentPanel({
  actionId,
  agentId,
  mandateKey,
  contextItems,
  agentLabel,
  onAgentIdChange,
  onAgentClear,
  sourceText,
  onApplySourceText,
  onBack,
  onCancel,
  sourceFeature,
}: ProTextareaAgentPanelProps) {
  const [runControls, setRunControls] = useState<RunControls>({
    run: () => {},
    isExecuting: false,
    canRun: false,
  });

  const handleControlsChange = useCallback((controls: RunControls) => {
    setRunControls(controls);
  }, []);

  // By mandate only while the person has not chosen an agent themselves.
  const activeMandateKey = agentId === null ? mandateKey : null;
  const mandateState = useMandate(activeMandateKey ?? "");
  const mandateName = useMandateDisplayName(activeMandateKey ?? "");
  const runAgentId =
    agentId ?? (activeMandateKey ? (mandateState.mandate?.agentId ?? null) : null);
  const mandateWaiting =
    activeMandateKey !== null &&
    runAgentId === null &&
    (mandateState.loading || mandateState.organizationPending);
  const mandateRefusal =
    activeMandateKey !== null && runAgentId === null && !mandateWaiting
      ? (mandateState.error ??
        "No agent is assigned to this job right now. Choose an agent above to continue.")
      : null;

  const isCustomAgentPicker =
    actionId === "customAgent" && agentId === null && activeMandateKey === null;
  const showRunner = runAgentId !== null;
  const showPicker = showRunner || activeMandateKey !== null;

  const handleBack = () => {
    if (actionId === "customAgent" && agentId) {
      onAgentClear();
      return;
    }
    onBack();
  };

  const pickerLabel =
    agentLabel?.trim() ||
    (activeMandateKey ? mandateName : "") ||
    "Select an agent";

  return (
    <div
      className={cn(
        "flex w-[min(100vw-2rem,480px)] min-w-[360px] flex-col",
        "h-[550px] min-h-[550px]",
      )}
    >
      {showPicker && (
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
        ) : showRunner && runAgentId ? (
          <ProTextareaAgentRunner
            key={`${activeMandateKey ?? "agent"}:${runAgentId}`}
            actionId={actionId}
            agentId={runAgentId}
            mandateKey={activeMandateKey}
            contextItems={contextItems ?? NO_CONTEXT_ITEMS}
            sourceFeature={sourceFeature}
            sourceText={sourceText}
            onApplySourceText={onApplySourceText}
            onControlsChange={handleControlsChange}
          />
        ) : mandateWaiting ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Finding the agent for {mandateName}…
          </div>
        ) : mandateRefusal ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {mandateRefusal}
            <ErrorAlchemyMenu error={mandateRefusal} />
          </div>
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
