"use client";

import { useCallback, useRef, useState } from "react";
import { useRunAgent } from "@/features/agents/run/useRunAgent";

export interface RunScraperAgentAnalysisOptions {
  agentId: string;
  /** Variable slot UUID → value (legacy broker IDs work as keys). */
  variables: Record<string, string>;
  userInput?: string;
}

/**
 * Runs a one-shot agent analysis over scraped content with live streaming text.
 * Replaces the deleted `run_recipe_to_chat` + socket task path.
 */
export function useScraperAgentAnalysis() {
  const { run, running, error, reset: resetRunAgent } = useRunAgent();
  const [streamingResponse, setStreamingResponse] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(
    async ({
      agentId,
      variables,
      userInput,
    }: RunScraperAgentAnalysisOptions): Promise<string> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      resetRunAgent();
      setStreamingResponse("");

      const text = await run({
        agentId,
        userInput,
        variables,
        signal: controller.signal,
        onChunk: setStreamingResponse,
      });
      setStreamingResponse(text);
      return text;
    },
    [run, resetRunAgent],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancel();
    resetRunAgent();
    setStreamingResponse("");
  }, [cancel, resetRunAgent]);

  return {
    runAnalysis,
    cancel,
    isLoading: running,
    error,
    streamingResponse,
    reset,
  };
}
