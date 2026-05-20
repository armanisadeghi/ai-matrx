/**
 * features/files/components/core/FileBadges/FileRagBadge.tsx
 *
 * Tiny inline indicator that a file is RAG-indexed (has a
 * `processed_documents` row) or that it's a derivation of another
 * file (`parentFileId`). Designed to live next to the filename in
 * dense list views — file table rows, grid cells, file-tree rows.
 *
 * The "derived from" pill is FREE: it reads `parentFileId` from the file
 * row already in Redux. The "indexed for RAG" pill is NOT free — it needs
 * a per-file `processed_documents` lookup — so it is OPT-IN via
 * `showRagStatus`. By default the badge never probes, because for the vast
 * majority of lists (images, generic uploads) the RAG signal is noise. Turn
 * it on only for surfaces that specifically curate RAG documents.
 *
 * Renders nothing when:
 *   - The file is virtual (no cld_files.id to look up against).
 *   - `showRagStatus` is off (default) and the file isn't a derivation.
 *   - The lookup hasn't returned yet (avoid layout shift on first
 *     paint of a long file list).
 *   - The file has no processed_document and no parentFileId.
 *
 * The badge is purely informational; click handlers live on the
 * row. We don't want a tiny pill stealing pointer events.
 */

"use client";

import { GitBranch, Lightbulb } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import { cn } from "@/lib/utils";

export interface FileRagBadgeProps {
  fileId: string;
  className?: string;
  /** Compact mode — no labels, just icons. Default true for dense lists. */
  iconOnly?: boolean;
  /**
   * Opt in to the "Indexed for RAG" pill. OFF by default: resolving it
   * requires a per-file `processed_documents` lookup, so leaving it off keeps
   * dense lists free of per-row reads. Enable it only on surfaces that
   * curate RAG documents (e.g. a document-library directory). The
   * "derived from" pill renders regardless — it's read from the file row.
   */
  showRagStatus?: boolean;
}

export function FileRagBadge({
  fileId,
  className,
  iconOnly = true,
  showRagStatus = false,
}: FileRagBadgeProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  // Only probe when the RAG pill is explicitly requested. Passing `null`
  // makes `useFileDocument` a no-op (no Supabase read), so the default
  // dense-list path costs nothing.
  const { state } = useFileDocument(showRagStatus ? fileId : null);

  // Virtual files don't have processed_documents (their content is
  // ingested via `source_kind: note | code_file`, not `cld_file`).
  if (!file || file.source.kind !== "real") return null;

  const isIndexed = showRagStatus && state.status === "found";
  const isDerived = !!file.parentFileId;

  if (!isIndexed && !isDerived) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 align-middle",
        className,
      )}
      aria-label={
        isIndexed && isDerived
          ? "Indexed for RAG, derived from another file"
          : isIndexed
            ? "Indexed for RAG"
            : "Derived from another file"
      }
    >
      {isIndexed ? (
        <span
          title="Indexed for RAG search"
          className="inline-flex items-center gap-0.5 rounded-sm bg-primary/10 text-primary px-1 py-px text-[9px] font-semibold leading-none"
        >
          <Lightbulb className="h-2.5 w-2.5" />
          {iconOnly ? null : <span>RAG</span>}
        </span>
      ) : null}
      {isDerived ? (
        <span
          title={`Derived from another file${file.derivationKind ? ` · ${file.derivationKind}` : ""}`}
          className="inline-flex items-center gap-0.5 rounded-sm bg-muted text-muted-foreground px-1 py-px text-[9px] font-semibold leading-none"
        >
          <GitBranch className="h-2.5 w-2.5" />
          {iconOnly ? null : <span>derived</span>}
        </span>
      ) : null}
    </span>
  );
}

export default FileRagBadge;
