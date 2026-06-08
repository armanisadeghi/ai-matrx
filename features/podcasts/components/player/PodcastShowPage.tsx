"use client";

import React from "react";
import {
  Music,
  Mic,
  Clock,
  ChevronRight,
  Share2,
  Link as LinkIcon,
  Rss,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { PcShow, PcEpisode } from "../../types";
import { useShare } from "../../hooks/useShare";
import { InlineMediaRef } from "@/features/files";

interface PodcastShowPageProps {
  show: PcShow;
  episodes: PcEpisode[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export function PodcastShowPage({ show, episodes }: PodcastShowPageProps) {
  const publishedEpisodes = episodes.filter((e) => e.is_published);
  const coverImage = show.image_url ?? null;
  const { share, copied, fallbackDialog } = useShare();
  const [rssCopied, setRssCopied] = React.useState(false);

  // Built client-side from the live origin so it works on any host
  // (localhost, preview, production) without hardcoding a domain.
  const feedUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/podcast/${show.slug}/feed.xml`
      : `/podcast/${show.slug}/feed.xml`;

  async function copyRss() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setRssCopied(true);
      toast.success("RSS feed URL copied");
      window.setTimeout(() => setRssCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the RSS URL");
    }
  }

  function handleShare() {
    share({
      title: show.title,
      text: show.description ?? `Listen to ${show.title}`,
    });
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* ── Hero — full-width image ───────────────────────────────── */}
      <div
        className="relative shrink-0 overflow-hidden bg-zinc-900"
        style={{ height: coverImage ? "38vh" : "20vh" }}
      >
        {coverImage ? (
          <>
            {/* Blurred backdrop — decorative; the handler keeps the URL durable. */}
            <InlineMediaRef
              ref={coverImage}
              size="fill"
              fit="cover"
              rounded="none"
              fallback={null}
              errorFallback={null}
              className="absolute inset-0 scale-110 blur-2xl opacity-50"
              alt=""
            />
            <InlineMediaRef
              ref={coverImage}
              size="fill"
              fit="cover"
              rounded="none"
              fallbackIcon={<Mic className="h-16 w-16 text-white/20" />}
              errorFallback="icon"
              className="relative z-10"
              alt={show.title}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Mic className="h-16 w-16 text-white/20" />
          </div>
        )}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-zinc-900 via-zinc-900/70 to-transparent pointer-events-none z-20" />

        {/* Info + share row — overlaid on the bottom of the hero */}
        <div className="absolute bottom-0 inset-x-0 z-30 px-4 pb-3 pt-8 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-bold text-xl leading-tight line-clamp-1">
              {show.title}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {show.author && (
                <p className="text-white/60 text-xs truncate">
                  by {show.author}
                </p>
              )}
              <p className="text-white/40 text-xs shrink-0">
                · {publishedEpisodes.length}{" "}
                {publishedEpisodes.length === 1 ? "episode" : "episodes"}
              </p>
            </div>
            {show.description && (
              <p className="text-white/65 text-xs mt-1 line-clamp-2 leading-relaxed">
                {show.description}
              </p>
            )}
          </div>

          {/* Share button */}
          <button
            onClick={handleShare}
            aria-label="Share this show"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white text-xs font-medium border border-white/20"
          >
            {copied ? (
              <>
                <LinkIcon className="h-3.5 w-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Episode list ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {/* Subscribe / RSS — distribution surface for Apple Podcasts & Spotify */}
          <div className="mb-3 rounded-2xl border border-border bg-card p-3.5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Rss className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  Subscribe with any podcast app
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Copy this RSS feed, then submit it to Apple Podcasts or Spotify
                  to publish the show.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    {feedUrl}
                  </code>
                  <button
                    onClick={copyRss}
                    aria-label="Copy RSS feed URL"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    {rssCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy RSS</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {publishedEpisodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 gap-3 text-muted-foreground">
              <Music className="h-12 w-12 opacity-20" />
              <p className="text-sm">No episodes published yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {publishedEpisodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/podcast/${ep.slug}`}
                  className="group flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.98]"
                >
                  <div className="relative shrink-0">
                    <InlineMediaRef
                      ref={(ep.thumbnail_url ?? ep.image_url ?? coverImage) ?? null}
                      size={{ width: 56, height: 56 }}
                      fit="cover"
                      rounded="lg"
                      fallbackIcon={<Music className="h-6 w-6 text-muted-foreground/50" />}
                      className="shadow-sm"
                      alt={ep.title}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    {ep.episode_number != null && (
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Ep {ep.episode_number}
                      </p>
                    )}
                    <p className="font-semibold text-sm text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-1">
                      {ep.title}
                    </p>
                    {ep.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 leading-relaxed">
                        {ep.description}
                      </p>
                    )}
                    {ep.duration_seconds != null && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDuration(ep.duration_seconds)}</span>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      {fallbackDialog}
    </div>
  );
}
