"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { selectPdfPages, type PdfPageSelectionResult } from "@/features/files/api/pdf-pages";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const selectedPdfCache = new Map<string, Promise<PdfPageSelectionResult>>();

const PdfPreview = dynamic(
  () => import("@/features/pdf/components/viewer/PdfPreview"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

function selectedPdf(
  fileId: string,
  sourcePages: number[],
): Promise<PdfPageSelectionResult> {
  const key = `${fileId}|${sourcePages.join(",")}`;
  let pending = selectedPdfCache.get(key);
  if (!pending) {
    pending = selectPdfPages(fileId, { pages: sourcePages }).then(
      ({ data }) => data,
    );
    selectedPdfCache.set(key, pending);
    void pending.catch(() => selectedPdfCache.delete(key));
  }
  return pending;
}

export function SelectedPdfPages({
  fileId,
  sourcePages,
  className,
  showPagePicker = false,
}: {
  fileId: string;
  sourcePages: number[];
  className?: string;
  showPagePicker?: boolean;
}) {
  const pageKey = sourcePages.join(",");
  const selectionKey = `${fileId}|${pageKey}`;
  const [loadState, setLoadState] = useState<{
    key: string;
    selection: PdfPageSelectionResult | null;
    error: string | null;
  }>({ key: "", selection: null, error: null });
  const [derivativePage, setDerivativePage] = useState(1);
  const current = loadState.key === selectionKey ? loadState : null;

  useEffect(() => {
    if (!pageKey) return undefined;
    let cancelled = false;
    const pages = pageKey.split(",").map((value) => Number.parseInt(value, 10));
    void selectedPdf(fileId, pages)
      .then((value) => {
        if (!cancelled) {
          setDerivativePage(1);
          setLoadState({ key: selectionKey, selection: value, error: null });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoadState({
            key: selectionKey,
            selection: null,
            error:
              reason instanceof Error
                ? reason.message
                : "Could not build the selected-page PDF",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, pageKey, selectionKey]);

  if (current?.error) {
    return (
      <div
        className={cn("flex h-full items-center justify-center p-6", className)}
      >
        <p className="max-w-sm text-center text-xs text-destructive">
          {current.error}
        </p>
      </div>
    );
  }
  if (!current?.selection) {
    return (
      <div
        className={cn(
          "flex h-full min-h-48 items-center justify-center gap-2 text-xs text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing physical page{sourcePages.length === 1 ? "" : "s"}…
      </div>
    );
  }

  const selection = current.selection;
  const activeSourcePage =
    selection.output_page_map.find(
      (entry) => entry.output_page === derivativePage,
    )?.source_page ?? selection.source_pages[derivativePage - 1];

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {showPagePicker ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 py-2">
          <span className="mr-1 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Source page
          </span>
          {selection.output_page_map.map((entry) => {
            const active = entry.output_page === derivativePage;
            return (
              <Button
                key={`${entry.output_page}-${entry.source_page}`}
                type="button"
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-xs tabular-nums"
                onClick={() => setDerivativePage(entry.output_page)}
                aria-pressed={active}
              >
                {active ? <Check className="h-3 w-3" /> : null}
                {entry.source_page}
              </Button>
            );
          })}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20">
        <PdfPreview
          fileId={selection.file.file_id}
          pageNumber={derivativePage}
          onPageChange={setDerivativePage}
        />
      </div>
      <div className="shrink-0 px-3 py-1.5 text-[10px] text-muted-foreground">
        Viewing source page {activeSourcePage ?? "—"} · derivative page{" "}
        {derivativePage} of {selection.output_page_map.length}
        {selection.cache_hit ? " · cached" : " · newly extracted"}
      </div>
    </div>
  );
}
