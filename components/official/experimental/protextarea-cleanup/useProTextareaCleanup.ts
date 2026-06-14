"use client";

/**
 * useProTextareaCleanup — the generic "clean up this text with an agent" hook
 * for the experimental ProTextareaWithCleanup.
 *
 * This is a thin consumer of the two canonical primitives that already power
 * the `/transcripts/cleanup` page:
 *
 *   1. `useAiPostProcess` — launches ANY agent over a piece of text and exposes
 *      its streaming state (no surface binding required; a bare `{ content }`
 *      scope falls through to name-heuristic → single-variable → user_input).
 *   2. The surfaces "clean" role on `matrx-user/transcripts-cleanup` — the same
 *      default cleaning agent the cleanup page uses, resolved
 *      platform → org → user via `useSurfaceAgentRoles`.
 *
 * Nothing here is transcript-specific: it takes a string, runs the cleanup
 * agent, and streams the result back. The caller (ProTextareaWithCleanup) shows
 * that result in a popover and decides whether to apply it — the source text is
 * never mutated by this hook.
 */

import { useCallback, useMemo } from "react";
import {
  CLEANUP_SURFACE_NAME,
  useAiPostProcess,
  type AiProcessPhase,
} from "@/features/transcription-cleanup/hooks/useAiPostProcess";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";

export interface UseProTextareaCleanupOptions {
  /**
   * Explicit cleanup agent id. When omitted, the agent is resolved from the
   * `clean` role on the shared cleanup surface (same default as the cleanup
   * page).
   */
  agentId?: string | null;
}

export interface UseProTextareaCleanupResult {
  /**
   * The default cleanup agent id from the surface "clean" role (or the
   * `agentId` override). Use it to seed the picker; the caller decides which
   * agent actually runs.
   */
  defaultAgentId: string | null;
  phase: AiProcessPhase;
  isBusy: boolean;
  /** Streaming/final cleaned text, with any <thinking> blocks stripped. */
  result: string;
  /** True while the model is in a thinking block (before visible output). */
  isThinking: boolean;
  error: string | null;
  /** Launch `agentId` over `text`. No-op (returns false) without both. */
  run: (text: string, agentId: string) => Promise<boolean>;
  /** Clear all streaming state (call on cancel / before a fresh run). */
  reset: () => void;
}

export function useProTextareaCleanup(
  options: UseProTextareaCleanupOptions = {},
): UseProTextareaCleanupResult {
  const { agentId: agentIdOverride } = options;

  const surfaceRoles = useSurfaceAgentRoles(CLEANUP_SURFACE_NAME);
  const roleAgentId = surfaceRoles.roles.clean?.effectiveAgentId ?? null;
  const defaultAgentId = agentIdOverride || roleAgentId;

  const ai = useAiPostProcess();

  const { visible, isThinking } = useMemo(
    () => stripThinkingStreaming(ai.accumulatedText),
    [ai.accumulatedText],
  );

  const run = useCallback(
    async (text: string, agentId: string): Promise<boolean> => {
      if (!agentId) return false;
      if (!text.trim()) return false;
      ai.reset();
      const launched = await ai.process({
        agentId,
        text,
        contextItems: [],
        scope: { content: text },
      });
      return launched !== null;
    },
    [ai],
  );

  return {
    defaultAgentId,
    phase: ai.phase,
    isBusy: ai.isBusy,
    result: visible,
    isThinking,
    error: ai.error,
    run,
    reset: ai.reset,
  };
}
