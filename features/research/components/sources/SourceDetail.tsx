"use client";

import { useState, useCallback, useMemo, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ClipboardPaste,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Globe,
  Hash,
  Clock,
  Calendar,
  FileText,
  Tag,
  Info,
  Link2,
  Brain,
  TrendingUp,
  RotateCcw,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useResearchSource,
  useResearchSources,
  useSourceContent,
  useAnalysisForSource,
  useSourceImportance,
} from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import { useStreamDebug } from "../../context/ResearchContext";
import {
  updateSource,
  updateContentCurated,
  restoreOriginalContent,
} from "../../service";
import { toast } from "sonner";
import { StatusBadge } from "../shared/StatusBadge";
import { SourceTypeIcon } from "../shared/SourceTypeIcon";
import { OriginBadge } from "../shared/OriginBadge";
import { ContentViewer } from "./ContentViewer";
import { PasteContentModal } from "./PasteContentModal";
import { AnalyzeCurationDialog } from "./AnalyzeCurationDialog";
import { AnalysisCard } from "../analysis/AnalysisCard";
import { SourceTagPicker } from "./SourceTagPicker";
import { SourceRankBadges } from "./SourceRankBadges";
import MarkdownStream from "@/components/MarkdownStream";
import type {
  ResearchSource,
  ResearchContent,
  ResearchAnalysis,
  ResearchDataEvent,
} from "../../types";
import {
  jsonArrayLength,
  sourceOriginFromDb,
  sourceTypeFromDb,
  stringArrayFromJson,
} from "../../types";

function formatPageAge(pageAge: string | null): string {
  if (!pageAge) return "—";
  const date = new Date(pageAge);
  if (isNaN(date.getTime())) return pageAge;
  const days = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  if (days === 0) return `${formatted} (today)`;
  if (days === 1) return `${formatted} (1 day ago)`;
  if (days < 30) return `${formatted} (${days} days ago)`;
  if (days < 365) return `${formatted} (${Math.floor(days / 30)} months ago)`;
  return `${formatted} (${Math.floor(days / 365)} years ago)`;
}

function MetaRow({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0 pt-0.5">
        {icon}
        {label}
      </span>
      <div className="text-xs font-medium text-right">{children}</div>
    </div>
  );
}

interface SourceDetailProps {
  topicId: string;
  sourceId: string;
}

export default function SourceDetail({ topicId, sourceId }: SourceDetailProps) {
  const router = useRouter();
  const api = useResearchApi();
  const debug = useStreamDebug();
  const [isNavigating, startNavTransition] = useTransition();

  const { data: source, refresh: refetchSource } = useResearchSource(sourceId);
  const { data: contentData, refresh: refetchContent } =
    useSourceContent(sourceId);
  const { data: allSources } = useResearchSources(topicId);
  const { data: importanceMap } = useSourceImportance(topicId);
  const importance = importanceMap?.get(sourceId);
  const { data: allAnalyses, refresh: refetchAnalyses } =
    useAnalysisForSource(sourceId);

  // No optimistic state needed — the backend stream sends metadata only (not full rows).
  // We refetch from Supabase after each analysis_complete / rescrape_complete event.
  // Live token text while analysis LLM is streaming
  const [streamingAnalysisText, setStreamingAnalysisText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [showRawSearch, setShowRawSearch] = useState(false);

  const sourceIds = useMemo(
    () => (allSources as ResearchSource[] | null)?.map((s) => s.id) ?? [],
    [allSources],
  );
  const currentIndex = sourceIds.indexOf(sourceId);
  const prevSourceId = currentIndex > 0 ? sourceIds[currentIndex - 1] : null;
  const nextSourceId =
    currentIndex >= 0 && currentIndex < sourceIds.length - 1
      ? sourceIds[currentIndex + 1]
      : null;

  const navigateToSource = useCallback(
    (id: string) => {
      if (isNavigating) return;
      startNavTransition(() => {
        router.push(`/research/topics/${topicId}/sources/${id}`);
      });
    },
    [isNavigating, router, topicId],
  );

  // Content versions from DB, newest first
  const contentVersions = useMemo(() => {
    const db = (contentData ?? []) as ResearchContent[];
    return [...db].sort((a, b) => b.version - a.version);
  }, [contentData]);

  const [selectedVersion, setSelectedVersion] = useState(0);
  const currentContent = contentVersions[selectedVersion] ?? null;

  // Analyses from DB filtered to current content version
  const currentAnalyses = useMemo(() => {
    const db = (allAnalyses ?? []) as ResearchAnalysis[];
    if (!currentContent) return db;
    return db.filter((a) => a.content_id === currentContent.id);
  }, [allAnalyses, currentContent]);

  // ── Scrape stream ────────────────────────────────────────────────────────
  const scrapeStream = useResearchStream();

  const handleScrape = useCallback(async () => {
    if (!typedSource || scrapeStream.isStreaming) return;
    const response = await api.scrapeSource(topicId, sourceId);
    scrapeStream.startStream(response, {
      onData: (payload: ResearchDataEvent) => {
        // rescrape_complete = single-source rescrape endpoint result
        // scrape_complete = bulk scrape (also fires for single source)
        if (
          (payload.type === "rescrape_complete" ||
            payload.type === "scrape_complete") &&
          payload.source_id === sourceId
        ) {
          // Fetch the new content version from DB — the stream only has metadata (char_count),
          // not the full content row, so a targeted refetch is needed here
          refetchContent();
          setSelectedVersion(0);
        }
        if (
          payload.type === "scrape_failed" &&
          payload.source_id === sourceId
        ) {
          // Still refresh source to update scrape_status to 'failed'
          refetchSource();
        }
      },
      onEnd: () => {
        // Sync the source scrape_status field
        refetchSource();
      },
    });
    debug.pushEvents(scrapeStream.rawEvents, "scrape");
  }, [
    api,
    topicId,
    sourceId,
    scrapeStream,
    refetchSource,
    refetchContent,
    debug,
  ]);

  // ── Analyze stream ───────────────────────────────────────────────────────
  const analyzeStream = useResearchStream();
  // Accumulates the live tokens in a ref so failure handlers can read the full
  // text (closures over `streamingAnalysisText` would be stale).
  const streamedRef = useRef("");
  // When the provider stops early (e.g. Gemini safety) we PRESERVE what already
  // streamed + the reason, instead of throwing it away and showing nothing.
  const [interrupted, setInterrupted] = useState<{
    text: string;
    reason: string;
  } | null>(null);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (!currentContent || analyzeStream.isStreaming) return;
    setIsAnalyzing(true);
    setInterrupted(null);
    streamedRef.current = "";
    setStreamingAnalysisText("");
    const response = await api.analyzeSource(topicId, sourceId);
    analyzeStream.startStream(response, {
      onChunk: (text) => {
        // Live LLM token streaming — shows the analysis being written in real time
        streamedRef.current += text;
        setStreamingAnalysisText(streamedRef.current);
      },
      onData: (payload: ResearchDataEvent) => {
        if (
          payload.type === "analysis_complete" &&
          payload.source_id === sourceId
        ) {
          // Stream only sends metadata (result_length, model_id) — not the full row.
          // Refetch from DB to get the complete analysis object.
          setInterrupted(null);
          streamedRef.current = "";
          setStreamingAnalysisText("");
          refetchAnalyses();
        }
        if (
          payload.type === "analysis_failed" &&
          payload.source_id === sourceId
        ) {
          // The model stopped early (safety filter, max tokens, etc.). We
          // already received real content — KEEP it and report exactly what
          // happened, rather than wiping it and looking broken.
          if (streamedRef.current.trim()) {
            setInterrupted({
              text: streamedRef.current,
              reason: payload.error || "The AI provider stopped early.",
            });
          }
          setStreamingAnalysisText("");
          setIsAnalyzing(false);
        }
        if (payload.type === "retry_complete") {
          setInterrupted(null);
          streamedRef.current = "";
          setStreamingAnalysisText("");
          refetchAnalyses();
        }
      },
      onEnd: () => {
        setIsAnalyzing(false);
        setStreamingAnalysisText("");
        // Final sync in case analysis_complete wasn't caught (e.g. single-source endpoint)
        refetchAnalyses();
      },
      onError: (msg: string) => {
        // Stream/network error after content streamed — preserve what we got.
        if (streamedRef.current.trim()) {
          setInterrupted({
            text: streamedRef.current,
            reason: msg || "The stream ended unexpectedly.",
          });
        }
        setIsAnalyzing(false);
        setStreamingAnalysisText("");
      },
    });
    debug.pushEvents(analyzeStream.rawEvents, "analyze");
  }, [
    api,
    topicId,
    sourceId,
    currentContent,
    analyzeStream,
    refetchAnalyses,
    debug,
  ]);

  // Plain fns — React Compiler memoizes; no manual useCallback/deps.
  const openAnalyzeDialog = () => setAnalyzeDialogOpen(true);

  // From the curation popup: save the trimmed/edited content (original backed
  // up once), then analyze the now-curated stored content. `null` = analyze the
  // full content as-is.
  const handleCuratedAnalyze = async (curated: string | null) => {
    setAnalyzeDialogOpen(false);
    if (curated !== null && currentContent) {
      try {
        await updateContentCurated(currentContent, curated);
        await refetchContent();
      } catch (err) {
        toast.error(
          `Couldn't save curated content: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
        return;
      }
    }
    handleAnalyze();
  };

  const handleRestoreOriginal = async () => {
    if (!currentContent?.original_content) return;
    try {
      await restoreOriginalContent(currentContent);
      refetchContent();
      toast.success("Restored the original scrape");
    } catch (err) {
      toast.error(
        `Couldn't restore: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  };

  const typedSource = source as ResearchSource | null | undefined;
  const extraSnippets = typedSource
    ? stringArrayFromJson(typedSource.extra_snippets)
    : [];
  const hasBeenScraped = typedSource && typedSource.scrape_status !== "pending";

  const handleMarkComplete = useCallback(async () => {
    await updateSource(sourceId, { scrape_status: "complete" });
    refetchSource();
  }, [sourceId, refetchSource]);

  const handleMarkStale = useCallback(async () => {
    await updateSource(sourceId, { is_stale: true });
    refetchSource();
  }, [sourceId, refetchSource]);

  const handleContentSaved = useCallback(() => {
    refetchContent();
  }, [refetchContent]);

  const isScraping = scrapeStream.isStreaming;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      {/* Left Panel — Source Info */}
      <div className="w-full md:w-[340px] lg:w-[380px] shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto pb-16 md:pb-0">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/research/topics/${topicId}/sources`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Sources
            </Link>
            {sourceIds.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentIndex + 1}/{sourceIds.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  disabled={!prevSourceId || isNavigating}
                  onClick={() => prevSourceId && navigateToSource(prevSourceId)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  disabled={!nextSourceId || isNavigating}
                  onClick={() => nextSourceId && navigateToSource(nextSourceId)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {typedSource && (
            <>
              {/* Hero: thumbnail + title */}
              <div className="space-y-3">
                {typedSource.thumbnail_url ? (
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-muted">
                    <Image
                      src={typedSource.thumbnail_url}
                      alt={typedSource.title ?? ""}
                      width={380}
                      height={214}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-full h-20 rounded-lg bg-muted flex items-center justify-center">
                    <Globe className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <SourceTypeIcon
                    type={sourceTypeFromDb(typedSource.source_type)}
                  />
                  <h2 className="font-semibold text-sm leading-snug">
                    {typedSource.title || "Untitled"}
                  </h2>
                </div>
                <a
                  href={typedSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-start gap-1 break-all"
                >
                  {typedSource.url}
                  <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                </a>
              </div>

              {/* Core metadata */}
              <div className="space-y-0 rounded-lg border border-border p-3">
                <MetaRow label="Host" icon={<Globe className="h-3 w-3" />}>
                  <span>{typedSource.hostname ?? "—"}</span>
                </MetaRow>
                <MetaRow label="Best rank" icon={<Hash className="h-3 w-3" />}>
                  {importance?.bestRank != null ? (
                    <span className="font-mono">#{importance.bestRank}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </MetaRow>
                <MetaRow label="Status" icon={<Info className="h-3 w-3" />}>
                  <StatusBadge status={typedSource.scrape_status} />
                </MetaRow>
                <MetaRow label="Origin" icon={<Tag className="h-3 w-3" />}>
                  <OriginBadge
                    origin={sourceOriginFromDb(typedSource.origin)}
                  />
                </MetaRow>
                <MetaRow
                  label="Included"
                  icon={<CheckCircle2 className="h-3 w-3" />}
                >
                  <Badge
                    variant={typedSource.is_included ? "default" : "secondary"}
                  >
                    {typedSource.is_included ? "Yes" : "No"}
                  </Badge>
                </MetaRow>
                <MetaRow
                  label="Page Age"
                  icon={<Calendar className="h-3 w-3" />}
                >
                  <span className="text-right block">
                    {formatPageAge(typedSource.page_age)}
                  </span>
                </MetaRow>
                <MetaRow
                  label="Discovered"
                  icon={<Clock className="h-3 w-3" />}
                >
                  <span>
                    {new Date(typedSource.discovered_at).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </span>
                </MetaRow>
                <MetaRow label="Last Seen" icon={<Clock className="h-3 w-3" />}>
                  <span>
                    {new Date(typedSource.last_seen_at).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </span>
                </MetaRow>
                {typedSource.is_stale && (
                  <MetaRow
                    label="Stale"
                    icon={<AlertTriangle className="h-3 w-3" />}
                  >
                    <Badge variant="destructive">Stale</Badge>
                  </MetaRow>
                )}
              </div>

              {/* Search ranking — total importance + per-keyword ranks (no hiding) */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  Search ranking
                </div>
                <SourceRankBadges importance={importance} />
              </div>

              {/* Tags — assign this source to dimensions for consolidation */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  Tags
                </div>
                <SourceTagPicker topicId={topicId} sourceId={sourceId} />
              </div>

              {/* Content version details */}
              {contentVersions.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Content Versions
                  </p>
                  {contentVersions.length > 1 ? (
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedVersion >= contentVersions.length - 1}
                        onClick={() => setSelectedVersion((v) => v + 1)}
                      >
                        &larr;
                      </Button>
                      <span className="text-xs tabular-nums text-center">
                        v
                        {contentVersions[selectedVersion]?.version ??
                          selectedVersion + 1}{" "}
                        of {contentVersions.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedVersion <= 0}
                        onClick={() => setSelectedVersion((v) => v - 1)}
                      >
                        &rarr;
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      1 version available
                    </div>
                  )}
                  {currentContent && (
                    <div className="space-y-0 text-xs">
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Chars</span>
                        <span className="font-mono">
                          {currentContent.char_count.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Quality</span>
                        <Badge
                          variant={
                            currentContent.is_good_scrape
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {currentContent.quality_override ??
                            (currentContent.is_good_scrape ? "Good" : "Thin")}
                        </Badge>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Method</span>
                        <span>{currentContent.capture_method}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Type</span>
                        <span>{currentContent.content_type}</span>
                      </div>
                      {currentContent.published_at && (
                        <div className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            Published
                          </span>
                          <span>
                            {new Date(
                              currentContent.published_at,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {currentContent.modified_at && (
                        <div className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">
                            Modified
                          </span>
                          <span>
                            {new Date(
                              currentContent.modified_at,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Scraped</span>
                        <span>
                          {new Date(
                            currentContent.scraped_at,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Extracted links count */}
              {currentContent &&
                jsonArrayLength(currentContent.extracted_links) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    <span>
                      {jsonArrayLength(currentContent.extracted_links)}{" "}
                      extracted links
                    </span>
                  </div>
                )}

              {/* Description */}
              {typedSource.description && (
                <p className="text-xs leading-relaxed text-foreground/80">
                  {typedSource.description}
                </p>
              )}

              {/* Extra snippets */}
              {extraSnippets.length > 0 && (
                <div className="space-y-2">
                  {extraSnippets.map((snippet, i) => (
                    <p
                      key={i}
                      className="text-xs text-foreground/70 leading-relaxed"
                    >
                      {snippet}
                    </p>
                  ))}
                </div>
              )}

              {/* Raw search result toggle */}
              {typedSource.raw_search_result && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowRawSearch((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    {showRawSearch ? "Hide" : "Show"} raw search result
                  </button>
                  {showRawSearch && (
                    <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap break-all">
                      {JSON.stringify(typedSource.raw_search_result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel — Actions + Content + Analysis */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 pb-20 md:pb-4 space-y-6">
        {/* Actions bar */}
        {typedSource && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleScrape}
              disabled={isScraping || analyzeStream.isStreaming}
            >
              {isScraping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : hasBeenScraped ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isScraping
                ? "Scraping…"
                : hasBeenScraped
                  ? "Re-scrape"
                  : "Scrape"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => setPasteOpen(true)}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste Content
            </Button>
            {currentContent?.original_content && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleRestoreOriginal}
                title="Replace the curated content with the original scrape"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore original
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleMarkComplete}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark Complete
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleMarkStale}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Mark Stale
            </Button>
          </div>
        )}

        {/* Scrape progress messages */}
        {isScraping && scrapeStream.messages.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 space-y-1">
            {scrapeStream.messages.slice(-3).map((msg) => (
              <p key={msg.id} className="text-[10px] text-muted-foreground">
                {msg.message}
              </p>
            ))}
          </div>
        )}

        {/* Content Section */}
        <div className="min-h-[220px]">
          {currentContent ? (
            <ContentViewer
              topicId={topicId}
              content={currentContent}
              onSaved={handleContentSaved}
            />
          ) : typedSource ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm min-h-[220px] flex flex-col items-center justify-center gap-3 p-6 text-center">
              {isScraping ? (
                <>
                  <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
                  </div>
                  <p className="text-xs font-medium text-foreground/70">
                    Scraping…
                  </p>
                  {scrapeStream.messages.length > 0 && (
                    <p className="text-[10px] text-muted-foreground max-w-[240px]">
                      {
                        scrapeStream.messages[scrapeStream.messages.length - 1]
                          .message
                      }
                    </p>
                  )}
                </>
              ) : typedSource.scrape_status === "failed" ? (
                <>
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-destructive/60" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground/70">
                      Scrape failed
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[240px]">
                      The scraper couldn&apos;t retrieve this page. Try
                      re-scraping or paste content manually.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleScrape}
                      disabled={isScraping}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Re-scrape
                    </button>
                    <button
                      onClick={() => setPasteOpen(true)}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    >
                      <ClipboardPaste className="h-3 w-3" />
                      Paste
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
                    <Download className="h-5 w-5 text-primary/60" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground/70">
                      No content yet
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[240px]">
                      Scrape this source to fetch its page content, or paste
                      content manually.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleScrape}
                      disabled={isScraping}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all min-h-[44px]"
                    >
                      <Download className="h-3 w-3" />
                      Scrape
                    </button>
                    <button
                      onClick={() => setPasteOpen(true)}
                      className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    >
                      <ClipboardPaste className="h-3 w-3" />
                      Paste
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/30 min-h-[220px] flex items-center justify-center text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading source...
            </div>
          )}
        </div>

        {/* Analysis Section */}
        <div className="space-y-2 min-h-[180px]">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Analysis
              {currentAnalyses.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  ({currentAnalyses.length})
                </span>
              )}
            </span>
            {currentContent && currentAnalyses.length > 0 && !isAnalyzing && (
              <AnalysisCard
                analysis={null}
                topicId={topicId}
                sourceId={sourceId}
                contentId={currentContent.id}
                onAnalyzed={openAnalyzeDialog}
                triggerOnly
              />
            )}
          </div>

          {currentContent ? (
            <>
              {/* Live streaming analysis card — shown while generating */}
              {isAnalyzing && (
                <AnalysisCard
                  analysis={null}
                  streamingText={streamingAnalysisText || " "}
                  topicId={topicId}
                  sourceId={sourceId}
                />
              )}
              {/* Provider stopped early (e.g. safety) — content preserved with
                  an honest reason, instead of wiping it and looking broken. */}
              {interrupted && !isAnalyzing && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] overflow-hidden">
                  <div className="flex items-start gap-2 px-4 py-2.5 border-b border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        The AI provider stopped early — content kept
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                        {interrupted.reason}
                      </p>
                    </div>
                    <button
                      onClick={() => setInterrupted(null)}
                      className="text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <MarkdownStream content={interrupted.text} />
                  </div>
                </div>
              )}
              {/* Completed analyses */}
              {currentAnalyses.length > 0 ? (
                <div className="space-y-2">
                  {currentAnalyses.map((analysis) => (
                    <AnalysisCard
                      key={analysis.id}
                      analysis={analysis}
                      topicId={topicId}
                      sourceId={sourceId}
                      contentId={currentContent.id}
                      onAnalyzed={openAnalyzeDialog}
                    />
                  ))}
                </div>
              ) : !isAnalyzing ? (
                <AnalysisCard
                  analysis={null}
                  topicId={topicId}
                  sourceId={sourceId}
                  contentId={currentContent.id}
                  onAnalyzed={openAnalyzeDialog}
                />
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm min-h-[160px] flex flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <Brain className="h-5 w-5 text-muted-foreground/30" />
              </div>
              <p className="text-[10px] text-muted-foreground max-w-[200px]">
                Scrape content first, then run analysis to extract insights.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Paste Content Modal */}
      <PasteContentModal
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        topicId={topicId}
        sourceId={sourceId}
        onSaved={() => {
          setPasteOpen(false);
          refetchContent();
        }}
      />

      <AnalyzeCurationDialog
        open={analyzeDialogOpen}
        onOpenChange={setAnalyzeDialogOpen}
        content={currentContent?.content ?? ""}
        onAnalyze={handleCuratedAnalyze}
        busy={isAnalyzing}
      />
    </div>
  );
}
