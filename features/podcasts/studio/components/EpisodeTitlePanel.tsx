"use client";

// features/podcasts/studio/components/EpisodeTitlePanel.tsx
//
// Post-run title-optimization panel on the studio run page: run the
// DB-managed podcast.title_optimizer Mandate against the FINISHED
// episode's script, list ranked title options, and apply one onto
// pc_episodes.title. Post-episode only by design — the agent always sees the
// final script, so a chosen title can never drift from the content. Sibling
// of EpisodeChaptersPanel (same self-contained fetch + slot-hook shape).
//
// The run itself is watched in the floating LiveRunWindow the hook opens (the
// agent emits the `episode_title_options` kind, so the option cards stream in
// and each carries its own "Use this title"). This panel is the settled list
// once the run finishes — it never shows a spinner as the whole story, and it
// never grows mid-run, so the episode content below it does not shift.

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import EpisodeTitleOptionsBlock from "@/components/mardown-display/blocks/episode-title-options/EpisodeTitleOptionsBlock";
import { podcastService } from "@/features/podcasts/service";
import { useEpisodeTitleOptions } from "@/features/podcasts/generator/useEpisodeTitleOptions";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

export function EpisodeTitlePanel({
  episodeId,
}: {
  episodeId: string;
  /** Kept for the mount site's API: applying now goes through the
   *  `episode_title` surface write target, whose handler reflects into the run
   *  state itself (`run.applyEpisodeMetadata`), so this callback is no longer
   *  invoked by this panel. */
  onTitleApplied?: (title: string) => void;
}) {
  const [episode, setEpisode] = useState<PcEpisodeWithShow | null>(null);
  const { options, workingTitle, busy, generate } =
    useEpisodeTitleOptions(episode);

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
  const hasOptions = options.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">Title options</span>
        </div>
        <Button
          size="sm"
          variant={hasOptions ? "ghost" : "default"}
          className="gap-1.5"
          disabled={busy || !episode || noScript}
          onClick={() => void generate()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasOptions ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {busy ? "Suggesting…" : hasOptions ? "More options" : "Suggest titles"}
        </Button>
      </div>

      {!hasOptions && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {noScript
            ? "This episode has no stored script, so titles can't be optimized."
            : "SEO and click-through optimized alternatives, grounded in the finished script."}
        </p>
      )}

      {/* 🚨 THE CANONICAL COMPONENT LAW (EpisodeChaptersPanel precedent).
          Settled options ARE an `episode_title_options` payload, so they
          render through that kind's ONE component — the same cards the live
          run window streams. The card's "Use this title" applies through the
          `episode_title` surface write target (PodcastRunWriteTargets →
          run.applyEpisodeMetadata), and the surface's published
          `episode_title_selection` state marks the current title — this panel
          used to hand-roll its own <ul> + Use button beside all of that.
          `hideHeader` because the card above already draws the title row. */}
      {hasOptions && (
        <div className="mt-3">
          <EpisodeTitleOptionsBlock
            hideHeader
            serverData={{
              workingTitle,
              options: options.map(({ title, subtitle, rationale }) => ({
                title,
                subtitle,
                rationale,
                complete: true,
              })),
              isComplete: true,
            }}
          />
        </div>
      )}
    </div>
  );
}
