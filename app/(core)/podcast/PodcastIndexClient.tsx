"use client";

// PodcastIndexClient — the /podcast index body.
//
// /podcast is the LIST-view first stop for podcasts (per the feature-entry
// doctrine): it must (1) route creators to the Studio create flow, and
// (2) separate the user's own shows from the platform's published catalog.
// The server page passes the published catalog (fast anonymous paint); this
// client layer adds the signed-in user's library via useMyPodcasts —
// including unpublished drafts, which only the owner can see here.

import Link from "next/link";
import { AudioLines, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import type { PcShow } from "@/features/podcasts/types";
import { PodcastGrid } from "./PodcastGrid";

export function PodcastIndexClient({ published }: { published: PcShow[] }) {
  const userId = useAppSelector(selectUserId);
  const { myShows, loading } = useMyPodcasts();

  const myShowIds = new Set(myShows.map((s) => s.id));
  const browse = published.filter((s) => !myShowIds.has(s.id));

  return (
    <div className="h-full w-full overflow-y-auto overscroll-contain bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-zinc-900 px-4 pt-10 pb-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h1 className="text-white font-bold text-4xl">Podcasts</h1>
          <p className="text-white/50 text-sm mt-2">
            Listen to shows on the platform — or generate a fully produced
            episode of your own in minutes.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button asChild className="gap-2 shadow-md">
              <Link href="/podcast/studio/create">
                <AudioLines className="h-4 w-4" />
                Create a podcast
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/podcast/studio">
                <Mic className="h-4 w-4" />
                Open Studio
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 py-6 space-y-8">
        {/* The signed-in user's library — includes drafts, with manage links. */}
        {userId && (loading || myShows.length > 0) && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your podcasts
            </h2>
            {loading && myShows.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 3 }, (_, i) => (
                  <div
                    key={i}
                    className="aspect-[4/5] animate-pulse rounded-2xl border border-border bg-muted/50"
                  />
                ))}
              </div>
            ) : (
              <PodcastGrid shows={myShows} manage />
            )}
          </section>
        )}

        {/* Everything published on the platform (minus the user's own). */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            On the platform
          </h2>
          <PodcastGrid
            shows={browse}
            emptyLabel="No shows published yet. Be the first — create one in the Studio."
          />
        </section>
      </div>
    </div>
  );
}
