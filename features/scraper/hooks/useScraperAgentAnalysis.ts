"use client";

import { useCallback, useRef, useState } from "react";
import type { LLMParamsBody } from "@/lib/api/call-api";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import { resolveMandate } from "@/features/agents/mandates/service";

export interface RunScraperAgentAnalysisOptions {
  /** The tab's mandate key (`SCRAPER_ANALYSIS_MANDATES.*`) — resolved at call time. */
  mandateKey: string;
  /** Variable name → value (the provision's offered values, e.g. `content`). */
  variables: Record<string, string>;
  userInput?: string;
}

/**
 * Runs a one-shot MANDATE analysis over scraped content with live streaming
 * text. The mandate resolves at call time (a binding saved seconds ago applies
 * to the next run) and its `configOverrides` ride the run; a mandate that
 * cannot resolve rejects — the tab gates on `useMandate` before calling this.
 * Replaces the deleted `run_recipe_to_chat` + socket task path.
 */
export function useScraperAgentAnalysis() {
  const { run, running, error, reset: resetRunAgent } = useRunAgent();
  const [streamingResponse, setStreamingResponse] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const runAnalysis = useCallback(
    async ({
      mandateKey,
      variables,
      userInput,
    }: RunScraperAgentAnalysisOptions): Promise<string> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      resetRunAgent();
      setStreamingResponse("");

      const mandate = await resolveMandate(mandateKey);
      const configOverrides: LLMParamsBody | undefined = mandate.configOverrides
        ? { ...mandate.configOverrides }
        : undefined;
      const text = await run({
        agentId: mandate.agentId,
        configOverrides,
        userInput,
        variables,
        sourceApp: "matrx-frontend",
        sourceFeature: "scraper",
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
