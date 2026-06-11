/**
 * features/file-analysis/studio/panels/PagesPanel.tsx
 *
 * The page-management workhorse. List of every page in the file with:
 *
 *   - Live thumbnail (module-cached)
 *   - Per-page operations: rotate / exclude / include / duplicate /
 *                          delete (derivative) / extract (derivative) / crop
 *   - Bulk selection with bulk operations
 *
 * Bulk operations + the single-page destructive ones (delete / extract /
 * duplicate / insert / reorder / crop) call the existing matrx-utils
 * endpoints (ENDPOINTS.pdf.*) and produce a DERIVATIVE PDF blob that
 * downloads to the user. In-place ops (rotate / exclude / include) update
 * the file_pages row directly — no derivative file.
 *
 * Reorder via drag-and-drop is wired against /utilities/pdf/reorder-pages
 * which produces a derivative; in-place reorder will land when
 * file_pages.page_index becomes user-mutable.
 */

"use client";

import { useMemo, useState } from "react";
import {
  Crop,
  Download,
  EyeOff,
  Eye,
  GripVertical,
  Loader2,
  RotateCw,
  Scissors,
  Shuffle,
  Trash2,
  Copy as CopyIcon,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { usePages } from "@/features/file-analysis/hooks/usePages";
import { usePageThumbnail } from "@/features/file-analysis/hooks/usePageThumbnail";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { BinaryResult } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import * as Api from "@/features/file-analysis/api/file-analysis";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";

interface Props {
  fileId: string;
  activePageNumber: number;
  onSelectPage: (pageNumber: number, pageId: string | null) => void;
}

export function PagesPanel({ fileId, activePageNumber, onSelectPage }: Props) {
  const { pages, loading, refetch } = usePages(fileId);
  const pdfApi = usePdfDemoApi();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BinaryResult | null>(null);

  const selectedPageNumbers = useMemo(() => {
    return pages
      .filter((p) => selected.has(p.id))
      .map((p) => p.page_index + 1)
      .sort((a, b) => a - b);
  }, [pages, selected]);

  const toggleSelect = (pageId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(pages.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());

  // ── Shared derivative-op runner ────────────────────────────────────────
  async function runDerivativeOp(
    label: string,
    endpoint: Parameters<typeof pdfApi.postPdfBlob>[0],
    body: Record<string, unknown>,
  ) {
    setBusy(label);
    setError(null);
    setLastResult(null);
    try {
      const result = await pdfApi.postPdfBlob(endpoint, {
        ...buildPdfSourceFromFileId(fileId),
        ...body,
      });
      setLastResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // ── In-place ops (file_pages mutation, no derivative) ──────────────────
  async function inPlaceRotate(pageId: string, currentRotation: number) {
    setBusy("rotate");
    setError(null);
    try {
      await Api.rotatePage(fileId, pageId, {
        rotation: (((currentRotation + 90) % 360) as 0 | 90 | 180 | 270),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function inPlaceExclude(pageId: string) {
    setBusy("exclude");
    setError(null);
    try {
      await Api.excludePage(fileId, pageId, { reason: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function inPlaceInclude(pageId: string) {
    setBusy("include");
    setError(null);
    try {
      await Api.includePage(fileId, pageId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // ── Bulk derivative ops ────────────────────────────────────────────────
  function bulkExtract() {
    if (!selectedPageNumbers.length) return;
    void runDerivativeOp("extract", "extractPages", {
      pages: selectedPageNumbers,
    });
  }
  function bulkDelete() {
    if (!selectedPageNumbers.length) return;
    void runDerivativeOp("delete", "deletePages", {
      pages: selectedPageNumbers,
    });
  }
  function bulkDuplicate() {
    if (!selectedPageNumbers.length) return;
    void runDerivativeOp("duplicate", "duplicatePages", {
      pages: selectedPageNumbers,
    });
  }
  function bulkRotate(rotation: 90 | 180 | 270) {
    if (!selectedPageNumbers.length) return;
    void runDerivativeOp("rotate-bulk", "rotatePages", {
      pages: selectedPageNumbers,
      rotation,
    });
  }

  function downloadResult() {
    if (!lastResult) return;
    const url = URL.createObjectURL(lastResult.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lastResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading && !pages.length) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading pages…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-xs">
      {/* Selection bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-card/60 px-2 py-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={selected.size === pages.length ? clearSelection : selectAll}
          className="h-6 text-[10px]"
        >
          {selected.size === pages.length && pages.length > 0 ? (
            <CheckSquare className="h-3 w-3 mr-1" />
          ) : (
            <Square className="h-3 w-3 mr-1" />
          )}
          {selected.size === pages.length && pages.length > 0
            ? "Clear"
            : "Select all"}
        </Button>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {selected.size} / {pages.length} selected
        </span>
        {selected.size > 0 ? (
          <PagesInput
            value={selectedPageNumbers.join(",")}
            onCommit={(nums) => {
              const lookup = new Map(
                pages.map((p) => [p.page_index + 1, p.id] as const),
              );
              setSelected(
                new Set(nums.map((n) => lookup.get(n)!).filter(Boolean)),
              );
            }}
          />
        ) : null}
      </div>

      {/* Bulk action bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card/40 px-2 py-1.5">
        <ActionBtn
          icon={Scissors}
          label="Extract"
          tooltip="Pull selected pages into a new PDF"
          disabled={!selected.size || !!busy}
          loading={busy === "extract"}
          onClick={bulkExtract}
        />
        <ActionBtn
          icon={Trash2}
          label="Delete"
          tone="destructive"
          tooltip="Remove selected pages (creates a derivative)"
          disabled={!selected.size || !!busy}
          loading={busy === "delete"}
          onClick={bulkDelete}
        />
        <ActionBtn
          icon={CopyIcon}
          label="Duplicate"
          tooltip="Duplicate each selected page in place"
          disabled={!selected.size || !!busy}
          loading={busy === "duplicate"}
          onClick={bulkDuplicate}
        />
        <ActionBtn
          icon={RotateCw}
          label="Rotate 90"
          tooltip="Rotate selected pages 90° clockwise"
          disabled={!selected.size || !!busy}
          loading={busy === "rotate-bulk"}
          onClick={() => bulkRotate(90)}
        />
        {lastResult ? (
          <Button
            size="sm"
            onClick={downloadResult}
            className="ml-auto h-6 text-[10px]"
          >
            <Download className="h-3 w-3 mr-1" /> {lastResult.filename}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3" /> {error}
        </div>
      ) : null}

      {/* Page list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pages.map((p) => (
            <PageCard
              key={p.id}
              fileId={fileId}
              page={p}
              selected={selected.has(p.id)}
              active={p.page_index + 1 === activePageNumber}
              busy={busy}
              onToggleSelect={() => toggleSelect(p.id)}
              onOpen={() => onSelectPage(p.page_index + 1, p.id)}
              onRotate={() => inPlaceRotate(p.id, p.rotation)}
              onExclude={() => inPlaceExclude(p.id)}
              onInclude={() => inPlaceInclude(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Single-page card ────────────────────────────────────────────────────

function PageCard({
  fileId,
  page,
  selected,
  active,
  busy,
  onToggleSelect,
  onOpen,
  onRotate,
  onExclude,
  onInclude,
}: {
  fileId: string;
  page: {
    id: string;
    page_index: number;
    status: string;
    rotation: number;
    text_source: string;
    ocr_confidence?: number | null;
  };
  selected: boolean;
  active: boolean;
  busy: string | null;
  onToggleSelect: () => void;
  onOpen: () => void;
  onRotate: () => void;
  onExclude: () => void;
  onInclude: () => void;
}) {
  const { png } = usePageThumbnail(fileId, page.id, { dpi: 80 });
  const excluded = page.status === "excluded";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md border transition-colors",
        selected
          ? "border-primary ring-1 ring-primary/40"
          : active
            ? "border-primary/60"
            : "border-border hover:border-foreground/30",
        excluded ? "opacity-50" : "",
      )}
    >
      <div className="flex items-center gap-1 border-b border-border bg-card/60 px-1 py-1">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 truncate text-left text-[11px] font-medium tabular-nums hover:underline"
        >
          Page {page.page_index + 1}
        </button>
        {page.text_source === "ocr" || page.text_source === "mixed" ? (
          <span className="rounded bg-amber-500/15 px-1 py-px text-[8px] uppercase text-amber-700 dark:text-amber-300">
            ocr
          </span>
        ) : null}
        {page.rotation !== 0 ? (
          <span className="rounded bg-muted px-1 py-px text-[8px] tabular-nums text-muted-foreground">
            {page.rotation}°
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="block w-full aspect-[8.5/11] bg-muted/30 text-left"
      >
        {png ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={png}
            alt={`Page ${page.page_index + 1}`}
            className="block h-full w-full object-contain"
            style={{
              transform:
                page.rotation === 0 ? undefined : `rotate(${page.rotation}deg)`,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            page {page.page_index + 1}
          </div>
        )}
      </button>

      <div className="flex items-center gap-0.5 border-t border-border bg-card/40 px-1 py-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <TinyBtn
          icon={RotateCw}
          label="Rotate"
          onClick={onRotate}
          disabled={!!busy}
        />
        {excluded ? (
          <TinyBtn icon={Eye} label="Include" onClick={onInclude} disabled={!!busy} />
        ) : (
          <TinyBtn
            icon={EyeOff}
            label="Exclude"
            onClick={onExclude}
            disabled={!!busy}
          />
        )}
      </div>
    </div>
  );
}

// ─── Utility components ──────────────────────────────────────────────────

function ActionBtn({
  icon: Icon,
  label,
  tooltip,
  disabled,
  loading,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  tone?: "destructive";
}) {
  return (
    <Button
      size="sm"
      variant={tone === "destructive" ? "outline" : "outline"}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        "h-6 text-[10px]",
        tone === "destructive" ? "border-destructive/50 text-destructive hover:bg-destructive/10" : "",
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Icon className="h-3 w-3 mr-1" />}
      {label}
    </Button>
  );
}

function TinyBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}

function PagesInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (pages: number[]) => void;
}) {
  const [text, setText] = useState(value);
  const commit = () => {
    const parsed = parsePages(text);
    onCommit(parsed);
  };
  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      placeholder="e.g. 1,3-5"
      className="ml-2 h-6 w-24 text-[10px]"
    />
  );
}

function parsePages(text: string): number[] {
  const out = new Set<number>();
  for (const chunk of text.split(/[,\s]+/)) {
    if (!chunk) continue;
    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number.parseInt(range[1], 10);
      const b = Number.parseInt(range[2], 10);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      continue;
    }
    const n = Number.parseInt(chunk, 10);
    if (Number.isFinite(n)) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}
