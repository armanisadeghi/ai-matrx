"use client";

// features/podcasts/generator/useEpisodeChapters.ts
//
// Generate + persist auto chapter markers for a finished episode. The
// podcast.chapter_marker agent (DB-managed slot, floating — repin from
// /administration/agents/slots) segments the episode script into 3–12 ordered
// chapters; the parsed list is saved under pc_episodes.metadata.chapters via
// podcastService.saveEpisodeChapters. Sibling of useEpisodeArticles — same
// resolveAgentSlot + useRunAgent one-shot pattern.

import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import { resolveAgentSlot } from "@/features/agents/slots/service";
import { extractFirstObject } from "@/utils/json/extract-json";
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
  const { run } = useRunAgent();
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
    try {
      const slot = await resolveAgentSlot(CHAPTER_MARKER_SLOT_KEY);
      const agentText = await run({
        agentId: slot.agentId,
        variables: {
          episode_script: episode.script,
          duration_hint: formatDurationHint(episode.duration_seconds),
          granularity_hint: "",
        },
        configOverrides: slot.configOverrides ?? undefined,
        sourceApp: "matrx-frontend",
        sourceFeature: "podcasts",
      });
      const parsed = extractFirstObject(agentText);
      const list = parseChapters(parsed?.value ?? null);
      if (!list) {
        throw new Error(
          "The chapter agent returned no usable chapter list — try again.",
        );
      }
      const saved = await podcastService.saveEpisodeChapters(episode.id, list);
      setGenerated({ episodeId: episode.id, chapters: saved.chapters ?? list });
      toast.success(`Generated ${list.length} chapters.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast.error(`Chapter generation failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [episode, run]);

  return { chapters, busy, error, generate };
}
