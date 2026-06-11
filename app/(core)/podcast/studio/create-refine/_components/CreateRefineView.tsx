"use client";

// app/(core)/podcast/studio/create-refine/_components/CreateRefineView.tsx
//
// ui-refine create surface. Keeps the existing mental model (pick a source →
// give input → tune a few settings → generate) and the existing wiring, while
// raising the bar exactly where the brief asks:
//
//   1. SQUARE, smaller source tiles in ONE row, with the rest behind a "More
//      sources" expander (SourceTiles) — no tile spans more than a row.
//   2. The source section never resizes as the input changes: every control
//      lives in one fixed-height frame (SourceInput).
//   3. Optional / advanced power is tucked behind a single "Advanced" expander
//      (EpisodeSettings) so first-timers aren't overwhelmed but power users get
//      everything in one click.
//   4. A clear, legible system VISUAL (PipelineVisual) so users understand what
//      each option feeds: Source → Research → Enrich → Script → Enhance → Audio
//      / Cover / Video / Related content.
//
// REAL wiring (identical to the production CreateView + GeneratorForm — NOT
// reimplemented): it builds a real PodcastGenerateRequest from the wired
// constants, durably creates a pc_studio_runs row via studioRunsService.createRun,
// stashes the pending start, and routes to the id-based run-refine page that owns
// the live stream. Only the presentation/layout is ours.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  LogIn,
  Mic,
  Podcast,
  AudioLines,
  Loader2,
  FileInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { ShowPicker } from "@/features/podcasts/generator/components/ShowPicker";
import {
  SOURCE_OPTIONS,
  DEFAULT_LANGUAGE,
  isRtlLanguage,
  deriveBackendPodcastType,
  HOST_COUNT_DEFAULT,
} from "@/features/podcasts/generator/constants";
import type {
  PodcastGenerateRequest,
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";
import { studioRunsService } from "@/features/podcasts/studio/runs/service";
import { stashPendingStart } from "@/features/podcasts/studio/runs/pendingStart";
import { PipelineVisual } from "./PipelineVisual";
import { SourceTiles } from "./SourceTiles";
import { SourceInput } from "./SourceInput";
import { EpisodeSettings } from "./EpisodeSettings";

const SECTION_LABEL =
  "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export function CreateRefineView() {
  const { isAuthenticated } = useApiAuth();
  const { shows, registerShow } = useMyPodcasts();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ── Wired form state (mirrors GeneratorForm exactly) ─────────────────────
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [resolvedText, setResolvedText] = useState("");
  const [resolverBusy, setResolverBusy] = useState(false);
  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [hostCount, setHostCount] = useState("2");
  const [showId, setShowId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [truncate, setTruncate] = useState(true);
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const isRtl = isRtlLanguage(language);

  const canGenerate =
    !busy &&
    !resolverBusy &&
    !!activeSource.inputDataType &&
    (activeSource.control === "urls"
      ? cleanUrls.length > 0
      : activeSource.control === "resolve"
        ? resolvedText.trim().length > 0
        : text.trim().length > 0);

  const handleSourceChange = (kind: PodcastSourceKind) => {
    setSourceKind(kind);
    setResolvedText("");
    setResolverBusy(false);
  };

  const handleGenerate = async () => {
    if (!canGenerate || !activeSource.inputDataType) return;
    const body: PodcastGenerateRequest = {
      input_data_type: activeSource.inputDataType,
      podcast_type: deriveBackendPodcastType(language, format),
      language,
      host_count: Number(hostCount) || HOST_COUNT_DEFAULT,
      truncate_audio_for_testing: truncate,
      post_prep_option: "none",
      show_id: showId,
    };
    if (activeSource.control === "urls") body.file_urls = cleanUrls;
    else if (activeSource.control === "resolve") body.input_data = resolvedText.trim();
    else body.input_data = text.trim();
    if (prepMessage.trim()) body.prep_user_message = prepMessage.trim();
    if (firstShowInfo.trim()) body.first_show_info_text = firstShowInfo.trim();

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
      startTransition(() =>
        router.push(`/podcast/studio/run-refine/${run.id}`),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't start the generation",
      );
      setBusy(false);
    }
  };

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
          <Link href="/login?next=/podcast/studio/create-refine">
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28">
      {/* Sticky header — the way back + the promise. */}
      <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border/60 bg-textured/80 px-4 pb-4 pt-6 backdrop-blur-glass backdrop-saturate-glass">
        <Link
          href="/podcast/studio"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-sm">
                <Podcast className="h-5 w-5" />
              </span>
              New episode
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Give us a source. We&apos;ll research it, write the script, record
              two hosts, and design the cover and video.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        {/* The system visual — so every option below makes sense. */}
        <PipelineVisual />

        {/* The composer card. */}
        <div className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {/* 1 + 2 — source tiles + the stable input frame. */}
          <section className="space-y-3">
            <Label className={SECTION_LABEL}>
              <FileInput className="h-3.5 w-3.5" />
              What&apos;s your source?
            </Label>
            <SourceTiles value={sourceKind} onChange={handleSourceChange} />
            <SourceInput
              source={activeSource}
              rtl={isRtl}
              text={text}
              onTextChange={setText}
              urls={urls}
              onUrlsChange={setUrls}
              resolvedText={resolvedText}
              onResolvedChange={setResolvedText}
              onResolverBusyChange={setResolverBusy}
            />
          </section>

          <div className="h-px bg-border" />

          {/* 3 — everyday settings + advanced power. */}
          <EpisodeSettings
            language={language}
            onLanguage={setLanguage}
            format={format}
            onFormat={setFormat}
            hostCount={hostCount}
            onHostCount={setHostCount}
            advancedOpen={advancedOpen}
            onAdvancedOpen={setAdvancedOpen}
            truncate={truncate}
            onTruncate={setTruncate}
            prepMessage={prepMessage}
            onPrepMessage={setPrepMessage}
            firstShowInfo={firstShowInfo}
            onFirstShowInfo={setFirstShowInfo}
          />

          <div className="h-px bg-border" />

          {/* Show picker (wired). */}
          <ShowPicker
            shows={shows}
            value={showId}
            onChange={setShowId}
            onShowCreated={registerShow}
          />
        </div>
      </div>

      {/* Sticky generate bar — always reachable on a long form, with live
          readiness so the user knows when they can go. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-textured/85 px-4 pb-safe pt-3 backdrop-blur-glass backdrop-saturate-glass">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">
            {resolverBusy
              ? "Fetching your source…"
              : canGenerate
                ? "Ready — audio, cover art and video will generate together."
                : "Add a source to begin."}
          </p>
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="ml-auto gap-2 shadow-md"
          >
            {busy ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <AudioLines className="h-4.5 w-4.5" />
            )}
            {busy ? "Starting…" : "Generate episode"}
          </Button>
        </div>
      </div>
    </div>
  );
}
