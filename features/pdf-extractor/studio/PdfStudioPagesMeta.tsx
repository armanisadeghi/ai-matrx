"use client";

/**
 * PdfStudioPagesMeta — compact document metadata above the pages list.
 *
 * Holds context assignment, corpus stats, processing status, and last-updated
 * so the center toolbar stays action-focused (title + page jumper + tools).
 */

import React from "react";
import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { ContextAssignmentPopover } from "@/features/scopes/components/context-assignment/ContextAssignmentPopover";
import { setRowScopes } from "@/features/scopes/components/context-assignment/data";
import type { PdfDocument } from "../hooks/usePdfExtractor";

export interface PdfStudioPagesMetaProps {
  doc: PdfDocument;
  pageRowCount: number;
  hasPageRows: boolean;
}

export function PdfStudioPagesMeta({
  doc,
  pageRowCount,
  hasPageRows,
}: PdfStudioPagesMetaProps) {
  const pageTotal = doc.totalPages ?? pageRowCount;
  const statuses: string[] = [];
  if (!hasPageRows) statuses.push("No per-page rows");
  if (doc.cleanContent) statuses.push("Cleaned");

  return (
    <div className="shrink-0 border-b border-border/60 px-3 py-2.5 space-y-2">
      <dl className="space-y-1 text-[11px]">
        {doc.sourceKind === "cld_file" && doc.sourceId && (
          <PdfFileContextRow fileId={doc.sourceId} fileName={doc.name} />
        )}
        <MetaRow label="Pages">
          {pageTotal > 0 ? pageTotal.toLocaleString() : "—"}
        </MetaRow>
        <MetaRow label="Characters">{doc.charCount.toLocaleString()}</MetaRow>
        {statuses.length > 0 && (
          <MetaRow label="Status">
            <span className="text-foreground">{statuses.join(" · ")}</span>
          </MetaRow>
        )}
        <MetaRow label="Updated">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <RefreshCw className="h-2.5 w-2.5 shrink-0" />
            {formatRelativeTime(doc.updatedAt)}
          </span>
        </MetaRow>
      </dl>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right tabular-nums text-foreground">
        {children}
      </dd>
    </div>
  );
}

// Renders the context indicator as a row inside the metadata `<dl>` (same
// px-3/text-[11px] envelope as Pages/Characters/Status/Updated below it) —
// NOT via ContextStatusButton, whose TapTargetButton geometry is fixed at
// header-icon size and doesn't fit a compact metadata list row. Reuses the
// same ContextAssignmentPopover the tap-button variant uses underneath.
function PdfFileContextRow({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const es = useEntityScopes({ entityType: "file", entityId: fileId });
  const n = es.scopeIds.length;
  const hasContext = n > 0;

  return (
    <ContextAssignmentPopover
      subject={{ entityType: "file", entityId: fileId, title: fileName }}
      writeMode="live"
      onSaved={(r) => {
        if (!r.ok) return;
        setRowScopes(
          "file",
          fileId,
          r.selection.scopeIds.filter((id) => !id.startsWith("new:")),
        );
        void es.refresh();
      }}
      trigger={
        // Same div > dt + dd shape as MetaRow below (the only valid `<dl>`
        // child besides dt/dd directly) — role="button" + tabIndex makes it
        // a real click/keyboard target without breaking the list markup.
        <div
          role="button"
          tabIndex={0}
          className="flex cursor-pointer items-baseline justify-between gap-2 min-w-0 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Context
          </dt>
          <dd
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate font-medium",
              hasContext
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {hasContext ? (
              <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
            ) : (
              <ShieldAlert className="h-2.5 w-2.5 shrink-0" />
            )}
            {hasContext ? `${n} scope${n === 1 ? "" : "s"}` : "None"}
          </dd>
        </div>
      }
    />
  );
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
