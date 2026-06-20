"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
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
  Link2,
  Tag,
  HelpCircle,
  ImageIcon,
  Clapperboard,
  Film,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTopicContext } from "../../context/ResearchContext";
import { appendTopicOutput, getDocument, getSynthesis } from "../../service";
import type { ResearchSynthesis } from "../../types";
import { usePodcastRun } from "@/features/podcasts/generator/usePodcastRun";
import type { PodcastType } from "@/features/podcasts/generator/types";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { ProductionTeaser } from "@/features/podcasts/generator/components/ProductionTeaser";
import { MediaOptionsGrid } from "@/features/podcasts/generator/components/MediaOptionsGrid";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import MarkdownStream from "@/components/MarkdownStream";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import Slideshow from "@/components/mardown-display/blocks/presentations/Slideshow";
import {
  parseOutputs,
  assetsFor,
  podcastMediaFrom,
  type OutputAsset,
  type OutputKind,
  type PodcastMedia,
} from "./outputs";

/** Research content-engine generator agents (created as data; run live via
 *  /ai/agents/{id}). Each forks the runnable config of the blog generator. */
const BLOG_AGENT_ID = "d5a17f12-c06e-4b07-8222-3fd1dfbdd85b";
const SLIDES_AGENT_ID = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";
const SEO_AGENT_ID = "de3e5a62-559b-406a-a6bd-c6064b4ba3fe";

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

interface SeoPackage {
  title?: string;
  meta_description?: string;
  slug?: string;
  primary_keyword?: string;
  keywords?: string[];
  schema_org?: Record<string, unknown>;
  open_graph?: Record<string, unknown>;
  faq?: Array<{ question?: string; answer?: string }>;
}

const HOST_COUNTS = [1, 2, 3, 4] as const;
const PODCAST_TYPES: { value: PodcastType; label: string }[] = [
  { value: "educational", label: "Educational" },
  { value: "news", label: "News" },
];

export default function OutputsStudio() {
  const { topicId, topic, refresh } = useTopicContext();

  // The report that feeds every output: prefer the assembled document, fall
  // back to the current project synthesis. Self-contained client fetch (runs
  // after mount when the Supabase session is ready) — more reliable here than
  // the shared query hook, which got stuck loading on this surface.
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setReportLoading(true);
    void (async () => {
      try {
        const [doc, synth] = await Promise.all([
          getDocument(topicId).catch(() => null),
          getSynthesis(topicId).catch(() => [] as ResearchSynthesis[]),
        ]);
        if (cancelled) return;
        let md = "";
        if (doc?.content?.trim()) {
          md = doc.content;
        } else {
          const list = (synth ?? []).filter((s) => s.scope === "project");
          const current =
            list.find((s) => s.is_current && s.result?.trim()) ??
            list.find((s) => s.result?.trim());
          md = current?.result ?? "";
        }
        setReportMarkdown(md);
      } finally {
        if (!cancelled) setReportLoading(false);
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
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground/80">
            Outputs Studio
          </span>
          <span className="text-[11px] text-muted-foreground">
            Turn this research into publishable formats
          </span>
        </div>

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
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "blog")}
          onPersisted={(asset) => persistOutput("blog", asset)}
        />
        <SlidesOutputCard
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "slides")}
          onPersisted={(asset) => persistOutput("slides", asset)}
        />

        <SeoOutputCard
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "seo")}
          onPersisted={(asset) => persistOutput("seo", asset)}
        />
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
            <input
              type="checkbox"
              checked={quickTest}
              onChange={(e) => setQuickTest(e.target.checked)}
              disabled={isRunning}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
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
              <Sparkles className="h-3.5 w-3.5" />
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
          // eslint-disable-next-line @next/next/no-img-element
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
          <audio controls src={media.audio_url} className="w-full h-8" />
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
              <video
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
                  <video
                    key={i}
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
                  // eslint-disable-next-line @next/next/no-img-element
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
  reportMarkdown,
  hasReport,
  toneProfile,
  defaultTitle,
  existing,
  onPersisted,
}: {
  reportMarkdown: string;
  hasReport: boolean;
  toneProfile: string;
  defaultTitle: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  const { run, running } = useRunAgent();
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
      const md = await run({
        agentId: BLOG_AGENT_ID,
        userInput: input,
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
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/50">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">Blog post</span>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              Live
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            An SEO-optimized, cited article from this research — copy or export
            to WordPress.
          </p>
        </div>
        {existing.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {existing.length} generated
          </span>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        {!running && !viewing && (
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleGenerate}
            disabled={!hasReport}
          >
            <Sparkles className="h-3.5 w-3.5" />
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
      </div>
    </div>
  );
}

// ── Reusable output-card chrome ──────────────────────────────────────────────

function OutputCardShell({
  icon,
  title,
  blurb,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  count: number;
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
      </div>
      <div className="p-3.5 space-y-3">{children}</div>
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

// ── Slides output (live: runs research_to_slides → renders a Slideshow) ───────

function SlidesOutputCard({
  reportMarkdown,
  hasReport,
  toneProfile,
  defaultTitle,
  existing,
  onPersisted,
}: {
  reportMarkdown: string;
  hasReport: boolean;
  toneProfile: string;
  defaultTitle: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  const { run, running } = useRunAgent();
  const [viewing, setViewing] = useState<OutputAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!hasReport || running) return;
    setViewing(null);
    setError(null);
    try {
      const raw = await run({
        agentId: SLIDES_AGENT_ID,
        userInput: buildGeneratorInput(reportMarkdown, toneProfile),
      });
      const deck = parseJsonLoose<PresentationDeck>(raw);
      if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
        setError("The slides generator didn't return a valid deck. Try again.");
        return;
      }
      const asset: OutputAsset = {
        id: crypto.randomUUID(),
        kind: "slides",
        title: deck.title || `${defaultTitle} — slides`,
        status: "ready",
        created_at: new Date().toISOString(),
        meta: { presentation: deck, slide_count: deck.slides.length },
      };
      await onPersisted(asset);
      setViewing(asset);
      toast.success("Slide deck saved to outputs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
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
    >
      {!running && !viewing && (
        <Button
          size="sm"
          className="gap-1.5 h-8"
          onClick={handleGenerate}
          disabled={!hasReport}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate slides
        </Button>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
      {running && <GeneratingNote label="Designing the deck…" />}

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
          <div className="relative bg-background p-2">
            <Slideshow slides={deck.slides ?? []} theme={deck.theme ?? {}} />
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

// ── SEO output (live: runs research_to_seo → renders the package) ────────────

function SeoOutputCard({
  reportMarkdown,
  hasReport,
  toneProfile,
  defaultTitle,
  existing,
  onPersisted,
}: {
  reportMarkdown: string;
  hasReport: boolean;
  toneProfile: string;
  defaultTitle: string;
  existing: OutputAsset[];
  onPersisted: (asset: OutputAsset) => Promise<void>;
}) {
  const { run, running } = useRunAgent();
  const [viewing, setViewing] = useState<OutputAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!hasReport || running) return;
    setViewing(null);
    setError(null);
    try {
      const raw = await run({
        agentId: SEO_AGENT_ID,
        userInput: buildGeneratorInput(reportMarkdown, toneProfile),
      });
      const seo = parseJsonLoose<SeoPackage>(raw);
      if (!seo || !seo.title) {
        setError("The SEO generator didn't return a valid package. Try again.");
        return;
      }
      const asset: OutputAsset = {
        id: crypto.randomUUID(),
        kind: "seo",
        title: seo.title,
        status: "ready",
        created_at: new Date().toISOString(),
        slug: seo.slug,
        meta: { seo },
      };
      await onPersisted(asset);
      setViewing(asset);
      toast.success("SEO package saved to outputs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    }
  };

  const seo = (viewing?.meta?.seo as SeoPackage | undefined) ?? null;

  return (
    <OutputCardShell
      icon={<SearchIcon className="h-4 w-4" />}
      title="SEO package"
      blurb="Title, meta, slug, keywords, schema.org + OG — on-page SEO for the published piece."
      count={existing.length}
    >
      {!running && !viewing && (
        <Button
          size="sm"
          className="gap-1.5 h-8"
          onClick={handleGenerate}
          disabled={!hasReport}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate SEO package
        </Button>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
      {running && <GeneratingNote label="Optimizing for search…" />}

      {!running && viewing && seo && (
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
          <div className="p-3">
            <SeoView seo={seo} />
          </div>
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
                className="w-full flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-left hover:bg-accent/40 transition-colors"
              >
                <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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

function SeoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="text-xs text-foreground/90">{children}</div>
    </div>
  );
}

function SeoView({ seo }: { seo: SeoPackage }) {
  const [showRaw, setShowRaw] = useState(false);
  const jsonLd = JSON.stringify(
    { schema_org: seo.schema_org ?? {}, open_graph: seo.open_graph ?? {} },
    null,
    2,
  );
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div className="space-y-3">
      <SeoField label="Title">
        <span className="font-medium">{seo.title}</span>
        {typeof seo.title === "string" && (
          <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
            {seo.title.length}/60
          </span>
        )}
      </SeoField>
      {seo.meta_description && (
        <SeoField label="Meta description">
          {seo.meta_description}
          <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
            {seo.meta_description.length}/155
          </span>
        </SeoField>
      )}
      {seo.slug && (
        <SeoField label="Slug">
          <button
            onClick={() => copy(seo.slug!, "Slug")}
            className="inline-flex items-center gap-1 font-mono text-[11px] rounded bg-muted/60 px-1.5 py-0.5 hover:bg-muted"
          >
            <Link2 className="h-3 w-3" />
            {seo.slug}
          </button>
        </SeoField>
      )}
      {Array.isArray(seo.keywords) && seo.keywords.length > 0 && (
        <SeoField label="Keywords">
          <div className="flex flex-wrap gap-1 mt-0.5">
            {seo.keywords.map((k, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                  k === seo.primary_keyword
                    ? "bg-primary/10 text-primary font-medium"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                <Tag className="h-2.5 w-2.5" />
                {k}
              </span>
            ))}
          </div>
        </SeoField>
      )}
      {Array.isArray(seo.faq) && seo.faq.length > 0 && (
        <SeoField label="FAQ">
          <div className="space-y-1.5 mt-0.5">
            {seo.faq.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5"
              >
                <div className="flex items-start gap-1.5">
                  <HelpCircle className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-[11px] font-medium">{f.question}</span>
                </div>
                {f.answer && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 pl-4.5">
                    {f.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SeoField>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showRaw ? "Hide" : "Show"} schema.org + OpenGraph
        </button>
        <button
          onClick={() => copy(jsonLd, "JSON-LD")}
          className="text-[11px] text-primary hover:underline"
        >
          Copy JSON-LD
        </button>
      </div>
      {showRaw && (
        <pre className="text-[10px] bg-muted/50 rounded-lg p-2.5 overflow-x-auto max-h-60 overflow-y-auto leading-relaxed">
          {jsonLd}
        </pre>
      )}
    </div>
  );
}
