"use client";

// features/education/media/audio/useAudioStudyRunPersistence.ts
//
// THE one place a live podcast run's outcome is written back onto its
// `study_media` artifact row: ready + episode + durable audio file_id when it
// lands, `error` when it fails, back to `generating` the moment a retry starts
// streaming. Extracted from `AudioStudyDetail`'s LiveAudioRun so a SECOND
// surface can host the same run (the study-kit board on /education/start
// streams the audio it just created instead of leaving a spinner that never
// resolves) without forking the persistence rules — a fork here is how a run
// ends up finished on one screen and "generating" forever on another.

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { studyMediaService } from "../service";
import type { StudyMediaRow } from "../types";

export interface AudioRunSnapshot {
  status: string;
  audioFileId?: string | null;
  audioUrl?: string | null;
  episodeId?: string | null;
  title?: string | null;
}

export function useAudioStudyRunPersistence(opts: {
  media: StudyMediaRow;
  /** The live run state (`useStudioRun().state` / `usePodcastRun().state`). */
  state: AudioRunSnapshot;
  /** True while the client is actively streaming this run. */
  streaming: boolean;
  /** Fires once with the saved row when the audio is durably persisted. */
  onReady?: (updated: StudyMediaRow) => void;
  /** Announce success with a toast (the detail page does; the kit board owns its own copy). */
  announce?: boolean;
}): void {
  const { media, state, streaming, onReady, announce = true } = opts;
  const persistedRef = useRef(false);

  // Persist the finished episode onto the artifact row — once.
  useEffect(() => {
    if (state.status !== "done" || persistedRef.current) return;
    const fileId =
      state.audioFileId ?? fileIdFromUserFilesUrl(state.audioUrl ?? "");
    // A durable anchor is either the re-mintable file_id (live path) OR the
    // produced episode (recovery path — no live file_id was ever captured).
    if (!fileId && !state.episodeId) return;
    persistedRef.current = true;
    void (async () => {
      const res = await studyMediaService.update(media.id, {
        status: "ready",
        episode_id: state.episodeId ?? null,
        audio_file_id: fileId,
        title: state.title || media.title,
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "Couldn't save the finished audio");
        return;
      }
      if (announce) toast.success("Audio study ready");
      onReady?.(res.data);
    })();
  }, [
    state.status,
    state.audioFileId,
    state.audioUrl,
    state.episodeId,
    state.title,
    media.id,
    media.title,
    onReady,
    announce,
  ]);

  // Mark the artifact errored so the library reflects it (best-effort).
  useEffect(() => {
    if (state.status === "error" && media.status !== "error") {
      void studyMediaService.update(media.id, { status: "error" });
    }
  }, [state.status, media.id, media.status]);

  // ...and put it BACK to generating the moment a retry starts streaming, so a
  // library row can never show "Failed" while audio is actively being produced.
  useEffect(() => {
    if (media.status !== "error") return;
    if (streaming || state.status === "running") {
      void studyMediaService.update(media.id, { status: "generating" });
    }
  }, [streaming, state.status, media.id, media.status]);
}
