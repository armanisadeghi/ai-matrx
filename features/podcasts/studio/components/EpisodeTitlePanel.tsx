"use client";

// features/podcasts/studio/components/EpisodeTitlePanel.tsx
//
// Post-run title-optimization panel on the studio run page: run the
// DB-managed podcast.title_optimizer agent slot against the FINISHED
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
import { Check, Loader2, RefreshCw, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { podcastService } from "@/features/podcasts/service";
import { useEpisodeTitleOptions } from "@/features/podcasts/generator/useEpisodeTitleOptions";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

export function EpisodeTitlePanel({
  episodeId,
  onTitleApplied,
}: {
  episodeId: string;
  /** Reflect a title this panel just persisted into the run page's own state,
   *  so the hero above stops showing the superseded one. The agent-driven
   *  `episode_title` write target lands through the SAME
   *  `podcastService.updateEpisode` call and reflects the same way. */
  onTitleApplied?: (title: string) => void;
}) {
  const [episode, setEpisode] = useState<PcEpisodeWithShow | null>(null);
  const { options, currentTitle, busy, applying, generate, apply } =
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

      {hasOptions && (
        <ul className="mt-3 space-y-2">
          {options.map((opt) => {
            const isCurrent = opt.title === currentTitle;
            return (
              <li
                key={opt.title}
                className="flex items-start justify-between gap-2.5 rounded-lg border border-border/60 p-2.5"
              >
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-foreground">
                    {opt.title}
                  </span>
                  {opt.subtitle && (
                    <span className="text-muted-foreground"> — {opt.subtitle}</span>
                  )}
                  {opt.rationale && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {opt.rationale}
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant={isCurrent ? "ghost" : "outline"}
                  className="shrink-0 gap-1"
                  disabled={isCurrent || applying != null}
                  onClick={() =>
                    void apply(opt.title).then(() =>
                      onTitleApplied?.(opt.title),
                    )
                  }
                >
                  {applying === opt.title ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isCurrent ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  {isCurrent ? "Current" : "Use"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
