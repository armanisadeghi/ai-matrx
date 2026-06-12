"use client";

// features/podcasts/studio/components/StudioDashboard.tsx
//
// The user-facing home for podcasts (/podcast/studio). Leads with the user's
// STUDIO RUN HISTORY — every generation they've started (running, done, or
// failed) is durably recorded in pc_studio_runs and reopenable here, so a
// creation is never lost. Also surfaces their shows and a path to create.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Podcast,
  AudioLines,
  Mic,
  Plus,
  Radio,
  LogIn,
  Rss,
  BookOpen,
  UploadCloud,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoonCard } from "@/components/coming-soon/ComingSoonCard";
import { InlineMediaRef } from "@/features/files";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { CreateShowDialog } from "@/features/podcasts/generator/components/CreateShowDialog";
import { UploadEpisodeDialog } from "@/features/podcasts/studio/components/UploadEpisodeDialog";
import { RunsManageView } from "@/features/podcasts/studio/components/RunsManageView";
import type { PcShow } from "@/features/podcasts/types";

function ShowChip({ show }: { show: PcShow }) {
  return (
    <Link
      href={`/podcast/studio/show/${show.id}`}
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {show.title}
        </p>
        {show.author && (
          <p className="truncate text-xs text-muted-foreground">{show.author}</p>
        )}
      </div>
      <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function StudioDashboard() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { isAuthenticated } = useApiAuth();
  const {
    myShows,
    shows,
    registerShow,
    registerEpisode,
    refresh: refreshPodcasts,
  } = useMyPodcasts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

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
              minutes. Every creation is saved here, ready to reopen anytime.
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
            <Button
              variant="outline"
              onClick={() => {
                if (shows.length === 0) {
                  setDialogOpen(true);
                  return;
                }
                setUploadOpen(true);
              }}
              className="gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              Upload episode
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

      {/* Run history — every attempt, its source, status, and recovery,
          read from the durable agent_run record (GET /podcast/runs). */}
      <RunsManageView />

      {/* What's coming to the studio */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <ComingSoonCard
          icon={Rss}
          title="RSS feeds"
          description="Publish every show as a podcast feed listeners can subscribe to in any podcast app."
        />
        <ComingSoonCard
          icon={BookOpen}
          title="Blog posts"
          description="Auto-generate a written article for each episode to grow reach and SEO."
        />
      </section>

      <CreateShowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(show) => {
          registerShow(show);
          void refreshPodcasts();
          // Take the owner straight to the manage page so a brand-new show
          // (which has no episodes yet, so it won't appear under "Your
          // podcasts") is immediately reachable and configurable.
          startTransition(() => router.push(`/podcast/studio/show/${show.id}`));
        }}
      />

      <UploadEpisodeDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        shows={shows}
        onCreated={(episode) => {
          registerEpisode(episode);
          void refreshPodcasts();
        }}
      />
    </div>
  );
}
