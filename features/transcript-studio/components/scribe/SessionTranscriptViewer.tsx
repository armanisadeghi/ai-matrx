"use client";

import { useState } from "react";
import { AlignLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import {
  selectRecordingSegments,
  selectSessionCleanedTimestamped,
  selectSessionRawTimestamped,
} from "../../redux/selectors";
import { cleanRecordingThunk } from "../../redux/thunks";

export type SessionTranscriptMode = "raw" | "clean";

interface SessionTranscriptViewerProps {
  sessionId: string;
  mode: SessionTranscriptMode;
  open: boolean;
  onClose: () => void;
  /** Show a refresh control that re-cleans every recording (clean mode only). */
  allowRefresh?: boolean;
}

/**
 * Read-only viewer for a session's full transcript — either the concatenated
 * raw (`all_raw`) or the concatenated recording-aligned clean (`session_cleaned`).
 * Used by the capture record bar (copy only) and the session ⋮ sheet (with the
 * full re-clean refresh).
 */
export function SessionTranscriptViewer({
  sessionId,
  mode,
  open,
  onClose,
  allowRefresh = false,
}: SessionTranscriptViewerProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  // Timestamped (`[m:ss] text`) — the single standard for the transcript display
  // + copy. Plain selectors stay for machine consumers (agent context, RAG).
  const rawText = useAppSelector(selectSessionRawTimestamped(sessionId));
  const cleanText = useAppSelector(selectSessionCleanedTimestamped(sessionId));
  const [refreshing, setRefreshing] = useState(false);

  const isClean = mode === "clean";
  const text = isClean ? cleanText : rawText;
  const title = isClean ? "All clean transcripts" : "All raw transcripts";

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const recordings = selectRecordingSegments(sessionId)(store.getState());
      let failed = 0;
      for (const rec of recordings) {
        const res = await dispatch(
          cleanRecordingThunk({
            sessionId,
            recordingSegmentId: rec.id,
            triggerCause: "manual",
          }),
        ).unwrap();
        if (res.status === "failed") failed += 1;
      }
      if (failed > 0)
        toast.error(`${failed} recording(s) failed to clean. Others updated.`);
      else toast.success("Re-cleaned all recordings.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-clean failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DrawerContent className="flex max-h-[88dvh] min-h-[50dvh] flex-col">
        <DrawerHeader className="flex flex-row items-center justify-between gap-2">
          <DrawerTitle className="flex items-center gap-1.5">
            {isClean && <AlignLeft className="h-4 w-4" />}
            {title}
          </DrawerTitle>
          <div className="flex items-center gap-1">
            {text && (
              <ContentActionBar
                content={text}
                metadata={{ session_id: sessionId, kind: mode }}
              />
            )}
            {isClean && allowRefresh && (
              <button
                type="button"
                onClick={refreshAll}
                disabled={refreshing || !rawText}
                aria-label="Re-clean all recordings"
                className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </button>
            )}
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {refreshing && !text ? (
            <p className="flex items-center gap-2 text-base text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cleaning…
            </p>
          ) : (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
              {text || (
                <span className="italic text-muted-foreground">
                  {isClean
                    ? "Nothing cleaned yet. Record something, then refresh."
                    : "No transcripts captured yet."}
                </span>
              )}
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
