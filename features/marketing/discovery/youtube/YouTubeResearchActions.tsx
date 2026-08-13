"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  LoaderCircle,
  MessageCircleMore,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { useAppDispatch } from "@/lib/redux/hooks";
import { removeRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import { toast } from "@/lib/toast";
import {
  enrichYouTubeComments,
  getYouTubeLibraryVideo,
  streamYouTubeVideoAnalysis,
} from "./service";
import type { YouTubeVideoLibraryRecord } from "./types";

const ANALYSIS_PHASE_LABELS: Record<string, string> = {
  connected: "Connected. Preparing the video…",
  processing: "Preparing the video and saved metadata…",
  analyzing:
    "Watching the video, building the transcript, and checking its claims…",
  complete: "Analysis complete. Loading the structured research…",
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function YouTubeResearchActions({
  videoId,
  initialStatus = "unprocessed",
  showAnalysis = true,
}: {
  videoId: string;
  initialStatus?: string | null;
  showAnalysis?: boolean;
}) {
  const dispatch = useAppDispatch();
  const openLiveRunWindow = useOpenLiveRunWindow();
  /** True once this run's stream was adopted — see the catch branch in analyze. */
  const adoptedRef = useRef(false);
  /** The adopted `activeRequests` row this component owns, so it can reap it. */
  const adoptedRequestIdRef = useRef<string | null>(null);
  /** The in-flight stream's abort controller — the SAME object the fetch and
   * the adopter watchdog share. Aborted on unmount and before a new run so an
   * orphaned stream never keeps draining into a reaped row (events on a
   * missing row are silently dropped — the disappearing-run class; see
   * features/agents/docs/LIVE_RUN_RETENTION.md seam #3). */
  const streamAbortRef = useRef<AbortController | null>(null);
  const [record, setRecord] = useState<YouTubeVideoLibraryRecord | null>(null);
  const [status, setStatus] = useState(initialStatus ?? "unprocessed");
  const [processing, setProcessing] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(
    () => () => {
      // Stop the client fetch FIRST (the analysis keeps running server-side
      // and the polling/saved record recovers it), then reap the adopted row.
      // The reap defers while the floating run window still renders it
      // (viewer retention) and completes when the window closes.
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      if (adoptedRequestIdRef.current) {
        dispatch(removeRequest(adoptedRequestIdRef.current));
        adoptedRequestIdRef.current = null;
      }
    },
    [dispatch],
  );

  useEffect(() => {
    if (!showAnalysis) return;
    let active = true;
    getYouTubeLibraryVideo(videoId)
      .then((result) => {
        if (!active) return;
        setRecord(result);
        setStatus(result.processing_status ?? "unprocessed");
        setActionError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setActionError(
          caught instanceof Error
            ? caught.message
            : "The saved analysis could not be loaded.",
        );
      });
    return () => {
      active = false;
    };
  }, [showAnalysis, videoId]);

  useEffect(() => {
    if (status !== "processing" || processing) return;
    const interval = window.setInterval(() => {
      getYouTubeLibraryVideo(videoId)
        .then((result) => {
          setRecord(result);
          setStatus(result.processing_status ?? "unprocessed");
          setActionError(null);
          if (result.processing_status === "completed") {
            setProgressMessage(null);
            toast.success("YouTube analysis is complete.");
          }
        })
        .catch((caught: unknown) => {
          setActionError(
            caught instanceof Error
              ? caught.message
              : "Live analysis status is temporarily unavailable.",
          );
        });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [processing, status, videoId]);

  const analyze = async (force = false) => {
    setProcessing(true);
    setStatus("processing");
    setProgressMessage("Connecting to the live analysis…");
    setActionError(null);
    // THE FLOATING LAW: watching the video, transcribing it and checking its
    // claims is minutes of AI work. It streams into the floating window (one
    // per video, so re-running rebinds instead of stacking) — the page itself
    // never shifts, and the stage line below stays as the summary.
    const runWindow = openLiveRunWindow({
      instanceId: `youtube-analysis-${videoId}`,
      label: "Analyzing this video",
      pending: true,
    });
    // Abort the previous run's stream BEFORE reaping its row — otherwise the
    // orphaned fetch keeps draining into a missing row and the response body
    // leaks for the run's lifetime.
    streamAbortRef.current?.abort();
    if (adoptedRequestIdRef.current) {
      dispatch(removeRequest(adoptedRequestIdRef.current));
      adoptedRequestIdRef.current = null;
    }
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    adoptedRef.current = false;
    try {
      await streamYouTubeVideoAnalysis(dispatch, videoId, force, {
        signal: abortController.signal,
        abortController,
        onAdopted: ({ requestId }) => {
          adoptedRef.current = true;
          adoptedRequestIdRef.current = requestId;
          runWindow.update({ requestId, pending: false });
        },
        onEvent: (event) => {
          if (event.event === "phase") {
            setProgressMessage(
              ANALYSIS_PHASE_LABELS[event.data.phase] ?? event.data.phase,
            );
            return;
          }
          if (event.event === "info") {
            setProgressMessage(
              event.data.user_message ??
                event.data.system_message ??
                "Analysis is progressing…",
            );
            return;
          }
          if (event.event === "data") {
            const data = objectValue(event.data);
            if (data?.type === "youtube_analysis_active") {
              setProgressMessage(
                typeof data.message === "string"
                  ? data.message
                  : "Analysis is already running and will update here.",
              );
            }
            if (data?.type === "youtube_analysis_complete") {
              setProgressMessage("Analysis complete. Rendering the research…");
            }
            return;
          }
          if (event.event === "error") {
            setActionError(
              event.data.user_message ??
                event.data.message ??
                "Analysis could not be completed.",
            );
          }
        },
      });
      const current = await getYouTubeLibraryVideo(videoId);
      setRecord(current);
      setStatus(current.processing_status ?? "unprocessed");
      if (current.processing_status === "completed") {
        setProgressMessage(null);
        toast.success("Analysis is complete.");
      } else if (current.processing_status === "processing") {
        setProgressMessage(
          "Analysis is continuing. This saved record will update automatically.",
        );
      } else {
        setProgressMessage(null);
        setActionError(
          current.processing_error ?? "Analysis did not complete successfully.",
        );
      }
    } catch (caught) {
      // Cancelled by teardown or a newer run — settle silently; the analysis
      // keeps running server-side and the saved record picks it up.
      if (abortController.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : "Analysis could not start.";
      // Never strand an empty "pending" window on a run that never began. Once
      // the stream was adopted the window owns real output — leave it up.
      if (!adoptedRef.current) runWindow.close();
      setActionError(message);
      try {
        const current = await getYouTubeLibraryVideo(videoId);
        setRecord(current);
        setStatus(current.processing_status ?? "unprocessed");
        if (current.processing_status === "processing") {
          setProgressMessage(
            "The live connection ended, but saved processing is continuing.",
          );
        }
      } catch {
        setStatus("failed");
        setProgressMessage(null);
      }
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    setActionError(null);
    try {
      const updated = await enrichYouTubeComments(videoId);
      setRecord(updated);
      setActionError(null);
      toast.success("YouTube comments were added to the video record.");
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Comments could not be loaded.",
      );
    } finally {
      setLoadingComments(false);
    }
  };

  const isComplete = status === "completed";
  const isRunning = status === "processing";

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void analyze(false)}
          disabled={processing || isRunning}
          className="rounded-xl bg-red-500 text-white hover:bg-red-400"
        >
          {processing || isRunning ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : isComplete ? (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          ) : (
            <Brain className="mr-2 h-4 w-4" />
          )}
          {isRunning ? "Analyzing…" : isComplete ? "Analyzed" : "Analyze"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadComments()}
          disabled={loadingComments}
          className="rounded-xl"
        >
          {loadingComments ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircleMore className="mr-2 h-4 w-4" />
          )}
          Enrich comments
        </Button>
        {(status === "failed" || status === "partial") && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void analyze(true)}
            disabled={processing}
            className="rounded-xl"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </div>
      {isRunning && (
        <div
          role="status"
          aria-live="polite"
          className="overflow-hidden rounded-xl border border-red-500/20 bg-red-500/[0.045] px-3 py-2.5"
        >
          <div className="flex items-center gap-2 text-xs text-foreground/80">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span>{progressMessage ?? "Analysis is progressing…"}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-red-500/10">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-red-500/70" />
          </div>
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {actionError}
        </p>
      )}
      {showAnalysis && record && <YouTubeAnalysis record={record} />}
    </div>
  );
}

function YouTubeAnalysis({ record }: { record: YouTubeVideoLibraryRecord }) {
  const analysis = objectValue(record.analysis_data);
  if (!analysis && !record.analysis_text && !record.processing_error)
    return null;

  if (!analysis) {
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
        <h2 className="font-semibold">Unstructured analysis fallback</h2>
        {record.processing_error && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {record.processing_error}
          </p>
        )}
        {record.analysis_text && (
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
            {record.analysis_text}
          </pre>
        )}
      </section>
    );
  }

  return (
    <KindInstanceRender
      kind="video_transcript_research"
      value={analysis}
      showRoutingNote={false}
    />
  );
}
