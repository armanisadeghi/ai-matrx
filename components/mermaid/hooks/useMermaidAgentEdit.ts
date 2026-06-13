"use client";

/**
 * useMermaidAgentEdit — runs ANY agent over the workbench's current diagram and
 * exposes its streaming output as a proposed new diagram.
 *
 * Cloned from features/transcription-cleanup/hooks/useAiPostProcess.ts (the
 * proven "any agent over surface content" pattern). Differences for mermaid:
 *   - TWO payloads: the diagram SOURCE lands on a variable / context entry
 *     (via surface binding or the diagram-source name heuristic), and the
 *     user's INSTRUCTION is the user message (always).
 *   - The streamed output is parsed for a ```mermaid fence; `proposedSource`
 *     updates live and the workbench previews + applies it as a new version.
 */

import { useCallback, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentExecutionPayload } from "@/features/agents/redux/agent-definition/selectors";
import {
  selectPrimaryRequest,
  selectAccumulatedText,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { fetchSurfaceBindingLayers } from "@/features/surfaces/services/agent-surface-bindings.service";
import { mergeValueMappingLayers } from "@/features/surfaces/utils/merge-value-mappings";
import { resolveValueMappings } from "@/features/surfaces/utils/value-mapping-resolver";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { extractErrorMessage } from "@/utils/errors";

import { extractMermaidFromOutput } from "../extract-fence";

export const MERMAID_SURFACE_NAME = "matrx-user/mermaid-editor";

/** Variable names (lowercased) that receive the diagram SOURCE, in priority order. */
const SOURCE_VARIABLE_NAMES = [
  "diagram_source",
  "mermaid_source",
  "mermaid",
  "diagram",
  "source",
  "current_diagram",
  "content",
  "code",
];

export type MermaidAgentPhase =
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

interface RunArgs {
  agentId: string;
  /** The user's natural-language instruction (becomes the user message). */
  instruction: string;
  /** The current diagram DSL. */
  source: string;
  /** Live workbench surface scope (from createMermaidEditorScope). */
  scope: ApplicationScope;
}

export function useMermaidAgentEdit() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
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

  const phase: MermaidAgentPhase = launching
    ? "launching"
    : ((requestStatus as MermaidAgentPhase | undefined) ?? "idle");

  const isBusy =
    phase === "launching" ||
    phase === "pending" ||
    phase === "connecting" ||
    phase === "streaming" ||
    phase === "awaiting-tools";

  // Visible (thinking-stripped) output and the diagram extracted from it.
  const visibleOutput = useMemo(
    () => stripThinkingStreaming(accumulatedText).visible,
    [accumulatedText],
  );
  const proposedSource = useMemo(
    () => extractMermaidFromOutput(visibleOutput),
    [visibleOutput],
  );

  const run = useCallback(
    async ({ agentId, instruction, source, scope }: RunArgs): Promise<string | null> => {
      setError(null);
      setLaunching(true);
      try {
        // 1. Snapshot the agent's variable/context definitions.
        await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        const payload = selectAgentExecutionPayload(store.getState(), agentId);
        const defs = payload.variableDefinitions ?? [];
        const slots = payload.contextSlots ?? [];
        const slotKeys = new Set(slots.map((s) => s.key));

        // 2. Surface bindings (layered merge: global → org → user).
        let bindingMappings = null;
        try {
          const layers = await fetchSurfaceBindingLayers(agentId, MERMAID_SURFACE_NAME);
          if (layers.length > 0) {
            const merged = mergeValueMappingLayers(layers);
            bindingMappings =
              Object.keys(merged.merged).length > 0 ? merged.merged : null;
          }
        } catch (err) {
          console.warn(`[mermaid] surface-binding lookup failed for agent ${agentId}:`, err);
        }
        const resolved = resolveValueMappings(scope, bindingMappings, defs, slots);
        if (resolved.errors.length > 0) throw new Error(resolved.errors.join("\n"));

        const variableValues: Record<string, unknown> = { ...resolved.variableValues };

        // 3. Make sure the diagram source reaches the agent. If a binding
        //    already placed it on a variable, leave it; else use the
        //    source-name heuristic; else fall back to a context entry so the
        //    agent always SEES the diagram (the instruction is the message).
        const entries: InstanceContextEntry[] = [...resolved.contextEntries];
        const sourceOnVariable = Object.values(variableValues).includes(source);
        if (!sourceOnVariable) {
          const byName = SOURCE_VARIABLE_NAMES.map((n) =>
            defs.find((d) => d.name.toLowerCase() === n),
          ).find(Boolean);
          if (byName) {
            variableValues[byName.name] = source;
          } else if (!entries.some((e) => e.key === "diagram_source")) {
            const slot = slots.find((s) => s.key === "diagram_source");
            entries.push({
              key: "diagram_source",
              value: source,
              slotMatched: slotKeys.has("diagram_source"),
              type: "text",
              label: slot?.label ?? "Current diagram",
            });
          }
        }

        // 4. Create the instance and wire it up. The INSTRUCTION is always the
        //    user message — the agent reads the diagram from variable/context.
        const cid = await dispatch(
          createManualInstance({
            agentId,
            sourceFeature: "mermaid-workbench",
            apiEndpointMode: "agent",
            displayMode: "direct",
            autoRun: false,
          }),
        ).unwrap();

        if (Object.keys(variableValues).length > 0) {
          dispatch(setUserVariableValues({ conversationId: cid, values: variableValues }));
        }
        if (entries.length > 0) {
          dispatch(setContextEntries({ conversationId: cid, entries }));
        }
        dispatch(setUserInputText({ conversationId: cid, text: instruction }));

        setConversationId(cid);
        dispatch(executeInstance({ conversationId: cid }));
        return cid;
      } catch (err) {
        setError(extractErrorMessage(err));
        return null;
      } finally {
        setLaunching(false);
      }
    },
    [dispatch, store],
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
    visibleOutput,
    proposedSource,
    error,
    run,
    reset,
  };
}
