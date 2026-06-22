"use client";

/**
 * RichMemberTable — clear, file-list view of what's in a data store.
 *
 * Replaces the opaque "kind / source_id" row with: file name, mime,
 * size, page count, chunk count, status badge, and direct actions
 * (Search / Open / Remove).
 */

import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuickSearchDialog } from "@/features/rag/components/library/QuickSearchDialog";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { StatusBadge } from "@/features/rag/components/library/StatusBadge";
import type { DocStatus } from "@/features/rag/types/library";
import type { RichMember } from "@/features/rag/hooks/useDataStores";

const FORMAT_BYTES = (n: number | null): string => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

function statusToDocStatus(s: RichMember["status"]): DocStatus {
  if (s === "no_processing") return "pending";
  if (s === "ready") return "ready";
  if (s === "embedding") return "embedding";
  if (s === "extracted") return "extracted";
  if (s === "pending") return "pending";
  return "unknown";
}

export interface RichMemberTableProps {
  members: RichMember[];
  loading: boolean;
  error: string | null;
  onRemove: (
    sourceKind: string,
    sourceId: string,
  ) => Promise<unknown> | unknown;
  onRefresh?: () => void;
}

export function RichMemberTable({
  members,
  loading,
  error,
  onRemove,
  onRefresh,
}: RichMemberTableProps) {
  const [searchTarget, setSearchTarget] = useState<RichMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<RichMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const doRemove = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      await onRemove(confirmRemove.sourceKind, confirmRemove.sourceId);
      toast.success(`Removed ${confirmRemove.name}`);
      setConfirmRemove(null);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  };

  if (loading && members.length === 0) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/50 bg-destructive/5 rounded-md p-3 text-sm text-destructive">
        <strong>Could not load members:</strong> {error}
        {onRefresh && (
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
        No members yet. Drag a file onto this store, or use Add Member.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                File
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pages
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {RAG_VOCAB.segmentsShort}
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Size
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Added
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr
                key={`${m.sourceKind}/${m.sourceId}`}
                className="hover:bg-muted/20"
              >
                <td className="px-3 py-2 max-w-md">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="px-1 py-0 text-[9px]">
                      {m.sourceKind}
                    </Badge>
                    {m.mimeType && (
                      <span className="truncate">{m.mimeType}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={statusToDocStatus(m.status)} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {m.pages > 0 ? m.pages.toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {m.chunks > 0 ? (
                    <span
                      className={
                        m.chunks > 0 && m.embeddingsOai < m.chunks
                          ? "text-yellow-600 dark:text-yellow-400"
                          : ""
                      }
                    >
                      {m.chunks.toLocaleString()}
                      {m.embeddingsOai !== m.chunks && (
                        <span className="text-muted-foreground">
                          {" / "}
                          {m.embeddingsOai}
                        </span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                  {FORMAT_BYTES(m.fileSize)}
                </td>
                <td className="px-3 py-2 text-[10px] text-muted-foreground tabular-nums">
                  {new Date(m.addedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Search inside this document"
                      disabled={!m.processedDocumentId || m.chunks === 0}
                      onClick={() => setSearchTarget(m)}
                    >
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Open preview"
                      disabled={!m.processedDocumentId}
                      onClick={() => {
                        if (m.processedDocumentId) {
                          window.open(
                            `/rag/library/${m.processedDocumentId}/preview`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive"
                      title="Remove from this store"
                      onClick={() => setConfirmRemove(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <QuickSearchDialog
        open={searchTarget !== null}
        onOpenChange={(o) => {
          if (!o) setSearchTarget(null);
        }}
        processedDocumentId={searchTarget?.processedDocumentId ?? null}
        documentName={searchTarget?.name ?? null}
      />

      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from store?</DialogTitle>
            <DialogDescription>
              Removes <strong>{confirmRemove?.name}</strong> from this store
              only. The file itself, its pages,{" "}
              {RAG_VOCAB.segmentsShort.toLowerCase()}, and embeddings are{" "}
              <strong>not</strong> deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={doRemove}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
