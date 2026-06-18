"use client";

import { useState } from "react";
import { AlignLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import {
  selectCleanedSegmentForRecording,
  selectRawSegmentsForRecording,
  selectRecordingSegments,
} from "../../redux/selectors";
import { cleanRecordingThunk } from "../../redux/thunks";
import { buildTimestampedTranscript } from "../../utils/timecode";

export type TranscriptSection = "raw" | "clean";

interface FullTranscriptDrawerProps {
  sessionId: string;
  recordingSegmentId: string | null;
  onClose: () => void;
  /** Which section to surface first (e.g. swiped "Clean" → clean on top). */
  initialSection?: TranscriptSection;
}

export function FullTranscriptDrawer({
  sessionId,
  recordingSegmentId,
  onClose,
  initialSection = "raw",
}: FullTranscriptDrawerProps) {
  const dispatch = useAppDispatch();
  const recordings = useAppSelector(selectRecordingSegments(sessionId));
  const raws = useAppSelector(
    selectRawSegmentsForRecording(sessionId, recordingSegmentId),
  );
  const cleanSeg = useAppSelector(
    selectCleanedSegmentForRecording(sessionId, recordingSegmentId),
  );
  const [cleaning, setCleaning] = useState(false);

  const index = recordingSegmentId
    ? recordings.findIndex((r) => r.id === recordingSegmentId)
    : -1;
  // Timestamped (`[m:ss] text`) — the single standard for transcript display + copy.
  const rawText = buildTimestampedTranscript(raws, "\n");
  const cleanText = cleanSeg ? buildTimestampedTranscript([cleanSeg]) : "";

  const reclean = async () => {
    if (!recordingSegmentId || cleaning) return;
    setCleaning(true);
    try {
      const res = await dispatch(
        cleanRecordingThunk({
          sessionId,
          recordingSegmentId,
          triggerCause: "manual",
        }),
      ).unwrap();
      if (res.status === "failed") toast.error(res.error);
      else if (res.status === "skipped")
        toast.info("Nothing to clean for this recording yet.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleaning failed");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Drawer
      open={recordingSegmentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className="flex max-h-[88dvh] min-h-[50dvh] flex-col">
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>
            {index >= 0 ? `Recording ${index + 1}` : "Recording"}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Raw */}
          <section style={{ order: initialSection === "clean" ? 2 : 1 }}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Raw transcript
              </h3>
              {rawText && (
                <ContentActionBar
                  content={rawText}
                  metadata={{
                    session_id: sessionId,
                    recording_segment_id: recordingSegmentId ?? "",
                    kind: "raw",
                  }}
                />
              )}
            </div>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
              {rawText || (
                <span className="italic text-muted-foreground">
                  No transcript was captured for this recording.
                </span>
              )}
            </p>
          </section>

          {/* Cleaned */}
          <section style={{ order: initialSection === "clean" ? 1 : 2 }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <AlignLeft className="h-3.5 w-3.5" />
                Cleaned transcript
              </h3>
              <div className="flex items-center gap-1">
                {cleanText && (
                  <ContentActionBar
                    content={cleanText}
                    metadata={{
                      session_id: sessionId,
                      recording_segment_id: recordingSegmentId ?? "",
                      kind: "clean",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={reclean}
                  disabled={cleaning || !rawText}
                  aria-label={
                    cleanText
                      ? "Re-clean this recording"
                      : "Clean this recording"
                  }
                  className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {cleaning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {cleanText ? "Redo" : "Clean"}
                </button>
              </div>
            </div>
            {cleaning && !cleanText ? (
              <p className="flex items-center gap-2 text-base text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cleaning this recording…
              </p>
            ) : (
              <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                {cleanText || (
                  <span className="italic text-muted-foreground">
                    Not cleaned yet. Tap “Clean” to tidy this recording.
                  </span>
                )}
              </p>
            )}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
