"use client";

import Link from "next/link";
import { Mic, Settings2 } from "lucide-react";
import type { PcShow } from "@/features/podcasts/types";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";

interface PodcastGridProps {
  shows: PcShow[];
  /** Owner view: adds a Manage link to the studio and a Draft badge on
   *  unpublished shows. */
  manage?: boolean;
  emptyLabel?: string;
}

export function PodcastGrid({
  shows,
  manage = false,
  emptyLabel = "No shows published yet.",
}: PodcastGridProps) {
  if (shows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Mic className="h-12 w-12 opacity-20" />
        <p className="text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {shows.map((show) => (
        <div
          key={show.id}
          className="group relative flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all active:scale-[0.97]"
        >
          {/* Whole-card click target. Sits ABOVE the artwork (z-10) so the
              cursor + click behave identically across the full card, and
              BELOW the Manage link / Draft badge (z-20) so those stay
              independently clickable. */}
          <Link
            href={`/podcast/${show.slug}`}
            aria-label={show.title}
            className="absolute inset-0 z-[15]"
          />
          <div className="relative aspect-square overflow-hidden bg-muted">
            {show.image_url ? (
              <>
                {/* Blurred backdrop — durable render via the handler. Decorative,
                    so no fallback/error chrome (the main image owns those). */}
                <InlineMediaRef
                  ref={show.image_url}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallback={null}
                  errorFallback={null}
                  className="absolute inset-0 scale-110 blur-xl opacity-40"
                  alt=""
                />
                {/* Consumer surface: a dead URL degrades to the same quiet
                    mic tile as "no artwork" — never the debug error panel. */}
                <InlineMediaRef
                  ref={show.thumbnail_url ?? show.image_url ?? null}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallback="icon"
                  errorFallback="icon"
                  fallbackIcon={
                    <Mic className="h-12 w-12 text-muted-foreground/40" />
                  }
                  className="relative z-10 transition-transform duration-300 group-hover:scale-105"
                  alt={show.title}
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Mic className="h-12 w-12 text-muted-foreground/40" />
              </div>
            )}
            {manage && !show.is_published && (
              <span className="absolute left-2 top-2 z-20 rounded-full bg-background/90 border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Draft
              </span>
            )}
          </div>
          <div className="p-3">
            <p className="font-semibold text-sm text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {show.title}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              {show.author ? (
                <p className="text-xs text-muted-foreground truncate">
                  by {show.author}
                </p>
              ) : (
                <span />
              )}
              {manage && (
                <Link
                  href={`/podcast/studio/show/${show.id}`}
                  className="relative z-20 inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Settings2 className="h-3 w-3" />
                  Manage
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
