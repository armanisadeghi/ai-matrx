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
 *   0. resolveMandate(agent.mandateKey) — the mandate's current Holder id.
 *   1. fetchAgentExecutionMinimal(agentId) — populates redux with the agent's
 *      variable_definitions + context_slots.
 *   2. createManualInstance({ agentId, mandateKey, displayMode: "direct", autoRun: false,
 *      apiEndpointMode: "agent" }) — snapshots definitions onto the instance.
 *   3. setUserVariableValues — wire the transcript to its variable key, and
 *      (if the agent declares `contextVariableKey`) wire user context as a
 *      regular variable too. userValues take priority in resolution.
 *   4. setContextEntries — only when the agent uses slot-based context
 *      (contextPolicyKey) or as a fallback for free-form context. Skipped when
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
import { resolveMandate } from "@/features/mandates/service";
import { extractErrorMessage } from "@/utils/errors";
import {
  selectPrimaryRequest,
  selectAccumulatedText,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useRetainRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
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

/**
 * A failure BEFORE a request exists (mandate unresolvable, no organization
 * selected, Holder fetch refused) has no request row to carry it — it lives
 * only in `error`. It must win over "idle", or the click does nothing visible
 * (felt 2026-09-25: Clean Up with no organization selected was a silent no-op).
 */
export function deriveAiProcessPhase(
  launching: boolean,
  error: string | null,
  requestStatus: string | undefined,
): AiProcessPhase {
  if (launching) return "launching";
  if (error) return "error";
  return (requestStatus as AiProcessPhase | undefined) ?? "idle";
}

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

  // Renders live stream output straight from the request row (no
  // `MarkdownStream requestId=`), so retention is this viewer's own job —
  // an owner reap mid-stream would otherwise blank it permanently.
  // Doctrine: /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md.
  useRetainRequestForViewer(requestId, "useAiPostProcess");

  const phase = deriveAiProcessPhase(launching, error, requestStatus);

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
        // THE MANDATE DECIDES THE HOLDER. Resolve per run (never cached in a
        // constant) so a rebinding in the mandate console takes effect on the
        // next click; an unresolvable mandate throws and lands in `error`.
        const { agentId } = await resolveMandate(agent.mandateKey);
        // Load the Holder's variable_definitions + context_slots into redux.
        // createManualInstance snapshots these onto the instance and
        // executeInstance reads through that snapshot, not agentId.
        await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();

        const cid = await dispatch(
          createManualInstance({
            agentId,
            // THE MANDATE DOOR: turn 1 posts to /ai/mandates/{key}; the
            // server resolves the Holder for this principal. agentId above
            // is display identity + the variable snapshot only.
            mandateKey: agent.mandateKey,
            sourceFeature: "transcription",
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
          const key = agent.contextPolicyKey ?? FALLBACK_CONTEXT_KEY;
          dispatch(
            setContextEntries({
              conversationId: cid,
              entries: [
                {
                  key,
                  value: contextValue,
                  slotMatched: !!agent.contextPolicyKey,
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
