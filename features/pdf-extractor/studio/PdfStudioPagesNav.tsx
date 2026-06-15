"use client";

import React, { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/utils/dataUtils";
import { PdfStudioPagesMeta } from "./PdfStudioPagesMeta";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";
import type { PdfDocument } from "../hooks/usePdfExtractor";

interface PdfStudioPagesNavProps {
  doc: PdfDocument;
  pageRowCount: number;
  hasPageRows: boolean;
  pages: PdfPageRow[];
  activePage: number | null;
  loading: boolean;
  onSelectPage: (pageNumber: number) => void;
}

export function PdfStudioPagesNav({
  doc,
  pageRowCount,
  hasPageRows,
  pages,
  activePage,
  loading,
  onSelectPage,
}: PdfStudioPagesNavProps) {
  const sorted = useMemo(
    () => [...pages].sort((a, b) => a.pageIndex - b.pageIndex),
    [pages],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <PdfStudioPagesMeta
        doc={doc}
        pageRowCount={pageRowCount}
        hasPageRows={hasPageRows}
      />
      <div className="px-3 py-1.5 border-b border-border/60 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Pages
      </div>
      <ScrollArea className="flex-1">
        {loading && sorted.length === 0 ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-full rounded bg-muted/40 animate-pulse"
              />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            No pages yet. Run the pipeline to extract pages.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {sorted.map((p) => {
              const isActive = p.pageNumber === activePage;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPage(p.pageNumber)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-[11px] transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50 text-foreground/90",
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium tabular-nums">
                        Page {p.pageNumber}: {toTitleCase(p.sectionKind)}
                      </span>
                      {/* {p.sectionKind && (
                        <span className="text-xs text-foreground">
                          Type: {toTitleCase(p.sectionKind)}
                        </span>
                      )} */}
                      {p.sectionTitle && (
                        <div className="text-xs text-primary break-words leading-tight">
                          {p.sectionTitle}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
