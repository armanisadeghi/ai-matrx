"use client";

// features/podcasts/studio/components/EpisodeChaptersPanel.tsx
//
// Post-run chapter-markers panel on the studio run page: generate ordered
// player/RSS chapters from the finished episode's script via the DB-managed
// podcast.chapter_marker agent slot, persist them on the episode row, and
// list them. Replaces the Chapter markers ComingSoonCard. Self-contained:
// fetches the episode by id and drives useEpisodeChapters (the sibling of
// EpisodeContentStudio / useEpisodeArticles).

import { useEffect, useState } from "react";
import { Bookmark, ListPlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { podcastService } from "@/features/podcasts/service";
import { useEpisodeChapters } from "@/features/podcasts/generator/useEpisodeChapters";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

export function EpisodeChaptersPanel({ episodeId }: { episodeId: string }) {
  const [episode, setEpisode] = useState<PcEpisodeWithShow | null>(null);
  const { chapters, busy, generate } = useEpisodeChapters(episode);

  useEffect(() => {
    let cancelled = false;
    void podcastService.fetchEpisodeById(episodeId).then((ep) => {
      if (!cancelled) setEpisode(ep);
    });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

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

      {hasChapters && (
        <ol className="mt-3 space-y-2">
          {chapters.map((ch, i) => (
            <li key={`${ch.start_hint}-${i}`} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {ch.start_hint || "—"}
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-medium text-foreground">{ch.title}</span>
                {ch.summary && (
                  <span className="text-muted-foreground"> — {ch.summary}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
