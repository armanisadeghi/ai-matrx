"use client";

// features/podcasts/components/player/PodcastBlogPage.tsx
//
// Public, anonymous render of an episode's blog article (pc_articles, kind
// 'blog', status 'published'). Reuses BasicMarkdownContent for the markdown
// body and links back to the episode. SEO/metadata live on the route's
// generateMetadata (article OG type, canonical URL).
//
// Layout is deliberately balanced rather than a wall of text: a hero cover, an
// audio player embedded at the article's midpoint (so a reader can listen
// while they read — no bottom-of-page hunt for a link), and — lower down — the
// episode's official video (a montage of the run's generated stills + clips)
// as a second visual anchor. Every media element uses only what the episode
// already exposes publicly; the extra generated images live on the internal
// studio run and are not anonymously readable.

import Link from "next/link";
import { ArrowLeft, ArrowRight, Headphones } from "lucide-react";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { splitMarkdownForEmbed } from "@/features/podcasts/blogLayout";
import type { PcArticle, PcEpisodeWithShow } from "@/features/podcasts/types";

interface PodcastBlogPageProps {
  episode: PcEpisodeWithShow;
  article: PcArticle;
}

export function PodcastBlogPage({ episode, article }: PodcastBlogPageProps) {
  const cover = article.og_image_url ?? episode.image_url ?? null;
  const hosts = (episode.speakers ?? []).map((s) => s.name).join(", ");
  const episodeHref = `/podcast/${episode.slug ?? episode.id}`;

  // Split the body so the player sits at the article's midpoint. On a short
  // article `after` is empty and the player simply follows the body.
  const { before, after } = splitMarkdownForEmbed(article.content_markdown);
  const hasVideo = Boolean(episode.video_url);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link
        href={episodeHref}
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

      {/* First half of the body (or the whole body on a short article). */}
      <div className="prose prose-neutral mt-8 max-w-none dark:prose-invert">
        <BasicMarkdownContent content={before} showCopyButton={false} />
      </div>

      {/* Embedded player — the article's midpoint. Reads "listen while you
          read" rather than a link buried at the very bottom. */}
      <section className="my-10 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Headphones className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Prefer to listen?
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {episode.title}
            </p>
          </div>
        </div>
        <PodcastAudioPlayer
          audioUrl={episode.audio_url}
          title={episode.title}
          coverImageUrl={cover ?? undefined}
        />
      </section>

      {/* Second half of the body (empty on a short article). */}
      {after && (
        <div className="prose prose-neutral max-w-none dark:prose-invert">
          <BasicMarkdownContent content={after} showCopyButton={false} />
        </div>
      )}

      {/* Lower visual anchor — the episode's official video (a montage of the
          run's generated stills + clips). Only when one exists; never a
          repeat of the hero cover. */}
      {hasVideo && episode.video_url && (
        <figure className="mt-10">
          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            <InlineMediaRef
              ref={podcastMediaRef(episode.video_url)}
              as="video"
              size="fill"
              fit="contain"
              controls
              preload="metadata"
              alt={`${article.title} — episode video`}
              className="aspect-video w-full"
              fallback="skeleton"
            />
          </div>
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">
            Watch the episode highlights
          </figcaption>
        </figure>
      )}

      {/* Slim footer — the player is embedded above, so this is a quiet nudge
          to the full episode page (video/other formats, share, show notes). */}
      <div className="mt-10 border-t border-border pt-5">
        <Link
          href={episodeHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Open the full episode
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
