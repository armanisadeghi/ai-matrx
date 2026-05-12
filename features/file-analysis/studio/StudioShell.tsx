/**
 * features/file-analysis/studio/StudioShell.tsx
 *
 * The full-screen Analysis Studio shell. Three-pane layout:
 *
 *   [ThumbnailStrip] [AnnotatablePdfCanvas] [InspectorRail]
 *
 * URL search params drive: ?page=N&tab=annotations&annotation=<id>.
 * Mode toggle (View / Draw / Select) sits in the toolbar above the canvas.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Edit3, MousePointer2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnnotatablePdfCanvas } from "@/features/file-analysis/components/AnnotatablePdfCanvas";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import { useFileAnalysis } from "@/features/file-analysis/hooks/useFileAnalysis";
import { usePages } from "@/features/file-analysis/hooks/usePages";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { InspectorRail, type StudioInspectorTab } from "./InspectorRail";
import type {
  PdfRegion,
} from "@/features/files/components/core/PdfAnnotationLayer";
import type { AnnotationLayerMode } from "@/features/files/components/core/PdfAnnotationLayer";

interface StudioShellProps {
  fileId: string;
}

export function StudioShell({ fileId }: StudioShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { annotations } = useAnnotations(fileId);
  const { pages } = usePages(fileId);
  useFileAnalysis(fileId); // warm the cache for the inspector panels

  // ── URL-driven state ─────────────────────────────────────────────────
  const initialPage = useMemo(() => {
    const raw = searchParams?.get("page");
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }, [searchParams]);
  const initialTab = (searchParams?.get("tab") as StudioInspectorTab | null) ?? "annotations";
  const initialAnnotation = searchParams?.get("annotation") ?? null;

  const [pageNumber, setPageNumber] = useState(initialPage);
  const [activeTab, setActiveTab] = useState<StudioInspectorTab>(initialTab);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(initialAnnotation);
  const [mode, setMode] = useState<AnnotationLayerMode>("view");

  // Update URL when state changes (without full nav).
  const pushUrl = useCallback(
    (next: { page?: number; tab?: StudioInspectorTab; annotation?: string | null }) => {
      const params = new URLSearchParams(searchParams?.toString());
      if (next.page) params.set("page", String(next.page));
      if (next.tab) params.set("tab", next.tab);
      if (next.annotation === null) params.delete("annotation");
      else if (next.annotation) params.set("annotation", next.annotation);
      const qs = params.toString();
      router.replace(`/files/f/${fileId}/studio${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams, fileId],
  );

  const handlePageChange = useCallback(
    (next: number) => {
      setPageNumber(next);
      pushUrl({ page: next });
    },
    [pushUrl],
  );

  const handleSelectPage = useCallback(
    (pageN: number, _pageId?: string | null) => {
      handlePageChange(pageN);
    },
    [handlePageChange],
  );

  const handleTabChange = useCallback(
    (tab: StudioInspectorTab) => {
      setActiveTab(tab);
      pushUrl({ tab });
    },
    [pushUrl],
  );

  const handleSelectAnnotation = useCallback(
    (annotationId: string | null) => {
      setSelectedAnnotationId(annotationId);
      pushUrl({ annotation: annotationId });
    },
    [pushUrl],
  );

  // ── Regions: derived from annotations ──
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

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/files/f/${fileId}`)}
          className="h-7 text-xs"
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to file
        </Button>
        <h1 className="truncate text-sm font-semibold">
          {file?.fileName ?? "Document"}{" "}
          <span className="text-muted-foreground">— Analysis Studio</span>
        </h1>
        <div className="ml-auto flex items-center gap-1">
          <ModeButton
            active={mode === "view"}
            onClick={() => setMode("view")}
            icon={<Eye className="h-3 w-3" />}
            label="View"
          />
          <ModeButton
            active={mode === "select"}
            onClick={() => setMode("select")}
            icon={<MousePointer2 className="h-3 w-3" />}
            label="Select"
          />
          <ModeButton
            active={mode === "draw"}
            onClick={() => setMode("draw")}
            icon={<Edit3 className="h-3 w-3" />}
            label="Draw"
          />
        </div>
      </div>

      {/* 3-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail — thumbnails */}
        <aside className="w-32 shrink-0 border-r border-border bg-card/40 lg:w-40">
          <ThumbnailStrip
            fileId={fileId}
            activePageNumber={pageNumber}
            onSelectPage={handleSelectPage}
          />
        </aside>

        {/* Center canvas */}
        <main className="relative min-w-0 flex-1">
          <AnnotatablePdfCanvas
            fileId={fileId}
            pageNumber={pageNumber}
            onPageChange={handlePageChange}
            regions={regions}
            selectedId={selectedAnnotationId}
            categoryOf={categoryOf}
            mode={mode}
            onAnnotationCreated={(a) => handleSelectAnnotation(a.id)}
            onRegionClick={(id) => handleSelectAnnotation(id)}
            onBackgroundClick={() => handleSelectAnnotation(null)}
          />
          {mode === "draw" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-sky-500/90 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-white shadow">
              Drag over a region to label it
            </div>
          ) : null}
        </main>

        {/* Right rail — inspector */}
        <aside className="w-80 shrink-0 border-l border-border lg:w-96">
          <InspectorRail
            fileId={fileId}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            selectedPageId={pages.find((p) => p.page_index + 1 === pageNumber)?.id ?? null}
            onJumpToPage={handleSelectPage}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={handleSelectAnnotation}
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
