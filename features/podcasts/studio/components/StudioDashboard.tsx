"use client";

// features/podcasts/studio/components/StudioDashboard.tsx
//
// The user-facing home for podcasts: a library of the episodes you've created
// and the shows that host them, with a prominent path to generate a new one.
// (Admins manage the catalog under /administration/podcasts; this is the
// creator-facing surface.)

import { useState } from "react";
import Link from "next/link";
import {
  Podcast,
  AudioLines,
  Mic,
  Plus,
  Globe,
  Lock,
  Radio,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineMediaRef } from "@/features/files";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { CreateShowDialog } from "@/features/podcasts/generator/components/CreateShowDialog";
import type { PcEpisodeWithShow, PcShow } from "@/features/podcasts/types";

function EpisodeCard({ episode }: { episode: PcEpisodeWithShow }) {
  return (
    <Link
      href={`/podcast/${episode.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative aspect-square w-full bg-muted">
        <InlineMediaRef
          ref={episode.image_url ?? episode.thumbnail_url ?? null}
          size="fill"
          fit="cover"
          alt={episode.title}
          fallbackIcon={<Mic className="h-7 w-7 text-primary/50" />}
        />
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {episode.is_published ? (
            <>
              <Globe className="h-3 w-3" />
              Public
            </>
          ) : (
            <>
              <Lock className="h-3 w-3" />
              Draft
            </>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {episode.title}
        </p>
        {episode.show?.title && (
          <p className="truncate text-xs text-muted-foreground">
            {episode.show.title}
          </p>
        )}
      </div>
    </Link>
  );
}

function ShowChip({ show }: { show: PcShow }) {
  return (
    <Link
      href={`/podcast/${show.slug}`}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        <InlineMediaRef
          ref={show.image_url ?? show.thumbnail_url ?? null}
          size="fill"
          fit="cover"
          alt={show.title}
          fallbackIcon={<Radio className="h-4 w-4 text-primary/50" />}
        />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {show.title}
        </p>
        {show.author && (
          <p className="truncate text-xs text-muted-foreground">{show.author}</p>
        )}
      </div>
    </Link>
  );
}

export function StudioDashboard() {
  const { isAuthenticated } = useApiAuth();
  const { episodes, myShows, loading, registerShow, refresh } = useMyPodcasts();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mic className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          Sign in to your studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Create and manage AI-produced podcast episodes from any idea, file, or
          note.
        </p>
        <Button asChild className="gap-2">
          <Link href="/login?next=/podcast/studio">
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-secondary/10 p-6 sm:p-10">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Podcast className="h-3.5 w-3.5" />
              Podcast Studio
            </span>
            <h1 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Turn any idea into a podcast
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              From a single topic, a document, or rough notes — generate a fully
              produced two-host episode with cover art, video, and audio in
              minutes.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New podcast
            </Button>
            <Button asChild size="lg" className="gap-2 shadow-md">
              <Link href="/podcast/studio/create">
                <AudioLines className="h-4.5 w-4.5" />
                Create episode
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* My shows */}
      {myShows.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your podcasts
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myShows.map((show) => (
              <ShowChip key={show.id} show={show} />
            ))}
          </div>
        </section>
      )}

      {/* My episodes */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your episodes
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : episodes.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Mic className="h-7 w-7" />
            </span>
            <div className="space-y-1">
              <p className="font-medium text-foreground">No episodes yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your first episode is a topic away. Generate one and watch it
                come to life in real time.
              </p>
            </div>
            <Button asChild className="gap-2">
              <Link href="/podcast/studio/create">
                <AudioLines className="h-4 w-4" />
                Create your first episode
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {episodes.map((episode) => (
              <EpisodeCard key={episode.id} episode={episode} />
            ))}
          </div>
        )}
      </section>

      <CreateShowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(show) => {
          registerShow(show);
          void refresh();
        }}
      />
    </div>
  );
}
