"use client";

// features/podcasts/studio/components/EpisodeContentStudio.tsx
//
// Post-run companion-content panel on the studio run page: generate a blog
// post and show notes from the finished episode's script (via the built
// podcast_blog_writer / podcast_show_notes_generator agents), stream the
// markdown live, then publish/unpublish. Replaces the ComingSoon blog/show-
// notes cards. Self-contained: fetches the episode by id and drives
// useEpisodeArticles.

import { useEffect, useState } from "react";
import {
  BookOpen,
  ListChecks,
  Loader2,
  Sparkles,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  GitCompareArrows,
} from "lucide-react";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import { podcastService } from "@/features/podcasts/service";
import { useEpisodeArticles } from "@/features/podcasts/generator/useEpisodeArticles";
import type {
  PcArticleKind,
  PcEpisodeWithShow,
} from "@/features/podcasts/types";

const KINDS: {
  kind: PcArticleKind;
  label: string;
  icon: typeof BookOpen;
  blurb: string;
}[] = [
  {
    kind: "blog",
    label: "Blog post",
    icon: BookOpen,
    blurb: "A polished, shareable SEO article written from this episode.",
  },
  {
    kind: "show_notes",
    label: "Show notes",
    icon: ListChecks,
    blurb: "Key takeaways, topics, and links — rendered on the episode page.",
  },
];

export function EpisodeContentStudio({ episodeId }: { episodeId: string }) {
  const [episode, setEpisode] = useState<PcEpisodeWithShow | null>(null);
  const { articles, drafts, busy, generate, togglePublish } =
    useEpisodeArticles(episode);
  const openDiff = useOpenDiffViewerWindow();

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

  return (
    <div className="space-y-4">
      {KINDS.map(({ kind, label, icon: Icon, blurb }) => {
        const article = articles[kind];
        const draft = drafts[kind];
        const isBusy = !!busy[kind];
        const published = article?.status === "published";
        const blogSlug = kind === "blog" ? article?.slug : null;

        return (
          <div
            key={kind}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  {article && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        published
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {published ? "Published" : "Draft"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {article &&
                  draft != null &&
                  !isBusy &&
                  draft !== article.content_markdown && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openDiff({
                          original: article.content_markdown ?? "",
                          modified: draft,
                          originalLabel: "Saved",
                          modifiedLabel: "Regenerated",
                          title: `${label} — compare`,
                          engine: "light",
                          language: "markdown",
                          defaultView: "highlight",
                        })
                      }
                      className="gap-1.5"
                    >
                      <GitCompareArrows className="h-3.5 w-3.5" />
                      Compare
                    </Button>
                  )}
                {article && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePublish(kind)}
                    className="gap-1.5"
                  >
                    {published ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {published ? "Unpublish" : "Publish"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={article ? "outline" : "default"}
                  onClick={() => generate(kind)}
                  disabled={isBusy || noScript}
                  className="gap-1.5"
                  title={noScript ? "This episode has no script to write from." : undefined}
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : article ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {isBusy ? "Writing…" : article ? "Regenerate" : "Generate"}
                </Button>
              </div>
            </div>

            {/* Live draft while generating, or the saved article preview. */}
            {(draft != null || article) && (
              <div className="border-t border-border px-4 py-3">
                <div className="prose prose-sm prose-neutral max-h-80 max-w-none overflow-y-auto dark:prose-invert">
                  <MarkdownStream
                    content={draft ?? article?.content_markdown ?? ""}
                    isStreamActive={isBusy}
                  />
                </div>
                {published && blogSlug && (
                  <Link
                    href={`/podcast/${episode?.slug ?? episodeId}/blog`}
                    target="_blank"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View published article
                  </Link>
                )}
              </div>
            )}

            {noScript && !article && (
              <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                This episode has no saved script — companion content needs the
                generated dialogue. Re-run a generation to enable it.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
