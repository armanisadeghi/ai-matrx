"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  PackageOpen,
  Mic,
  FileText,
  Presentation,
  Search as SearchIcon,
  Loader2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  X,
  Headphones,
  ImageIcon,
  Clapperboard,
  Film,
  ChevronDown,
  ListTree,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useTopicContext } from "../../context/ResearchContext";
import { appendTopicOutput, getDocument, getSynthesis } from "../../service";
import type { ResearchSynthesis } from "../../types";
import { normalizeSynthesisScope } from "../../types";
import { usePodcastRun } from "@/features/podcasts/generator/usePodcastRun";
import type { PodcastType } from "@/features/podcasts/generator/types";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { useSlotRunner } from "@/features/agents/slots/useSlotRunner";
import { SlotAgentPicker } from "@/features/agents/slots/components/SlotAgentPicker";
import MarkdownStream from "@/components/MarkdownStream";
import { SessionMediaElement } from "@/features/audio/session/SessionMediaElement";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { useAgentSlot } from "@/features/agents/slots/useAgentSlot";
import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";
import { LiveRunWindowController } from "@/features/overlays/openers/liveRunWindow";
import {
  parseOutputs,
  assetsFor,
  podcastMediaFrom,
  type OutputAsset,
  type OutputKind,
  type PodcastMedia,
} from "./outputs";
import {
  DOMAIN_OUTPUTS,
  REPORT_ONLY_BUNDLE_SLUG,
  contextBuilderHref,
} from "./outputDefinitions";
import { getBundleBySlug, getResourceManifest } from "../../service/resources";
import { resolveBundle } from "../../resources/resolve";

/** Research content-engine generators run through AGENT SLOTS — the slot is the
 *  identity, never a hardcoded agent id. The system default is managed in the
 *  admin console; each user may bind their own agent via the SlotAgentPicker in
 *  each card header. SoR: common-docs/systems/agent-slots/FEATURE.md. */
const BLOG_SLOT = "research_client.output_blog";
const SLIDES_SLOT = "research_client.output_slides";
const SEO_SLOT = "research_client.output_seo";

/** First H1 in a markdown doc, for an asset title. */
function extractMarkdownTitle(md: string): string | null {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

/** Build the generator input: prepend the Voice & Lens, then the report. */
function buildGeneratorInput(
  reportMarkdown: string,
  toneProfile: string,
): string {
  return (
    (toneProfile.trim() ? `Voice & Lens: ${toneProfile.trim()}\n\n` : "") +
    `Research report:\n\n${reportMarkdown}`
  );
}

/** Parse a JSON object out of an agent's text output, tolerating code fences
 *  or stray prose around it. Returns null if no valid object is found. */
function parseJsonLoose<T = Record<string, unknown>>(s: string): T | null {
  if (!s) return null;
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const i = t.indexOf("{");
    const j = t.lastIndexOf("}");
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
  }
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

interface PresentationDeck {
  title?: string;
  theme?: Record<string, unknown>;
  slides?: Array<Record<string, unknown>>;
}

const HOST_COUNTS = [1, 2, 3, 4] as const;
const PODCAST_TYPES: { value: PodcastType; label: string }[] = [
  { value: "educational", label: "Educational" },
  { value: "news", label: "News" },
];

export default function OutputsStudio() {
  const { topicId, topic, refresh } = useTopicContext();

  // The report that feeds every publishing output. It now arrives through the
  // SAME resource-bundle path the domain outputs use: the `research-report-only`
  // system bundle (assembled document, else the newest successful topic report).
  // One mechanism for both families — a second hand-rolled "get the report"
  // fetch here is exactly how the two paths would drift.
  //
  // Falls back to the direct read if the bundle is missing (a database that has
  // not been seeded must still generate a podcast), and says so out loud rather
  // than silently rendering "no report yet".
  const [reportMarkdown, setReportMarkdown] = useState("");
  // Loading + fallback are DERIVED from the fetch lifecycle (keyed by which
  // topic the last completed fetch / fallback was for) — no synchronous
  // setState inside the effect.
  const [reportLoadedFor, setReportLoadedFor] = useState<string | null>(null);
  const [bundleFallbackFor, setBundleFallbackFor] = useState<string | null>(
    null,
  );
  const reportLoading = Boolean(topicId) && reportLoadedFor !== topicId;
  const bundleFallback = Boolean(topicId) && bundleFallbackFor === topicId;

  useEffect(() => {
    if (!topicId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await getBundleBySlug(REPORT_ONLY_BUNDLE_SLUG).catch(
          () => null,
        );
        if (bundle) {
          const manifest = await getResourceManifest(topicId);
          const resolved = await resolveBundle(manifest, bundle);
          if (cancelled) return;
          const md = resolved.variables.research_report ?? "";
          if (md.trim()) {
            setReportMarkdown(md);
            return;
          }
        } else if (!cancelled) {
          setBundleFallbackFor(topicId);
        }

        // Direct read — the pre-bundle path, kept as the safety net only.
        const [doc, synth] = await Promise.all([
          getDocument(topicId).catch(() => null),
          getSynthesis(topicId).catch(() => [] as ResearchSynthesis[]),
        ]);
        if (cancelled) return;
        let md = "";
        if (doc?.content?.trim()) {
          md = doc.content;
        } else {
          // PHASE-4 COMPAT: legacy rows carry scope="project" (= topic-wide).
          const list = (synth ?? []).filter(
            (s) => normalizeSynthesisScope(s.scope) === "topic",
          );
          const current =
            list.find((s) => s.is_current && s.result?.trim()) ??
            list.find((s) => s.result?.trim());
          md = current?.result ?? "";
        }
        setReportMarkdown(md);
      } finally {
        if (!cancelled) setReportLoadedFor(topicId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const hasReport = reportMarkdown.trim().length > 0;
  const outputs = useMemo(() => parseOutputs(topic?.outputs), [topic?.outputs]);

  // Append a freshly generated asset to the topic's outputs index. Goes
  // through the row-locked `rs_topic_append_output` RPC — a client-side
  // read-modify-write of the whole `outputs` JSONB would let a long-running
  // generator (podcast: 8–12 min) overwrite assets created during its wait
  // with a stale snapshot. The RPC merges server-side under a row lock.
  const persistOutput = async (kind: OutputKind, asset: OutputAsset) => {
    await appendTopicOutput(
      topicId,
      kind,
      asset as unknown as Record<string, unknown>,
    );
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
          <PackageOpen className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground/80">
            Outputs Studio
          </span>
          <span className="text-[11px] text-muted-foreground">
            Turn this research into publishable formats
          </span>
        </div>

        <DomainReportsCard topicId={topicId} />

        {bundleFallback && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              The <code>{REPORT_ONLY_BUNDLE_SLUG}</code> system bundle is
              missing from the database, so the report was read the old way.
              Outputs still work; apply{" "}
              <code>migrations/research_system_context_bundles.sql</code> to
              restore the canonical path.
            </span>
          </div>
        )}

        {reportLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>Loading the research report…</span>
          </div>
        )}

        {!hasReport && !reportLoading && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              No report yet. Run the{" "}
              <Link
                href={`/research/topics/${topicId}/synthesis`}
                className="underline hover:no-underline"
              >
                project synthesis
              </Link>{" "}
              (or generate the{" "}
              <Link
                href={`/research/topics/${topicId}/document`}
                className="underline hover:no-underline"
              >
                document
              </Link>
              ) first — every output is built from it.
            </span>
          </div>
        )}

        <PodcastOutputCard
          topicId={topicId}
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "podcast")}
          onPersisted={(asset) => persistOutput("podcast", asset)}
        />

        <BlogOutputCard
          topicId={topicId}
          organizationId={topic?.organization_id ?? undefined}
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "blog")}
          onPersisted={(asset) => persistOutput("blog", asset)}
        />
        <SlidesOutputCard
          topicId={topicId}
          organizationId={topic?.organization_id ?? undefined}
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "slides")}
          onPersisted={(asset) => persistOutput("slides", asset)}
        />

        <SeoOutputCard
          topicId={topicId}
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          existing={assetsFor(outputs, "seo")}
          onPersisted={(asset) => persistOutput("seo", asset)}
        />
      </div>
    </div>
  );
}

/**
 * DOMAIN REPORTS — the outputs that read the RESEARCH, not the report.
 *
 * Each one is an agent plus a system bundle (see `outputDefinitions.ts`), and
 * each opens in the Context Builder with its bundle preloaded. That is
 * deliberate: the builder shows exactly which resources the agent will receive
 * and what they cost before a token is spent. A "just generate it" button here
 * would be a second run path whose inputs are invisible — precisely the problem
 * this whole system exists to fix.
 */
function DomainReportsCard({ topicId }: { topicId: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5 border-b border-border/50">
        <ListTree className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">
            Domain reports
          </div>
          <div className="text-[11px] text-muted-foreground">
            Built from the research itself — search results, pages read,
            analyses and syntheses — not from the finished report. Each opens
            with its inputs already selected so you can see the cost before
            running.
          </div>
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {DOMAIN_OUTPUTS.map((def) => (
          <Link
            key={def.slug}
            href={contextBuilderHref(topicId, def.bundleSlug)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-foreground">
                {def.label}
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-2">
                {def.description}
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Podcast output (live: posts the report to the running /podcast/generate) ──

function PodcastOutputCard({
  topicId,
  reportMarkdown,
  hasReport,
  defaultTitle,
  existing,
  onPersisted,
}: {
  topicId: string;
  reportMarkdown: string;
  hasReport: boolean;
  defaultTitle: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  const run = usePodcastRun();
  const [hostCount, setHostCount] = useState(2);
  const [podcastType, setPodcastType] = useState<PodcastType>("educational");
  const [quickTest, setQuickTest] = useState(false);
  const savedRef = useRef<Set<string>>(new Set());

  const { state, startedAt, start, cancel, reset } = run;
  const isRunning = state.status === "running";

  const liveCover =
    state.images.find((s) => s.status === "done" && s.url)?.url ?? null;

  // Persist the episode into the topic's outputs index once it lands — with
  // EVERY media URL it produced (cover, all stills, all clips, the composed
  // video, audio). All are durable public CDN URLs (`pc_episodes` + the
  // official-video persist write them PUBLIC, never signed — backend file
  // rule 3), so the whole episode re-renders inline on a cold load with no
  // re-query of the podcast domain. The /podcast/{slug} page is the deep link,
  // not the only place the media survives.
  useEffect(() => {
    if (
      state.status === "done" &&
      state.episodeId &&
      !savedRef.current.has(state.episodeId)
    ) {
      savedRef.current.add(state.episodeId);
      const imageUrls = state.images
        .filter((s) => s.status === "done" && s.url)
        .map((s) => s.url as string);
      const videoUrls = state.videos
        .filter((s) => s.status === "done" && s.url)
        .map((s) => s.url as string);
      const media: PodcastMedia = {
        host_count: hostCount,
        podcast_type: podcastType,
        audio_url: state.audioUrl ?? undefined,
        cover_url: imageUrls[0],
        image_urls: imageUrls,
        video_urls: videoUrls,
        official_video_url: state.officialVideoUrl ?? undefined,
      };
      const asset: OutputAsset = {
        id: state.episodeId,
        kind: "podcast",
        title: state.title || defaultTitle,
        status: "ready",
        created_at: new Date().toISOString(),
        slug: state.episodeSlug ?? undefined,
        url: state.episodeSlug ? `/podcast/${state.episodeSlug}` : undefined,
        meta: media as unknown as Record<string, unknown>,
      };
      onPersisted(asset)
        .then(() => toast.success(`Podcast “${asset.title}” saved to outputs`))
        .catch((e) =>
          toast.error(
            `Generated, but couldn't save to outputs: ${
              e instanceof Error ? e.message : "unknown error"
            }`,
          ),
        );
    }
  }, [
    state.status,
    state.episodeId,
    state.title,
    state.episodeSlug,
    state.audioUrl,
    state.officialVideoUrl,
    state.images,
    state.videos,
    defaultTitle,
    hostCount,
    podcastType,
    onPersisted,
  ]);

  const handleGenerate = () => {
    if (!hasReport || isRunning) return;
    void start({
      context_anchor: {
        resource_type: "research_topic",
        resource_id: topicId,
      },
      input_data_type: "full_content",
      input_data: reportMarkdown,
      podcast_type: podcastType,
      host_count: hostCount,
      ...(quickTest
        ? { truncate_audio_for_testing: true, max_images: 0, max_videos: 0 }
        : {}),
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/50">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Mic className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">Podcast</span>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              Live
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A two-voice episode from this research — audio, cover art, show
            notes.
          </p>
        </div>
        {existing.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {existing.length} generated
          </span>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        {/* Options */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Hosts</span>
            <div className="flex rounded-lg border border-border/60 overflow-hidden">
              {HOST_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setHostCount(n)}
                  disabled={isRunning}
                  className={cn(
                    "h-7 w-7 text-[11px] font-medium transition-colors disabled:opacity-50",
                    hostCount === n
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Style</span>
            <div className="flex rounded-lg border border-border/60 overflow-hidden">
              {PODCAST_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setPodcastType(t.value)}
                  disabled={isRunning}
                  className={cn(
                    "h-7 px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50",
                    podcastType === t.value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={quickTest}
              onCheckedChange={(v) => setQuickTest(v === true)}
              disabled={isRunning}
            />
            Quick test render
            <span className="text-muted-foreground/60">(short, no media)</span>
          </label>
        </div>

        {/* Action / live progress */}
        {!isRunning && state.status !== "done" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleGenerate}
              disabled={!hasReport}
            >
              <Mic className="h-3.5 w-3.5" />
              Generate podcast
            </Button>
            {state.status === "error" && state.error && (
              <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {state.error}
              </span>
            )}
          </div>
        )}

        {isRunning && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                This takes about 8–12 minutes. Watch the cover art, clips, and
                script come together below — you can leave and come back.
              </p>
              <button
                onClick={cancel}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                title="Cancel generation"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>

            <LiveProgressRail state={state} startedAt={startedAt} />

            {state.title && (
              <ProductionTeaser state={state} startedAt={startedAt} />
            )}

            {state.audioUrl && (
              <audio controls src={state.audioUrl} className="w-full h-9" />
            )}

            <MediaOptionsGrid
              state={state}
              interactive={false}
              selectedCoverUrl={liveCover}
              onSelectCover={() => {}}
            />
          </div>
        )}

        {state.status === "done" && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/[0.06] px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-xs font-medium text-foreground/90 flex-1 truncate">
                {state.title || "Episode ready"}
              </span>
              <button
                onClick={reset}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                New
              </button>
            </div>
            {state.audioUrl && (
              <audio controls src={state.audioUrl} className="w-full h-9" />
            )}
            {state.episodeSlug && (
              <Link
                href={`/podcast/${state.episodeSlug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Open episode page
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

        {/* Previously generated — each episode re-renders its full media
            (cover, audio, composed video, every still + clip) from the
            persisted index, so a refresh shows everything it produced. */}
        {existing.length > 0 && (
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Generated episodes
            </span>
            <div className="space-y-2">
              {existing.map((a) => (
                <PersistedEpisode key={a.id} asset={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A previously-generated episode, fully reconstructed from the persisted
 *  outputs index — cover, audio, the composed video, and every still + clip.
 *  All URLs are durable public CDN, so this is the same media the live run
 *  produced, surviving any number of refreshes with no podcast-domain query. */
function PersistedEpisode({ asset }: { asset: OutputAsset }) {
  const media = useMemo<PodcastMedia>(() => podcastMediaFrom(asset), [asset]);
  const [showMedia, setShowMedia] = useState(false);

  const images = media.image_urls ?? [];
  const clips = media.video_urls ?? [];
  const cover = media.cover_url ?? images[0] ?? null;
  // The cover already appears as the header thumbnail — the still strip shows
  // the remaining alternates so nothing is duplicated or lost.
  const extraStills = cover ? images.filter((u) => u !== cover) : images;
  const mediaCount =
    (media.audio_url ? 1 : 0) +
    (media.official_video_url ? 1 : 0) +
    images.length +
    clips.length;

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-9 w-9 rounded object-cover shrink-0 border border-border/40"
          />
        ) : (
          <div className="h-9 w-9 rounded bg-muted/60 flex items-center justify-center shrink-0">
            <Headphones className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium truncate">{asset.title}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {new Date(asset.created_at).toLocaleDateString()}
            {mediaCount > 0 && (
              <span className="ml-1.5">
                · {mediaCount} media {mediaCount === 1 ? "item" : "items"}
              </span>
            )}
          </div>
        </div>
        {mediaCount > 0 && (
          <button
            onClick={() => setShowMedia((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
          >
            {showMedia ? "Hide" : "Show"} media
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                showMedia && "rotate-180",
              )}
            />
          </button>
        )}
        {asset.slug && (
          <Link
            href={`/podcast/${asset.slug}`}
            target="_blank"
            className="text-muted-foreground hover:text-primary shrink-0"
            title="Open episode page"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Audio is always shown when present — it's the episode's core artifact. */}
      {media.audio_url && (
        <div className="px-2.5 pb-2">
          <SessionMediaElement
            as="audio"
            sessionSource="podcast"
            sessionLabel={asset.title}
            controls
            src={media.audio_url}
            className="w-full h-8"
          />
        </div>
      )}

      {showMedia && mediaCount > 0 && (
        <div className="border-t border-border/40 px-2.5 py-2.5 space-y-3">
          {media.official_video_url && (
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Film className="h-3 w-3" />
                Composed video
              </span>
              <SessionMediaElement
                sessionSource="podcast"
                sessionLabel={`${asset.title} — video`}
                controls
                src={media.official_video_url}
                poster={cover ?? undefined}
                className="w-full rounded-md border border-border/40 bg-black/90 max-h-72"
              />
            </div>
          )}

          {clips.length > 0 && (
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Clapperboard className="h-3 w-3" />
                Clips ({clips.length})
              </span>
              <div className="grid grid-cols-2 gap-2">
                {clips.map((url, i) => (
                  <SessionMediaElement
                    key={i}
                    sessionSource="podcast"
                    sessionLabel={`${asset.title} — clip ${i + 1}`}
                    controls
                    src={url}
                    className="w-full rounded-md border border-border/40 bg-black/90"
                  />
                ))}
              </div>
            </div>
          )}

          {extraStills.length > 0 && (
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                Cover art &amp; stills ({images.length})
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {extraStills.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded object-cover border border-border/40"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Blog output (live: runs the content_to_blog agent over the report) ──────

function BlogOutputCard({
  topicId,
  organizationId,
  reportMarkdown,
  hasReport,
  toneProfile,
  defaultTitle,
  existing,
  onPersisted,
}: {
  topicId: string;
  organizationId?: string;
  reportMarkdown: string;
  hasReport: boolean;
  toneProfile: string;
  defaultTitle: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  const { runSlot, running, unavailable, slotError } = useSlotRunner(BLOG_SLOT);
  const [streamText, setStreamText] = useState("");
  const [viewing, setViewing] = useState<OutputAsset | null>(null);

  const handleGenerate = async () => {
    if (!hasReport || running) return;
    setStreamText("");
    setViewing(null);
    const input =
      (toneProfile.trim() ? `Voice & Lens: ${toneProfile.trim()}\n\n` : "") +
      `Research report:\n\n${reportMarkdown}`;
    try {
      const md = await runSlot({
        userInput: input,
        organizationId,
        contextAnchor: {
          resource_type: "research_topic",
          resource_id: topicId,
        },
        sourceApp: "matrx-frontend",
        sourceFeature: "research",
        onChunk: (full) => setStreamText(full),
      });
      if (md && md.trim()) {
        const asset: OutputAsset = {
          id: crypto.randomUUID(),
          kind: "blog",
          title: extractMarkdownTitle(md) || `${defaultTitle} — blog`,
          status: "ready",
          created_at: new Date().toISOString(),
          meta: { markdown: md },
        };
        await onPersisted(asset);
        setStreamText("");
        setViewing(asset);
        toast.success("Blog article saved to outputs");
      } else {
        toast.error("The blog generator returned no content.");
      }
    } catch (e) {
      toast.error(
        `Blog generation failed: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    }
  };

  const viewingMarkdown =
    typeof viewing?.meta?.markdown === "string"
      ? (viewing.meta.markdown as string)
      : "";

  return (
    <OutputCardShell
      icon={<FileText className="h-4 w-4" />}
      title="Blog post"
      blurb="An SEO-optimized, cited article from this research — copy or export to WordPress."
      count={existing.length}
      slotKey={BLOG_SLOT}
    >
      <>
        {slotError && <SlotUnavailableNote message={slotError} />}
        {!running && !viewing && (
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleGenerate}
            disabled={!hasReport || unavailable}
          >
            <FileText className="h-3.5 w-3.5" />
            Generate blog
          </Button>
        )}

        {running && (
          <div className="rounded-lg border border-primary/30 bg-primary/[0.04] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
              <span className="text-xs font-medium text-primary">
                Writing the article…
              </span>
            </div>
            {streamText && (
              <div className="px-3 py-3 max-h-[420px] overflow-y-auto">
                <MarkdownStream content={streamText} isStreamActive />
              </div>
            )}
          </div>
        )}

        {!running && viewing && (
          <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-xs font-medium flex-1 truncate">
                {viewing.title}
              </span>
              <button
                onClick={() => setViewing(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="px-3 py-3 max-h-[460px] overflow-y-auto">
              <MarkdownStream content={viewingMarkdown} />
              <div className="flex justify-end mt-2">
                <ContentActionBar
                  content={viewingMarkdown}
                  title={viewing.title}
                  instanceKey={`research-blog-${viewing.id}`}
                />
              </div>
            </div>
          </div>
        )}

        {existing.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Generated articles
            </span>
            <div className="space-y-1">
              {existing.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setViewing(a);
                    setStreamText("");
                  }}
                  className="w-full flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-left hover:bg-accent/40 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium truncate flex-1">
                    {a.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    </OutputCardShell>
  );
}

// ── Reusable output-card chrome ──────────────────────────────────────────────

function OutputCardShell({
  icon,
  title,
  blurb,
  count,
  slotKey,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  count: number;
  /** The agent slot that writes this output — renders the "which agent runs
   *  this" picker in the header, so swapping in your own agent is one click
   *  from where the output is generated. */
  slotKey: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/50">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{title}</span>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              Live
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">{blurb}</p>
        </div>
        {count > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {count} generated
          </span>
        )}
        <SlotAgentPicker slotKey={slotKey} className="shrink-0" />
      </div>
      <div className="p-3.5 space-y-3">{children}</div>
    </div>
  );
}

/** The generator's agent could not resolve — the affordance is disabled and
 *  says why (loud recovery: never fall back to a hardcoded agent). */
function SlotUnavailableNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-3 py-2.5">
      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-destructive">
          This generator has no agent bound
        </p>
        <p className="text-[11px] text-muted-foreground break-words">{message}</p>
      </div>
    </div>
  );
}

function GeneratingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
      <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
      <span className="text-xs font-medium text-primary">{label}</span>
    </div>
  );
}

// ── Slides output ────────────────────────────────────────────────────────────
//
// The deck IS the `presentation_deck` content-IR kind: the slot's agent emits a
// canonical `{__kind:"presentation_deck", slides:[{__kind:"presentation_slide"}]}`
// envelope, so the run streams into the FLOATING LiveRunWindow and the pipeline
// routes it to the real Slideshow token by token — no spinner, no page shift,
// and no second renderer for a shape that already has one. The persisted asset
// replays through the SAME path (`KindInstanceRender`), so a reload shows the
// identical component the live run did.

function SlidesOutputCard({
  topicId,
  organizationId,
  reportMarkdown,
  hasReport,
  toneProfile,
  defaultTitle,
  existing,
  onPersisted,
}: {
  topicId: string;
  organizationId?: string;
  reportMarkdown: string;
  hasReport: boolean;
  toneProfile: string;
  defaultTitle: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  // Slot resolution stays the identity layer (the header's SlotAgentPicker
  // still swaps the agent); the RUN goes through the live posture so the deck
  // streams instead of hiding behind a spinner.
  const { error: slotError } = useAgentSlot(SLIDES_SLOT);
  const unavailable = slotError !== null;
  const {
    run,
    isRunning: running,
    conversationId,
    hasLiveRun,
  } = useLiveAgentRun();
  const [viewing, setViewing] = useState<OutputAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!hasReport || running) return;
    setViewing(null);
    setError(null);
    try {
      const deck = await run<PresentationDeck>({
        slotKey: SLIDES_SLOT,
        surfaceKey: `research-outputs-slides:${topicId}`,
        sourceFeature: "research",
        userInput: buildGeneratorInput(reportMarkdown, toneProfile),
        organizationId,
        contextAnchor: {
          resource_type: "research_topic",
          resource_id: topicId,
        },
        // A 10-14 slide deck on a long report runs well past the 120s default.
        timeoutMs: 300_000,
        // LOUD, and DIFFERENT from the noJson message below: "the run produced
        // nothing" and "the run produced the wrong shape" are different bugs
        // and must never share a sentence, or the next person debugging this
        // cannot tell which one they are looking at.
        coerce: (value) => {
          const candidate = value as PresentationDeck | null;
          if (
            !candidate ||
            !Array.isArray(candidate.slides) ||
            candidate.slides.length === 0
          ) {
            const shape =
              candidate && typeof candidate === "object"
                ? `keys: ${Object.keys(candidate).join(", ") || "(none)"}`
                : `type: ${typeof candidate}`;
            throw new Error(
              `The slides generator returned something that isn't a deck (${shape}). Try again.`,
            );
          }
          return candidate;
        },
        failureMessages: {
          noJson:
            "The slides generator finished but produced no deck at all. Try again.",
        },
      });
      const asset: OutputAsset = {
        id: crypto.randomUUID(),
        kind: "slides",
        // The envelope is persisted AS the canonical kind value (`__kind` and
        // all) so the saved asset replays through the same render path the
        // live run used — never a second, drifting shape.
        title: deck.title || `${defaultTitle} — slides`,
        status: "ready",
        created_at: new Date().toISOString(),
        meta: { presentation: deck, slide_count: deck.slides?.length ?? 0 },
      };
      await onPersisted(asset);
      setViewing(asset);
      toast.success("Slide deck saved to outputs");
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  const deck =
    (viewing?.meta?.presentation as PresentationDeck | undefined) ?? null;

  return (
    <OutputCardShell
      icon={<Presentation className="h-4 w-4" />}
      title="Slide deck"
      blurb="A presentation built from this research — rendered as a live slideshow."
      count={existing.length}
      slotKey={SLIDES_SLOT}
    >
      {slotError && <SlotUnavailableNote message={slotError} />}
      {!running && !viewing && (
        <Button
          size="sm"
          className="gap-1.5 h-8"
          onClick={handleGenerate}
          disabled={!hasReport || unavailable}
        >
          <Presentation className="h-3.5 w-3.5" />
          Generate slides
        </Button>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
      {/* THE FLOATING LAW: the run streams in a floating window, so this card
          — and every card under it — never moves while the deck is built. */}
      {hasLiveRun ? (
        <LiveRunWindowController
          instanceId={`research-slides:${topicId}`}
          conversationId={conversationId}
          label="Designing the deck"
          pending={running && !conversationId}
        />
      ) : null}
      {running && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Designing the deck — watch it build in the run window.
        </span>
      )}

      {!running && viewing && deck && (
        <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-xs font-medium flex-1 truncate">
              {viewing.title}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {deck.slides?.length ?? 0} slides
            </span>
            <button
              onClick={() => setViewing(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {/* ONE shape, ONE component: the saved deck replays through the
              canonical route (envelope → `applyIrKindRoute` → the presentation
              renderer), exactly what the live run showed. */}
          <div className="relative bg-background p-2">
            <KindInstanceRender
              kind="presentation_deck"
              value={deck}
              showRoutingNote={false}
            />
          </div>
        </div>
      )}

      {existing.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Generated decks
          </span>
          <div className="space-y-1">
            {existing.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setViewing(a);
                  setError(null);
                }}
                className="w-full flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-left hover:bg-accent/40 transition-colors"
              >
                <Presentation className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-medium truncate flex-1">
                  {a.title}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </OutputCardShell>
  );
}

// ── SEO output ───────────────────────────────────────────────────────────────
//
// The package IS the `seo_package` content-IR kind: the slot's agent emits a
// canonical `{__kind:"seo_package", faq:[{__kind:"faq_item"}]}` envelope, so the
// run streams into the FLOATING LiveRunWindow and the pipeline routes it to the
// real SeoPackageBlock token by token — the title lands with its 60-character
// budget already measured while the FAQ is still being written. No spinner, no
// page shift, and no second renderer for a shape that already has one (the
// bespoke `SeoView` card this replaced was deleted 2026-08-11). The persisted
// asset replays through the SAME path (`KindInstanceRender`), so a reload shows
// the identical component the live run did.
//
// The research-topic anchor and the org survive the move: `HeadlessAgentJsonOptions`
// carries `contextAnchor` / `organizationId` straight into the launcher (D165,
// filed and closed 2026-08-11), so the server still reloads the topic's saved
// scope exactly as the one-shot runner made it do.
//
// SAVING is broken platform-wide right now — FOUND_DEFECTS D167: every Outputs
// Studio generator persists through `rs_topic_append_output`, whose `FOR UPDATE`
// is denied by the RLS update policy, so the run completes and the save 400s.
// Not this card's bug; this card just refuses to hide it.

function SeoOutputCard({
  topicId,
  organizationId,
  reportMarkdown,
  hasReport,
  toneProfile,
  existing,
  onPersisted,
}: {
  topicId: string;
  organizationId?: string;
  reportMarkdown: string;
  hasReport: boolean;
  toneProfile: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  // Resolution is read here only to DISABLE the affordance and say why; the
  // run itself resolves the slot inside the canonical launcher.
  const { error: slotError } = useAgentSlot(SEO_SLOT);
  const seoRun = useLiveAgentRun();
  const [viewing, setViewing] = useState<OutputAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!hasReport || seoRun.isRunning) return;
    setViewing(null);
    setError(null);
    try {
      const seo = await seoRun.run<Record<string, unknown>>({
        slotKey: SEO_SLOT,
        surfaceKey: "research-outputs-seo",
        sourceFeature: "research",
        organizationId,
        contextAnchor: {
          resource_type: "research_topic",
          resource_id: topicId,
        },
        userInput: buildGeneratorInput(reportMarkdown, toneProfile),
        coerce: (value) => {
          if (
            typeof value !== "object" ||
            value === null ||
            typeof (value as { title?: unknown }).title !== "string"
          ) {
            throw new Error(
              "The SEO generator didn't return a valid package. Try again.",
            );
          }
          return value as Record<string, unknown>;
        },
      });
      const asset: OutputAsset = {
        id: crypto.randomUUID(),
        kind: "seo",
        title: String(seo.title),
        status: "ready",
        created_at: new Date().toISOString(),
        slug: typeof seo.slug === "string" ? seo.slug : undefined,
        meta: { seo },
      };
      await onPersisted(asset);
      setViewing(asset);
      seoRun.dismiss();
      toast.success("SEO package saved to outputs");
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  const seo = (viewing?.meta?.seo as Record<string, unknown> | undefined) ?? null;

  return (
    <OutputCardShell
      icon={<SearchIcon className="h-4 w-4" />}
      title="SEO package"
      blurb="Title, meta, slug, keywords, schema.org + OG — on-page SEO for the published piece."
      count={existing.length}
      slotKey={SEO_SLOT}
    >
      {slotError && <SlotUnavailableNote message={slotError} />}
      {!seoRun.isRunning && !viewing && (
        <Button
          size="sm"
          className="gap-1.5 h-8"
          onClick={handleGenerate}
          disabled={!hasReport || slotError !== null}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          Generate SEO package
        </Button>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}

      {/* The RUN itself is the display — it floats, so this page never shifts
          and the user can keep working underneath. This strip only says where
          to look; it is never the only thing on screen while the AI works. */}
      {seoRun.hasLiveRun && (
        <LiveRunWindowController
          instanceId={`seo:${topicId}`}
          conversationId={seoRun.conversationId}
          pending={seoRun.conversationId === null}
          label="Optimizing for search"
        />
      )}
      {/* Gated on isRunning, NOT hasLiveRun: the window deliberately stays open
          after a run settles so the user can keep reading it, but this line must
          stop claiming a stream the moment there is no longer one — a failed run
          left it saying "streaming" forever. */}
      {seoRun.isRunning && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-xs font-medium text-primary">
            Writing the package — it is streaming in the run window.
          </span>
        </div>
      )}

      {!seoRun.isRunning && viewing && seo && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
            <span className="flex-1 truncate text-xs font-medium">
              {viewing.title}
            </span>
            <button
              onClick={() => setViewing(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {/* ONE component for the shape — the same one the live run rendered. */}
          <KindInstanceRender
            kind="seo_package"
            value={seo}
            showRoutingNote={false}
          />
        </div>
      )}

      {existing.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Generated packages
          </span>
          <div className="space-y-1">
            {existing.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setViewing(a);
                  setError(null);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40"
              >
                <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-[11px] font-medium">
                  {a.title}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </OutputCardShell>
  );
}
