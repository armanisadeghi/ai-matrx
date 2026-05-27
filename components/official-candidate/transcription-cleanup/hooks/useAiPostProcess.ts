"use client";

/**
 * useAiPostProcess — launches an AI post-processing agent for the
 * TranscriptionCleanup pad and exposes its streaming state.
 *
 * CRITICAL — variable resolution:
 *   `createManualInstance` snapshots the agent's `variableDefinitions` from
 *   `state.agentDefinition.agents[agentId]` into the instance. If that agent
 *   hasn't been loaded yet (e.g. the user opened TranscriptionCleanup without first
 *   visiting the agent page), the snapshot is EMPTY — and
 *   `selectResolvedVariables` only emits keys that exist in `definitions`.
 *   That means `setUserVariableValues({transcribed_text: "..."})` silently
 *   no-ops at execute time.
 *
 *   Fix: we await `fetchAgentExecutionMinimal(agentId)` before creating the
 *   instance so the definition snapshot has the right variable names.
 *
 * Flow:
 *   1. fetchAgentExecutionMinimal(agentId) — populates redux with the agent's
 *      variable_definitions + context_slots.
 *   2. createManualInstance({ agentId, displayMode: "direct", autoRun: false,
 *      apiEndpointMode: "agent" }) — snapshots definitions onto the instance.
 *   3. setUserVariableValues — wire the transcript to its variable key, and
 *      (if the agent declares `contextVariableKey`) wire user context as a
 *      regular variable too. userValues take priority in resolution.
 *   4. setContextEntries — only when the agent uses slot-based context
 *      (contextSlotKey) or as a fallback for free-form context. Skipped when
 *      the agent uses contextVariableKey instead.
 *   5. executeInstance — fire-and-forget. Redux is the source of truth for
 *      streaming progress; selectors below feed the UI live.
 *
 * No user input is set — these agents don't consume one.
 */

import { useCallback, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { extractErrorMessage } from "@/utils/errors";
import {
  selectPrimaryRequest,
  selectAccumulatedText,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { AiPostProcessAgent } from "../ai-agents";

export type AiProcessPhase =
  | "idle"
  | "launching"
  | "pending"
  | "connecting"
  | "streaming"
  | "awaiting-tools"
  | "complete"
  | "error"
  | "cancelled"
  | "timeout";

interface ProcessArgs {
  agent: AiPostProcessAgent;
  transcript: string;
  context: string;
}

const FALLBACK_CONTEXT_KEY = "user_context";

export function useAiPostProcess() {
  const dispatch = useAppDispatch();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useAppSelector((s) =>
    conversationId ? selectPrimaryRequest(conversationId)(s) : undefined,
  );
  const requestId = request?.requestId ?? null;
  const requestStatus = useAppSelector((s) =>
    requestId ? selectRequestStatus(requestId)(s) : undefined,
  );
  const accumulatedText = useAppSelector((s) =>
    requestId ? selectAccumulatedText(requestId)(s) : "",
  );

  const phase: AiProcessPhase = launching
    ? "launching"
    : ((requestStatus as AiProcessPhase | undefined) ?? "idle");

  const isBusy =
    phase === "launching" ||
    phase === "pending" ||
    phase === "connecting" ||
    phase === "streaming" ||
    phase === "awaiting-tools";

  const process = useCallback(
    async ({ agent, transcript, context }: ProcessArgs) => {
      setError(null);
      setLaunching(true);
      try {
        // Load the agent's variable_definitions + context_slots into redux.
        // createManualInstance snapshots these onto the instance and
        // executeInstance reads through that snapshot, not agentId.
        await dispatch(fetchAgentExecutionMinimal(agent.id)).unwrap();

        const cid = await dispatch(
          createManualInstance({
            agentId: agent.id,
            sourceFeature: "transcription-cleanup",
            apiEndpointMode: "agent",
            displayMode: "direct",
            autoRun: false,
          }),
        ).unwrap();

        const contextValue = context.trim();
        const hasContext = contextValue.length > 0;

        const variableValues: Record<string, string> = {
          [agent.transcriptVariableKey]: transcript,
        };
        if (hasContext && agent.contextVariableKey) {
          variableValues[agent.contextVariableKey] = contextValue;
        }
        dispatch(
          setUserVariableValues({
            conversationId: cid,
            values: variableValues,
          }),
        );

        if (hasContext && !agent.contextVariableKey) {
          const key = agent.contextSlotKey ?? FALLBACK_CONTEXT_KEY;
          dispatch(
            setContextEntries({
              conversationId: cid,
              entries: [
                {
                  key,
                  value: contextValue,
                  slotMatched: !!agent.contextSlotKey,
                },
              ],
            }),
          );
        }

        setConversationId(cid);
        // Fire-and-forget — the UI reads streaming state from redux selectors.
        dispatch(executeInstance({ conversationId: cid }));
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLaunching(false);
      }
    },
    [dispatch],
  );

  const reset = useCallback(() => {
    setConversationId(null);
    setError(null);
    setLaunching(false);
  }, []);

  return {
    conversationId,
    requestId,
    phase,
    isBusy,
    accumulatedText,
    error,
    process,
    reset,
  };
}
