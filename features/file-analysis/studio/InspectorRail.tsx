/**
 * features/file-analysis/studio/InspectorRail.tsx
 *
 * Right rail of the studio. PDF is in the center; this rail mirrors the
 * AnalysisTab's content sections so the user has all the rich extraction
 * data alongside the live document, plus the studio-only tools:
 *
 *   Content:   Outline · Text · PII · Tables · Images · Regions ·
 *              Duplicates · Classify · Metadata
 *   Tools:     Annotations · Findings · Redact · Search
 *
 * Tabs scroll horizontally when they overflow. Jump-to-page handlers move
 * the studio's canvas (no nav) — the PDF on the left re-paginates instead
 * of routing.
 */

"use client";

import { useMemo } from "react";
import {
  FileCog,
  FileSearch,
  FileText,
  Files,
  Image as ImageIcon,
  Info,
  Layers,
  ListTree,
  Shield,
  ShieldAlert,
  Sparkles,
  Table2,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileAnalysis } from "@/features/file-analysis/hooks/useFileAnalysis";

// Content renderers — shared with the AnalysisTab.
import { OutlineContent } from "@/features/file-analysis/content/OutlineContent";
import { TextContent } from "@/features/file-analysis/content/TextContent";
import { PiiCandidatesContent } from "@/features/file-analysis/content/PiiCandidatesContent";
import { TablesContent } from "@/features/file-analysis/content/TablesContent";
import { ImagesContent } from "@/features/file-analysis/content/ImagesContent";
import { RepeatedRegionsContent } from "@/features/file-analysis/content/RepeatedRegionsContent";
import { DuplicatesContent } from "@/features/file-analysis/content/DuplicatesContent";
import { ClassificationContent } from "@/features/file-analysis/content/ClassificationContent";
import { MetadataContent } from "@/features/file-analysis/content/MetadataContent";
import { RawView } from "@/features/file-analysis/content/RawView";
import { allResults, findResult } from "@/features/file-analysis/content/utils";

// User-driven tool panels.
import { AnnotationsPanel } from "./panels/AnnotationsPanel";
import { FindingsPanel } from "./panels/FindingsPanel";
import { RedactPanel } from "./panels/RedactPanel";
import { SearchPanel } from "./panels/SearchPanel";
import { PagesPanel } from "./panels/PagesPanel";
import { DocumentOpsPanel } from "./panels/DocumentOpsPanel";

export type StudioInspectorTab =
  | "outline"
  | "text"
  | "pii"
  | "tables"
  | "images"
  | "regions"
  | "duplicates"
  | "classification"
  | "metadata"
  | "annotations"
  | "findings"
  | "redact"
  | "search"
  | "pages"
  | "docops";

export interface InspectorRailProps {
  fileId: string;
  activeTab: StudioInspectorTab;
  onTabChange: (tab: StudioInspectorTab) => void;
  pageNumber: number;
  selectedPageId: string | null;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (annotationId: string | null) => void;
  /**
   * Optional whitelist — only these tabs are rendered in the strip.
   * Useful when the rail is embedded in a more focused surface (e.g. the
   * file-viewer Edit tab, which only wants the action-oriented tools and
   * skips the read-oriented content panels that already live in the
   * Analysis tab). The parent is responsible for keeping `activeTab` within
   * the whitelist. Defaults to every tab.
   */
  allowedTabs?: readonly StudioInspectorTab[];
}

const TABS: Array<{
  id: StudioInspectorTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "content" | "tools";
}> = [
  // ── Content (read what's in the document) ──
  { id: "outline", label: "Outline", icon: ListTree, group: "content" },
  { id: "text", label: "Text", icon: FileText, group: "content" },
  { id: "pii", label: "PII", icon: ShieldAlert, group: "content" },
  { id: "tables", label: "Tables", icon: Table2, group: "content" },
  { id: "images", label: "Images", icon: ImageIcon, group: "content" },
  { id: "regions", label: "Regions", icon: Layers, group: "content" },
  { id: "duplicates", label: "Dupes", icon: Layers, group: "content" },
  { id: "classification", label: "Classify", icon: Tag, group: "content" },
  { id: "metadata", label: "Info", icon: Info, group: "content" },
  // ── Tools (act on the document) ──
  { id: "pages", label: "Pages", icon: Files, group: "tools" },
  { id: "docops", label: "Doc Ops", icon: FileCog, group: "tools" },
  { id: "annotations", label: "Notes", icon: Sparkles, group: "tools" },
  { id: "findings", label: "Findings", icon: ListTree, group: "tools" },
  { id: "redact", label: "Redact", icon: Shield, group: "tools" },
  { id: "search", label: "Search", icon: FileSearch, group: "tools" },
];

export function InspectorRail({
  fileId,
  activeTab,
  onTabChange,
  pageNumber,
  onJumpToPage,
  selectedAnnotationId,
  onSelectAnnotation,
  allowedTabs,
}: InspectorRailProps) {
  const { data } = useFileAnalysis(fileId);
  const results = useMemo(() => data?.results ?? [], [data]);
  const jumpPage = (p: number) => onJumpToPage(p, null);

  // If the caller restricts the tab set, only show the rows that actually
  // contain at least one allowed tab. Skipping an empty strip avoids a
  // ghost border line when (e.g.) the Edit tab only uses "tools".
  const showContentStrip =
    !allowedTabs ||
    TABS.some((t) => t.group === "content" && allowedTabs.includes(t.id));
  const showToolsStrip =
    !allowedTabs ||
    TABS.some((t) => t.group === "tools" && allowedTabs.includes(t.id));

  return (
    <div className="flex h-full w-full flex-col bg-card/40">
      {/* Two-row tab strip — content tabs on top, tools on bottom. */}
      {showContentStrip ? (
        <TabStrip
          activeTab={activeTab}
          onTabChange={onTabChange}
          group="content"
          allowedTabs={allowedTabs}
        />
      ) : null}
      {showToolsStrip ? (
        <TabStrip
          activeTab={activeTab}
          onTabChange={onTabChange}
          group="tools"
          allowedTabs={allowedTabs}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "outline" ? (
          <RawView
            label="Outline"
            rawData={findResult(results, "page_outline")?.payload ?? null}
          >
            <ScrollPanel>
              <OutlineContent results={results} onJumpToPage={jumpPage} />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "text" ? (
          <RawView
            label="Text extraction"
            rawData={{
              native: findResult(results, "text_extraction_native")?.payload,
              ocr: findResult(results, "text_extraction_ocr")?.payload,
            }}
          >
            <TextContent
              results={results}
              initialPage={pageNumber}
              onJumpToPage={jumpPage}
            />
          </RawView>
        ) : activeTab === "pii" ? (
          <RawView
            label="PII candidates"
            rawData={allResults(results, "redaction_candidates").map((r) => ({
              tier: r.confidence_tier,
              payload: r.payload,
            }))}
          >
            <PiiCandidatesContent results={results} onJumpToPage={jumpPage} />
          </RawView>
        ) : activeTab === "tables" ? (
          <RawView
            label="Tables"
            rawData={findResult(results, "tables")?.payload ?? null}
          >
            <ScrollPanel>
              <TablesContent results={results} onJumpToPage={jumpPage} />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "images" ? (
          <RawView
            label="Embedded images"
            rawData={findResult(results, "embedded_images")?.payload ?? null}
          >
            <ScrollPanel>
              <ImagesContent
                fileId={fileId}
                results={results}
                onJumpToPage={jumpPage}
              />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "regions" ? (
          <RawView
            label="Repeated regions"
            rawData={allResults(results, "repeated_regions").map((r) => ({
              tier: r.confidence_tier,
              payload: r.payload,
            }))}
          >
            <ScrollPanel>
              <RepeatedRegionsContent
                fileId={fileId}
                results={results}
                onJumpToPage={jumpPage}
              />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "duplicates" ? (
          <RawView
            label="Duplicate pages"
            rawData={[
              "duplicate_pages_exact",
              "duplicate_pages_normalized",
              "duplicate_pages_structural",
              "duplicate_pages_shingle",
              "duplicate_pages_visual",
            ].reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = allResults(results, k).map((r) => ({
                tier: r.confidence_tier,
                payload: r.payload,
              }));
              return acc;
            }, {})}
          >
            <ScrollPanel>
              <DuplicatesContent results={results} onJumpToPage={jumpPage} />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "classification" ? (
          <RawView
            label="Page classification"
            rawData={
              findResult(results, "page_classification")?.payload ?? null
            }
          >
            <ScrollPanel>
              <ClassificationContent
                results={results}
                onJumpToPage={jumpPage}
              />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "metadata" ? (
          <RawView
            label="File metadata"
            rawData={findResult(results, "metadata")?.payload ?? null}
          >
            <ScrollPanel>
              <MetadataContent results={results} />
            </ScrollPanel>
          </RawView>
        ) : activeTab === "pages" ? (
          <PagesPanel
            fileId={fileId}
            activePageNumber={pageNumber}
            onSelectPage={onJumpToPage}
          />
        ) : activeTab === "docops" ? (
          <DocumentOpsPanel fileId={fileId} />
        ) : activeTab === "annotations" ? (
          <AnnotationsPanel
            fileId={fileId}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={onSelectAnnotation}
            onJumpToPage={onJumpToPage}
          />
        ) : activeTab === "findings" ? (
          <FindingsPanel fileId={fileId} onJumpToPage={onJumpToPage} />
        ) : activeTab === "redact" ? (
          <RedactPanel fileId={fileId} />
        ) : (
          <SearchPanel fileId={fileId} onJumpToPage={onJumpToPage} />
        )}
      </div>
    </div>
  );
}

function ScrollPanel({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto p-2">{children}</div>;
}

function TabStrip({
  activeTab,
  onTabChange,
  group,
  allowedTabs,
}: {
  activeTab: StudioInspectorTab;
  onTabChange: (tab: StudioInspectorTab) => void;
  group: "content" | "tools";
  allowedTabs?: readonly StudioInspectorTab[];
}) {
  const items = TABS.filter(
    (t) => t.group === group && (!allowedTabs || allowedTabs.includes(t.id)),
  );
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-0 border-b border-border",
        group === "content" ? "bg-card/60" : "bg-card/30",
      )}
      role="tablist"
      aria-label={group === "content" ? "Content sections" : "Tool sections"}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          onClick={() => onTabChange(t.id)}
          className={cn(
            "flex items-center gap-1 border-b border-r border-transparent px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
            activeTab === t.id
              ? "border-r-border bg-background text-foreground"
              : "border-r-border text-muted-foreground hover:bg-accent/40",
          )}
          title={t.label}
        >
          <t.icon className="h-3 w-3" />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
