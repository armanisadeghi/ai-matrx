"use client";

/**
 * PdfStudioPagesMeta — compact document metadata above the pages list.
 *
 * Holds context assignment, corpus stats, processing status, and last-updated
 * so the center toolbar stays action-focused (title + page jumper + tools).
 */

import React from "react";
import { RefreshCw } from "lucide-react";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
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
      {doc.sourceKind === "cld_file" && doc.sourceId && (
        <PdfFileContextRow fileId={doc.sourceId} fileName={doc.name} />
      )}

      <dl className="space-y-1 text-[11px]">
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

function PdfFileContextRow({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const es = useEntityScopes({ entityType: "file", entityId: fileId });
  const n = es.scopeIds.length;
  return (
    <ContextStatusButton
      size="xs"
      showScopeLabel
      buttonClassName="w-full justify-start"
      subject={{ entityType: "file", entityId: fileId, title: fileName }}
      knownScopeCount={n}
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
