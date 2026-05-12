/**
 * Right-rail Annotations panel — list grouped by category with jump + delete.
 */

"use client";

import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import { useLabelCatalog } from "@/features/file-analysis/hooks/useLabelCatalog";
import { colorsFor } from "@/features/files/components/core/PdfAnnotationLayer";

interface Props {
  fileId: string;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (annotationId: string | null) => void;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
}

export function AnnotationsPanel({
  fileId,
  selectedAnnotationId,
  onSelectAnnotation,
  onJumpToPage,
}: Props) {
  const { annotations, loading, remove, byCategory } = useAnnotations(fileId);
  const { byId: labelById, categories } = useLabelCatalog();

  if (loading && annotations.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading annotations…
      </div>
    );
  }
  if (annotations.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        No annotations yet. Switch to <strong>Draw</strong> mode and click-drag
        over a region on any page.
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2 text-xs">
      {Array.from(byCategory.entries()).map(([cat, items]) => (
        <div key={cat} className="rounded border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              {categories[cat] ?? cat}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {items.length}
            </span>
          </div>
          <ul>
            {items.map((a) => {
              const palette = colorsFor({ category: a.label_category });
              const labelDef = labelById.get(a.label);
              return (
                <li
                  key={a.id}
                  className={cn(
                    "group flex items-start gap-2 border-b border-border/40 px-2 py-1.5 last:border-0 hover:bg-accent/30",
                    selectedAnnotationId === a.id ? "bg-accent/40" : "",
                  )}
                >
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded"
                    style={{
                      backgroundColor: palette.fill,
                      border: `1px solid ${palette.stroke}`,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAnnotation(a.id);
                      onJumpToPage(a.page_number, a.page_id);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate font-medium">
                        {labelDef?.display_name ?? a.label}
                      </span>
                      <span className="rounded bg-muted px-1 py-px text-[9px] uppercase text-muted-foreground">
                        p{a.page_number}
                      </span>
                      {a.redact ? (
                        <span className="rounded bg-destructive/15 px-1 py-px text-[9px] uppercase text-destructive">
                          redact
                        </span>
                      ) : null}
                    </div>
                    {a.extracted_text ? (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {a.extracted_text}
                      </div>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    title="Delete annotation"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
