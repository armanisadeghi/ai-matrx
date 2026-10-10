"use client";

/**
 * AGENT FORM — an agent run with no chat display (Arman, 2026-10-06): the
 * agent's inputs as a form, ONE Run, and the reply rendered as its shape.
 *
 * Built only from the platform's canonical pieces, nothing parallel:
 *   - the conversation: `useCanvasWorkspaceConversation` (the chat tile's own
 *     hook — launch with the agent, reopen a saved run IN PLACE through the
 *     canonical resume so a run mid-stream at reload reattaches, wait on the
 *     organization gate);
 *   - the inputs: `SmartAgentInput` in its FORM style (`showFreeformInput`
 *     off — variables and one Run button, the same card every agent composer
 *     uses), with the tile's chosen inputs layout (`meta.inputStyle`);
 *   - the reply: `AgentAssistantMessage` — the one assistant renderer
 *     (MarkdownStream → kind registry), live while streaming and from the
 *     saved message after a reload; a `__kind` reply renders as its shape;
 *   - the agent surface: `/chat`'s own `ChatConversationSurface` for the run.
 *
 * Each run is its own conversation (variables apply to a conversation's first
 * turn). "Run again" starts a fresh one with the same agent and carries the
 * values over, so the person edits and re-runs.
 *
 * OPEN QUESTION (Arman, 2026-10-06): which inputs layout is best here — Form,
 * Cards, Wizard, Guided… The tile's layout switch exists to compare them on
 * real agents; the default stays "form" until that is decided.
 */

import { useEffect, useEffectEvent, useRef } from "react";
import { AlertTriangle, Building2, RotateCcw } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button, EmptyState, RegionSkeleton, Select } from "@ai-matrx/design-system/controls";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ChatConversationSurface } from "@ai-matrx/chat/agents/components/chat/ChatConversationSurface";
import { SmartAgentInput } from "@ai-matrx/chat/agents/components/inputs/smart-input/SmartAgentInput";
import {
  VARIABLE_PANEL_STYLE_OPTIONS,
  isVariablesPanelStyle,
  type VariablesPanelStyle,
} from "@ai-matrx/chat/agents/components/inputs/variable-input-variations/variable-input-options";
import { AgentAssistantMessage } from "@ai-matrx/chat/agents/components/messages-display/assistant/AgentAssistantMessage";
import { useLiveRunStatus } from "@ai-matrx/chat/agents/components/live-run/useLiveRunStatus";
import { useRetainLatestRequestForViewer } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import {
  selectAgentIdFromInstance,
  selectIsCacheOnly,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { setShowFreeformInput } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { setUserVariableValues } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { selectInstanceVariableDefinitions } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectConversationMessages } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { selectIsExecuting } from "@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";
import { useCanvasWorkspaceConversation } from "@ai-matrx/chat/canvas/workspace/useCanvasWorkspaceConversation";
import type { ItemBodyProps } from "./types";
import { titleToAdopt } from "./feature-items.logic";
import {
  AGENT_FORM_ENTITY,
  agentFormAgentId,
  agentFormInputStyle,
  agentFormSource,
  agentFormSourceToSave,
  entityId,
  isEntity,
} from "./work-sources";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

import { ErrorNotice } from "@ai-matrx/design-system";
/** The inputs layout a new tile starts with (see OPEN QUESTION above). */
export const AGENT_FORM_DEFAULT_INPUT_STYLE: VariablesPanelStyle = "form";
/** A new tile's title until the agent's name is known. */
export const AGENT_FORM_PLACEHOLDER_TITLE = "Agent form";

const INPUT_STYLE_OPTIONS = VARIABLE_PANEL_STYLE_OPTIONS.filter((o) => o.value !== "hidden").map((o) => ({
  value: o.value,
  label: o.label,
}));

export function AgentFormItemBody({ tileId, source, title, onSource }: ItemBodyProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = `board-agent-form:${tileId}`;
  const savedId = entityId(source);
  const chosenAgentId = agentFormAgentId(source);
  const savedStyle = agentFormInputStyle(source);
  const inputStyle: VariablesPanelStyle =
    savedStyle && isVariablesPanelStyle(savedStyle) ? savedStyle : AGENT_FORM_DEFAULT_INPUT_STYLE;

  // Read once, at mount: reopen the latest run, or start one with the agent.
  const run = useCanvasWorkspaceConversation(surfaceKey, {
    start: savedId
      ? { kind: "open", conversationId: savedId, agentId: chosenAgentId }
      : chosenAgentId
        ? { kind: "agent", agentId: chosenAgentId }
        : { kind: "new" },
    surfaceName: null,
  });
  const conversationId = run.conversationId;
  const agentId =
    useAppSelector((s) => (conversationId ? selectAgentIdFromInstance(conversationId)(s) : null)) ?? chosenAgentId;
  const agentName = useAgentName(agentId);

  // A viewer of the run holds it (LIVE-RUN-RETENTION.md).
  useRetainLatestRequestForViewer(conversationId, "board-agent-form-tile");

  // FORM STYLE: an agent with inputs takes no typed message here. An agent
  // with none keeps its text box — it has nothing else to run on.
  const definitionCount = useAppSelector((s) =>
    conversationId ? selectInstanceVariableDefinitions(conversationId)(s).length : 0,
  );
  useEffect(() => {
    if (conversationId && definitionCount > 0) {
      dispatch(setShowFreeformInput({ conversationId, value: false }));
    }
  }, [conversationId, definitionCount, dispatch]);

  // "Run again": the values of the run being replaced, applied to the next one.
  const carryOver = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!conversationId || !carryOver.current || definitionCount === 0) return;
    dispatch(setUserVariableValues({ conversationId, values: carryOver.current }));
    carryOver.current = null;
  }, [conversationId, definitionCount, dispatch]);

  // Save the latest run (once the server has it) and the agent's name as the title.
  const serverHasIt = useAppSelector((s) => (conversationId ? !selectIsCacheOnly(conversationId)(s) : false));
  const record = useEffectEvent((id: string) => {
    const next = agentFormSourceToSave({
      conversationId: id,
      serverHasIt,
      savedId,
      agentId: selectAgentIdFromInstance(id)(store.getState()) ?? null,
      chosenAgentId,
      inputStyle: savedStyle,
    });
    if (next) onSource(next);
  });
  useEffect(() => {
    if (conversationId) record(conversationId);
  }, [conversationId, serverHasIt]);
  // The agent's name replaces the placeholder once; a name the person gave the tile stays.
  const adopt = title === AGENT_FORM_PLACEHOLDER_TITLE ? titleToAdopt(title, agentName) : null;
  useEffect(() => {
    if (adopt) onSource(source, adopt);
  }, [adopt, source, onSource]);

  const messages = useAppSelector(
    selectConversationMessages(conversationId ?? `${AGENT_FORM_ENTITY}:none`),
  );
  const answer = messages.findLast((m) => m.role === "assistant");
  const { requestId, isActive, statusText, errorMessage } = useLiveRunStatus(conversationId, null, false);
  const executing = useAppSelector((s) => (conversationId ? selectIsExecuting(conversationId)(s) : false));
  const hasRun = Boolean(answer) || executing;

  const chooseStyle = (next: VariablesPanelStyle) => {
    onSource(agentFormSource(savedId, chosenAgentId ?? agentId, next));
  };

  const runAgain = () => {
    if (!agentId || !conversationId) return;
    const state = store.getState();
    carryOver.current = { ...(state.instanceVariableValues?.byConversationId[conversationId]?.userValues ?? {}) };
    run.startWith(agentId);
  };

  if (!isEntity(source, AGENT_FORM_ENTITY)) return null;

  if (!chosenAgentId && !savedId) {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <EmptyState icon={<AGENT_ICON />} title="No agent chosen" line="Remove this tile and add it again with an agent." />
      </div>
    );
  }

  const state = run.conversation;
  if (state.state === "failed") {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <ErrorNotice
         
          title={state.purpose === "open" ? "Couldn't open this run" : "Couldn't start the agent"}
           message={state.reason}
          actions={<Button onClick={state.retry}>Try again</Button>}
        />
      </div>
    );
  }
  if (state.state === "needs-organization") {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4">
        <EmptyState
          icon={<Building2 />}
          title="Choose an organization"
          line="The run is billed to an organization."
          action={<Button onClick={state.choose}>Choose</Button>}
        />
      </div>
    );
  }
  if (!conversationId) {
    return (
      <div className="h-full bg-card p-3">
        <RegionSkeleton />
      </div>
    );
  }

  const body = (
    <div className="flex h-full min-h-0 flex-col bg-card" data-agent-form-tile="">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Select
          aria-label="Inputs layout"
          value={inputStyle}
          options={INPUT_STYLE_OPTIONS}
          onValueChange={chooseStyle}
          disabled={hasRun}
        />
        {hasRun && !executing ? (
          <div className="ml-auto">
            <Button variant="quiet" icon={<RotateCcw />} onClick={runAgain}>
              Run again
            </Button>
          </div>
        ) : null}
      </div>
      {hasRun ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {answer ? (
            <AgentAssistantMessage
              conversationId={conversationId}
              messageId={answer.id}
              requestId={answer._streamRequestId === requestId ? (requestId ?? undefined) : undefined}
              isStreamActive={isActive && answer._streamRequestId === requestId}
              surfaceKey={surfaceKey}
              compact
            />
          ) : (
            <p className="py-1 text-xs text-muted-foreground">{statusText || "Starting…"}</p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* A run that failed before any reply says so above the form (nothing fails silently). */}
          {errorMessage ? (
            <p className="pb-2 text-xs text-destructive">
              {errorMessage} <ErrorAlchemyMenu error={errorMessage} />
            </p>
          ) : null}
          <SmartAgentInput
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            compact
            variablesPanelStyle={inputStyle}
            composer={{ size: "compact", mode: "chat", meta: "none" }}
          />
        </div>
      )}
    </div>
  );

  return (
    <ChatConversationSurface conversationId={conversationId} agentId={agentId ?? ""} surfaceKey={surfaceKey}>
      {body}
    </ChatConversationSurface>
  );
}
