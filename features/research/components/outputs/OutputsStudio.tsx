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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTopicContext } from "../../context/ResearchContext";
import {
  useResearchDocument,
  useResearchSynthesis,
} from "../../hooks/useResearchState";
import { updateTopic } from "../../service";
import type { ResearchSynthesis } from "../../types";
import { usePodcastRun } from "@/features/podcasts/generator/usePodcastRun";
import type {
  PodcastType,
  PodcastRunState,
} from "@/features/podcasts/generator/types";
import { useRunAgent } from "@/features/agents/run/useRunAgent";
import MarkdownStream from "@/components/MarkdownStream";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import {
  parseOutputs,
  appendAsset,
  assetsFor,
  type OutputAsset,
} from "./outputs";

/** Research content-engine generator agents (created as data; run live via
 *  /ai/agents/{id}). content_to_blog forks the Document Assembly agent. */
const BLOG_AGENT_ID = "d5a17f12-c06e-4b07-8222-3fd1dfbdd85b";

/** First H1 in a markdown doc, for an asset title. */
function extractMarkdownTitle(md: string): string | null {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

const HOST_COUNTS = [1, 2, 3, 4] as const;
const PODCAST_TYPES: { value: PodcastType; label: string }[] = [
  { value: "educational", label: "Educational" },
  { value: "news", label: "News" },
];

export default function OutputsStudio() {
  const { topicId, topic, refresh } = useTopicContext();
  const { data: document } = useResearchDocument(topicId);
  const { data: projectSyntheses } = useResearchSynthesis(topicId, {
    scope: "project",
  });

  // The report that feeds every output: prefer the assembled document, fall
  // back to the current project synthesis.
  const reportMarkdown = useMemo(() => {
    if (document?.content?.trim()) return document.content;
    const list = (projectSyntheses ?? []) as ResearchSynthesis[];
    const current =
      list.find((s) => s.is_current && s.result?.trim()) ??
      list.find((s) => s.result?.trim());
    return current?.result ?? "";
  }, [document, projectSyntheses]);

  const hasReport = reportMarkdown.trim().length > 0;
  const outputs = useMemo(
    () => parseOutputs(topic?.outputs),
    [topic?.outputs],
  );

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

        {!hasReport && (
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
          onPersisted={async (asset) => {
            const next = appendAsset(parseOutputs(topic?.outputs), "podcast", asset);
            await updateTopic(topicId, { outputs: next });
            refresh();
          }}
        />

        <BlogOutputCard
          reportMarkdown={reportMarkdown}
          hasReport={hasReport}
          toneProfile={topic?.tone_profile ?? ""}
          defaultTitle={topic?.name ?? "Research"}
          existing={assetsFor(outputs, "blog")}
          onPersisted={async (asset) => {
            const next = appendAsset(parseOutputs(topic?.outputs), "blog", asset);
            await updateTopic(topicId, { outputs: next });
            refresh();
          }}
        />
        <PlaceholderCard
          icon={<Presentation className="h-4 w-4" />}
          title="Slide deck"
          blurb="A presentation rendered to a shareable web slideshow."
        />
        <PlaceholderCard
          icon={<SearchIcon className="h-4 w-4" />}
          title="SEO package"
          blurb="Title, meta, slug, keywords, schema.org + OG — on-page SEO for the published piece."
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

  const { state, start, cancel, reset } = run;
  const isRunning = state.status === "running";

  // Persist the episode into the topic's outputs index once it lands.
  useEffect(() => {
    if (
      state.status === "done" &&
      state.episodeId &&
      !savedRef.current.has(state.episodeId)
    ) {
      savedRef.current.add(state.episodeId);
      const asset: OutputAsset = {
        id: state.episodeId,
        kind: "podcast",
        title: state.title || defaultTitle,
        status: "ready",
        created_at: new Date().toISOString(),
        slug: state.episodeSlug ?? undefined,
        // Durable refs only — episode_id + slug. The /podcast/{slug} page
        // re-mints media; never persist the expiring signed audio URL here.
        url: state.episodeSlug ? `/podcast/${state.episodeSlug}` : undefined,
        meta: {
          host_count: hostCount,
          podcast_type: podcastType,
        },
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
            A two-voice episode from this research — audio, cover art, show notes.
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

        {isRunning && <LiveRun state={state} onCancel={cancel} />}

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

        {/* Previously generated */}
        {existing.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Generated episodes
            </span>
            <div className="space-y-1">
              {existing.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5"
                >
                  <Headphones className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium truncate flex-1">
                    {a.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {a.slug && (
                    <Link
                      href={`/podcast/${a.slug}`}
                      target="_blank"
                      className="text-muted-foreground hover:text-primary shrink-0"
                      title="Open episode"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveRun({
  state,
  onCancel,
}: {
  state: PodcastRunState;
  onCancel: () => void;
}) {
  const featured =
    state.stages.find((s) => s.status === "running")?.label ||
    state.currentLabel ||
    "Starting…";
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
        <span className="text-xs font-medium text-primary flex-1 truncate">
          {featured}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {Math.round(state.progress)}%
        </span>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${Math.max(4, Math.round(state.progress))}%` }}
        />
      </div>
      {state.audioUrl && (
        <audio controls src={state.audioUrl} className="w-full h-9" />
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
            An SEO-optimized, cited article from this research — copy or export to
            WordPress.
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

function PlaceholderCard({
  icon,
  title,
  blurb,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/50 bg-card/30 px-3.5 py-2.5 flex items-center gap-2.5">
      <div className="h-7 w-7 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground/70">
            {title}
          </span>
          <Badge variant="secondary" className="text-[8px] h-3.5 px-1 font-normal">
            Soon
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}
