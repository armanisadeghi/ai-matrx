"use client";

/**
 * LineageTreeView — two-axis lineage tree for a processed document.
 *
 *   ┌── Binary lineage (cld_files.parent_file_id) ───┐
 *   │  source.pdf                                    │
 *   │   └─ extract-pages → cropped.pdf               │
 *   └────────────────────────────────────────────────┘
 *   ┌── Processing lineage (processed_documents.parent_processed_id) ─┐
 *   │  initial_extract                                                │
 *   │   └─ re_clean → re_chunk                                        │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Both axes pull from Supabase via `useDocumentLineage`. RLS scopes them
 * to the signed-in user. When the source isn't a `cld_file` (legacy rows
 * land with `source_kind='legacy'`), the binary side renders an explainer
 * pointing at the re-process action.
 */

import React from "react";
import {
  GitBranch,
  FileText,
  ArrowRight,
  Loader2,
  Layers,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  useDocumentLineage,
  type ProcessingNode,
  type BinaryNode,
} from "../hooks/useDocumentLineage";
import type { PdfDocument } from "../hooks/usePdfExtractor";

interface LineageTreeViewProps {
  doc: PdfDocument;
}

export function LineageTreeView({ doc }: LineageTreeViewProps) {
  const { lineage, loading, error, refresh } = useDocumentLineage({
    docId: doc.id,
    parentProcessedId: doc.parentProcessedId,
    sourceKind: doc.sourceKind,
    sourceId: doc.sourceId,
  });

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Lineage
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          processing · binary
          <button
            type="button"
            onClick={refresh}
            className="p-0.5 hover:text-foreground transition-colors rounded"
            title="Refresh lineage"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          </button>
        </span>
      </div>

      {error && (
        <div className="text-[10px] text-destructive border border-destructive/30 bg-destructive/10 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* ── Processing lineage ─────────────────────────────────────────── */}
      <Section
        title="Processing lineage"
        subtitle="Re-extractions, re-cleans, and re-chunks of this document."
        icon={<Layers className="w-3 h-3 text-muted-foreground" />}
      >
        {loading && !lineage ? (
          <SkeletonRow />
        ) : (
          <>
            {(lineage?.processingAncestors ?? []).map((n) => (
              <ProcessingRow key={n.id} node={n} variant="ancestor" />
            ))}

            <div className="flex items-center gap-2 px-2.5 py-2 bg-card border-2 border-primary/40 rounded-md">
              <div className="shrink-0 w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {/* This IS the document the studio has open, so its name is
                    not a door to anywhere new — but it stays an `EntityRef`
                    so the row reads identically to its ancestors and
                    descendants, and so the peek arrives here too if
                    `processed_document` ever gets one. */}
                <EntityRef
                  token="processed_document"
                  id={doc.id}
                  name={doc.name}
                  showIcon={false}
                  disableNewTab
                  className="text-xs font-medium"
                />
                <p className="text-[10px] text-muted-foreground truncate">
                  <code className="font-mono">{doc.id.slice(0, 8)}…</code> ·{" "}
                  current · {doc.derivationKind}
                  {doc.totalPages != null && (
                    <> · {doc.totalPages.toLocaleString()} pages</>
                  )}
                </p>
              </div>
            </div>

            {(lineage?.processingChildren ?? []).map((n) => (
              <ProcessingRow key={n.id} node={n} variant="descendant" />
            ))}

            {!loading && (lineage?.processingChildren?.length ?? 0) === 0 && (
              <p className="text-[10px] text-muted-foreground/70 italic px-1">
                No re-processing runs yet. Trigger a re-extract or re-clean to
                add a child here.
              </p>
            )}
          </>
        )}
      </Section>

      {/* ── Binary lineage ─────────────────────────────────────────────── */}
      <Section
        title="Binary lineage"
        subtitle="Derivative PDFs (extract pages, crop, rotate, merge, split, compress)."
        icon={<GitBranch className="w-3 h-3 text-muted-foreground" />}
      >
        {loading && !lineage ? (
          <SkeletonRow />
        ) : doc.sourceKind !== "cld_file" ? (
          <div className="px-3 py-3 border border-dashed border-border rounded-md bg-muted/20 space-y-1">
            <p className="text-[11px] text-muted-foreground leading-snug">
              This document was not ingested via the Cloud Files pipeline
              <span className="ml-1 px-1 bg-card border border-border rounded text-[10px] font-mono">
                source_kind = {doc.sourceKind ?? "(null)"}
              </span>
              , so there's no binary lineage chain to walk yet.
            </p>
            <p className="text-[10px] text-muted-foreground/70">
              New extractions and the manipulation operations (extract pages,
              crop, rotate, …) will populate this side automatically.
            </p>
          </div>
        ) : !lineage?.currentBinary ? (
          <p className="text-[10px] text-muted-foreground italic px-1">
            Source <code>cld_files</code> row not found.
          </p>
        ) : (
          <>
            {(lineage.binaryAncestors ?? []).map((n) => (
              <BinaryRow key={n.id} node={n} variant="ancestor" />
            ))}
            <BinaryRow node={lineage.currentBinary} variant="current" />
            {(lineage.binaryChildren ?? []).map((n) => (
              <BinaryRow key={n.id} node={n} variant="descendant" />
            ))}
            {!loading &&
              (lineage.binaryChildren?.length ?? 0) === 0 &&
              !lineage.currentBinary.parentFileId && (
                <p className="text-[10px] text-muted-foreground/70 italic px-1">
                  No derivatives yet. Operations like extract-pages or merge
                  will appear here once the new derivative-persistence flag is
                  set on the request.
                </p>
              )}
          </>
        )}
      </Section>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/70 ml-1">
          {subtitle}
        </span>
      </div>
      <div className="space-y-1 ml-1">{children}</div>
    </div>
  );
}

function ProcessingRow({
  node,
  variant,
}: {
  node: ProcessingNode;
  variant: "ancestor" | "descendant";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 bg-card border border-border rounded-md",
        variant === "ancestor" && "opacity-80",
      )}
    >
      <ArrowRight
        className={cn(
          "w-3 h-3 shrink-0 text-muted-foreground/60",
          variant === "ancestor" && "rotate-180",
        )}
      />
      <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        {/* A lineage tree exists to answer "what did this come from?" and then
            gave you no way to GO there — the whole point of the panel stopped
            one click short. `openInNewTab` because the studio has an extraction
            session open behind this panel; navigating the current tab to a
            different document is precisely the state loss the new-tab door
            exists to prevent. */}
        <EntityRef
          token="processed_document"
          id={node.id}
          name={node.name}
          showIcon={false}
          openInNewTab
          fill
          className="text-[11px] font-medium"
        />
        <p className="text-[9px] text-muted-foreground truncate">
          <code className="font-mono">{node.id.slice(0, 8)}…</code> ·{" "}
          {node.derivationKind}
        </p>
      </div>
    </div>
  );
}

function BinaryRow({
  node,
  variant,
}: {
  node: BinaryNode;
  variant: "ancestor" | "current" | "descendant";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-md",
        variant === "current"
          ? "bg-card border-2 border-primary/40"
          : "bg-card border border-border",
        variant === "ancestor" && "opacity-80",
      )}
    >
      {variant !== "current" && (
        <ArrowRight
          className={cn(
            "w-3 h-3 shrink-0 text-muted-foreground/60",
            variant === "ancestor" && "rotate-180",
          )}
        />
      )}
      <FileText
        className={cn(
          "w-3 h-3 shrink-0",
          variant === "current" ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div className="flex-1 min-w-0">
        {/* The binary axis walks `files.files`, which is the registry's `file`:
            a real route AND a peek. The peek is the one that earns its keep on
            this panel — "is that the cropped one?" is answerable without
            leaving the extraction you are in the middle of. */}
        <EntityRef
          token="file"
          id={node.id}
          name={node.fileName}
          showIcon={false}
          openInNewTab
          fill
          className="text-[11px] font-medium"
        />
        <p className="text-[9px] text-muted-foreground truncate">
          <code className="font-mono">{node.id.slice(0, 8)}…</code>
          {node.derivationKind && <> · {node.derivationKind}</>}
          {node.fileSize != null && <> · {(node.fileSize / 1024).toFixed(0)} KB</>}
        </p>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30 border border-border/50 rounded-md">
      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />
      <span className="text-[10px] text-muted-foreground/60">Loading…</span>
    </div>
  );
}
