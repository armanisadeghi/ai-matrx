"use client";

/**
 * The node panel's "Draft brief" action — ONE page's brief, written against
 * its NEIGHBOURS.
 *
 * 🚨 THIS RUNS SERVER-SIDE AND IS PERSISTED ON ARRIVAL. It used to run the
 * `content_plan.brief_writer` slot from the browser and stage the result into
 * React state: the angle, must-not-cover list, concerns and suggested word
 * count had no column and were discarded even on a successful Save, and a
 * refresh, a node switch, or a closed panel destroyed the whole paid run.
 *
 * `POST /content-plan/nodes/{id}/draft-brief` now builds the neighbour context
 * on the server and writes the COMPLETE draft to
 * `plan.node.metadata.ai_brief_draft` the instant the model answers. Drafting
 * still PROPOSES — the user accepts, and `deepen` remains the
 * commit-immediately sibling — but the proposal itself is durable, so nothing
 * the user does (or fails to do) can lose it.
 *
 * The stream is ADOPTED into the canonical execution slice
 * (`adoptForeignStream`), so the model's own tokens render live through the ONE
 * pipeline — never a bespoke renderer, never a bare spinner.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parseStreamError,
} from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { planKeys } from "../data/hooks";
import type { PlanNodeRow } from "../types";

/** The persisted proposal, exactly as the server writes it. */
export interface BriefDraft {
  brief: string[];
  angle: string;
  must_not_cover: string[];
  concerns: string[];
  suggested_word_count: number | null;
  slot_key: string;
  agent_id: string | null;
  model_id: string | null;
  generated_at: string;
  /** Set once the user promotes it onto the live brief. */
  accepted_at: string | null;
  /** The `chat.agent_run` row holding this run's complete request + result. */
  run_id: string | null;
}

/** One past run, from `GET /content-plan/nodes/{id}/brief-runs`. */
export interface BriefRunSummary {
  run_id: string;
  status: string;
  created_at: string;
  model_id: string | null;
  agent_id: string | null;
  brief_line_count: number;
  angle: string;
  is_current: boolean;
  error: string;
}

/** Where the server keeps it — one key, named once on each side. */
const BRIEF_DRAFT_KEY = "ai_brief_draft";

/** Query keys for a node's recorded brief runs. */
export const briefRunKeys = {
  list: (nodeId: string) => ["content-plan", "brief-runs", nodeId] as const,
};

/**
 * Read the node's persisted draft. This is the source of truth the panel
 * renders — NOT a copy held in component state, which is precisely the bug
 * this replaced.
 */
export function readBriefDraft(node: PlanNodeRow): BriefDraft | null {
  const metadata = node.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>)[BRIEF_DRAFT_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const brief = Array.isArray(row.brief)
    ? row.brief.filter((line): line is string => typeof line === "string")
    : [];
  if (brief.length === 0) return null;
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  return {
    brief,
    angle: typeof row.angle === "string" ? row.angle : "",
    must_not_cover: strings(row.must_not_cover),
    concerns: strings(row.concerns),
    suggested_word_count:
      typeof row.suggested_word_count === "number" ? row.suggested_word_count : null,
    slot_key: typeof row.slot_key === "string" ? row.slot_key : "",
    agent_id: typeof row.agent_id === "string" ? row.agent_id : null,
    model_id: typeof row.model_id === "string" ? row.model_id : null,
    generated_at: typeof row.generated_at === "string" ? row.generated_at : "",
    accepted_at: typeof row.accepted_at === "string" ? row.accepted_at : null,
    run_id: typeof row.run_id === "string" ? row.run_id : null,
  };
}

/**
 * The run-history response, read defensively at the wire boundary (the repo's
 * established pattern for callApi bodies — `result.data` is deliberately loose).
 */
function parseRunSummaries(data: unknown): BriefRunSummary[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const rows = (data as Record<string, unknown>).runs;
  if (!Array.isArray(rows)) return [];
  const out: BriefRunSummary[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.run_id !== "string" || !item.run_id) continue;
    out.push({
      run_id: item.run_id,
      status: typeof item.status === "string" ? item.status : "",
      created_at: typeof item.created_at === "string" ? item.created_at : "",
      model_id: typeof item.model_id === "string" ? item.model_id : null,
      agent_id: typeof item.agent_id === "string" ? item.agent_id : null,
      brief_line_count:
        typeof item.brief_line_count === "number" ? item.brief_line_count : 0,
      angle: typeof item.angle === "string" ? item.angle : "",
      is_current: item.is_current === true,
      error: typeof item.error === "string" ? item.error : "",
    });
  }
  return out;
}

/**
 * A draft is worth showing when it exists and the user hasn't already taken
 * it — a consumed draft whose lines still match the live brief is history,
 * not a pending decision.
 */
export function isDraftPending(node: PlanNodeRow, draft: BriefDraft | null): boolean {
  if (!draft) return false;
  const live = node.brief ?? [];
  const same =
    live.length === draft.brief.length &&
    live.every((line, index) => line === draft.brief[index]);
  return !same;
}

export interface BriefWriterRunState {
  status: "idle" | "running" | "done" | "error";
  stage?: string;
  error?: string;
  /** Canonical live-render handle — `<LiveRunDisplay requestId=…>`. */
  requestId?: string;
}

const IDLE: BriefWriterRunState = { status: "idle" };

function readPhaseMessage(event: TypedStreamEvent): string | null {
  if (event.event === "phase") {
    return event.data.phase === "connected" ? null : event.data.phase;
  }
  if (event.event === "info") {
    return event.data.user_message ?? event.data.system_message ?? null;
  }
  return null;
}

export function useBriefWriter(args: { node: PlanNodeRow; siteId: string }) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [run, setRun] = useState<BriefWriterRunState>(IDLE);
  const [accepting, setAccepting] = useState(false);
  const inFlight = useRef(false);
  // Adopted rows have no owning instance — nothing else reaps them.
  const adoptedRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
    },
    [dispatch],
  );

  const nodeId = args.node.id;
  const siteId = args.siteId;

  const start = useCallback(
    async (guidance = "") => {
      if (inFlight.current) return;
      inFlight.current = true;
      cancelledRef.current = false;
      setRun({ status: "running", stage: "Reading neighbours + research…" });
      let streamFailure: string | null = null;

      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
      const streamAbort = new AbortController();
      abortRef.current = streamAbort;
      const consumeStream = dispatch(
        adoptForeignStream({
          onAdopted: ({ requestId }) => {
            adoptedRequestIdRef.current = requestId;
            setRun((current) => ({ ...current, requestId }));
          },
          abortController: streamAbort,
          onEvent: (event) => {
            const stage = readPhaseMessage(event);
            if (stage) setRun((current) => ({ ...current, stage }));
            if (event.event === "error") {
              streamFailure = describeBackendFailure(
                parseStreamError(event.data),
              ).headline;
            }
          },
        }),
      );

      const result = await dispatch(
        callApi({
          path: "/content-plan/nodes/{node_id}/draft-brief",
          method: "POST",
          pathParams: { node_id: nodeId },
          body: { guidance, accept: false },
          stream: true,
          consumeStream,
          signal: streamAbort.signal,
        }),
      );

      inFlight.current = false;
      abortRef.current = null;
      // The server persists the draft before it streams anything — refetch
      // regardless of how the stream ended. A user who closed the tab mid-run
      // finds the draft waiting when they come back.
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });

      if (cancelledRef.current) {
        cancelledRef.current = false;
        setRun(IDLE);
        return;
      }
      if (result.error) {
        const explanation = describeBackendFailure(parseCallApiError(result.error));
        setRun({ status: "error", error: explanation.headline });
        toast.error(`Brief draft failed: ${explanation.headline}`);
        return;
      }
      if (streamFailure) {
        setRun({ status: "error", error: streamFailure });
        toast.error(`Brief draft failed: ${streamFailure}`);
        return;
      }
      setRun((current) => ({ ...current, status: "done" }));
      toast.success("Brief drafted and saved to this page — review it below.");
    },
    [dispatch, nodeId, queryClient, siteId],
  );

  /** Promote the persisted draft onto the node's live brief. */
  const accept = useCallback(async () => {
    if (accepting) return;
    setAccepting(true);
    const result = await dispatch(
      callApi({
        path: "/content-plan/nodes/{node_id}/accept-brief-draft",
        method: "POST",
        pathParams: { node_id: nodeId },
        body: {},
      }),
    );
    setAccepting(false);
    void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
    if (result.error) {
      toast.error(
        `Could not apply the draft: ${describeBackendFailure(parseCallApiError(result.error)).headline}`,
      );
      return;
    }
    toast.success("Brief applied to this page.");
  }, [accepting, dispatch, nodeId, queryClient, siteId]);

  /**
   * Every recorded run for this page. The node metadata holds only the CURRENT
   * proposal; these rows are the archive — five runs stay five runs, and any
   * one can be brought back.
   */
  const runsQuery = useQuery({
    queryKey: briefRunKeys.list(nodeId),
    queryFn: async (): Promise<BriefRunSummary[]> => {
      const result = await dispatch(
        callApi({
          path: "/content-plan/nodes/{node_id}/brief-runs",
          method: "GET",
          pathParams: { node_id: nodeId },
        }),
      );
      if (result.error) {
        throw new Error(
          describeBackendFailure(parseCallApiError(result.error)).headline,
        );
      }
      return parseRunSummaries(result.data);
    },
    staleTime: 30_000,
  });

  const [restoringRunId, setRestoringRunId] = useState<string | null>(null);

  /** Make a past run the current proposal. Destroys nothing. */
  const restore = useCallback(
    async (runId: string) => {
      setRestoringRunId(runId);
      const result = await dispatch(
        callApi({
          path: "/content-plan/nodes/{node_id}/brief-runs/restore",
          method: "POST",
          pathParams: { node_id: nodeId },
          body: { run_id: runId },
        }),
      );
      setRestoringRunId(null);
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
      void queryClient.invalidateQueries({ queryKey: briefRunKeys.list(nodeId) });
      if (result.error) {
        toast.error(
          `Could not restore that run: ${describeBackendFailure(parseCallApiError(result.error)).headline}`,
        );
        return;
      }
      toast.success("That run is the current draft again — review and apply it.");
    },
    [dispatch, nodeId, queryClient, siteId],
  );

  const reset = useCallback(() => {
    if (inFlight.current) {
      cancelledRef.current = true;
      abortRef.current?.abort();
    }
    if (adoptedRequestIdRef.current) {
      dispatch(removeRequest(adoptedRequestIdRef.current));
      adoptedRequestIdRef.current = null;
    }
    setRun(IDLE);
  }, [dispatch]);

  return {
    run,
    start,
    accept,
    accepting,
    reset,
    busy: run.status === "running",
    runs: runsQuery.data ?? [],
    runsLoading: runsQuery.isLoading,
    // An unreachable history is NOT an empty history — saying "no runs yet"
    // when the call failed tells the user their paid runs are gone.
    runsError:
      runsQuery.error instanceof Error ? runsQuery.error.message : null,
    restore,
    restoringRunId,
  };
}

export type BriefWriterController = ReturnType<typeof useBriefWriter>;
