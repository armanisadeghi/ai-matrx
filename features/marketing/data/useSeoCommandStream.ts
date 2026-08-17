"use client";

/**
 * useSeoCommandStream — THE way a surface runs one durable SEO command.
 *
 * Every aidream SEO command speaks the same wire language (`SeoCommandRun` +
 * `run_streamed_command`): a `seo.command_run` identity event, typed
 * `seo.<stage>` milestones, the agent's own tokens, a terminal
 * `seo.<final>_completed` carrying the persisted result, and live rejoin at
 * `POST /seo/collections/{run_id}/rejoin`. Before this hook every consumer
 * re-implemented the same ninety lines — adopt the stream, mind the abort /
 * reap ordering, stash the run id, re-read the result, float a window.
 *
 * It gives a surface all four halves of THE FLOATING LAW at once:
 *
 * - **Canonical rendering.** The stream is ADOPTED (`adoptForeignStream`), so
 *   the model's output renders through the ONE pipeline. No surface ever parses
 *   a chunk (`features/content-ir/FEATURE.md` § No bespoke stream renderers).
 * - **Floating, never shifting.** The run streams into `LiveRunWindow` via
 *   `useFloatingLiveRun`; the page under it never moves.
 * - **Survives the tab.** The durable run id is stashed the moment it exists,
 *   so a reload rejoins the run instead of losing it.
 * - **Never silent.** A failure surfaces as the command's real error, and a
 *   stream that ends with no result says exactly that.
 *
 * Retention discipline (`features/agents/docs/LIVE_RUN_RETENTION.md`): the
 * client fetch is aborted BEFORE the adopted row is reaped, both on unmount and
 * before a new run — an orphaned stream draining into a missing row is the
 * disappearing-run class.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import type { ForeignStreamConsumer } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";
import { callApi } from "@/lib/api/call-api";
import type { ApiCallResult } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parseCallApiError,
  parsePersistedBackendError,
  parseStreamError,
} from "@/lib/api/errors";
import { isErrorEvent, type TypedStreamEvent } from "@/lib/api/types";
import { useAppDispatch } from "@/lib/redux/hooks";

export interface SeoCommandState<TResult> {
  status: "idle" | "running" | "done" | "error";
  requestId?: string;
  /** The durable `seo.collection_run` id — the rejoin handle. */
  runId?: string;
  /** The last milestone, already translated to the caller's own words. */
  stage?: string;
  result?: TResult;
  error?: string;
}

/** What the caller hands `start`: the stream plumbing, already wired. */
export interface SeoCommandLaunchIo {
  consumeStream: ForeignStreamConsumer;
  signal: AbortSignal;
}

export interface UseSeoCommandStreamOptions<TResult> {
  /**
   * Stable per-subject key. Used for the sessionStorage rejoin handle AND the
   * window instance, so re-running reuses ONE window and a reload rejoins the
   * right run — e.g. `seo.classify` or `seo.strategy.${siteId}`.
   */
  key: string;
  /** What the user is watching, e.g. "Classifying keywords". */
  label: string;
  /** The terminal event kind carrying the result, e.g. `seo.classify_completed`. */
  finalKind: string;
  /** `seo.<kind>` → the sentence a human should read. Milestones only. */
  stages?: Record<string, string>;
  /** Fired once with the persisted result. Refetches belong here. */
  onComplete?: (result: TResult) => void | Promise<void>;
}

export interface SeoCommandHandle<TResult> {
  run: SeoCommandState<TResult>;
  /** True while the command is working (including a rejoined server run). */
  isActive: boolean;
  /**
   * Launch it. The callback receives the adopted-stream plumbing and returns
   * the `callApi` dispatch, so each surface keeps its own typed path and body.
   */
  start: (launch: (io: SeoCommandLaunchIo) => Promise<ApiCallResult>) => Promise<void>;
}

function dataOf(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data" ? (event.data as Record<string, unknown>) : null;
}

export function useSeoCommandStream<TResult>(
  options: UseSeoCommandStreamOptions<TResult>,
): SeoCommandHandle<TResult> {
  const { key, label, finalKind, stages, onComplete } = options;
  const dispatch = useAppDispatch();
  const [run, setRun] = useState<SeoCommandState<TResult>>({ status: "idle" });
  const adoptedRequestId = useRef<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const storageKey = `seo.command.${key}`;

  useEffect(
    () => () => {
      // Stop the client fetch FIRST (the server-side run is durable and keeps
      // going), then reap the row.
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      if (adoptedRequestId.current) {
        dispatch(removeRequest(adoptedRequestId.current));
        adoptedRequestId.current = null;
      }
    },
    [dispatch],
  );

  const consume = useCallback(
    async (launch: (io: SeoCommandLaunchIo) => Promise<ApiCallResult>) => {
      let completed: TResult | null = null;
      let busy = false;
      let failure: string | null = null;

      streamAbortRef.current?.abort();
      if (adoptedRequestId.current) {
        dispatch(removeRequest(adoptedRequestId.current));
        adoptedRequestId.current = null;
      }
      setRun({ status: "running" });
      const controller = new AbortController();
      streamAbortRef.current = controller;

      const consumeStream = dispatch(
        adoptForeignStream({
          abortController: controller,
          onAdopted: ({ requestId }) => {
            adoptedRequestId.current = requestId;
            setRun((current) => ({ ...current, requestId }));
          },
          onEvent: (event) => {
            if (isErrorEvent(event)) {
              failure = describeBackendFailure(parseStreamError(event.data)).headline;
              setRun((current) => ({
                ...current,
                status: "error",
                error: failure ?? undefined,
              }));
              return;
            }
            const data = dataOf(event);
            const kind = typeof data?.kind === "string" ? data.kind : null;
            if (!data || !kind) return;
            if (kind === "seo.command_run" && typeof data.run_id === "string") {
              sessionStorage.setItem(storageKey, data.run_id);
              setRun((current) => ({ ...current, runId: data.run_id as string }));
            }
            if (kind === "seo.run_in_progress") busy = true;
            if (kind === "seo.run_snapshot") {
              if (data.status === "completed" && data.result) {
                completed = data.result as TResult;
              } else if (data.status === "failed") {
                const persisted = parsePersistedBackendError(data.error);
                failure = persisted
                  ? describeBackendFailure(persisted).headline
                  : "This run failed on the server.";
              } else {
                busy = true;
              }
            }
            if (kind === finalKind && data.result && typeof data.result === "object") {
              completed = data.result as TResult;
            }
            const stage = stages?.[kind];
            if (stage) setRun((current) => ({ ...current, stage }));
          },
        }),
      );

      const response = await launch({ consumeStream, signal: controller.signal });
      // Cancelled by teardown or a newer run — settle silently. The run keeps
      // executing server-side and the stored run id keeps rejoin possible.
      if (controller.signal.aborted) return;
      if (response.error) {
        failure = describeBackendFailure(parseCallApiError(response.error)).headline;
      }
      if (completed) {
        sessionStorage.removeItem(storageKey);
        setRun((current) => ({
          ...current,
          status: "done",
          result: completed ?? undefined,
        }));
        await onCompleteRef.current?.(completed);
        return;
      }
      // Still running under another identity/lease: keep the rejoin handle and
      // say so, never claim failure.
      if (busy && !failure) {
        setRun((current) => ({
          ...current,
          status: "running",
          stage:
            "This command is already running — rejoin it in a moment; the result is kept either way.",
        }));
        return;
      }
      sessionStorage.removeItem(storageKey);
      setRun((current) => ({
        ...current,
        status: "error",
        error:
          failure ??
          "The stream ended without a result. The work may still be running on the server — try again to rejoin it.",
      }));
    },
    [dispatch, finalKind, stages, storageKey],
  );

  // A run this tab started before a reload is still running on the server.
  // Rejoin it rather than showing a blank card.
  useEffect(() => {
    const runId = sessionStorage.getItem(storageKey);
    if (!runId) return;
    const timer = window.setTimeout(() => {
      void consume(({ consumeStream, signal }) =>
        dispatch(
          callApi({
            path: "/seo/collections/{run_id}/rejoin",
            method: "POST",
            pathParams: { run_id: runId },
            stream: true,
            consumeStream,
            signal,
          }),
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [consume, dispatch, storageKey]);

  const isActive = run.status === "running";

  useFloatingLiveRun({
    active: isActive,
    instanceId: `seo-command:${key}`,
    requestId: run.requestId ?? null,
    label: run.stage ?? label,
  });

  return { run, isActive, start: consume };
}
