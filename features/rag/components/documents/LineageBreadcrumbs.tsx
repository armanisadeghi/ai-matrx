"use client";

/**
 * Compact lineage chain rendered in the viewer header.
 *
 * Shows two layers (per the unified-document model):
 *   * Binary lineage (cld_files.parent_file_id) — "this PDF is pages
 *     5–10 of <bigger PDF>"
 *   * Processing lineage (processed_documents.parent_processed_id) —
 *     "this is a re-clean of the prior extraction"
 *
 * For deep trees the user clicks "open lineage explorer" to get the
 * full ancestor + descendant view (LineagePanel below).
 */

import { useMemo } from "react";
import { ArrowLeft, GitBranch, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DocumentDetail,
  LineageTree,
} from "@/features/rag/types/documents";

export interface LineageBreadcrumbsProps {
  document: DocumentDetail | null;
  lineage: LineageTree | null;
  onOpenAncestor?: (
    id: string,
    kind: "cld_files" | "processed_document",
  ) => void;
}

export function LineageBreadcrumbs({
  document,
  lineage,
  onOpenAncestor,
}: LineageBreadcrumbsProps) {
  const compact = document?.lineage ?? null;

  const hasAny = useMemo(
    () =>
      !!compact &&
      (compact.binary_parent_file_id || compact.processing_parent_id),
    [compact],
  );

  if (!document) return null;
  if (!hasAny) {
    return <span className="text-xs text-muted-foreground">No parents</span>;
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {compact?.binary_parent_file_id && (
        <BreadcrumbChip
          icon={<ArrowLeft className="h-3 w-3" />}
          label="binary parent"
          kindLabel={compact.binary_parent_kind ?? "manual"}
          onClick={() =>
            onOpenAncestor?.(compact.binary_parent_file_id!, "cld_files")
          }
        />
      )}
      {compact?.processing_parent_id && (
        <BreadcrumbChip
          icon={<History className="h-3 w-3" />}
          label="prior extraction"
          kindLabel={compact.processing_parent_kind ?? "re_extract"}
          onClick={() =>
            onOpenAncestor?.(
              compact.processing_parent_id!,
              "processed_document",
            )
          }
        />
      )}
      {lineage && (
        <span className="text-muted-foreground">
          · <GitBranch className="inline h-3 w-3 mr-0.5" />
          {(lineage.binary_ancestors?.length ?? 0) +
            (lineage.processing_ancestors?.length ?? 0)}{" "}
          ancestors,{" "}
          {(lineage.binary_descendants?.length ?? 0) +
            (lineage.processing_descendants?.length ?? 0)}{" "}
          descendants
        </span>
      )}
    </div>
  );
}

function BreadcrumbChip({
  icon,
  label,
  kindLabel,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  kindLabel: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-card",
        onClick && "hover:bg-secondary/40 transition-colors",
      )}
    >
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono text-[10px] uppercase tracking-wide">
        {kindLabel}
      </span>
    </Tag>
  );
}
