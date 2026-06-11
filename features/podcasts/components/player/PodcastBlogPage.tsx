"use client";

// features/podcasts/components/player/PodcastBlogPage.tsx
//
// Public, anonymous render of an episode's blog article (pc_articles, kind
// 'blog', status 'published'). Reuses BasicMarkdownContent for the markdown
// body and links back to the episode. SEO/metadata live on the route's
// generateMetadata (article OG type, canonical URL).

import Link from "next/link";
import { ArrowLeft, Headphones } from "lucide-react";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { InlineMediaRef } from "@/features/files";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import type { PcArticle, PcEpisodeWithShow } from "@/features/podcasts/types";

interface PodcastBlogPageProps {
  episode: PcEpisodeWithShow;
  article: PcArticle;
}

export function PodcastBlogPage({ episode, article }: PodcastBlogPageProps) {
  const cover = article.og_image_url ?? episode.image_url ?? null;
  const hosts = (episode.speakers ?? []).map((s) => s.name).join(", ");

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link
        href={`/podcast/${episode.slug ?? episode.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the episode
      </Link>

      {episode.show?.title && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
          {episode.show.title}
        </p>
      )}
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
        {article.title}
      </h1>
      {hosts && (
        <p className="mt-2 text-sm text-muted-foreground">By {hosts}</p>
      )}

      {cover && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          <InlineMediaRef
            ref={podcastMediaRef(cover)}
            size="fill"
            fit="cover"
            alt={article.title}
            className="aspect-[16/9] w-full"
            fallback="skeleton"
          />
        </div>
      )}

      <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
        <BasicMarkdownContent content={article.content_markdown} showCopyButton={false} />
      </div>

      <div className="mt-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Listen to the episode
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {episode.title}
          </p>
        </div>
        <Link
          href={`/podcast/${episode.slug ?? episode.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Headphones className="h-4 w-4" />
          Play
        </Link>
      </div>
    </article>
  );
}
