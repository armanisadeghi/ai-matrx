"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import {
  selectRawSegmentsForRecording,
  selectRecordingSegments,
} from "../../redux/selectors";

interface FullTranscriptDrawerProps {
  sessionId: string;
  recordingSegmentId: string | null;
  onClose: () => void;
}

export function FullTranscriptDrawer({
  sessionId,
  recordingSegmentId,
  onClose,
}: FullTranscriptDrawerProps) {
  const recordings = useAppSelector(selectRecordingSegments(sessionId));
  const raws = useAppSelector(
    selectRawSegmentsForRecording(sessionId, recordingSegmentId),
  );

  const index = recordingSegmentId
    ? recordings.findIndex((r) => r.id === recordingSegmentId)
    : -1;
  const text = raws.map((r) => r.text).join(" ").trim();

  return (
    <Drawer
      open={recordingSegmentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>
            {index >= 0 ? `Recording ${index + 1}` : "Recording"}
          </DrawerTitle>
          {text && (
            <ContentActionBar
              content={text}
              metadata={{
                session_id: sessionId,
                recording_segment_id: recordingSegmentId ?? "",
              }}
            />
          )}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
            {text || (
              <span className="italic text-muted-foreground">
                No transcript was captured for this recording.
              </span>
            )}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
