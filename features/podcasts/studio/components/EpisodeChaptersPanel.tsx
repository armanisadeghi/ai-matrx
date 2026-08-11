"use client";

// features/podcasts/studio/components/EpisodeChaptersPanel.tsx
//
// Post-run chapter-markers panel on the studio run page: generate ordered
// player/RSS chapters from the finished episode's script via the DB-managed
// podcast.chapter_marker agent slot, persist them on the episode row, and
// list them. Replaces the Chapter markers ComingSoonCard. Self-contained:
// fetches the episode by id and drives useEpisodeChapters (the sibling of
// EpisodeContentStudio / useEpisodeArticles).
//
// Also the owner of the `episode_chapters` write target on
// `matrx-user/podcast-run` — it holds the episode row, the current chapter
// list, and the canonical save, so the handler lives here rather than being
// threaded up to the run view (see PodcastRunWriteTargets for the other two).

import { useCallback, useEffect, useState } from "react";
import { Bookmark, ListPlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import MediaChaptersBlock from "@/components/mardown-display/blocks/media-chapters/MediaChaptersBlock";
import { podcastService } from "@/features/podcasts/service";
import { useEpisodeChapters } from "@/features/podcasts/generator/useEpisodeChapters";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  PODCAST_RUN_SURFACE_NAME,
  asRecord,
} from "@/features/podcasts/studio/components/PodcastRunWriteTargets";
import type {
  PcEpisodeChapter,
  PcEpisodeWithShow,
} from "@/features/podcasts/types";

const MAX_CHAPTERS = 24;
const MAX_CHAPTER_TITLE_CHARS = 120;
const MAX_CHAPTER_SUMMARY_CHARS = 300;
/** MM:SS or HH:MM:SS — the shape the chapter agent emits and the player reads. */
const START_HINT_RE = /^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/;

/** Wire value for the `episode_chapters` target. Replaces the whole list. */
export interface EpisodeChaptersWrite {
  chapters: PcEpisodeChapter[];
}

/**
 * Validate an agent-supplied chapter list into the exact `PcEpisodeChapter`
 * shape `parseChapters` reads back. Throws on anything off-contract — a wrong
 * value is the agent's error to hear about, never something to coerce.
 */
export function parseChaptersWrite(value: unknown): PcEpisodeChapter[] {
  const obj = asRecord(value, "episode_chapters");
  const raw = obj.chapters;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "episode_chapters: chapters must be a non-empty array of { start_hint, title, summary }.",
    );
  }
  if (raw.length > MAX_CHAPTERS) {
    throw new Error(
      `episode_chapters: at most ${MAX_CHAPTERS} chapters (got ${raw.length}).`,
    );
  }
  return raw.map((entry, index): PcEpisodeChapter => {
    const record = asRecord(entry, `episode_chapters: chapters[${index}]`);
    const title = record.title;
    if (typeof title !== "string" || !title.trim()) {
      throw new Error(
        `episode_chapters: chapters[${index}].title must be a non-empty string.`,
      );
    }
    if (title.trim().length > MAX_CHAPTER_TITLE_CHARS) {
      throw new Error(
        `episode_chapters: chapters[${index}].title must be ${MAX_CHAPTER_TITLE_CHARS} characters or fewer.`,
      );
    }
    const startHint = record.start_hint;
    if (typeof startHint !== "string" || !START_HINT_RE.test(startHint.trim())) {
      throw new Error(
        `episode_chapters: chapters[${index}].start_hint must be a MM:SS or HH:MM:SS timestamp — reuse the one already on this chapter.`,
      );
    }
    const summaryRaw = record.summary;
    if (summaryRaw !== undefined && typeof summaryRaw !== "string") {
      throw new Error(
        `episode_chapters: chapters[${index}].summary must be a string when provided.`,
      );
    }
    const summary = (summaryRaw ?? "").trim();
    if (summary.length > MAX_CHAPTER_SUMMARY_CHARS) {
      throw new Error(
        `episode_chapters: chapters[${index}].summary must be ${MAX_CHAPTER_SUMMARY_CHARS} characters or fewer.`,
      );
    }
    return { start_hint: startHint.trim(), title: title.trim(), summary };
  });
}

export function EpisodeChaptersPanel({
  episodeId,
  onChaptersChange,
}: {
  episodeId: string;
  /** Lifts the loaded/saved chapter list so the run view can emit it as the
   *  `episode_chapters` READ TWIN of the write target below. */
  onChaptersChange?: (chapters: PcEpisodeChapter[] | null) => void;
}) {
  const [episode, setEpisode] = useState<PcEpisodeWithShow | null>(null);
  const [written, setWritten] = useState<PcEpisodeChapter[] | null>(null);
  const { chapters: liveChapters, busy, generate } = useEpisodeChapters(episode);
  const chapters = written ?? liveChapters;

  useEffect(() => {
    let cancelled = false;
    void podcastService.fetchEpisodeById(episodeId).then((ep) => {
      if (!cancelled) setEpisode(ep);
    });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  // A different episode invalidates anything this panel wrote for the last one.
  useEffect(() => setWritten(null), [episodeId]);

  useEffect(() => {
    onChaptersChange?.(chapters ?? null);
  }, [chapters, onChaptersChange]);

  const applyChapters = useCallback(
    async (value: unknown) => {
      const next = parseChaptersWrite(value);
      if (!episode) {
        throw new Error(
          "episode_chapters: this episode hasn't loaded yet — try again in a moment.",
        );
      }
      if (busy) {
        throw new Error(
          "episode_chapters: the chapter agent is generating a new set right now and would overwrite this. Wait for it to finish.",
        );
      }
      const saved = await podcastService.saveEpisodeChapters(episode.id, next);
      setWritten(saved.chapters ?? next);
      toast.success(`Chapter markers updated (${next.length}).`);
    },
    [episode, busy],
  );

  useSurfaceWriteHandlers(PODCAST_RUN_SURFACE_NAME, {
    episode_chapters: applyChapters,
  });

  const noScript = episode != null && !episode.script?.trim();
  const hasChapters = !!chapters?.length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">Chapter markers</span>
        </div>
        <Button
          size="sm"
          variant={hasChapters ? "ghost" : "default"}
          className="gap-1.5"
          disabled={busy || !episode || noScript}
          onClick={() => void generate()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasChapters ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <ListPlus className="h-3.5 w-3.5" />
          )}
          {busy ? "Generating…" : hasChapters ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {!hasChapters && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {noScript
            ? "This episode has no stored script, so chapters can't be generated."
            : "Auto-generated timestamps that let listeners jump to each topic."}
        </p>
      )}

      {/* 🚨 THE CANONICAL COMPONENT LAW. Saved chapters ARE a `media_chapters`
          payload, so they render through that kind's ONE component — the same
          one the live run window streams into. This panel used to hand-roll
          its own <ol>, which is exactly the duplicate that drifts. `hideHeader`
          because the card above already draws the title row. */}
      {hasChapters && (
        <MediaChaptersBlock
          className="mt-3"
          hideHeader
          serverData={{ chapters, isComplete: true }}
        />
      )}
    </div>
  );
}
