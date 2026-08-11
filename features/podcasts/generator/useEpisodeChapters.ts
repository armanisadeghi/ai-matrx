"use client";

// features/podcasts/generator/useEpisodeChapters.ts
//
// Generate + persist auto chapter markers for a finished episode. The
// podcast.chapter_marker agent (DB-managed slot, floating — repin from
// /administration/agents/slots) segments the episode script into 3–12 ordered
// chapters and emits them as the `media_chapters` content-IR kind; the parsed
// list is saved under pc_episodes.metadata.chapters via
// podcastService.saveEpisodeChapters.
//
// 🚨 THE FLOATING LAW (features/window-panels/FEATURE.md). This run STREAMS
// into the floating LiveRunWindow — it never shows a spinner and never puts a
// live block above the page's own content. The agent's `__kind` envelope means
// the window renders MediaChaptersBlock, so chapters appear one at a time as
// the model writes them, in the same component that renders them after the
// save. The window is the DEFAULT posture here deliberately: the chapters
// panel sits mid-page beside other cards, so an inline block would shift
// everything under it the moment the user clicked Generate.
//
// `useLiveAgentRun` (NOT `useRunAgent`) is what makes any of that possible —
// useRunAgent produces no requestId at all, so live rendering is structurally
// impossible from it (docs/handoffs/live-stream-everywhere.md).

import { useCallback, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { useOpenLiveRunWindow } from "@/features/overlays/openers/liveRunWindow";
import type { LiveRunWindowHandle } from "@/features/overlays/openers/liveRunWindow";
import { podcastService } from "@/features/podcasts/service";
import { parseChapters } from "@/features/podcasts/types";
import type { PcEpisode, PcEpisodeChapter } from "@/features/podcasts/types";

const CHAPTER_MARKER_SLOT_KEY = "podcast.chapter_marker";

/** `duration_hint` for the agent: HH:MM:SS / MM:SS from the stored runtime. */
function formatDurationHint(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface UseEpisodeChapters {
  /** Persisted chapters (loaded from the episode row + after save). */
  chapters: PcEpisodeChapter[] | null;
  busy: boolean;
  error: string | null;
  /** Run the chapter agent against the episode script and save the result. */
  generate: () => Promise<void>;
}

export function useEpisodeChapters(
  episode: Pick<
    PcEpisode,
    "id" | "script" | "duration_seconds" | "chapters"
  > | null,
): UseEpisodeChapters {
  const { run } = useLiveAgentRun();
  const openLiveRunWindow = useOpenLiveRunWindow();
  const windowRef = useRef<LiveRunWindowHandle | null>(null);
  // This-session generation result, keyed by episode so a stale result can
  // never leak across episodes; persisted chapters come off the episode row.
  const [generated, setGenerated] = useState<{
    episodeId: string;
    chapters: PcEpisodeChapter[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chapters =
    (generated && generated.episodeId === episode?.id
      ? generated.chapters
      : null) ??
    episode?.chapters ??
    null;

  const generate = useCallback(async () => {
    if (!episode || !episode.script?.trim()) {
      toast.error("This episode has no script to segment.");
      return;
    }
    setBusy(true);
    setError(null);
    // Open BEFORE the launch so the user sees the run start; the conversation
    // id lands a moment later via onConversationCreated. One window per
    // episode — regenerating reuses it instead of stacking a second.
    windowRef.current = openLiveRunWindow({
      instanceId: `episode-chapters:${episode.id}`,
      label: "Marking chapters",
      pending: true,
    });
    try {
      const list = await run<PcEpisodeChapter[]>({
        slotKey: CHAPTER_MARKER_SLOT_KEY,
        surfaceKey: "podcast-episode-chapters",
        sourceFeature: "podcasts",
        variables: {
          episode_script: episode.script,
          duration_hint: formatDurationHint(episode.duration_seconds),
          granularity_hint: "",
        },
        onConversationCreated: (conversationId) => {
          windowRef.current?.update({ conversationId, pending: false });
        },
        // parseChapters is the SAME reader the persistence side uses
        // (mapPcEpisodeRow), so what the window streamed and what reloads
        // off the episode row can never disagree.
        coerce: (value) => {
          const parsed = parseChapters(value);
          if (!parsed) {
            throw new Error(
              "The chapter agent returned no usable chapter list — try again.",
            );
          }
          return parsed;
        },
      });
      const saved = await podcastService.saveEpisodeChapters(episode.id, list);
      setGenerated({ episodeId: episode.id, chapters: saved.chapters ?? list });
      toast.success(`Generated ${list.length} chapters.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast.error(`Chapter generation failed: ${message}`);
      // The window deliberately STAYS OPEN on failure: it holds the partial
      // stream and the error, which is the only place the user can see what
      // actually went wrong.
    } finally {
      setBusy(false);
    }
  }, [episode, run, openLiveRunWindow]);

  return { chapters, busy, error, generate };
}
