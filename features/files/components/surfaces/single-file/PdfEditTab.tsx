/**
 * features/files/components/surfaces/single-file/PdfEditTab.tsx
 *
 * PDF Edit tab body for SingleFileShell + PreviewPane. Brings together the
 * existing PDF tooling that previously only lived in the standalone
 * `/files/f/{id}/studio` route — Analysis Studio's `AnnotatablePdfCanvas`
 * (PdfPreview + draw-to-annotate + snap-bbox + label picker) on the left,
 * the lazy `ThumbnailStrip` (server-rendered thumbnails with annotation-
 * count badges) in the gutter, and a filtered `InspectorRail` showing
 * only the action-oriented panels (Pages / Doc Ops / Notes / Findings /
 * Redact / Search) on the right.
 *
 * Why filter the inspector? The content-oriented panels (Outline / Text /
 * PII / Tables / Images / Regions / Dupes / Classify / Info) already have
 * a dedicated home — the Analysis tab next door in this same shell. Edit
 * is for *acting on* the PDF; Analysis is for *reading* what's in it.
 * Showing both sets here would duplicate UI in two adjacent tabs.
 *
 * State scope:
 *   - All state is local to this component (page number, mode, active
 *     panel, selected annotation). The dedicated `/files/f/{id}/studio`
 *     pushes its state to the URL — that's a route concern. Inside a tab
 *     body we don't want to rewrite the URL on every tab/page change.
 *   - Annotations are persisted through `useAnnotations(fileId).create`,
 *     which is the SAME hook the standalone studio uses. Annotations
 *     created here show up immediately in the Analysis tab (same shared
 *     cache) and in the standalone studio (same Realtime channel).
 *
 * Layout:
 *   - 3-column CSS grid (thumbs | canvas | inspector). Sized identically
 *     to the studio so muscle memory carries over.
 *   - On narrow viewports the layout still grids — the thumbnail column
 *     stays slim (7rem) and the inspector tab strip wraps. If the file
 *     viewer is mounted in a very narrow side panel, switch to the
 *     dedicated `/files/f/{id}/studio` page (the "Open in Studio" button
 *     in the slim header here gets you there).
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  MousePointer2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { AnnotatablePdfCanvas } from "@/features/file-analysis/components/AnnotatablePdfCanvas";
import { ThumbnailStrip } from "@/features/file-analysis/studio/ThumbnailStrip";
import {
  InspectorRail,
  type StudioInspectorTab,
} from "@/features/file-analysis/studio/InspectorRail";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import { useFileAnalysis } from "@/features/file-analysis/hooks/useFileAnalysis";
import { usePages } from "@/features/file-analysis/hooks/usePages";
import type { AnnotationLayerMode, PdfRegion } from "@/features/files";

export interface PdfEditTabProps {
  fileId: string;
  className?: string;
}

// The Edit tab's filtered tool whitelist. Order matches InspectorRail's
// canonical declaration so the strip reads predictably.
const EDIT_TAB_PANELS: readonly StudioInspectorTab[] = [
  "pages",
  "docops",
  "annotations",
  "findings",
  "redact",
  "search",
];

const DEFAULT_PANEL: StudioInspectorTab = "annotations";

export function PdfEditTab({ fileId, className }: PdfEditTabProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { annotations, create: createAnnotation } = useAnnotations(fileId);
  const { pages } = usePages(fileId);
  // Warm the analysis cache so the inspector's Findings / Redact panels
  // have data the moment the user clicks them.
  useFileAnalysis(fileId);

  const [pageNumber, setPageNumber] = useState(1);
  const [activePanel, setActivePanel] =
    useState<StudioInspectorTab>(DEFAULT_PANEL);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [mode, setMode] = useState<AnnotationLayerMode>("view");

  const handlePageChange = useCallback((next: number) => {
    setPageNumber(next);
  }, []);

  const handleSelectPage = useCallback(
    (pageN: number, _pageId?: string | null) => {
      setPageNumber(pageN);
    },
    [],
  );

  const handleSelectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
  }, []);

  const handlePanelChange = useCallback((tab: StudioInspectorTab) => {
    // Defensive: parent owns the whitelist. If something hands us a
    // disallowed tab, fall back to the default panel rather than
    // rendering a content panel we deliberately filtered out.
    if (!EDIT_TAB_PANELS.includes(tab)) {
      setActivePanel(DEFAULT_PANEL);
      return;
    }
    setActivePanel(tab);
  }, []);

  // Regions are derived from active annotations — same shape the
  // Analysis Studio uses. Filtering by status excludes redacted/deleted
  // rows so they don't visually clutter the page.
  const regions: PdfRegion[] = useMemo(() => {
    return annotations
      .filter((a) => a.status === "active")
      .map((a) => ({
        id: a.id,
        page_number: a.page_number,
        bbox: a.bbox as { x0: number; y0: number; x1: number; y1: number },
        kind: "annotation" as const,
      }));
  }, [annotations]);

  const categoryOf = useCallback(
    (id: string) => annotations.find((a) => a.id === id)?.label_category,
    [annotations],
  );

  const annotationsByPage = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of annotations) {
      if (a.status !== "active") continue;
      m.set(a.page_number, (m.get(a.page_number) ?? 0) + 1);
    }
    return m;
  }, [annotations]);

  if (!file) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted/10 p-6",
          className,
        )}
      >
        <div className="max-w-sm space-y-2 text-center">
          <FileText
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold">File not loaded</h3>
          <p className="text-xs text-muted-foreground">
            The PDF metadata hasn&apos;t hydrated yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      {/* Slim header: mode toolbar + "Open in Studio" escape hatch. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <FileText
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-muted-foreground">
          Edit PDF
        </span>
        <div className="ml-3 flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
          <ModeButton
            active={mode === "view"}
            onClick={() => setMode("view")}
            icon={<Eye className="h-3 w-3" />}
            label="View"
            tooltip="Read-only. Text selection + links pass through to the PDF."
          />
          <ModeButton
            active={mode === "select"}
            onClick={() => setMode("select")}
            icon={<MousePointer2 className="h-3 w-3" />}
            label="Select"
            tooltip="Click an existing annotation to select and edit it."
          />
          <ModeButton
            active={mode === "draw"}
            onClick={() => setMode("draw")}
            icon={<Edit3 className="h-3 w-3" />}
            label="Draw"
            tooltip="Drag a rectangle anywhere on the page. The server snaps it to the tightest text-block bounds and opens the label picker."
          />
        </div>
        <div className="ml-auto">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            title="Open the full Analysis Studio (3-pane workshop with content + tools panels)"
          >
            <Link href={`/files/f/${encodeURIComponent(fileId)}/studio`}>
              <ExternalLink className="h-3 w-3" />
              Open in Studio
            </Link>
          </Button>
        </div>
      </div>

      {/* 3-pane grid — same column sizing as StudioShell so muscle memory
       * carries over. `minmax(0, …fr)` is critical for fr-ratios inside
       * containers with overflow content (see StudioShell for the long
       * explanation). */}
      <div className="grid min-h-0 flex-1 grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.2fr)] lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Left rail — thumbnails. Annotation counts surface as green
         * badges so the user can scan + jump to pages with pinned data. */}
        <aside className="min-w-0 overflow-hidden border-r border-border bg-card/40">
          <ThumbnailStrip
            fileId={fileId}
            activePageNumber={pageNumber}
            onSelectPage={handleSelectPage}
            annotationCounts={annotationsByPage}
          />
        </aside>

        {/* Center canvas. Mode banner floats so it doesn't eat layout. */}
        <main className="relative min-w-0 overflow-hidden border-r border-border">
          <AnnotatablePdfCanvas
            fileId={fileId}
            pageNumber={pageNumber}
            onPageChange={handlePageChange}
            regions={regions}
            selectedId={selectedAnnotationId}
            categoryOf={categoryOf}
            mode={mode}
            createAnnotation={createAnnotation}
            onAnnotationCreated={(a) => {
              handleSelectAnnotation(a.id);
              if (a.page_number !== pageNumber) {
                handlePageChange(a.page_number);
              }
              // Surface the new note in the Notes panel by default so the
              // user can label / categorize / promote it without hunting.
              setActivePanel("annotations");
            }}
            onRegionClick={(id) => handleSelectAnnotation(id)}
            onBackgroundClick={() => handleSelectAnnotation(null)}
          />
          {/* Interaction hint — only shown in the modes that change how
           * clicking the page behaves. View mode needs no banner (the
           * toolbar already shows the active mode, and the document should
           * stay unobstructed). */}
          {mode === "draw" || mode === "select" ? (
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-md border border-border bg-card/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
              {mode === "draw"
                ? "Drag a rectangle over any text to label it"
                : "Click an existing annotation to edit"}
            </div>
          ) : null}
        </main>

        {/* Right rail — filtered inspector. The whitelist matches the
         * `tools` group from InspectorRail.TABS: Pages, Doc Ops, Notes,
         * Findings, Redact, Search. Content tabs (Outline, Text, PII,
         * Tables, Images, Regions, Dupes, Classify, Info) deliberately
         * live in the Analysis tab next door, not here. */}
        <aside className="min-w-0 overflow-hidden">
          <InspectorRail
            fileId={fileId}
            activeTab={activePanel}
            onTabChange={handlePanelChange}
            pageNumber={pageNumber}
            selectedPageId={
              pages.find((p) => p.page_index + 1 === pageNumber)?.id ?? null
            }
            onJumpToPage={handleSelectPage}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={handleSelectAnnotation}
            allowedTabs={EDIT_TAB_PANELS}
          />
        </aside>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
  tooltip,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

export default PdfEditTab;
