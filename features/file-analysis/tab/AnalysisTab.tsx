/**
 * features/file-analysis/tab/AnalysisTab.tsx
 *
 * Body for the "Analysis" tab inside PreviewPane.
 *
 * Content-focused — NOT detector summaries. Each section shows the actual
 * value the pipeline extracted:
 *
 *   - Overview         metadata (title/author), page-class breakdown
 *   - Outline          PDF TOC (clickable)
 *   - Extracted text   page-by-page reader (the BIG one)
 *   - PII candidates   sortable list with masked previews
 *   - Tables           rendered as HTML tables
 *   - Images           thumbnail grid
 *   - Repeated regions cropped previews of headers/footers/watermarks
 *   - Duplicates       page-group cards per detection method
 *   - Classification   chip grid (page → class)
 *
 * Section tabs sit at top so the user can jump between content kinds.
 */

"use client";

import { FileKnowledgePanel } from "@/features/rag/components/files/FileKnowledgePanel";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  ListTree,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  Zap,
  Table2,
  Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileAnalysis } from "@/features/file-analysis/hooks/useFileAnalysis";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import * as Api from "@/features/file-analysis/api/file-analysis";
import { TextContent } from "@/features/file-analysis/content/TextContent";
import { TablesContent } from "@/features/file-analysis/content/TablesContent";
import { ImagesContent } from "@/features/file-analysis/content/ImagesContent";
import { PiiCandidatesContent } from "@/features/file-analysis/content/PiiCandidatesContent";
import { EntitiesContent } from "@/features/file-analysis/content/EntitiesContent";
import { RepeatedRegionsContent } from "@/features/file-analysis/content/RepeatedRegionsContent";
import { DuplicatesContent } from "@/features/file-analysis/content/DuplicatesContent";
import { OutlineContent } from "@/features/file-analysis/content/OutlineContent";
import { ClassificationContent } from "@/features/file-analysis/content/ClassificationContent";
import { MetadataContent } from "@/features/file-analysis/content/MetadataContent";
import {
  asObject,
  findResult,
  allResults,
  type EmbeddedImagesPayload,
  type MetadataPayload,
  type OutlinePayload,
  type PiiCandidatesPayload,
  type RepeatedRegionsPayload,
  type TablesPayload,
  type TextExtractionPayload,
} from "@/features/file-analysis/content/utils";

interface AnalysisTabProps {
  fileId: string;
  className?: string;
}

type Section =
  | "overview"
  | "outline"
  | "text"
  | "pii"
  | "entities"
  | "tables"
  | "images"
  | "regions"
  | "duplicates"
  | "classification";

const STATUS_LABEL: Record<string, string> = {
  pending: "Starting…",
  running: "Running",
  partial: "Done (with errors)",
  complete: "Complete",
  failed: "Failed",
  not_applicable: "Not applicable for this file type",
};

export function AnalysisTab({ fileId, className }: AnalysisTabProps) {
  const analysis = useFileAnalysis(fileId);
  const annotations = useAnnotations(fileId);
  const [section, setSection] = useState<Section>("overview");
  const [refreshing, setRefreshing] = useState(false);

  const head = analysis.data?.head;
  const results = analysis.data?.results ?? [];
  const status = head?.status ?? (analysis.loading ? "running" : "pending");
  const progress = head?.progress ?? {};
  const progressTotal = typeof progress["total"] === "number" ? (progress["total"] as number) : 0;
  const progressComplete = typeof progress["complete"] === "number" ? (progress["complete"] as number) : 0;
  const summaryCounts = head?.summary_counts ?? {};

  // ── Counts driving the tab badges ──
  const counts = useMemo(() => {
    const nativeP = asObject<TextExtractionPayload>(
      findResult(results, "text_extraction_native")?.payload,
    );
    const ocrP = asObject<TextExtractionPayload>(
      findResult(results, "text_extraction_ocr")?.payload,
    );
    const text_pages = new Set<number>();
    for (const p of nativeP?.pages ?? []) text_pages.add(p.page_number);
    for (const p of ocrP?.pages ?? []) text_pages.add(p.page_number);
    const charsTotal =
      (nativeP?.pages ?? []).reduce((a, p) => a + (p.chars ?? 0), 0) +
      (ocrP?.pages ?? []).reduce((a, p) => a + (p.chars ?? 0), 0);

    const tables =
      asObject<TablesPayload>(findResult(results, "tables")?.payload)?.tables ?? [];
    const images =
      asObject<EmbeddedImagesPayload>(findResult(results, "embedded_images")?.payload)
        ?.images ?? [];
    const outline =
      asObject<OutlinePayload>(findResult(results, "page_outline")?.payload)
        ?.entries ?? [];

    const piiByTier: Record<string, number> = {};
    for (const r of allResults(results, "redaction_candidates")) {
      const n =
        (asObject<PiiCandidatesPayload>(r.payload)?.spans ?? []).length;
      piiByTier[r.confidence_tier] = n;
    }

    const regionsByTier: Record<string, number> = {};
    for (const r of allResults(results, "repeated_regions")) {
      const n =
        (asObject<RepeatedRegionsPayload>(r.payload)?.regions ?? []).length;
      regionsByTier[r.confidence_tier] = n;
    }

    const meta = asObject<MetadataPayload>(findResult(results, "metadata")?.payload);

    return {
      text_pages: text_pages.size,
      chars_total: charsTotal,
      tables_count: tables.length,
      images_count: images.length,
      outline_count: outline.length,
      pii_medium: piiByTier["medium"] ?? piiByTier["n/a"] ?? 0,
      pii_high: piiByTier["high"] ?? 0,
      regions_medium: regionsByTier["medium"] ?? 0,
      page_count: head?.page_count ?? meta?.page_count ?? null,
      title: meta?.info?.title ?? null,
      author: meta?.info?.author ?? null,
    };
  }, [results, head?.page_count]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Api.refreshAnalysis(fileId, {
        force: true,
        only_stale: false,
        detectors: null,
        confidence_tiers: null,
      });
      setTimeout(() => analysis.refetch(), 800);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={cn("flex h-full w-full flex-col overflow-hidden bg-background", className)}>
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Document analysis</h2>
          <StatusBadge status={status} />
          {(status === "pending" || status === "running") && progressTotal > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {progressComplete} / {progressTotal} detectors
            </span>
          ) : null}
          {(status === "pending" || status === "running") && progressTotal === 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> starting backfill
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-7 text-xs"
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Refresh
            </Button>
            <Button asChild size="sm" className="h-7 text-xs">
              <Link href={`/files/f/${fileId}/studio`}>
                <ExternalLink className="h-3 w-3 mr-1" /> Open in Studio
              </Link>
            </Button>
          </div>
        </div>
        {/* Title + author when known */}
        {(counts.title || counts.author) ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {counts.title ? (
              <span className="font-medium text-foreground">{counts.title}</span>
            ) : null}
            {counts.title && counts.author ? " · " : ""}
            {counts.author ?? ""}
          </div>
        ) : null}
        {analysis.error ? (
          <div className="mt-2 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" /> {analysis.error}
          </div>
        ) : null}
      </div>

      {/* Section tabs */}
      <SectionTabs
        section={section}
        onChange={setSection}
        counts={{
          ...counts,
          annotations: annotations.annotations.length,
        }}
      />

      {/* Section body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {section === "overview" ? (
          <>
          <FileKnowledgePanel fileId={fileId} className="mb-2" />
          <OverviewSection
            results={results}
            counts={counts}
            pageCount={head?.page_count ?? null}
            summaryCounts={summaryCounts}
            onJumpToPage={(p) => jumpToPage(fileId, p)}
          />
          </>
        ) : section === "outline" ? (
          <ScrollSection>
            <OutlineContent
              results={results}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : section === "text" ? (
          <TextContent
            results={results}
            onJumpToPage={(p) => jumpToPage(fileId, p)}
          />
        ) : section === "pii" ? (
          <PiiCandidatesContent
            results={results}
            onJumpToPage={(p) => jumpToPage(fileId, p)}
          />
        ) : section === "entities" ? (
          <ScrollSection>
            <EntitiesContent
              fileId={fileId}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : section === "tables" ? (
          <ScrollSection>
            <TablesContent
              results={results}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : section === "images" ? (
          <ScrollSection>
            <ImagesContent
              fileId={fileId}
              results={results}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : section === "regions" ? (
          <ScrollSection>
            <RepeatedRegionsContent
              fileId={fileId}
              results={results}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : section === "duplicates" ? (
          <ScrollSection>
            <DuplicatesContent
              results={results}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : section === "classification" ? (
          <ScrollSection>
            <ClassificationContent
              results={results}
              onJumpToPage={(p) => jumpToPage(fileId, p)}
            />
          </ScrollSection>
        ) : null}
      </div>
    </div>
  );
}

function jumpToPage(fileId: string, page: number) {
  // Stay inside the PreviewPane. Dispatch the same event the FileContextMenu
  // uses to switch tabs — no navigation, no PDF refetch. PreviewPane swaps
  // to the Preview tab with the blob already warm in useFileBlob's cache.
  //
  // The `page` field rides along for any future PreviewPane upgrade that
  // wants to forward it into PdfPreview's controlled pageNumber.
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cloud-files:open-preview-tab", {
      detail: { fileId, tab: "preview", page },
    }),
  );
}

function ScrollSection({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto p-4">{children}</div>;
}

function OverviewSection({
  results,
  counts,
  pageCount,
  summaryCounts,
  onJumpToPage,
}: {
  results: ReturnType<typeof useFileAnalysis>["data"] extends infer T
    ? T extends { results: infer R }
      ? R
      : never
    : never;
  counts: {
    text_pages: number;
    chars_total: number;
    tables_count: number;
    images_count: number;
    outline_count: number;
    pii_medium: number;
    pii_high: number;
    regions_medium: number;
    page_count: number | null;
  };
  pageCount: number | null;
  summaryCounts: Record<string, unknown>;
  onJumpToPage: (page: number) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Pages" value={pageCount ?? counts.page_count ?? "—"} />
        <Stat label="Extracted chars" value={counts.chars_total.toLocaleString()} />
        <Stat label="Outline entries" value={counts.outline_count} />
        <Stat label="Tables" value={counts.tables_count} />
        <Stat label="Images" value={counts.images_count} />
        <Stat
          label="PII (med / high)"
          value={`${counts.pii_medium} / ${counts.pii_high}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="File metadata">
          <MetadataContent results={results as never} />
        </Card>
        <Card title="Page classification">
          <ClassificationContent
            results={results as never}
            // OverviewSection sits inside the AnalysisTab; pass the same
            // jump-to-page handler the parent uses elsewhere so clicks
            // switch back to the Preview tab instead of triggering a
            // hard navigation.
            onJumpToPage={onJumpToPage}
          />
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-card">
      <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    running: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "bg-destructive/15 text-destructive",
    not_applicable: "bg-muted text-muted-foreground italic",
  };
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        colors[status] ?? colors.pending,
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function SectionTabs({
  section,
  onChange,
  counts,
}: {
  section: Section;
  onChange: (s: Section) => void;
  counts: {
    text_pages: number;
    chars_total: number;
    tables_count: number;
    images_count: number;
    outline_count: number;
    pii_medium: number;
    regions_medium: number;
    annotations: number;
  };
}) {
  const items: Array<{
    id: Section;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
  }> = [
    { id: "overview", label: "Overview", icon: Zap },
    { id: "outline", label: "Outline", icon: ListTree, badge: counts.outline_count || undefined },
    { id: "text", label: "Text", icon: FileText, badge: counts.chars_total ? `${Math.round(counts.chars_total / 1000)}K` : undefined },
    { id: "pii", label: "PII", icon: Shield, badge: counts.pii_medium || undefined },
    { id: "entities", label: "Entities", icon: Sparkles },
    { id: "tables", label: "Tables", icon: Table2, badge: counts.tables_count || undefined },
    { id: "images", label: "Images", icon: ImageIcon, badge: counts.images_count || undefined },
    { id: "regions", label: "Regions", icon: Layers, badge: counts.regions_medium || undefined },
    { id: "duplicates", label: "Duplicates", icon: Layers },
    { id: "classification", label: "Classify", icon: Tag },
  ];

  const scroller = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scroller}
      className="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-border bg-card/40"
      role="tablist"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={section === it.id}
          onClick={() => onChange(it.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-2 text-[11px] font-medium transition-colors last:border-r-0",
            section === it.id
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-accent/40",
          )}
        >
          <it.icon className="h-3.5 w-3.5" />
          <span>{it.label}</span>
          {it.badge ? (
            <span
              className={cn(
                "ml-1 rounded px-1 py-px text-[9px] tabular-nums",
                section === it.id
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {it.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
