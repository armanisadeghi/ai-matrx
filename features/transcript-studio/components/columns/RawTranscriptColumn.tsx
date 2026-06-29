"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileAudio, Mic, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { COLUMN_IDS } from "../../constants";
import type { RawSegment } from "../../types";
import {
  deleteRawSegmentThunk,
  updateRawSegmentTextThunk,
} from "../../redux/thunks";
import { formatTimecode } from "../../utils/timecode";
import { useScrollSyncOptional } from "../scroll-sync/ScrollSyncProvider";
import { AudioImportDialog } from "./AudioImportDialog";
import { ColumnEmptyState } from "./ColumnEmptyState";
import { ColumnHeader } from "./ColumnHeader";
import { EditableTextSegmentRow } from "./EditableTextSegmentRow";
import { PasteRawContentDialog } from "./PasteRawContentDialog";
import { SegmentWrapper } from "./SegmentWrapper";

interface RawTranscriptColumnProps {
  sessionId: string;
  /** True iff this session is the active recording. Drives the live dot. */
  isRecording: boolean;
  className?: string;
}

function summarizeSegments(segs: RawSegment[]): string {
  if (segs.length === 0) return "";
  const lastEnd = segs[segs.length - 1]!.tEnd;
  return `${segs.length} chunk${segs.length === 1 ? "" : "s"} · ${formatTimecode(lastEnd)}`;
}

export function RawTranscriptColumn({
  sessionId,
  isRecording,
  className,
}: RawTranscriptColumnProps) {
  const dispatch = useAppDispatch();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Subscribe to the raw segment ids + the byId map separately so React-Redux
  // sees stable references for both. Materialize the array via `useMemo` —
  // not a `createSelector`, since per-(sessionId) selectors that close over
  // session-specific state interact poorly with subscription resync in
  // React 19's concurrent mode.
  const ids = useAppSelector(
    (state) => state.transcriptStudio.rawIdsBySession[sessionId],
  );
  const byId = useAppSelector(
    (state) => state.transcriptStudio.rawById[sessionId],
  );
  const segments = useMemo<RawSegment[]>(() => {
    if (!ids || !byId) return [];
    const out: RawSegment[] = [];
    for (const id of ids) {
      const seg = byId[id];
      if (seg) out.push(seg);
    }
    return out;
  }, [ids, byId]);
  const status = useMemo(() => summarizeSegments(segments), [segments]);

  const sessionTitle = useAppSelector(
    (state) => state.transcriptStudio.byId[sessionId]?.title,
  );

  const exportText = useMemo(
    () =>
      segments
        .map((seg) => `[${formatTimecode(seg.tStart)}] ${seg.text}`)
        .join("\n\n"),
    [segments],
  );

  const importButton = (
    <button
      type="button"
      onClick={() => setImportOpen(true)}
      title="Import audio from a file, URL, or cloud storage"
      aria-label="Import audio"
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
    >
      <FileAudio className="h-3.5 w-3.5" />
    </button>
  );
  const pasteButton = (
    <button
      type="button"
      onClick={() => setPasteOpen(true)}
      title="Paste in transcript content from another source"
      aria-label="Paste in content"
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
  const headerActions = (
    <>
      {importButton}
      {pasteButton}
      {segments.length > 0 && (
        <ContentActionBar
          content={exportText}
          title={
            sessionTitle
              ? `Raw Transcript — ${sessionTitle}`
              : "Raw Transcript"
          }
          metadata={{
            source: "transcript-studio",
            column: "raw",
            session_id: sessionId,
            session_title: sessionTitle,
          }}
          instanceKey={`studio-raw-${sessionId}`}
          hideSpeaker
          hidePencil
        />
      )}
    </>
  );

  const sync = useScrollSyncOptional();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sync) return undefined;
    sync.registerColumn(COLUMN_IDS.raw, scrollRef.current);
    return () => sync.registerColumn(COLUMN_IDS.raw, null);
  }, [sync]);

  const onPointerLead = sync
    ? () => sync.markLeader(COLUMN_IDS.raw)
    : undefined;

  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        className,
      )}
      aria-label="Raw transcript"
    >
      <ColumnHeader
        icon={Mic}
        label="Raw"
        status={status || undefined}
        dotState={isRecording ? "live" : "idle"}
        actions={headerActions}
      />
      {segments.length === 0 ? (
        <ColumnEmptyState
          icon={Mic}
          title="No audio yet"
          description={
            isRecording
              ? "Speak — chunks land here every ~10 seconds."
              : "Press Record to begin. Each chunk appends below — never overwrites."
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
              column={COLUMN_IDS.raw}
              tStart={seg.tStart}
              tEnd={seg.tEnd}
            >
              <EditableTextSegmentRow
                text={seg.text}
                itemKind="chunk"
                onSave={(text) =>
                  void dispatch(
                    updateRawSegmentTextThunk({
                      sessionId,
                      segmentId: seg.id,
                      text,
                    }),
                  )
                }
                onDelete={() =>
                  void dispatch(
                    deleteRawSegmentThunk({ sessionId, segmentId: seg.id }),
                  )
                }
              >
                <div className="flex items-baseline gap-2 pr-12">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                    {formatTimecode(seg.tStart)}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-words">
                    {seg.text}
                  </span>
                </div>
              </EditableTextSegmentRow>
            </SegmentWrapper>
          ))}
        </div>
      )}
      <PasteRawContentDialog
        sessionId={sessionId}
        open={pasteOpen}
        onOpenChange={setPasteOpen}
      />
      <AudioImportDialog
        sessionId={sessionId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </section>
  );
}
