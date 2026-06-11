"use client";

// app/(core)/podcast/studio/create-reimagine/_components/Composer.tsx
//
// REIMAGINED create surface — the "Studio Command Bar".
//
// Reference model: NotebookLM's Audio Overview generator crossed with Suno's
// single prompt bar. Where the original GeneratorForm is seven stacked scrolling
// sections, this is ONE calm focused canvas: a big "what do you want to make?"
// input as the hero, the eight real source kinds as a chip rail above it, and the
// rest of the studio's configuration (format · language · hosts · show) collapsed
// into an inline pill tray below. A first-timer types a topic and hits Generate;
// a power user opens a pill or the advanced drawer. Nothing important is ever
// scrolled past.
//
// THIS IS REAL. The submit path is identical to the shipped CreateView:
//   build a PodcastGenerateRequest → studioRunsService.createRun(payload)
//   → stashPendingStart(run.id, body) → router.push('/podcast/studio/run-reimagine/<id>').
// Every option binds to the shared generator constants/types; coming-soon items
// render disabled+labeled, never as fake buttons.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  LogIn,
  Mic,
  Plus,
  X,
  AudioLines,
  Loader2,
  SlidersHorizontal,
  ChevronDown,
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useMyPodcasts } from "@/features/podcasts/hooks/useMyPodcasts";
import { useMyStudioRuns } from "@/features/podcasts/studio/runs/useMyStudioRuns";
import { SourceResolverPanel } from "@/features/podcasts/generator/components/SourceResolverPanel";
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
import { SettingsTray } from "./SettingsTray";

export function Composer() {
  const { isAuthenticated } = useApiAuth();
  const { shows, registerShow } = useMyPodcasts();
  const router = useRouter();

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
  const [, startTransition] = useTransition();

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
          <Link href="/login?next=/podcast/studio/create-reimagine">
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

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
    else if (activeSource.control === "resolve")
      body.input_data = resolvedText.trim();
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
        router.push(`/podcast/studio/run-reimagine/${run.id}`),
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't start the generation",
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 pr-14 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/podcast/studio"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio
        </Link>
        <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          What should we make a podcast about?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Describe a topic, paste a source, or pull from your library — we
          produce a two-host episode with script, cover art, video, and audio.
        </p>
      </div>

      {/* ── THE COMMAND BAR ─────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-border bg-card shadow-lg shadow-black/[0.03] ring-1 ring-black/[0.02]">
        {/* Source chip rail */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide border-b border-border/70 p-2.5">
          {SOURCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = sourceKind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => handleSourceChange(opt.kind)}
                title={opt.helper}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                  selected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {opt.label.replace(/^From (a |an )?/i, "")}
              </button>
            );
          })}
        </div>

        {/* The input — adapts to the selected source */}
        <div className="p-3.5">
          <p className="mb-2 px-1 text-[13px] text-muted-foreground">
            {activeSource.helper}
          </p>
          {activeSource.control === "text" ? (
            <ProTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={activeSource.placeholder}
              rows={sourceKind === "topic" ? 3 : 7}
              dir={isRtl ? "rtl" : undefined}
              autoGrow
              minHeight={sourceKind === "topic" ? 88 : 176}
              showCopyButton={false}
              className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            />
          ) : activeSource.control === "urls" ? (
            <div className="space-y-2">
              {urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={url}
                    onChange={(e) =>
                      setUrls((prev) =>
                        prev.map((u, idx) => (idx === i ? e.target.value : u)),
                      )
                    }
                    placeholder="https://…/document.pdf"
                    inputMode="url"
                  />
                  {urls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setUrls((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove URL"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUrls((prev) => [...prev, ""])}
                className="gap-1.5 text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                Add another file URL
              </Button>
            </div>
          ) : activeSource.control === "resolve" && activeSource.resolveKind ? (
            <SourceResolverPanel
              resolveKind={activeSource.resolveKind}
              value={resolvedText}
              onChange={setResolvedText}
              rtl={isRtl}
              onBusyChange={setResolverBusy}
            />
          ) : null}
        </div>

        {/* Settings tray + Generate */}
        <div className="flex flex-col gap-3 border-t border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <SettingsTray
            language={language}
            onLanguage={setLanguage}
            format={format}
            onFormat={setFormat}
            hostCount={hostCount}
            onHostCount={setHostCount}
          />
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="gap-2 self-end rounded-full shadow-md sm:self-auto"
          >
            {busy ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <AudioLines className="h-4.5 w-4.5" />
            )}
            {busy ? "Starting…" : "Generate episode"}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ── ADVANCED (show · steer · test mode) — progressive disclosure ─── */}
      <Collapsible
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        className="mt-4"
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl px-1.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Show, steer &amp; test mode
            {truncate && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                <FlaskConical className="h-3 w-3" />
                Test mode on
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 rounded-2xl border border-border bg-card/50 p-4">
          <ShowPicker
            shows={shows}
            value={showId}
            onChange={setShowId}
            onShowCreated={registerShow}
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Extra instruction to the research / extraction agent
            </Label>
            <ProTextarea
              value={prepMessage}
              onChange={(e) => setPrepMessage(e.target.value)}
              placeholder="Optional — e.g. focus on the practical takeaways"
              rows={2}
              showCopyButton={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Show intro / blurb
            </Label>
            <ProTextarea
              value={firstShowInfo}
              onChange={(e) => setFirstShowInfo(e.target.value)}
              placeholder="Optional — a short intro for the show"
              rows={2}
              showCopyButton={false}
            />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
              <FlaskConical className="h-4.5 w-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="truncate-toggle-rx"
                  className="text-sm font-medium text-foreground"
                >
                  Test mode — short audio
                </Label>
                <Switch
                  id="truncate-toggle-rx"
                  checked={truncate}
                  onCheckedChange={setTruncate}
                />
              </div>
              <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                Trims audio to ~one line per host so runs stay fast and cheap.
                Script, cover art and videos are always full quality. Turn off
                for a full-length episode.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── PICK UP WHERE YOU LEFT OFF — real recent runs ───────────────── */}
      <RecentRuns />
    </div>
  );
}

// Recent studio runs — a real, returnable on-ramp. Reuses useMyStudioRuns
// (direct Supabase, RLS-scoped) so a half-finished or just-completed episode is
// one click away. Links into the reimagined run surface.
function RecentRuns() {
  const { runs, loading } = useMyStudioRuns();

  if (loading) {
    return (
      <div className="mt-10">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (runs.length === 0) return null;

  const recent = runs.slice(0, 4);

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Pick up where you left off
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {recent.map((run) => {
          const done = run.status === "completed" || !!run.episode_id;
          const failed = run.status === "failed" && !run.episode_id;
          const StatusIcon = done
            ? CheckCircle2
            : failed
              ? AlertTriangle
              : Clock;
          return (
            <Link
              key={run.id}
              href={`/podcast/studio/run-reimagine/${run.id}`}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  done
                    ? "bg-emerald-500/10 text-emerald-500"
                    : failed
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary",
                )}
              >
                <StatusIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {run.title || "Untitled episode"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {done ? "Ready" : failed ? "Needs attention" : "In progress"}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
