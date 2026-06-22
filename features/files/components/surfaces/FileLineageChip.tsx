/**
 * features/files/components/surfaces/FileLineageChip.tsx
 *
 * Compact lineage indicator that lives in the PreviewPane header for
 * any file with a known parent (`parentFileId`) or a processed-document
 * row with binary/processing ancestors.
 *
 * Two layers, mirroring `features/rag/components/documents/LineageBreadcrumbs`:
 *   - Binary lineage (cld_files.parent_file_id) — "this PDF is a
 *     re-extract / page-range / OCR re-run of <bigger PDF>"
 *   - Processing lineage (processed_documents.parent_processed_id) —
 *     surfaced lazily when the user opens the chip popover
 *
 * Click → opens the source file in the same PreviewPane (real files)
 * or routes to /rag/viewer/<id> for processed-document ancestors.
 *
 * If neither layer has a known ancestor, the component renders nothing.
 * It is a soft enhancement; missing data is the steady state for files
 * that haven't been derived from anything.
 */

"use client";

import { useCallback } from "react";
import { ArrowLeft, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { setActiveFileId } from "@/features/files/redux/slice";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";

export interface FileLineageChipProps {
  fileId: string;
  className?: string;
}

export function FileLineageChip({ fileId, className }: FileLineageChipProps) {
  const dispatch = useAppDispatch();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { state } = useFileDocument(fileId);

  const onOpenParent = useCallback(() => {
    if (!file?.parentFileId) return;
    dispatch(setActiveFileId(file.parentFileId));
  }, [dispatch, file?.parentFileId]);

  const hasBinaryParent = !!file?.parentFileId;
  // The "found" lookup carries the doc id — clicking the chip when the
  // user wants the *processed_document* (not the raw bytes parent) opens
  // the full RAG viewer. The "found" state alone doesn't imply a
  // processing-parent though; the LineageTree from /api/document/{id}/lineage
  // is what tells us about prior extractions. We keep the chip simple
  // here and reserve the "ancestor explorer" affordance for the
  // DocumentViewer's own LineageBreadcrumbs.
  const hasProcessedDoc = state.status === "found";

  if (!hasBinaryParent && !hasProcessedDoc) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-[10px] text-muted-foreground",
        className,
      )}
    >
      {hasBinaryParent && (
        <button
          type="button"
          onClick={onOpenParent}
          title={`Derived from another file${file?.derivationKind ? ` · ${file.derivationKind}` : ""}`}
          className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 hover:bg-accent"
        >
          <ArrowLeft className="h-3 w-3" />
          <span>derived</span>
          {file?.derivationKind ? (
            <span className="font-mono uppercase tracking-wide">
              · {file.derivationKind}
            </span>
          ) : null}
        </button>
      )}
      {hasProcessedDoc && (
        <span
          title={
            state.status === "found" && state.doc.chunk_count != null
              ? `Has a processed_documents row with ${state.doc.chunk_count} ${RAG_VOCAB.segmentsShort.toLowerCase()}`
              : "Has a processed_documents row"
          }
          className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5"
        >
          <GitBranch className="h-3 w-3" />
          <span>RAG</span>
        </span>
      )}
    </div>
  );
}
