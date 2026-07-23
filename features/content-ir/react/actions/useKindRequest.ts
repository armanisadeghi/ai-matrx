"use client";

/**
 * useKindRequest — the run engine behind "ask an agent for a typed value".
 *
 * Generalizes the proven headless-run pattern (features/flashcards/data/
 * useGenerateCards.ts, itself mirroring image-studio): launch the agent in
 * `direct` + `autoRun` mode with JSON extraction on, wait for the extraction to
 * finalize, and return the structured object the agent emitted. Presentation
 * (a dialog, a window panel, inline) and SELECTION (rendering the result kind
 * component and waiting for the user to pick) are the caller's job — this hook
 * owns only the agent round-trip, so the same primitive serves every
 * "generate options for me" flow, not just this one.
 *
 * The returned `value` carries its `__kind` when the agent emits one; if it
 * doesn't, the caller's `expectedKind` is stamped so the value can still route
 * to the right component. A skipped/failed run rejects — never a silent empty.
 */

import { useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
import { KIND_KEY } from "../../core/kind-schema.types";

export interface KindRequestInput {
  agentId: string;
  /** Variable values keyed by the agent's variable NAME. */
  variables: Record<string, string>;
  /** Stamped as `__kind` on the result if the agent didn't emit one. */
  expectedKind?: string;
}

export interface KindRequestResult {
  /** The kind slug of the returned value (agent-emitted or `expectedKind`). */
  kind: string | null;
  /** The structured value the agent produced. */
  value: unknown;
}

export interface UseKindRequest {
  run: (input: KindRequestInput) => Promise<KindRequestResult>;
  isRunning: boolean;
  error: string | null;
}

// Generous ceiling — a flash model producing a handful of ideas is fast, but
// the browser must not give up on a momentarily slow provider.
const EXTRACTION_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 250;

function readKind(value: unknown, fallback?: string): string | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const k = (value as Record<string, unknown>)[KIND_KEY];
    if (typeof k === "string" && k) return k;
  }
  return fallback ?? null;
}

export function useKindRequest(): UseKindRequest {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function waitForResult(
    requestId: string,
    expectedKind?: string,
  ): Promise<KindRequestResult> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;

      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        if (!snapshot) {
          throw new Error("The agent finished but produced no structured result.");
        }
        return {
          value: snapshot.value,
          kind: readKind(snapshot.value, expectedKind),
        };
      }

      const status = selectRequestStatus(requestId)(state);
      if (status === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ??
            reqError?.message ??
            "The agent failed before returning a result.",
        );
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for the agent to respond.");
  }

  async function run(input: KindRequestInput): Promise<KindRequestResult> {
    setIsRunning(true);
    setError(null);
    try {
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: `kind-request:${input.agentId}`,
          agentId: input.agentId,
          sourceFeature: "kind-action",
          // The direct-agentId path does not inherit extraction from the agent
          // row, so enable it explicitly to capture the streamed object.
          jsonExtraction: { enabled: true },
          runtime: { variables: input.variables },
          config: { autoRun: true, displayMode: "direct" },
        }),
      ).unwrap();

      if (!requestId) {
        throw new Error("The agent launch did not return a request id.");
      }
      return await waitForResult(requestId, input.expectedKind);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to run the agent.";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsRunning(false);
    }
  }

  return { run, isRunning, error };
}
