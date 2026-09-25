"use client";

/**
 * useProTextareaAgentAction — run ANY agent over ProTextarea content and stream
 * the result back. Powers Clean up, Help with this…, Custom Agent, and future
 * "…" menu agent actions.
 *
 * Thin consumer of `useAiPostProcess` (same primitive as `/transcripts/cleanup`).
 * The caller shows the streamed result in a popover and decides whether to
 * apply it — this hook never mutates the source text.
 */

import { useCallback, useMemo } from "react";
import {
  useAiPostProcess,
  type AiProcessPhase,
} from "@/features/transcription-cleanup/hooks/useAiPostProcess";
import { stripThinkingStreaming } from "@/components/content-refine/utils/stripThinking";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectLatestAnswerText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

export interface UseProTextareaAgentActionResult {
  phase: AiProcessPhase;
  isBusy: boolean;
  /** Streaming/final agent output, with any <thinking> blocks stripped. */
  result: string;
  /** True while the model is in a thinking block (before visible output). */
  isThinking: boolean;
  error: string | null;
  /**
   * Launch `agentId` over `text`. No-op (returns false) without both.
   * `contextItems` ride as declared context policies or ad-hoc entries — same
   * handling as the cleanup page.
   */
  run: (
    text: string,
    agentId: string,
    contextItems?: SessionContextItem[],
    options?: {
      surfaceName?: string;
      applicationScope?: ApplicationScope;
    },
  ) => Promise<boolean>;
  /** Clear all streaming state (call on cancel / before a fresh run). */
  reset: () => void;
}

export function useProTextareaAgentAction(): UseProTextareaAgentActionResult {
  const ai = useAiPostProcess();

  const { visible, isThinking } = useMemo(
    () => stripThinkingStreaming(ai.accumulatedText),
    [ai.accumulatedText],
  );
  // The live stream projection is for WATCHING; the result handed on is the
  // COMMITTED final answer once it lands — the projection drops a code
  // fence's opening line (verify-RC-B5 r4). Same selector every agent-run
  // path reads (selectLatestAnswerText).
  const committed = useAppSelector((s) =>
    ai.conversationId ? selectLatestAnswerText(ai.conversationId)(s) : "",
  );

  const run = useCallback(
    async (
      text: string,
      agentId: string,
      contextItems: SessionContextItem[] = [],
      options?: {
        surfaceName?: string;
        applicationScope?: ApplicationScope;
      },
    ): Promise<boolean> => {
      if (!agentId) return false;
      if (!text.trim()) return false;
      ai.reset();
      const launched = await ai.process({
        agentId,
        text,
        contextItems,
        scope: options?.applicationScope ?? {
          content: text,
          raw_transcript_text: text,
        },
        surfaceName: options?.surfaceName,
      });
      return launched !== null;
    },
    [ai],
  );

  return {
    phase: ai.phase,
    isBusy: ai.isBusy,
    result: ai.phase === "complete" && committed.trim() ? committed : visible,
    isThinking,
    error: ai.error,
    run,
    reset: ai.reset,
  };
}
