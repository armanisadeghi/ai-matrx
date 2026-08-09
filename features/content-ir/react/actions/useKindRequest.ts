"use client";

/**
 * useKindRequest — the run engine behind "ask an agent for a typed value".
 *
 * Built on the canonical `useHeadlessAgentJson` primitive (D126): launch the
 * agent in `direct` + `autoRun` mode with JSON extraction on, wait for the
 * extraction to finalize, and return the structured object the agent emitted. Presentation
 * (a dialog, a window panel, inline) and SELECTION (rendering the result kind
 * component and waiting for the user to pick) are the caller's job — this hook
 * owns only the agent round-trip, so the same primitive serves every
 * "generate options for me" flow, not just this one.
 *
 * The returned `value` carries its `__kind` when the agent emits one; if it
 * doesn't, the caller's `expectedKind` is stamped so the value can still route
 * to the right component. A skipped/failed run rejects — never a silent empty.
 */

import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
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
  /**
   * The live conversation id, set the instant the run's conversation is created
   * — EARLY, while the agent is still streaming (long before `run()` resolves,
   * which only happens when the whole run finishes). Consumers resolve the live
   * request from it (`selectConversationRequestIds`) and subscribe to the
   * streaming selectors, so the result renders AS IT STREAMS instead of
   * blocking on a spinner. `run()`'s late-resolving requestId is useless for
   * streaming — by the time it returns, the run is already done.
   */
  conversationId: string | null;
  /** Clear transient state — call when the surface resets. */
  reset: () => void;
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
  const { run: runHeadless, isRunning, error, conversationId, reset } =
    useHeadlessAgentJson();

  async function run(input: KindRequestInput): Promise<KindRequestResult> {
    return runHeadless<KindRequestResult>({
      agentId: input.agentId,
      surfaceKey: `kind-request:${input.agentId}`,
      sourceFeature: "ai-results",
      // The surface renders the stream live off `conversationId` and reads the
      // result kind component after completion — keep the instance alive; the
      // presenting surface owns cleanup on reset/unmount.
      displayMode: "direct",
      keepInstance: true,
      variables: input.variables,
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The agent failed before returning a result.",
        noJson: "The agent finished but produced no structured result.",
        timeout: "Timed out waiting for the agent to respond.",
      },
      coerce: (value) => ({
        value,
        kind: readKind(value, input.expectedKind),
      }),
    });
  }

  return { run, isRunning, error, conversationId, reset };
}
