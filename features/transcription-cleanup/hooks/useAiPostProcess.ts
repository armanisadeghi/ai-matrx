"use client";

/**
 * useAiPostProcess — runs ANY agent over the cleanup page's content and
 * exposes its streaming state. One hook instance per output container
 * (Clean and Custom each own one).
 *
 * "Any agent" resolution — how the input text + context reach an arbitrary
 * agent, in priority order:
 *
 *   1. SURFACE BINDING — if an `agx_agent_surface` row exists for
 *      (agent, "matrx-user/transcripts-cleanup"), its value_mappings are
 *      resolved against the page's surface scope via `resolveValueMappings`
 *      (auto-name-match included: scope keys like `content` /
 *      `raw_transcript_text` bind to same-named agent variables/slots).
 *   2. NAME HEURISTIC — the input text lands on the first agent variable
 *      whose name looks transcript-shaped (transcribed_text, transcript,
 *      content, text, input, …).
 *   3. SINGLE VARIABLE — an agent with exactly one declared variable gets
 *      the text there.
 *   4. USER INPUT — otherwise the text is sent as the user message
 *      (`user_input`), which every agent accepts.
 *
 * Context items are passed as PROPER context entries (the fix for the old
 * "questionable" handling):
 *   - an item whose key matches an agent-declared context slot fills that
 *     slot directly (slotMatched: true);
 *   - if NO item matched any slot and the agent declares slots, the items are
 *     combined into the agent's first declared slot (legacy system-cleaner
 *     behavior preserved);
 *   - otherwise items ride as ad-hoc context entries under their own keys.
 *
 * CRITICAL — variable resolution: `createManualInstance` snapshots the
 * agent's `variableDefinitions` from redux into the instance. We await
 * `fetchAgentExecutionMinimal(agentId)` first so the snapshot has the real
 * variable names; without it `setUserVariableValues` silently no-ops.
 */

import { useCallback, useState } from "react";
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
import type { ValueMappingMap } from "@/features/surfaces/types";
import { resolveValueMappings } from "@/features/surfaces/utils/value-mapping-resolver";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import { extractErrorMessage } from "@/utils/errors";

export const CLEANUP_SURFACE_NAME = "matrx-user/transcripts-cleanup";

/** Variable names (lowercased) that receive the input text, in priority order. */
const TEXT_VARIABLE_NAMES = [
  "transcribed_text",
  "transcript",
  "raw_transcript",
  "raw_transcript_text",
  "transcription",
  "content",
  "text",
  "input",
  "input_text",
  "source_text",
  "raw_text",
];

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

/** How the input text reached the agent — surfaced in the UI for transparency. */
export interface InputMappingInfo {
  mode: "binding" | "variable" | "user_input";
  /** Variable name the text landed on (mode "variable" / sometimes "binding"). */
  target?: string;
}

interface ProcessArgs {
  agentId: string;
  /** The input text (raw transcript for Clean; raw or clean for Custom). */
  text: string;
  contextItems: SessionContextItem[];
  /** Live surface scope (session ids, all three container texts). */
  scope: ApplicationScope;
  /**
   * Surface registry name for binding lookup. Defaults to the cleanup page
   * surface when omitted (backward compatible).
   */
  surfaceName?: string;
}

export interface ProcessLaunchResult {
  conversationId: string;
  mapping: InputMappingInfo;
}

export function useAiPostProcess() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<InputMappingInfo | null>(null);

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
    async ({
      agentId,
      text,
      contextItems,
      scope,
      surfaceName: surfaceNameArg,
    }: ProcessArgs): Promise<ProcessLaunchResult | null> => {
      const bindingSurface = surfaceNameArg ?? CLEANUP_SURFACE_NAME;
      setError(null);
      setLaunching(true);
      try {
        // 1. Load the agent's variable_definitions + context_slots into redux
        //    (createManualInstance snapshots them onto the instance).
        await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
        const payload = selectAgentExecutionPayload(store.getState(), agentId);
        const defs = payload.variableDefinitions ?? [];
        const slots = payload.contextSlots ?? [];
        const slotKeys = new Set(slots.map((s) => s.key));

        // 2. Surface bindings — same layered per-key merge as the launch
        //    thunk (global → org-by-membership → user), so the in-page Run
        //    buttons and the context menu resolve identically.
        let bindingMappings: ValueMappingMap | null = null;
        try {
          const layers = await fetchSurfaceBindingLayers(
            agentId,
            bindingSurface,
          );
          if (layers.length > 0) {
            const mergedResult = mergeValueMappingLayers(layers);
            for (const inert of mergedResult.inertLayers) {
              console.warn(
                `[cleanup] mapping layer "${inert}" for agent ${agentId} exists but contributed no keys — fully shadowed`,
                { provenance: mergedResult.provenance },
              );
            }
            bindingMappings =
              Object.keys(mergedResult.merged).length > 0
                ? mergedResult.merged
                : null;
          }
        } catch (err) {
          // Binding lookup is an enhancement, never a blocker — but say so.
          console.warn(
            `[cleanup] surface-binding lookup failed for agent ${agentId}:`,
            err,
          );
        }
        const resolved = resolveValueMappings(
          scope,
          bindingMappings,
          defs,
          slots,
        );
        if (resolved.errors.length > 0) {
          // Required surface values missing — the page IS the surface, so
          // this is a real configuration/state problem. Abort loudly.
          throw new Error(resolved.errors.join("\n"));
        }
        if (resolved.pendingPrompts.length > 0) {
          // In-page runs are non-interactive (no pre-launch dialog here).
          const requiredPrompts = resolved.pendingPrompts.filter(
            (p) => p.required,
          );
          if (requiredPrompts.length > 0) {
            throw new Error(
              `This agent's binding requires user input (${requiredPrompts
                .map((p) => `"${p.targetName}"`)
                .join(", ")}) — run it from the context menu instead.`,
            );
          }
          console.warn(
            "[cleanup] optional prompt_user mappings skipped for in-page run:",
            resolved.pendingPrompts.map((p) => p.targetName),
          );
        }

        const variableValues: Record<string, unknown> = {
          ...resolved.variableValues,
        };

        // 3. Did the input text land on a variable? If not, heuristics.
        let landedVar = Object.entries(variableValues).find(
          ([, v]) => v === text,
        )?.[0];
        if (!landedVar) {
          const byName = TEXT_VARIABLE_NAMES.map((n) =>
            defs.find((d) => d.name.toLowerCase() === n),
          ).find(Boolean);
          const target = byName ?? (defs.length === 1 ? defs[0] : undefined);
          if (target) {
            variableValues[target.name] = text;
            landedVar = target.name;
          }
        }
        const useUserInputFallback = !landedVar;

        // 4. Context items → proper context entries.
        const entries: InstanceContextEntry[] = [...resolved.contextEntries];
        const taken = new Set(entries.map((e) => e.key));
        const activeItems = contextItems.filter((i) => i.value.trim());
        const slotMatchedItems = activeItems.filter(
          (i) => slotKeys.has(i.key) && !taken.has(i.key),
        );
        const unmatchedItems = activeItems.filter((i) => !slotKeys.has(i.key));
        for (const item of slotMatchedItems) {
          entries.push({
            key: item.key,
            value: item.value,
            slotMatched: true,
            type: "text",
            label: item.label || item.key,
          });
          taken.add(item.key);
        }
        if (unmatchedItems.length > 0) {
          const combined = unmatchedItems
            .map((i) =>
              i.label.trim() ? `[${i.label.trim()}]\n${i.value}` : i.value,
            )
            .join("\n\n");
          const firstOpenSlot = slots.find((s) => !taken.has(s.key));
          if (slotMatchedItems.length === 0 && firstOpenSlot) {
            // Legacy system-cleaner behavior: free-form context fills the
            // agent's declared context slot.
            entries.push({
              key: firstOpenSlot.key,
              value: combined,
              slotMatched: true,
              type: "text",
              label: firstOpenSlot.label ?? "User context",
            });
          } else {
            for (const item of unmatchedItems) {
              if (taken.has(item.key)) continue;
              entries.push({
                key: item.key,
                value: item.value,
                slotMatched: false,
                type: "text",
                label: item.label || item.key,
              });
              taken.add(item.key);
            }
          }
        }

        // 5. Create the instance and wire everything up.
        const cid = await dispatch(
          createManualInstance({
            agentId,
            sourceFeature: "transcription-cleanup",
            apiEndpointMode: "agent",
            displayMode: "direct",
            autoRun: false,
          }),
        ).unwrap();

        if (Object.keys(variableValues).length > 0) {
          dispatch(
            setUserVariableValues({
              conversationId: cid,
              values: variableValues,
            }),
          );
        }
        if (entries.length > 0) {
          dispatch(setContextEntries({ conversationId: cid, entries }));
        }
        if (useUserInputFallback) {
          dispatch(setUserInputText({ conversationId: cid, text }));
        }

        const mappingInfo: InputMappingInfo = useUserInputFallback
          ? { mode: "user_input" }
          : bindingMappings && Object.keys(bindingMappings).length > 0
            ? { mode: "binding", target: landedVar }
            : { mode: "variable", target: landedVar };
        setMapping(mappingInfo);

        setConversationId(cid);
        // Fire-and-forget — the UI reads streaming state from redux selectors.
        dispatch(executeInstance({ conversationId: cid }));
        return { conversationId: cid, mapping: mappingInfo };
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
    setMapping(null);
  }, []);

  return {
    conversationId,
    requestId,
    phase,
    isBusy,
    accumulatedText,
    error,
    mapping,
    process,
    reset,
  };
}
