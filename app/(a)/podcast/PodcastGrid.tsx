"use client";

import Link from "next/link";
import { Mic } from "lucide-react";
import type { PcShow } from "@/features/podcasts/types";
import { InlineMediaRef } from "@/features/files";

export function PodcastGrid({ shows }: { shows: PcShow[] }) {
  if (shows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Mic className="h-12 w-12 opacity-20" />
        <p className="text-sm">No shows published yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {shows.map((show) => (
        <Link
          key={show.id}
          href={`/podcast/${show.slug}`}
          className="group flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all active:scale-[0.97]"
        >
          <div className="relative aspect-square overflow-hidden bg-zinc-800">
            {show.image_url ? (
              <>
                {/* Blurred backdrop — keep as plain <img> so it stays
                    layout-agnostic and bypasses the wrapper. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={show.image_url}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40"
                  loading="lazy"
                  decoding="async"
                />
                <InlineMediaRef
                  ref={(show.thumbnail_url ?? show.image_url) ?? null}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallback={null}
                  className="relative z-10 transition-transform duration-300 group-hover:scale-105"
                  alt={show.title}
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Mic className="h-12 w-12 text-white/20" />
              </div>
            )}
          </div>
          <div className="p-3">
            <p className="font-semibold text-sm text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {show.title}
            </p>
            {show.author && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                by {show.author}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
