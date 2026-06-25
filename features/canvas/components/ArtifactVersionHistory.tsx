"use client";

/**
 * ArtifactVersionHistory — the ONE generic version-history viewer for any
 * materialized artifact (vision Q4: every type versioned + viewable + "see what
 * was originally streamed"). Generalizes the mermaid-workbench pattern to all
 * types: load the `canvas_items` version chain (`cx_canvas_get_version_history`),
 * browse every version, read the original streamed content, and restore a prior
 * version (saved as a new version — never destructive).
 *
 * Mounted wherever an artifact is shown (the artifact wrapper, the canvas). Pure
 * read + the existing owner-checked `saveUserVersion` RPC — no schema coupling.
 */

import React, { useCallback, useState } from "react";
import { History, RotateCcw, Loader2, FileClock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  canvasArtifactService,
  type CanvasArtifactRow,
} from "@/features/canvas/services/canvasArtifactService";
import { CANVAS_ITEM_UPDATED_EVENT } from "@/features/canvas/hooks/useCanvasItem";

/** Pull the readable body out of the stored `{ data, type, metadata }` shape. */
function versionText(row: CanvasArtifactRow): string {
  const c = row.content as { data?: unknown } | string | null | undefined;
  if (c && typeof c === "object" && "data" in c) {
    return typeof c.data === "string" ? c.data : JSON.stringify(c.data ?? "", null, 2);
  }
  return typeof c === "string" ? c : JSON.stringify(c ?? "", null, 2);
}

function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

interface ArtifactVersionHistoryProps {
  canvasItemId: string;
  /** Classes for the trigger button (so callers control the affordance look). */
  triggerClassName?: string;
}

export function ArtifactVersionHistory({
  canvasItemId,
  triggerClassName,
}: ArtifactVersionHistoryProps) {
  const [rows, setRows] = useState<CanvasArtifactRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const history = await canvasArtifactService.getVersionHistory(canvasItemId);
      const sorted = [...history].sort((a, b) => b.version - a.version);
      setRows(sorted);
      setSelectedId(sorted[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [canvasItemId]);

  const restore = useCallback(
    async (row: CanvasArtifactRow) => {
      setRestoringId(row.id);
      try {
        const saved = await canvasArtifactService.saveUserVersion({
          canvasId: canvasItemId,
          title: row.title,
          content: versionText(row),
          type: row.type,
        });
        if (saved) {
          toast.success(`Restored v${row.version} as a new version`);
          window.dispatchEvent(
            new CustomEvent(CANVAS_ITEM_UPDATED_EVENT, {
              detail: { rootId: canvasItemId, latestId: saved.id },
            }),
          );
          void load();
        } else {
          toast.error("Couldn't restore that version");
        }
      } finally {
        setRestoringId(null);
      }
    },
    [canvasItemId, load],
  );

  const selected = rows?.find((r) => r.id === selectedId) ?? null;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void load();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          title="Version history"
          aria-label="Version history"
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-foreground">
          <FileClock className="h-3.5 w-3.5 text-muted-foreground" />
          Version history
        </div>

        {loading && (
          <div className="px-3 py-6 text-center">
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && rows && rows.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No saved versions yet.
          </div>
        )}

        {!loading && rows && rows.length > 0 && (
          <>
            <div className="max-h-44 overflow-auto py-1">
              {rows.map((row, i) => {
                const isLatest = i === 0;
                const isOriginal =
                  row.parent_canvas_id === null || row.version === 1;
                const isSelected = row.id === selectedId;
                return (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${
                      isSelected ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-medium text-foreground">
                        v{row.version}
                        {isLatest && (
                          <span className="ml-1 text-[10px] text-primary">
                            current
                          </span>
                        )}
                        {isOriginal && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            original
                          </span>
                        )}
                      </div>
                      <div className="truncate text-muted-foreground">
                        {row.source_type.replace(/_/g, " ")} · {relTime(row.created_at)}
                      </div>
                    </button>
                    {!isLatest && (
                      <button
                        type="button"
                        onClick={() => restore(row)}
                        disabled={restoringId === row.id}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        title={`Restore v${row.version}`}
                      >
                        {restoringId === row.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {selected && (
              <div className="border-t border-border">
                <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {selected.version === 1 ||
                  selected.parent_canvas_id === null
                    ? "Originally streamed"
                    : `Version ${selected.version}`}
                </div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 pb-3 pt-1 text-[11px] leading-relaxed text-foreground/80">
                  {versionText(selected).slice(0, 4000)}
                </pre>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
