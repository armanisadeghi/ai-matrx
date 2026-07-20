"use client";

// features/flashcards/components/set-detail/AudioOverviewSection.tsx
//
// Phase 7 (Flashcards Competitive Parity Push) — "Generate audio overview"
// action on SetDetailView. Reuses the generic podcast generator
// (usePodcastRun → POST /podcast/generate) rather than the full multi-step
// Studio UI — the source is already known (this set), so there's nothing for
// a picker to pick. Persists ONLY a durable file_id to
// `fc_set.audio_overview_file_id` (never the raw/signed audioUrl — media
// durability doctrine) and plays back via the shared `SessionAudio`.
//
// React Compiler is on: no manual memo.

import { useEffect, useRef, useState } from "react";
import { Volume2, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { usePodcastRun } from "@/features/podcasts/generator/usePodcastRun";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { SessionAudio } from "@/features/education/study/components/SessionAudio";
import { fcService } from "../../data/fcService";
import { buildDeckOverviewRequest } from "../../data/podcastOverview";
import type { FcSetRow, CardWithDetails } from "../../data/types";

export function AudioOverviewSection({
  setId,
  set,
  cards,
  onFileIdChange,
}: {
  setId: string;
  set: FcSetRow;
  cards: CardWithDetails[];
  onFileIdChange: (fileId: string | null) => void;
}) {
  const { state, start, cancel, reset } = usePodcastRun();
  const [persisting, setPersisting] = useState(false);
  // Guards against double-persisting the same completed run — `state.status`
  // stays "done" across re-renders, so a plain effect dep would re-fire the
  // save on every unrelated parent re-render.
  const persistedRef = useRef(false);

  const generating = state.status === "running";

  useEffect(() => {
    if (state.status !== "done" || persistedRef.current) return;
    persistedRef.current = true;
    const fileId =
      state.audioFileId ?? fileIdFromUserFilesUrl(state.audioUrl ?? "");
    if (!fileId) {
      toast.error(
        "Audio generated, but couldn't resolve a durable file reference — try regenerating.",
      );
      return;
    }
    void (async () => {
      setPersisting(true);
      const res = await fcService.updateSetAudioOverview(setId, fileId);
      setPersisting(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onFileIdChange(fileId);
      toast.success("Audio overview ready");
    })();
  }, [state.status, state.audioFileId, state.audioUrl, setId, onFileIdChange]);

  const handleGenerate = () => {
    if (cards.length === 0) {
      toast.error("Add some cards to this set first");
      return;
    }
    persistedRef.current = false;
    const { request, truncated } = buildDeckOverviewRequest(set, cards);
    if (truncated) {
      toast.info(
        "This deck is large — the audio overview covers the first 60 cards.",
      );
    }
    void start(request);
  };

  if (generating) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate">
          {state.currentLabel || "Generating audio overview…"}
        </span>
        <span className="tabular-nums">{state.progress}%</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {state.error ?? "Couldn't generate the audio overview"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => {
            reset();
            handleGenerate();
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (set.audio_overview_file_id) {
    return (
      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SessionAudio
          fileId={set.audio_overview_file_id}
          className="h-8 flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          disabled={persisting}
          onClick={handleGenerate}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={handleGenerate}
    >
      <Volume2 className="h-4 w-4" />
      Generate audio overview
    </Button>
  );
}
