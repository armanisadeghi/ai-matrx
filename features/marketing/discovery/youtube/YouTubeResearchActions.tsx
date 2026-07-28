"use client";

import { useEffect, useState } from "react";
import {
  Brain,
  CheckCircle2,
  LoaderCircle,
  MessageCircleMore,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { toast } from "@/lib/toast";
import {
  enrichYouTubeComments,
  getYouTubeLibraryVideo,
  processYouTubeVideo,
} from "./service";
import type { YouTubeVideoLibraryRecord } from "./types";

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
  const [record, setRecord] = useState<YouTubeVideoLibraryRecord | null>(null);
  const [status, setStatus] = useState(initialStatus ?? "unprocessed");
  const [processing, setProcessing] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (!showAnalysis) return;
    let active = true;
    getYouTubeLibraryVideo(videoId)
      .then((result) => {
        if (!active) return;
        setRecord(result);
        setStatus(result.processing_status ?? "unprocessed");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [showAnalysis, videoId]);

  useEffect(() => {
    if (status !== "processing") return;
    const interval = window.setInterval(() => {
      getYouTubeLibraryVideo(videoId)
        .then((result) => {
          setRecord(result);
          setStatus(result.processing_status ?? "unprocessed");
          if (result.processing_status === "completed") {
            toast.success("YouTube analysis is complete.");
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [status, videoId]);

  const analyze = async (force = false) => {
    setProcessing(true);
    try {
      const result = await processYouTubeVideo(videoId, force);
      if ((result.already_complete ?? []).includes(videoId)) {
        const current = await getYouTubeLibraryVideo(videoId);
        setRecord(current);
        setStatus(current.processing_status ?? "unprocessed");
        toast.success("This video has already been analyzed.");
      } else {
        setStatus("processing");
        toast.success("Video analysis started. You can leave this page.");
      }
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Analysis could not start.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const updated = await enrichYouTubeComments(videoId);
      setRecord(updated);
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
          {isRunning
            ? "Analyzing…"
            : isComplete
              ? "Analysis complete"
              : "Analyze with Gemini"}
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
    <section className="rounded-2xl border border-border bg-muted/20 p-3 dark:border-white/10 dark:bg-white/[0.025]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600 dark:text-red-400">
        Gemini research
      </p>
      <div className="mt-3">
        <KindInstanceRender
          kind="video_transcript_research"
          value={analysis}
          showRoutingNote={false}
        />
      </div>
    </section>
  );
}
