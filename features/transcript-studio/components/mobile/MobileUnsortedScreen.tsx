"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Inbox } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUnsortedRecordings } from "../../redux/selectors";
import { fetchUnsortedRecordingsThunk } from "../../redux/thunks";
import { RecordingCard } from "./RecordingCard";
import { FullTranscriptDrawer } from "./FullTranscriptDrawer";

interface MobileUnsortedScreenProps {
  onBack: () => void;
}

export function MobileUnsortedScreen({ onBack }: MobileUnsortedScreenProps) {
  const dispatch = useAppDispatch();
  const recordings = useAppSelector(selectUnsortedRecordings);
  const [openTranscript, setOpenTranscript] = useState<{
    sessionId: string;
    id: string;
  } | null>(null);

  useEffect(() => {
    void dispatch(fetchUnsortedRecordingsThunk());
  }, [dispatch]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-textured">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 w-full items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to sessions"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Inbox className="h-4 w-4" />
            Unsorted
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing here. Recordings you “Unsort” from a session land in this
              pool; swipe one to restore it to its session.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recordings.map((rec, idx) => (
              <RecordingCard
                key={rec.id}
                sessionId={rec.sessionId}
                recording={rec}
                index={idx}
                variant="unsorted"
                onOpenTranscript={(id) =>
                  setOpenTranscript({ sessionId: rec.sessionId, id })
                }
              />
            ))}
          </div>
        )}
      </div>

      <FullTranscriptDrawer
        sessionId={openTranscript?.sessionId ?? ""}
        recordingSegmentId={openTranscript?.id ?? null}
        onClose={() => setOpenTranscript(null)}
      />
    </div>
  );
}
