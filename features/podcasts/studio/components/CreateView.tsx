"use client";

// features/podcasts/studio/components/CreateView.tsx
//
// The compose surface (/podcast/studio/create). It ONLY collects the request.
// On Generate it durably creates a pc_studio_runs row, then routes to the
// id-based run page which owns the live stream — so the creation is persistent
// and returnable from the very first second.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Podcast, ArrowLeft, LogIn, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { GeneratorForm } from "@/features/podcasts/generator/components/GeneratorForm";
import type {
  PodcastFormat,
  PodcastGenerateRequest,
} from "@/features/podcasts/generator/types";
import { studioRunsService } from "@/features/podcasts/studio/runs/service";
import { stashPendingStart } from "@/features/podcasts/studio/runs/pendingStart";

export function CreateView() {
  const { isAuthenticated } = useApiAuth();
  const { shows, registerShow } = useMyPodcasts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const initialTopic = searchParams.get("topic") ?? "";
  const formatParam = searchParams.get("format");
  const initialFormat: PodcastFormat =
    formatParam === "news" ||
    formatParam === "entertainment" ||
    formatParam === "interview" ||
    formatParam === "debate" ||
    formatParam === "panel" ||
    formatParam === "storytelling"
      ? formatParam
      : "educational";
  const initialAgentLabel = searchParams.get("agent") ?? undefined;
  const initialInstructions = searchParams.get("instructions") ?? undefined;

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
          <Link href="/login?next=/podcast/studio/create">
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
      startTransition(() => router.push(`/podcast/studio/run/${run.id}`));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't start the generation",
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <div className="mb-6">
        <Link
          href="/podcast/studio"
          className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
            <Podcast className="h-5 w-5" />
          </span>
          Create an episode
        </h1>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <GeneratorForm
          shows={shows}
          onShowCreated={registerShow}
          onGenerate={handleGenerate}
          busy={busy}
          initialTopic={initialTopic}
          initialFormat={initialFormat}
          initialAgentLabel={initialAgentLabel}
          initialInstructions={initialInstructions}
        />
      </div>
    </div>
  );
}
