"use client";

// app/(core)/podcast/studio/create-sharp/_components/CreateSharpView.tsx
//
// ui-sharp create surface. Modeled after Descript / Spotify for Podcasters'
// "new episode" composer: one calm canvas, the SOURCE is the hero, and every
// other choice is quiet, progressive, one glance away. The header sticks so the
// primary action and the way back are always reachable on a long form.
//
// REAL wiring (unchanged from the production CreateView): it consumes the
// already-wired GeneratorForm, builds a PodcastGenerateRequest, durably creates
// a pc_studio_runs row via studioRunsService.createRun, stashes the pending
// start, and routes to the id-based run-sharp page that owns the live stream.
// No data layer is reimplemented here — only the presentation.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, LogIn, Mic, Podcast, ImageIcon, Clapperboard, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { GeneratorForm } from "@/features/podcasts/generator/components/GeneratorForm";
import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";
import { studioRunsService } from "@/features/podcasts/studio/runs/service";
import { stashPendingStart } from "@/features/podcasts/studio/runs/pendingStart";

export function CreateSharpView() {
  const { isAuthenticated } = useApiAuth();
  const { shows, registerShow } = useMyPodcasts();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mic className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          Sign in to create podcasts
        </h1>
        <p className="text-sm text-muted-foreground">
          The podcast studio turns any idea, document, or note into a fully
          produced two-host episode — with cover art, video, and audio.
        </p>
        <Button asChild className="gap-2">
          <Link href="/login?next=/podcast/studio/create-sharp">
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  const handleGenerate = async (body: PodcastGenerateRequest) => {
    setBusy(true);
    try {
      const run = await studioRunsService.createRun({
        status: "running",
        request: body,
        podcast_type: body.podcast_type,
        input_data_type: body.input_data_type,
        title: "",
        show_id: body.show_id ?? null,
      });
      stashPendingStart(run.id, body);
      startTransition(() => router.push(`/podcast/studio/run-sharp/${run.id}`));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't start the generation",
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      {/* Sticky header — the way back + the promise of what this makes, always
          in reach on a long form. */}
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-border/60 bg-textured/80 px-4 pb-4 pt-6 backdrop-blur-glass backdrop-saturate-glass">
        <Link
          href="/podcast/studio"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
                <Podcast className="h-5 w-5" />
              </span>
              New episode
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Give us a source. We&apos;ll write the script, record two hosts,
              and design the cover and video.
            </p>
          </div>
          {/* What you get — a quiet promise, not a CTA. */}
          <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
            <Promise icon={AudioLines} label="Audio" />
            <Promise icon={ImageIcon} label="Cover art" />
            <Promise icon={Clapperboard} label="Video" />
          </div>
        </div>
      </header>

      {/* The canvas. The GeneratorForm carries every wired control + its own
          progressive disclosure; we just give it a calm, single-surface frame
          and let the source lead. */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <GeneratorForm
          shows={shows}
          onShowCreated={registerShow}
          onGenerate={handleGenerate}
          busy={busy}
        />
      </div>
    </div>
  );
}

function Promise({
  icon: Icon,
  label,
}: {
  icon: typeof AudioLines;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-primary" />
      {label}
    </span>
  );
}
