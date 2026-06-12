"use client";

// app/(core)/podcast/studio/run-dense/[id]/_components/RunDenseView.tsx
//
// ui-dense run surface — the production control room.
//
// Reference product: a Vercel build console crossed with a Datadog / ops
// monitoring board. A tight status stat-bar runs across the top (state · elapsed
// · progress · % · stage/asset counts), then a full-width 3-column workspace:
//   • LEFT    — the live pipeline (LiveProgressRail) + recovery, the drumbeat.
//   • CENTER  — the episode artifact: identity, audio (or live teaser), the media
//               grid, and the finished-episode actions.
//   • RIGHT   — the inspector: a raw stage timeline for the power user, the
//               transcript, and the source. Everything legible at once.
// Dense, full-bleed, scannable — the eye lands on the status bar, then the
// artifact. No information is buried in a popover.
//
// REAL wiring (unchanged): every byte of state comes from useStudioRun(runId) —
// the live POST /podcast/generate stream, /podcast/resume recovery, the 20s
// heartbeat/stall watchdog, background-poll-on-disconnect, and the derived
// recovery state. We render that state densely; we do not reimplement it. Every
// proven wired presentation piece is reused as-is.

import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  BookOpen,
  Bookmark,
  ListChecks,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  WifiOff,
  Podcast,
  ImageIcon,
  Clapperboard,
  AudioLines,
  FileText,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoonCard } from "@/components/coming-soon/ComingSoonCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { MetadataHero } from "@/features/podcasts/generator/components/MetadataHero";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { ResultActions } from "@/features/podcasts/generator/components/ResultActions";
import { TranscriptPanel } from "@/features/podcasts/generator/components/TranscriptPanel";
import { ElapsedTimer } from "@/features/podcasts/generator/components/ElapsedTimer";
import {
  STAGE_KIND_ICON,
  STAGE_KIND_COLOR,
  stageKind,
  episodeHref,
} from "@/features/podcasts/generator/constants";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { RunRecoveryBanner } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { SourceSummaryPanel } from "@/features/podcasts/studio/components/SourceSummaryPanel";
import type { PodcastRunState } from "@/features/podcasts/generator/types";

// ── Status stat-bar ──────────────────────────────────────────────────────────
// The ops-board top strip: one glance gives the run's state, the clock, the
// honest progress bar, and the per-resource counts. The dominant accent reads
// the state instantly; the stats are the density.

type StatTone = "building" | "ready" | "failed" | "stalled" | "background";

interface StatSpec {
  tone: StatTone;
  icon: LucideIcon;
  label: string;
  dot: string; // status dot color
  accent: string; // text color for label
  bar: string; // progress fill
}

function statSpec(args: {
  isDone: boolean;
  isError: boolean;
  streaming: boolean;
  stalled: boolean;
  backgroundWorking: boolean;
}): StatSpec {
  const { isDone, isError, streaming, stalled, backgroundWorking } = args;
  if (isDone)
    return {
      tone: "ready",
      icon: CheckCircle2,
      label: "Ready",
      dot: "bg-emerald-500",
      accent: "text-emerald-600 dark:text-emerald-400",
      bar: "bg-emerald-500",
    };
  if (isError)
    return {
      tone: "failed",
      icon: AlertTriangle,
      label: "Failed",
      dot: "bg-destructive",
      accent: "text-destructive",
      bar: "bg-destructive",
    };
  if (streaming && stalled)
    return {
      tone: "stalled",
      icon: WifiOff,
      label: "Interrupted",
      dot: "bg-amber-500",
      accent: "text-amber-600 dark:text-amber-500",
      bar: "bg-amber-500",
    };
  if (backgroundWorking)
    return {
      tone: "background",
      icon: Loader2,
      label: "Background",
      dot: "bg-sky-500",
      accent: "text-sky-600 dark:text-sky-400",
      bar: "bg-sky-500",
    };
  return {
    tone: "building",
    icon: Loader2,
    label: "Generating",
    dot: "bg-primary",
    accent: "text-primary",
    bar: "bg-gradient-to-r from-primary to-secondary",
  };
}

function Stat({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <Icon className={cn("h-3.5 w-3.5", color ?? "text-muted-foreground")} />
      <span className="text-xs font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">
        {label}
      </span>
    </div>
  );
}

function StatusBar({
  spec,
  state,
  startedAt,
  streaming,
  progress,
  doneStages,
  totalStages,
}: {
  spec: StatSpec;
  state: PodcastRunState;
  startedAt: number | null;
  streaming: boolean;
  progress: number;
  doneStages: number;
  totalStages: number;
}) {
  const Icon = spec.icon;
  const spin = spec.tone === "building" || spec.tone === "background";
  const imagesDone = state.images.filter((s) => s.status === "done").length;
  const videosDone = state.videos.filter((s) => s.status === "done").length;

  return (
    <div className="shrink-0 border-b border-border bg-card/70 backdrop-blur-glass">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2">
        {/* State chip */}
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {(spec.tone === "building" || spec.tone === "background") && (
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", spec.dot)} />
            )}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", spec.dot)} />
          </span>
          <Icon className={cn("h-4 w-4", spec.accent, spin && "animate-spin")} />
          <span className={cn("text-sm font-semibold", spec.accent)}>{spec.label}</span>
        </span>

        <span className="hidden h-4 w-px bg-border sm:block" />

        {/* Stat row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {startedAt != null && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold tabular-nums text-foreground">
                <ElapsedTimer startedAt={startedAt} running={streaming} />
              </span>
            </span>
          )}
          <Stat
            icon={ListChecks}
            value={`${doneStages}/${totalStages || "—"}`}
            label="stages"
          />
          <Stat
            icon={ImageIcon}
            value={`${imagesDone}/${state.images.length || EXPECTED_IMAGE}`}
            label="covers"
            color="text-fuchsia-500"
          />
          <Stat
            icon={Clapperboard}
            value={`${videosDone}/${state.videos.length || EXPECTED_VIDEO}`}
            label="clips"
            color="text-orange-500"
          />
          <Stat
            icon={AudioLines}
            value={state.audioUrl ? "ready" : "—"}
            label="audio"
            color={state.audioUrl ? "text-emerald-500" : "text-muted-foreground"}
          />
          <Stat
            icon={FileText}
            value={state.script ? "ready" : "—"}
            label="script"
            color={state.script ? "text-blue-500" : "text-muted-foreground"}
          />
        </div>

        {/* % + progress bar (right-aligned, fills remaining width) */}
        <div className="ml-auto flex min-w-[140px] flex-1 items-center gap-2 sm:max-w-xs">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500 ease-out", spec.bar)}
              style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </div>
  );
}

const EXPECTED_IMAGE = 5;
const EXPECTED_VIDEO = 2;

// ── Raw stage timeline (the power-user inspector) ────────────────────────────
// Exposes the underlying stages exactly as the backend reports them, with their
// raw keys — the kind of detail a power creator wants but the friendly rail
// abstracts away. Distinct from LiveProgressRail (which humanizes + synthesizes).

function RawStageTimeline({ state }: { state: PodcastRunState }) {
  if (state.stages.length === 0) return null;
  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
        Raw stage log
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {state.stages.length}
        </span>
      </summary>
      <ul className="border-t border-border">
        {state.stages.map((s) => {
          const kind = stageKind(s.stage);
          const Icon = STAGE_KIND_ICON[kind];
          const color = STAGE_KIND_COLOR[kind];
          return (
            <li
              key={s.stage}
              className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] last:border-0"
            >
              <Icon className={cn("h-3 w-3 shrink-0", color.text)} />
              <code className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {s.stage}
              </code>
              <span className="ml-auto flex items-center gap-1">
                {s.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : null}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    s.status === "done"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : s.status === "failed"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary",
                  )}
                >
                  {s.status}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function RunDenseView({ runId }: { runId: string }) {
  const {
    state,
    startedAt,
    loading,
    notFound,
    streaming,
    stalled,
    backgroundWorking,
    canReconnect,
    reconnect,
    rerunFromSource,
    refresh,
    detail,
    recovery,
    assetBusy,
    regenerateAsset,
    addAsset,
    selectedCoverUrl,
    selectCover,
  } = useStudioRun(runId);

  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border bg-card/70 px-4 py-2.5">
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="hidden h-64 w-full rounded-xl lg:block" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Podcast className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">Run not found</h1>
        <p className="text-sm text-muted-foreground">
          This studio run doesn&apos;t exist or isn&apos;t yours.
        </p>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/podcast/studio">
            <ArrowLeft className="h-4 w-4" />
            Back to studio
          </Link>
        </Button>
      </div>
    );
  }

  const isDone = state.status === "done";
  const isRunning = state.status === "running";
  const isError = state.status === "error";
  const rtl = state.podcastType === "persian";

  const firstDoneImage =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;
  const effectiveCover = selectedCoverUrl ?? firstDoneImage;
  const hasVideo = state.videos.some((s) => s.status === "done" && s.url);
  const hasStages = state.stages.length > 0;
  const publicLink = episodeHref(state.episodeSlug, state.episodeId);

  const doneStages = state.stages.filter((s) => s.status !== "running").length;
  const totalStages = Math.max(state.stages.length, state.totalSteps);
  const progress = isDone
    ? 100
    : Math.max(2, Math.round(state.progress));

  const spec = statSpec({ isDone, isError, streaming, stalled, backgroundWorking });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Dense top bar — breadcrumb + actions on one line. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 py-1.5 pr-14 backdrop-blur-glass">
        <Link
          href="/podcast/studio"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Studio</span>
        </Link>
        <span className="hidden text-border sm:inline">/</span>
        <h1 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          <Podcast className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{state.title || "Studio run"}</span>
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            className="h-7 gap-1.5 px-2 text-muted-foreground"
            title="Re-sync this run from the server"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button asChild size="sm" className="h-7 gap-1.5 px-2.5">
            <Link href="/podcast/studio/create-dense">
              <Plus className="h-3.5 w-3.5" />
              New
            </Link>
          </Button>
        </div>
      </header>

      {/* Status stat-bar. */}
      <StatusBar
        spec={spec}
        state={state}
        startedAt={startedAt}
        streaming={streaming}
        progress={progress}
        doneStages={doneStages}
        totalStages={totalStages}
      />

      {/* Full-width 3-column control room. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden bg-border lg:grid-cols-[330px_minmax(0,1fr)_340px] xl:grid-cols-[360px_minmax(0,1fr)_368px]">
        {/* LEFT — pipeline + recovery (the drumbeat). */}
        <section className="min-h-0 space-y-3 overflow-y-auto bg-textured p-3">
          <RunRecoveryBanner
            status={state.status}
            streaming={streaming}
            stalled={stalled}
            backgroundWorking={backgroundWorking}
            canReconnect={canReconnect}
            canRerun={recovery.canRerun}
            error={state.error}
            onResume={reconnect}
            onRerun={rerunFromSource}
          />

          {hasStages ? (
            <LiveProgressRail state={state} startedAt={startedAt} />
          ) : isRunning ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Warming up the studio…
            </div>
          ) : null}

          <RawStageTimeline state={state} />
        </section>

        {/* CENTER — the episode artifact. */}
        <section className="min-h-0 overflow-y-auto bg-textured">
          <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-5">
            <MetadataHero state={state} />

            {/* Audio: finished player, or live teaser while it renders. */}
            {state.audioUrl ? (
              <div
                className={cn(
                  "rounded-xl border bg-card p-4 shadow-sm",
                  isDone
                    ? "border-emerald-500/30 ring-1 ring-emerald-500/10"
                    : "border-border",
                )}
              >
                <PodcastAudioPlayer
                  audioUrl={state.audioUrl}
                  title={state.title}
                  coverImageUrl={effectiveCover ?? undefined}
                />
              </div>
            ) : streaming && state.title ? (
              <ProductionTeaser state={state} startedAt={startedAt} />
            ) : null}

            {isDone && state.episodeId && (
              <ResultActions
                episodeId={state.episodeId}
                episodeSlug={state.episodeSlug}
                audioUrl={state.audioUrl}
                title={state.title}
                hasVideo={hasVideo}
              />
            )}

            <MediaOptionsGrid
              state={state}
              interactive={isDone && !!state.episodeId}
              selectedCoverUrl={effectiveCover}
              onSelectCover={selectCover}
              onRegenerate={!streaming ? regenerateAsset : undefined}
              onAddAsset={!streaming ? addAsset : undefined}
              assetBusy={assetBusy}
              modelCounts={detail?.model_counts}
            />

            {isDone && (
              <div className="grid gap-3 sm:grid-cols-3">
                <ComingSoonCard
                  icon={BookOpen}
                  title="Blog post"
                  description="Turn this episode into a shareable article from the same script."
                />
                <ComingSoonCard
                  icon={Bookmark}
                  title="Chapters"
                  description="Auto timestamps to jump to each topic."
                />
                <ComingSoonCard
                  icon={ListChecks}
                  title="Show notes"
                  description="Key points, links, and references."
                />
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — the inspector: transcript + source, always legible. */}
        <aside className="hidden min-h-0 space-y-3 overflow-y-auto bg-textured p-3 lg:block">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Inspector
          </div>

          {state.script ? (
            <TranscriptPanel script={state.script} rtl={rtl} />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground">
              <FileText className="mx-auto mb-1.5 h-4 w-4 opacity-60" />
              Transcript appears once the script is written.
            </div>
          )}

          {detail && <SourceSummaryPanel detail={detail} />}

          {isDone && (state.episodeId || publicLink) && (
            <div className="rounded-xl border border-border bg-card/40 p-3 text-[11px] text-muted-foreground">
              <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground/80">
                Episode
              </div>
              <div className="space-y-1">
                {state.episodeId && (
                  <p className="break-all">
                    <span className="font-medium text-foreground/70">ID</span>{" "}
                    <code className="font-mono">{state.episodeId}</code>
                  </p>
                )}
                {publicLink && (
                  <p className="truncate">
                    <span className="font-medium text-foreground/70">Link</span>{" "}
                    <Link href={publicLink} className="text-primary hover:underline">
                      {publicLink}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          )}

          {!state.script && !detail && (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-3 py-4 text-center text-xs text-muted-foreground">
              Run details load here as the source resolves.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
