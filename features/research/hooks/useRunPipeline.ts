"use client";

import { useCallback } from "react";

import { toast } from "@/lib/toast";
import { useTopicContext } from "../context/ResearchContext";
import { useResearchApi } from "./useResearchApi";
import { useResearchStream } from "./useResearchStream";

/**
 * Run the full pipeline from ANY research surface.
 *
 * The overview's `PipelineOrchestra` owns the rich live visualization (stage
 * graph, per-item feed, cost strip) and keeps its own wiring. Every other
 * surface — the keywords list, a single keyword's page — needs the same
 * capability without any of that machinery: start the run, show that it is
 * running, refresh when it lands. Duplicating the orchestra's stream plumbing
 * on each of those is exactly the "second implementation" the doctrine forbids,
 * so this is the shared thin path.
 *
 * The run is topic-wide by design, because the backend has no keyword-scoped
 * entry point (`RunPipelineRequest` carries only an organization). Its skip
 * gates make that safe and cheap: already-searched keywords are not re-searched,
 * already-scraped pages are not re-fetched, and already-analyzed sources are
 * not re-analyzed. Callers MUST describe it in those terms and never imply the
 * run is scoped to one keyword.
 */
export function useRunPipeline() {
  const { topicId, topic, refresh, refreshProgress } = useTopicContext();
  const api = useResearchApi();
  const stream = useResearchStream();

  const run = useCallback(async () => {
    if (!topic) {
      toast.error("The research topic has not loaded. Reload before running it.");
      return;
    }
    try {
      // Organization is asserted from the LOADED TOPIC, never from ambient
      // active-org state — the backend reloads the topic as authority and
      // rejects a mismatch before any paid work starts.
      const response = await api.runPipeline(topicId, topic.organization_id);
      await stream.startStream(response, {
        onEnd: () => {
          refresh();
          refreshProgress();
        },
      });
    } catch (err) {
      toast.error((err as Error).message ?? "Could not start the pipeline");
    }
  }, [api, topicId, topic, stream, refresh, refreshProgress]);

  return {
    run,
    isRunning: stream.isStreaming,
    /** Latest backend progress line, for a live label on the trigger. */
    message: stream.messages.at(-1)?.message ?? null,
    cancel: stream.cancel,
  };
}
