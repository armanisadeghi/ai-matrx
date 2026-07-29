"use client";

/**
 * State + actions for the keyword research workbench.
 *
 * Reads are Supabase-direct (universal keyword plane). Compute goes to the
 * Python brain via callApi: POST /seo/keywords/research (agent → artifact →
 * ingestion → volume) and POST /seo/keywords/volume-refresh (provider fetch
 * for stale/missing market rows).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import {
  describeBackendFailure,
  parseCallApiError,
  parsePersistedBackendError,
  parseStreamError,
} from "@/lib/api/errors";
import { isErrorEvent, type TypedStreamEvent } from "@/lib/api/types";
import type { components } from "@/types/python-generated/api-types";

import { listKeywordEdges, listKeywordsWithMarket } from "./data/queries";
import type {
  KeywordEdgeView,
  KeywordResearchResponse,
  KeywordWithMarket,
} from "./types";

export interface ResearchRunState {
  status: "idle" | "running" | "done" | "error";
  primaryKeyword?: string;
  stage?: string;
  /**
   * The `activeRequests` id this run's agent stream was ADOPTED under
   * (`adoptForeignStream`). This is the whole live-rendering contract: hand it
   * to `<MarkdownStream requestId={…} />` and the canonical pipeline renders
   * every research/classification payload as its real kind component.
   *
   * This surface used to bucket raw chunk text into per-phase strings and feed
   * them to hand-opened parse sessions — the banned bespoke-renderer pattern
   * (`features/content-ir/FEATURE.md` § No bespoke stream renderers). It did
   * that because a server-orchestrated pipeline run had no requestId to render
   * from. It has one now.
   */
  requestId?: string;
  /**
   * True once the adopted stream produced ANY renderable content. Distinguishes
   * "live run with output" from a rejoin (no chunk replay exists), which falls
   * back to the durable persisted artifact.
   */
  hasStreamedContent?: boolean;
  result?: KeywordResearchResponse;
  error?: string;
  /** Durable seo.collection_run id — persisted by the server BEFORE the AI
   * call, so a refreshed/crashed client can rejoin or re-read by id. */
  runId?: string;
}

/** sessionStorage record of the in-flight research command, used to rejoin
 * live progress (or read the durable result) after a page refresh. */
const ACTIVE_RUN_STORAGE_KEY = "seo.keywordResearch.activeRun";

interface StoredActiveRun {
  runId: string;
  primaryKeyword: string;
}

function readStoredActiveRun(): StoredActiveRun | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredActiveRun;
    return parsed.runId ? parsed : null;
  } catch {
    return null;
  }
}

function storeActiveRun(record: StoredActiveRun | null): void {
  try {
    if (record) {
      sessionStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(record));
    } else {
      sessionStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable (SSR/private mode) — reconnect is best-effort.
  }
}

const STAGE_LABELS: Record<string, string> = {
  "seo.research_started": "Starting keyword research",
  "seo.research_agent_completed": "Research agent completed",
  "seo.research_artifact_persisted": "Research artifact persisted",
  "seo.research_relationships_persisted": "Keyword relationships persisted",
  "seo.volume_refresh_started": "Planning keyword-volume refresh",
  "seo.volume_refresh_planned": "Checking stored market freshness",
  "seo.volume_run_claimed": "Provider run claimed",
  "seo.volume_provider_request_started": "Requesting DataForSEO market data",
  "seo.volume_provider_task_checkpoint": "DataForSEO task checkpoint persisted",
  "seo.volume_provider_task_checkpoints":
    "DataForSEO task checkpoints persisted",
  "seo.volume_provider_response": "DataForSEO response received",
  "seo.volume_raw_persisted": "Raw provider response persisted",
  "seo.volume_normalized": "Provider response normalized",
  "seo.volume_observations_persisted": "Keyword market observations persisted",
  "seo.volume_batch_completed": "Keyword-volume batch completed",
  "seo.volume_refresh_completed": "Keyword volume complete",
  "seo.classification_started": "Classifying keyword intent",
  "seo.classification_completed": "Keyword classification persisted",
  "seo.research_completed": "Research complete",
};

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data"
    ? (event.data as Record<string, unknown>)
    : null;
}

function resultFromEvent(
  event: TypedStreamEvent,
  expectedKind: string,
): Record<string, unknown> | null {
  const data = streamData(event);
  if (data?.kind !== expectedKind) return null;
  const result = data.result;
  return result && typeof result === "object"
    ? (result as Record<string, unknown>)
    : null;
}

/** A durable research-stream command: either a fresh run (typed body, no path
 * params) or a rejoin of an existing run by id (path param, no body). Both
 * stream the same seo.* progress events. Paths and their bodies are the
 * generated OpenAPI contract — the union keeps each variant correlated. */
type ResearchStreamRequest =
  | {
      path: "/seo/keywords/research";
      pathParams?: undefined;
      body: components["schemas"]["KeywordResearchBody"];
    }
  | {
      path: "/seo/collections/{run_id}/rejoin";
      pathParams: { run_id: string };
      body?: undefined;
    };

export function useKeywordResearch(organizationId?: string | null) {
  const dispatch = useAppDispatch();
  const [keywords, setKeywords] = useState<KeywordWithMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [run, setRun] = useState<ResearchRunState>({ status: "idle" });
  const [volumeStage, setVolumeStage] = useState<string | null>(null);
  // The phrases of the last research run — when set, the explorer scopes to
  // this cluster instead of the whole universal library.
  const [clusterPhrases, setClusterPhrases] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (searchValue: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listKeywordsWithMarket({
        search: searchValue,
        signal: controller.signal,
      });
      setKeywords(rows);
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void reload(search), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, reload]);

  const consumeResearchStream = useCallback(
    async (phrase: string, request: ResearchStreamRequest) => {
      const completedResults: KeywordResearchResponse[] = [];
      let serverBusy = false;
      let streamFailure: string | null = null;
      const onStreamEvent = (event: TypedStreamEvent) => {
        {
          // Agent content — chunks and server render blocks — is NOT handled
          // here. It is already in `activeRequests` under the adopted
          // requestId, and renders through the canonical pipeline. This
          // handler owns only this feature's OWN typed progress events.
          if (event.event === "chunk" || event.event === "render_block") {
            setRun((current) =>
              current.hasStreamedContent
                ? current
                : { ...current, hasStreamedContent: true },
            );
            return;
          }
          if (isErrorEvent(event)) {
            const explanation = describeBackendFailure(
              parseStreamError(event.data),
            );
            streamFailure = explanation.headline;
            setRun((current) => ({
              ...current,
              status: "error",
              stage: "Research stopped",
              error: explanation.headline,
            }));
            return;
          }
          const data = streamData(event);
          if (!data) return;
          const kind = typeof data.kind === "string" ? data.kind : null;
          if (!kind) return;
          // Phase transitions are progress labels only. Region boundaries and
          // finalization belong to the stream accumulator — this surface no
          // longer decides when a payload is "done".
          // Durable job identity — persisted server-side BEFORE the AI call.
          if (kind === "seo.command_run" && typeof data.run_id === "string") {
            const runId = data.run_id;
            storeActiveRun({ runId, primaryKeyword: phrase });
            setRun((current) => ({ ...current, runId }));
          }
          if (kind === "seo.run_in_progress") {
            serverBusy = true;
            setRun((current) => ({
              ...current,
              stage:
                "This research is already running on the server — rejoin or retry shortly.",
            }));
            return;
          }
          if (kind === "seo.run_snapshot") {
            // Durable snapshot after a restart: no live stream to follow.
            const snapshotResult =
              data.result as KeywordResearchResponse | null;
            if (data.status === "completed" && snapshotResult) {
              completedResults.push(snapshotResult);
              setRun((current) => ({
                ...current,
                status: "done",
                stage: "Research complete (recovered)",
                result: snapshotResult,
              }));
            } else if (data.status === "failed") {
              const persistedError = parsePersistedBackendError(data.error);
              const explanation = persistedError
                ? describeBackendFailure(persistedError)
                : null;
              streamFailure =
                explanation?.headline ?? "The research run failed.";
              setRun((current) => ({
                ...current,
                status: "error",
                error: streamFailure ?? "The research run failed.",
              }));
            } else {
              serverBusy = true;
              setRun((current) => ({
                ...current,
                stage: `Run is ${String(data.status)} on the server`,
              }));
            }
            return;
          }
          setRun((current) => ({
            ...current,
            stage: STAGE_LABELS[kind] ?? kind,
          }));
          const final = resultFromEvent(event, "seo.research_completed");
          if (final) {
            const completedResult = final as unknown as KeywordResearchResponse;
            completedResults.push(completedResult);
            setRun((current) => ({
              ...current,
              status: "done",
              stage: "Research complete",
              result: completedResult,
            }));
          }
        }
      };
      // Hand the raw NDJSON body to the execution system instead of draining
      // it here: the agent's content lands in `activeRequests` under a real
      // requestId, so the canonical pipeline renders it. This surface still
      // sees every event via `onEvent` for its own `seo.*` progress.
      const consumeStream = dispatch(
        adoptForeignStream({
          onAdopted: ({ requestId }) =>
            setRun((current) => ({ ...current, requestId })),
          onEvent: onStreamEvent,
        }),
      );
      const result = await dispatch(
        request.path === "/seo/keywords/research"
          ? callApi({
              path: request.path,
              method: "POST",
              body: request.body,
              scopeOverrides: organizationId
                ? { organization_id: organizationId }
                : undefined,
              stream: true,
              consumeStream,
            })
          : callApi({
              path: request.path,
              method: "POST",
              pathParams: request.pathParams,
              stream: true,
              consumeStream,
            }),
      );
      if (result.error) {
        storeActiveRun(null);
        const explanation = describeBackendFailure(
          parseCallApiError(result.error),
        );
        setRun((current) => ({
          ...current,
          status: "error",
          primaryKeyword: phrase,
          stage: "Research could not start",
          error: explanation.headline,
        }));
        return;
      }
      const completedResult = completedResults.at(-1);
      if (!completedResult) {
        if (serverBusy) return; // keep the stored run id so rejoin stays possible
        storeActiveRun(null);
        setRun((current) => ({
          ...current,
          status: "error",
          primaryKeyword: phrase,
          error:
            streamFailure ??
            "The server ended this research run without a result or an error. Please retry; if it repeats, report this as a server-stream defect.",
        }));
        return;
      }
      storeActiveRun(null);
      const artifact = completedResult.artifact;
      const phrases = [
        artifact.primary_keyword || phrase,
        ...(artifact.keyword_lists ?? []).flatMap(
          (list) => list.keywords ?? [],
        ),
      ]
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);
      setClusterPhrases(Array.from(new Set(phrases)));
      void reload(search);
    },
    [dispatch, organizationId, reload, search],
  );

  const runResearch = useCallback(
    async (primaryKeyword: string) => {
      const phrase = primaryKeyword.trim();
      if (!phrase) return;
      setRun({
        status: "running",
        primaryKeyword: phrase,
        stage: "Checking organization access and DataForSEO credentials",
      });
      await consumeResearchStream(phrase, {
        path: "/seo/keywords/research",
        body: { primary_keyword: phrase },
      });
    },
    [consumeResearchStream],
  );

  const rejoinResearch = useCallback(
    async (runId: string, primaryKeyword: string) => {
      setRun({
        status: "running",
        primaryKeyword,
        stage: "Rejoining previous run",
        runId,
      });
      await consumeResearchStream(primaryKeyword, {
        path: "/seo/collections/{run_id}/rejoin",
        pathParams: { run_id: runId },
      });
    },
    [consumeResearchStream],
  );

  // After a refresh/crash mid-run, automatically rejoin the durable run —
  // live progress replays when the server still executes it; otherwise the
  // persisted snapshot (status + result) renders immediately.
  const attemptedRejoinRef = useRef(false);
  useEffect(() => {
    if (attemptedRejoinRef.current) return;
    attemptedRejoinRef.current = true;
    const stored = readStoredActiveRun();
    // Deferred so the rejoin's synchronous setRun never fires inside the
    // effect body (react-hooks/set-state-in-effect).
    if (stored) {
      void Promise.resolve().then(() =>
        rejoinResearch(stored.runId, stored.primaryKeyword),
      );
    }
  }, [rejoinResearch]);

  const refreshVolume = useCallback(
    async (phrases: string[], forceRefresh: boolean) => {
      const completedResults: Record<string, unknown>[] = [];
      setVolumeStage("Connecting");
      const result = await dispatch(
        callApi({
          path: "/seo/keywords/volume-refresh",
          method: "POST",
          body: { phrases, force_refresh: forceRefresh },
          scopeOverrides: organizationId
            ? { organization_id: organizationId }
            : undefined,
          stream: true,
          onStreamEvent: (event) => {
            const data = streamData(event);
            const kind = typeof data?.kind === "string" ? data.kind : null;
            if (kind) setVolumeStage(STAGE_LABELS[kind] ?? kind);
            const final = resultFromEvent(
              event,
              "seo.volume_refresh_completed",
            );
            if (final) completedResults.push(final);
          },
        }),
      );
      if (result.error) {
        setVolumeStage(null);
        throw new Error(result.error.message);
      }
      const completedResult = completedResults.at(-1);
      if (!completedResult) {
        setVolumeStage(null);
        throw new Error("The volume stream ended without a completed result.");
      }
      void reload(search);
      setVolumeStage(null);
      return completedResult;
    },
    [dispatch, organizationId, reload, search],
  );

  const loadEdges = useCallback(
    (keywordId: string): Promise<KeywordEdgeView[]> =>
      listKeywordEdges(keywordId),
    [],
  );

  const clearCluster = useCallback(() => setClusterPhrases(null), []);

  /** Re-read the library with the current search (post-archive/restore). */
  const reloadKeywords = useCallback(() => {
    void reload(search);
  }, [reload, search]);

  return {
    clusterPhrases,
    clearCluster,
    keywords,
    loading,
    loadError,
    search,
    setSearch,
    run,
    volumeStage,
    runResearch,
    rejoinResearch,
    refreshVolume,
    loadEdges,
    reloadKeywords,
  };
}
