"use client";

// The structural loading state for a podcast run before metadata arrives.
// It deliberately mirrors the finished episode surface — identity, production
// card, cover options, and video options — so the page has a stable footprint
// while research/script work is still happening. Nothing here pretends that
// generated content already exists; every content region is an honest skeleton.

import { AudioLines, Clapperboard, ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function SectionHeading({
  icon: Icon,
  label,
}: {
  icon: typeof ImageIcon;
  label: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span>{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">Preparing</span>
    </div>
  );
}

/**
 * Stable, reusable composition skeleton for podcast-generation surfaces.
 * Keeps the eventual layout visible before the metadata/media slot event lands.
 */
export function PodcastCompositionPlaceholder() {
  return (
    <div className="space-y-6" role="status" aria-label="Composing the episode">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AudioLines className="h-3.5 w-3.5 animate-pulse text-primary" />
          Composing the episode…
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-[82%] rounded-lg sm:h-9" />
          <Skeleton className="h-8 w-[58%] rounded-lg sm:h-9" />
        </div>
        <div className="space-y-2 pt-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[76%]" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid sm:grid-cols-[minmax(0,260px)_1fr]">
          <Skeleton className="aspect-square w-full rounded-none sm:aspect-auto sm:min-h-[260px]" />
          <div className="flex min-w-0 flex-col p-5">
            <Skeleton className="mb-4 h-5 w-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-[88%]" />
              <Skeleton className="h-5 w-[62%]" />
            </div>
            <div className="mt-6 space-y-2.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[86%]" />
              <Skeleton className="h-4 w-[68%]" />
            </div>
            <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
              <AudioLines className="h-5 w-5 animate-pulse text-primary/45" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="ml-auto h-3 w-10" />
            </div>
          </div>
        </div>
      </div>

      <section aria-label="Preparing cover art options">
        <SectionHeading icon={ImageIcon} label="Cover art options" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <Skeleton className="aspect-square w-full rounded-none" />
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Preparing video options">
        <SectionHeading icon={Clapperboard} label="Video options" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((slot) => (
            <div
              key={slot}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <Skeleton className="aspect-video w-full rounded-none" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
