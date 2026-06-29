"use client";

import { useEffect, useMemo, useRef } from "react";
import { RefreshCw, Stars } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { COLUMN_IDS } from "../../constants";
import { runCleaningPassThunk } from "../../redux/runCleaningPass.thunk";
import {
  deleteCleanedSegmentThunk,
  updateCleanedSegmentTextThunk,
} from "../../redux/thunks";
import type { CleanedSegment } from "../../types";
import {
  buildTimestampedTranscript,
  formatTimecode,
} from "../../utils/timecode";
import { useScrollSyncOptional } from "../scroll-sync/ScrollSyncProvider";
import { ColumnEmptyState } from "./ColumnEmptyState";
import { ColumnHeader } from "./ColumnHeader";
import { EditableTextSegmentRow } from "./EditableTextSegmentRow";
import { SegmentWrapper } from "./SegmentWrapper";

interface CleanedTranscriptColumnProps {
  sessionId: string;
  className?: string;
}

export function CleanedTranscriptColumn({
  sessionId,
  className,
}: CleanedTranscriptColumnProps) {
  // Subscribe to ids + byId separately for stable references — same pattern
  // as RawTranscriptColumn, see Phase 3 docs for why.
  const ids = useAppSelector(
    (state) => state.transcriptStudio.cleanedIdsBySession[sessionId],
  );
  const byId = useAppSelector(
    (state) => state.transcriptStudio.cleanedById[sessionId],
  );
  const segments = useMemo<CleanedSegment[]>(() => {
    if (!ids || !byId) return [];
    const out: CleanedSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (seg) out.push(seg);
    }
    return out;
  }, [ids, byId]);

  // Show "running" while a Column 2 run is in flight (cleanup is racing the
  // user's speaking). Reads from the runs registry rather than wiring a
  // separate slice flag so the source of truth stays auditable.
  const runIds = useAppSelector(
    (state) => state.transcriptStudio.runIdsBySession[sessionId],
  );
  const runsById = useAppSelector(
    (state) => state.transcriptStudio.runsById[sessionId],
  );
  const latestColumnRun = useMemo(() => {
    if (!runIds || !runsById) return null;
    for (let i = runIds.length - 1; i >= 0; i--) {
      const r = runsById[runIds[i]!];
      if (r?.columnIdx === 2) return r;
    }
    return null;
  }, [runIds, runsById]);

  const status = useMemo(() => {
    if (segments.length === 0) return latestColumnRun?.status === "running"
      ? "running…"
      : undefined;
    const lastEnd = segments[segments.length - 1]!.tEnd;
    const passes = segments.length;
    const lastRunStatus = latestColumnRun?.status;
    if (lastRunStatus === "running") return `running · ${passes} pass${passes === 1 ? "" : "es"}`;
    if (lastRunStatus === "failed") return `last run failed · ${passes} pass${passes === 1 ? "" : "es"}`;
    return `${passes} pass${passes === 1 ? "" : "es"} · ${formatTimecode(lastEnd)}`;
  }, [segments, latestColumnRun]);

  const dotState =
    latestColumnRun?.status === "running"
      ? "running"
      : latestColumnRun?.status === "failed"
        ? "error"
        : "idle";

  const sync = useScrollSyncOptional();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sync) return undefined;
    sync.registerColumn(COLUMN_IDS.cleaned, scrollRef.current);
    return () => sync.registerColumn(COLUMN_IDS.cleaned, null);
  }, [sync]);
  const onPointerLead = sync
    ? () => sync.markLeader(COLUMN_IDS.cleaned)
    : undefined;

  const dispatch = useAppDispatch();
  const isRunning = latestColumnRun?.status === "running";
  const handleManualRun = () => {
    if (isRunning) return;
    void dispatch(
      runCleaningPassThunk({ sessionId, triggerCause: "manual" }),
    );
  };
  const manualButton = (
    <button
      type="button"
      onClick={handleManualRun}
      disabled={isRunning}
      title={
        isRunning
          ? "A cleanup pass is already running"
          : "Run a cleanup pass now"
      }
      aria-label="Run cleanup now"
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
        isRunning
          ? "text-muted-foreground/50 cursor-not-allowed"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <RefreshCw
        className={cn("h-3 w-3", isRunning && "animate-spin")}
      />
    </button>
  );

  const sessionTitle = useAppSelector(
    (state) => state.transcriptStudio.byId[sessionId]?.title,
  );

  // Timestamped `[m:ss] text` per segment — matches the raw column's export so
  // copied transcripts carry timecodes everywhere (was plain text).
  const exportText = useMemo(
    () => buildTimestampedTranscript(segments),
    [segments],
  );

  const headerActions = (
    <>
      {manualButton}
      {segments.length > 0 && (
        <ContentActionBar
          content={exportText}
          title={
            sessionTitle
              ? `Cleaned Transcript — ${sessionTitle}`
              : "Cleaned Transcript"
          }
          metadata={{
            source: "transcript-studio",
            column: "cleaned",
            session_id: sessionId,
            session_title: sessionTitle,
            passes: segments.length,
          }}
          instanceKey={`studio-cleaned-${sessionId}`}
          hideSpeaker
          hidePencil
        />
      )}
    </>
  );

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
      aria-label="Cleaned transcript"
    >
      <ColumnHeader
        icon={Stars}
        label="Cleaned"
        status={status}
        dotState={dotState}
        actions={headerActions}
      />
      {segments.length === 0 ? (
        <ColumnEmptyState
          icon={Stars}
          title={
            latestColumnRun?.status === "running"
              ? "Cleaning your audio…"
              : "Cleanup runs every 30s"
          }
          description={
            latestColumnRun?.status === "failed"
              ? "Last cleanup failed. Recording continues; the next tick retries automatically."
              : "An AI agent polishes Column 1's text and lands paragraphs here."
          }
        />
      ) : (
        <div
          ref={scrollRef}
          onWheel={onPointerLead}
          onTouchStart={onPointerLead}
          onPointerDown={onPointerLead}
          className="flex-1 min-h-0 overflow-y-auto py-1.5"
        >
          {segments.map((seg) => (
            <SegmentWrapper
              key={seg.id}
              column={COLUMN_IDS.cleaned}
              tStart={seg.tStart}
              tEnd={seg.tEnd}
            >
              <EditableTextSegmentRow
                text={seg.text}
                itemKind="cleaned pass"
                onSave={(text) =>
                  void dispatch(
                    updateCleanedSegmentTextThunk({
                      sessionId,
                      segmentId: seg.id,
                      text,
                    }),
                  )
                }
                onDelete={() =>
                  void dispatch(
                    deleteCleanedSegmentThunk({
                      sessionId,
                      segmentId: seg.id,
                    }),
                  )
                }
              >
                <div className="flex items-baseline gap-2 pr-12">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                    {formatTimecode(seg.tStart)}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-words leading-snug">
                    {seg.text}
                  </span>
                </div>
              </EditableTextSegmentRow>
            </SegmentWrapper>
          ))}
        </div>
      )}
    </section>
  );
}
