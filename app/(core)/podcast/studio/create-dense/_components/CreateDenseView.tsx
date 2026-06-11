"use client";

// app/(core)/podcast/studio/create-dense/_components/CreateDenseView.tsx
//
// ui-dense create surface — the power-creator console.
//
// Reference product: a CI / build-pipeline config editor (CircleCI / GitHub
// Actions job config) crossed with Linear's densest issue composer. The form is
// the spec; a fixed left rail shows the pipeline this run will execute end-to-end
// and a fixed footer keeps the primary action + run summary always in reach. The
// whole "what will this produce and how" is legible at one glance — no buried
// popovers — while the wired GeneratorForm keeps owning the request.
//
// REAL wiring (unchanged from the production CreateView): consumes the already-
// wired GeneratorForm, which builds the PodcastGenerateRequest; on Generate we
// durably create a pc_studio_runs row via studioRunsService.createRun, stash the
// pending start, and route to the id-based run-dense page that owns the live
// stream. No data/stream/recovery layer is reimplemented here.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  LogIn,
  Mic,
  Terminal,
  FileSearch,
  ListFilter,
  FileText,
  LayoutGrid,
  AudioLines,
  ImageIcon,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { GeneratorForm } from "@/features/podcasts/generator/components/GeneratorForm";
import type { PodcastGenerateRequest } from "@/features/podcasts/generator/types";
import { studioRunsService } from "@/features/podcasts/studio/runs/service";
import { stashPendingStart } from "@/features/podcasts/studio/runs/pendingStart";
import { EXPECTED_IMAGE_COUNT, EXPECTED_VIDEO_COUNT } from "@/features/podcasts/generator/constants";

// The fixed pipeline this run executes — the same stage kinds the run console
// visualizes live, surfaced here so a power user sees the full plan before firing.
const PIPELINE: { icon: LucideIcon; label: string; detail: string; color: string }[] = [
  { icon: FileSearch, label: "Prepare", detail: "Research / extract the source", color: "text-violet-500" },
  { icon: ListFilter, label: "Post-prep", detail: "Clean & structure", color: "text-amber-500" },
  { icon: FileText, label: "Script", detail: "Write the two-host dialogue", color: "text-blue-500" },
  { icon: LayoutGrid, label: "Metadata", detail: "Title, cover & video concepts", color: "text-pink-500" },
  { icon: ImageIcon, label: "Cover art", detail: `${EXPECTED_IMAGE_COUNT} style options`, color: "text-fuchsia-500" },
  { icon: Clapperboard, label: "Video", detail: `${EXPECTED_VIDEO_COUNT} clips`, color: "text-orange-500" },
  { icon: AudioLines, label: "Audio", detail: "Produce the episode (long step)", color: "text-emerald-500" },
];

export function CreateDenseView() {
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
          <Link href="/login?next=/podcast/studio/create-dense">
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
      startTransition(() => router.push(`/podcast/studio/run-dense/${run.id}`));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't start the generation",
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Dense top bar — one line: breadcrumb, title, the producible artifacts. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 py-2 pr-14 backdrop-blur-glass">
        <Link
          href="/podcast/studio"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>
        <span className="text-border">/</span>
        <h1 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          New episode
        </h1>
        <span className="ml-auto flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <AudioLines className="h-3.5 w-3.5 text-emerald-500" />
            Audio
          </span>
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5 text-fuchsia-500" />
            {EXPECTED_IMAGE_COUNT} covers
          </span>
          <span className="inline-flex items-center gap-1">
            <Clapperboard className="h-3.5 w-3.5 text-orange-500" />
            {EXPECTED_VIDEO_COUNT} clips
          </span>
        </span>
      </header>

      {/* Two-pane console: fixed pipeline rail + scrollable config (the form). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[208px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
        {/* LEFT — the pipeline plan, the same stages the run console renders. */}
        <aside className="hidden min-h-0 overflow-y-auto border-r border-border bg-muted/20 p-3 lg:block">
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pipeline
          </div>
          <ol className="space-y-0.5">
            {PIPELINE.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.label}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                >
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded bg-card text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <Icon className={`h-3.5 w-3.5 ${step.color}`} />
                      {step.label}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                      {step.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 px-2 text-[10px] leading-snug text-muted-foreground/80">
            Configure the run on the right. Once you generate, the run console
            tracks every stage live and recovers from any interruption.
          </p>
        </aside>

        {/* RIGHT — the request spec: the fully-wired GeneratorForm, full width,
            no narrow centered column. */}
        <main className="min-h-0 overflow-y-auto bg-textured px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <GeneratorForm
              shows={shows}
              onShowCreated={registerShow}
              onGenerate={handleGenerate}
              busy={busy}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
