"use client";

/**
 * ManipulationPanel — fully wired PDF operation panel for the Studio inspector.
 *
 * Every operation targets the currently active doc via `doc.sourceId` (cld_file)
 * or `doc.source` (public URL). No external links to demo pages.
 *
 * After a binary result is produced the user can:
 *   1. Download it directly to disk.
 *   2. "Save as document" — uploads to cld_files and creates a derivative
 *      processed_documents row with full lineage:
 *        parent_processed_id: doc.id
 *        derivation_kind:     e.g. "delete_pages"
 *        derivation_metadata: { pages_deleted: [1,3], original_page_count: 20, … }
 *
 * For content-reducing ops (delete pages, extract pages, crop) the derivation
 * metadata records exactly what changed so downstream consumers can re-index
 * or update extracted text against the new boundaries.
 */

import React, { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Combine,
  Copy,
  Crop,
  Download,
  Eraser,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  Scissors,
  Shield,
  Shuffle,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { BinaryResult } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import { cn } from "@/lib/utils";
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";
import { fileHandler } from "@/features/files";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfRedactionPatternCatalog } from "../types";
import type { PdfPaneEditMode } from "../studio/PdfStudioReader";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DerivativeSave {
  saving: boolean;
  savedDocId: string | null;
  error: string | null;
}

// ─── Per-op state hook (called once per operation at component top) ───────────

function useOpState() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<DerivativeSave>({
    saving: false,
    savedDocId: null,
    error: null,
  });
  return {
    running,
    result,
    error,
    save,
    setRunning,
    setResult,
    setError,
    setSave,
  };
}

type OpState = ReturnType<typeof useOpState>;

// ─── Save-as-derivative ───────────────────────────────────────────────────────

async function saveDerivative(params: {
  doc: PdfDocument;
  userId: string;
  result: BinaryResult;
  derivationKind: string;
  derivationMetadata: Record<string, unknown>;
}): Promise<{ docId: string | null; error: string | null }> {
  const { doc, userId, result, derivationKind, derivationMetadata } = params;

  // 1. Upload blob to cld_files
  const file = new File([result.blob], result.filename, {
    type: result.contentType || "application/pdf",
  });
  let fileId: string;
  let storageUri: string;
  try {
    const normalized = await fileHandler.upload(
      { kind: "file", file },
      { folderPath: `derivatives/${doc.id}` },
    );
    if (!normalized.fileId || !normalized.fileUri) {
      throw new Error("Upload returned no fileId/fileUri");
    }
    fileId = normalized.fileId;
    storageUri = normalized.fileUri;
  } catch (err) {
    return {
      docId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Create a derivative processed_documents row with lineage
  const { data: newDoc, error: insertError } = await supabase
    .from("processed_documents")
    .insert({
      name: result.filename.replace(/\.pdf$/i, ""),
      storage_uri: storageUri,
      source_kind: "cld_file",
      source_id: fileId,
      source_hash: "",
      owner_id: userId,
      parent_processed_id: doc.id,
      derivation_kind: derivationKind,
      derivation_metadata: {
        ...derivationMetadata,
        original_name: doc.name,
        original_total_pages: doc.totalPages,
      },
      mime_type: "application/pdf",
    })
    .select("id")
    .single();

  if (insertError) {
    return { docId: null, error: insertError.message };
  }

  return { docId: (newDoc as { id: string }).id, error: null };
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadBlob({ blob, filename }: BinaryResult) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Result bar ───────────────────────────────────────────────────────────────

function ResultBar({
  result,
  saveState,
  onSave,
}: {
  result: BinaryResult;
  saveState: DerivativeSave;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[10px] px-2"
        onClick={() => downloadBlob(result)}
      >
        <Download className="w-3 h-3 mr-1" />
        Download
      </Button>

      {saveState.savedDocId ? (
        <span className="text-[10px] text-green-600 dark:text-green-400">
          Saved as document ✓
        </span>
      ) : (
        <Button
          size="sm"
          className="h-7 text-[10px] px-2"
          disabled={saveState.saving}
          onClick={() => void onSave()}
        >
          {saveState.saving ? (
            <>
              <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-2.5 h-2.5 mr-1" />
              Save as document
            </>
          )}
        </Button>
      )}

      {saveState.error && (
        <p className="text-[10px] text-destructive w-full leading-snug">
          {saveState.error}
        </p>
      )}
    </div>
  );
}

// ─── Op card ─────────────────────────────────────────────────────────────────

interface OpCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  children?: React.ReactNode;
  op: OpState;
  onRun: () => Promise<void>;
  onSave: () => Promise<void>;
}

function OpCard({
  icon: Icon,
  label,
  description,
  children,
  op,
  onRun,
  onSave,
}: OpCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="shrink-0 w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
          <Icon className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-tight">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-snug truncate">
            {description}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-2">
          {children}

          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[10px] px-2.5"
            disabled={op.running}
            onClick={() => void onRun()}
          >
            {op.running ? (
              <>
                <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />
                Running…
              </>
            ) : (
              "Run"
            )}
          </Button>

          {op.result && (
            <ResultBar result={op.result} saveState={op.save} onSave={onSave} />
          )}

          {op.error && (
            <p className="text-[10px] text-destructive leading-snug">
              {op.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-0.5 pt-2 pb-0.5">
      {children}
    </p>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─── Second-source parser (merge / insert) ────────────────────────────────────

function parseSecondSrc(v: string): Record<string, unknown> | null {
  const t = v.trim();
  if (!t) return null;
  if (t.startsWith("http")) return { url: t };
  return { cld_id: t };
}

// ─── Visual tool card ─────────────────────────────────────────────────────────
//
// Replaces raw-input OpCards for operations that require a visual GUI in the
// PDF pane (crop, reorder). Instead of form fields + "Run" button, shows a
// "Launch tool in PDF pane" button that activates the corresponding edit mode,
// with an active-state indicator while the tool is open in the pane.

function VisualToolCard({
  icon: Icon,
  label,
  description,
  isActive,
  onLaunch,
  onCancel,
  launchLabel,
  activeLabel,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  isActive: boolean;
  onLaunch: () => void;
  onCancel: () => void;
  launchLabel: string;
  activeLabel: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-md border overflow-hidden transition-colors",
        isActive ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div
          className={cn(
            "shrink-0 w-6 h-6 rounded flex items-center justify-center",
            isActive ? "bg-primary/20" : "bg-primary/10",
          )}
        >
          <Icon
            className={cn(
              "w-3 h-3",
              isActive ? "text-primary" : "text-primary",
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-tight">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-snug truncate">
            {description}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-2">
          {children}

          {isActive ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded bg-primary/10 border border-primary/20 px-2 py-1.5 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] text-primary leading-snug">
                  {activeLabel}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] px-2 shrink-0"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-[10px] px-2.5 w-full"
              onClick={onLaunch}
            >
              {launchLabel}
            </Button>
          )}

          {hint && (
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ManipulationPanel ────────────────────────────────────────────────────────

export function ManipulationPanel({
  doc,
  onRunPipeline,
  running: pipelineRunning,
  pdfPaneEditMode,
  onStartCrop,
  onStartReorder,
  onEditModeCancel,
}: {
  doc: PdfDocument;
  onRunPipeline?: () => void | Promise<unknown>;
  running?: boolean;
  pdfPaneEditMode?: PdfPaneEditMode;
  onStartCrop?: (pagesInput: string) => void;
  onStartReorder?: () => void;
  onEditModeCancel?: () => void;
}) {
  const api = usePdfDemoApi();
  const userId = useAppSelector(selectUserId) ?? "";

  // ── Source payload ─────────────────────────────────────────────────────────
  const src: Record<string, unknown> | null =
    doc.sourceKind === "cld_file" && doc.sourceId
      ? { cld_id: doc.sourceId }
      : doc.source && !doc.source.startsWith("s3://")
        ? { url: doc.source }
        : null;

  // ── Per-op state ───────────────────────────────────────────────────────────
  const scrub = useOpState();
  const flatten = useOpState();
  const strip = useOpState();
  const compress = useOpState();
  const rotate = useOpState();
  const del = useOpState();
  const ext = useOpState();
  const dup = useOpState();
  const split = useOpState();
  const merge = useOpState();
  const insert = useOpState();
  const redact = useOpState();

  // ── Per-op input state ─────────────────────────────────────────────────────
  const [compressLevel, setCompressLevel] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [rotPages, setRotPages] = useState("");
  const [rotation, setRotation] = useState<90 | 180 | 270>(90);
  const [delPages, setDelPages] = useState("");
  const [extPages, setExtPages] = useState("");
  const [dupPages, setDupPages] = useState("1");
  const [dupCount, setDupCount] = useState(1);
  const [splitParts, setSplitParts] = useState("2");
  const [cropPages, setCropPages] = useState("");
  const [mergeSrc2, setMergeSrc2] = useState("");
  const [insertSrc, setInsertSrc] = useState("");
  const [insertAt, setInsertAt] = useState(0);
  const [insertSrcPages, setInsertSrcPages] = useState("");
  const [redactPattern, setRedactPattern] = useState("ssn");
  const [redactReason, setRedactReason] = useState("");
  const [redactCatalog, setRedactCatalog] =
    useState<PdfRedactionPatternCatalog | null>(null);

  // Load redact pattern catalog once
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c =
          await api.getJson<PdfRedactionPatternCatalog>("redactPatterns");
        if (!cancelled) setRedactCatalog(c);
      } catch {
        // Non-fatal; user can type a custom pattern
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shared runners ─────────────────────────────────────────────────────────

  async function run(
    op: OpState,
    key: Parameters<typeof api.postPdfBlob>[0],
    body: Record<string, unknown>,
  ) {
    op.setRunning(true);
    op.setResult(null);
    op.setError(null);
    op.setSave({ saving: false, savedDocId: null, error: null });
    try {
      op.setResult(await api.postPdfBlob(key, body));
    } catch (err) {
      op.setError(err instanceof Error ? err.message : String(err));
    } finally {
      op.setRunning(false);
    }
  }

  async function saveOp(
    op: OpState,
    kind: string,
    meta: Record<string, unknown>,
  ) {
    if (!op.result) return;
    op.setSave((s) => ({ ...s, saving: true, error: null }));
    const { docId, error } = await saveDerivative({
      doc,
      userId,
      result: op.result,
      derivationKind: kind,
      derivationMetadata: meta,
    });
    op.setSave({ saving: false, savedDocId: docId, error });
  }

  // ── No source guard ────────────────────────────────────────────────────────

  if (!src) {
    return (
      <div className="p-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          No source file linked. Re-upload the PDF to enable manipulation
          operations.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 space-y-1">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Manipulate
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[140px]">
          {doc.name}
        </span>
      </div>

      {/* ── Privacy & Cleanup ─────────────────────────────────────────────── */}
      <SectionLabel>Privacy &amp; Cleanup</SectionLabel>

      <OpCard
        icon={Shield}
        label="Scrub"
        description="Strip metadata, attachments, and JS actions"
        op={scrub}
        onRun={() =>
          run(scrub, "scrub", {
            ...src,
            metadata: true,
            attachments: true,
            javascript: true,
          })
        }
        onSave={() =>
          saveOp(scrub, "scrub", {
            operations: ["metadata", "attachments", "javascript"],
          })
        }
      />

      <OpCard
        icon={Eraser}
        label="Flatten annotations"
        description="Bake form fields and annotations into page pixels"
        op={flatten}
        onRun={() => run(flatten, "flattenAnnotations", { ...src })}
        onSave={() => saveOp(flatten, "flatten_annotations", {})}
      />

      <OpCard
        icon={FileText}
        label="Strip metadata"
        description="Remove /Info, XMP, and custom properties"
        op={strip}
        onRun={() => run(strip, "stripMetadata", { ...src })}
        onSave={() => saveOp(strip, "strip_metadata", {})}
      />

      {/* ── Quality ──────────────────────────────────────────────────────── */}
      <SectionLabel>Quality</SectionLabel>

      <OpCard
        icon={FileText}
        label="Compress"
        description="Reduce file size via image quality reduction"
        op={compress}
        onRun={() =>
          run(compress, "compress", { ...src, level: compressLevel })
        }
        onSave={() => saveOp(compress, "compress", { level: compressLevel })}
      >
        <Row label="Level">
          <select
            value={compressLevel}
            onChange={(e) =>
              setCompressLevel(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
            }
            className="w-full rounded border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            <option value={1}>1 — Lossless (largest)</option>
            <option value={2}>2 — Light</option>
            <option value={3}>3 — Balanced (recommended)</option>
            <option value={4}>4 — Aggressive</option>
            <option value={5}>5 — Max (smallest)</option>
          </select>
        </Row>
      </OpCard>

      {/* ── Page Operations ───────────────────────────────────────────────── */}
      <SectionLabel>Page Operations</SectionLabel>

      <OpCard
        icon={RotateCcw}
        label="Rotate pages"
        description="Rotate 90°, 180°, or 270°"
        op={rotate}
        onRun={async () => {
          let pages: number[] | undefined;
          if (rotPages.trim()) {
            try {
              pages = parsePagesInput(rotPages);
            } catch (e) {
              rotate.setError(e instanceof Error ? e.message : "Invalid pages");
              return;
            }
          }
          await run(rotate, "rotatePages", {
            ...src,
            rotation,
            ...(pages ? { pages } : {}),
          });
        }}
        onSave={() =>
          saveOp(rotate, "rotate_pages", {
            rotation,
            pages_affected: rotPages.trim() || "all",
          })
        }
      >
        <Row label="Rotation">
          <select
            value={rotation}
            onChange={(e) =>
              setRotation(Number(e.target.value) as 90 | 180 | 270)
            }
            className="w-full rounded border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </Row>
        <Row label="Pages">
          <Input
            value={rotPages}
            onChange={(e) => setRotPages(e.target.value)}
            placeholder="all (e.g. 1,3-5)"
            className="h-6 text-[11px]"
          />
        </Row>
      </OpCard>

      <OpCard
        icon={Trash2}
        label="Delete pages"
        description="Remove pages; reduces document content"
        op={del}
        onRun={async () => {
          let pages: number[];
          try {
            pages = parsePagesInput(delPages);
          } catch (e) {
            del.setError(e instanceof Error ? e.message : "Invalid pages");
            return;
          }
          if (!pages.length) {
            del.setError("Enter at least one page.");
            return;
          }
          await run(del, "deletePages", { ...src, pages });
        }}
        onSave={() => {
          let pages: number[] = [];
          try {
            pages = parsePagesInput(delPages);
          } catch {
            /* ignore */
          }
          return saveOp(del, "delete_pages", {
            pages_deleted: pages,
            result_page_count: (doc.totalPages ?? 0) - pages.length,
          });
        }}
      >
        <Row label="Pages">
          <Input
            value={delPages}
            onChange={(e) => setDelPages(e.target.value)}
            placeholder="e.g. 1,3-5"
            className="h-6 text-[11px]"
          />
        </Row>
      </OpCard>

      <OpCard
        icon={ArrowDownToLine}
        label="Extract pages"
        description="Pull selected pages into a new PDF"
        op={ext}
        onRun={async () => {
          let pages: number[];
          try {
            pages = parsePagesInput(extPages);
          } catch (e) {
            ext.setError(e instanceof Error ? e.message : "Invalid pages");
            return;
          }
          if (!pages.length) {
            ext.setError("Enter at least one page.");
            return;
          }
          await run(ext, "extractPages", { ...src, pages });
        }}
        onSave={() => {
          let pages: number[] = [];
          try {
            pages = parsePagesInput(extPages);
          } catch {
            /* ignore */
          }
          return saveOp(ext, "extract_pages", {
            pages_extracted: pages,
            result_page_count: pages.length,
          });
        }}
      >
        <Row label="Pages">
          <Input
            value={extPages}
            onChange={(e) => setExtPages(e.target.value)}
            placeholder="e.g. 1,3-5"
            className="h-6 text-[11px]"
          />
        </Row>
      </OpCard>

      <OpCard
        icon={Copy}
        label="Duplicate pages"
        description="Append copies of selected pages after the originals"
        op={dup}
        onRun={async () => {
          let pages: number[];
          try {
            pages = parsePagesInput(dupPages);
          } catch (e) {
            dup.setError(e instanceof Error ? e.message : "Invalid pages");
            return;
          }
          if (!pages.length) {
            dup.setError("Pick at least one page.");
            return;
          }
          await run(dup, "duplicatePages", { ...src, pages, count: dupCount });
        }}
        onSave={() => {
          let pages: number[] = [];
          try {
            pages = parsePagesInput(dupPages);
          } catch {
            /* ignore */
          }
          return saveOp(dup, "duplicate_pages", {
            pages_duplicated: pages,
            copies: dupCount,
          });
        }}
      >
        <Row label="Pages">
          <Input
            value={dupPages}
            onChange={(e) => setDupPages(e.target.value)}
            placeholder="e.g. 1,3-5"
            className="h-6 text-[11px]"
          />
        </Row>
        <Row label="Copies">
          <Input
            type="number"
            min={1}
            max={10}
            value={dupCount}
            onChange={(e) => setDupCount(Number(e.target.value) || 1)}
            className="h-6 text-[11px] w-20"
          />
        </Row>
      </OpCard>

      <VisualToolCard
        icon={Shuffle}
        label="Reorder pages"
        description="Drag page tiles to rearrange the document order"
        isActive={pdfPaneEditMode === "reorder"}
        onLaunch={() => onStartReorder?.()}
        onCancel={() => onEditModeCancel?.()}
        launchLabel="Reorder in PDF pane →"
        activeLabel="Reordering — drag tiles in the PDF pane"
        hint={doc.totalPages ? `${doc.totalPages} pages` : undefined}
      />

      <OpCard
        icon={Scissors}
        label="Split"
        description="Break into equal parts; result is a ZIP"
        op={split}
        onRun={async () => {
          const parts = parseInt(splitParts, 10);
          if (!parts || parts < 2) {
            split.setError("Enter 2 or more parts.");
            return;
          }
          await run(split, "split", { ...src, parts });
        }}
        onSave={() =>
          saveOp(split, "split", {
            parts: parseInt(splitParts, 10),
            note: "ZIP archive; each part is a separate derived document",
          })
        }
      >
        <Row label="Parts">
          <Input
            type="number"
            min={2}
            value={splitParts}
            onChange={(e) => setSplitParts(e.target.value)}
            className="h-6 text-[11px] w-20"
          />
        </Row>
      </OpCard>

      {/* ── Layout ───────────────────────────────────────────────────────── */}
      <SectionLabel>Layout</SectionLabel>

      <VisualToolCard
        icon={Crop}
        label="Crop pages"
        description="Draw a selection on the PDF to trim content"
        isActive={pdfPaneEditMode === "crop"}
        onLaunch={() => onStartCrop?.(cropPages)}
        onCancel={() => onEditModeCancel?.()}
        launchLabel="Draw crop area in PDF →"
        activeLabel="Crop mode — drag to select area in PDF pane"
        hint="Crops to the drawn selection; saves with re-extraction note"
      >
        <Row label="Pages">
          <Input
            value={cropPages}
            onChange={(e) => setCropPages(e.target.value)}
            placeholder="all  (e.g. 1,3-5)"
            className="h-6 text-[11px]"
          />
        </Row>
        <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug pt-0.5">
          Content outside the selection is removed. Save as document to re-index
          extracted text.
        </p>
      </VisualToolCard>

      {/* ── Composition ──────────────────────────────────────────────────── */}
      <SectionLabel>Composition</SectionLabel>

      <OpCard
        icon={Combine}
        label="Merge PDFs"
        description="Concatenate this doc with a second PDF"
        op={merge}
        onRun={async () => {
          const src2 = parseSecondSrc(mergeSrc2);
          if (!src2) {
            merge.setError("Enter a second PDF source (cld file ID or URL).");
            return;
          }
          await run(merge, "merge", {
            sources: [src, src2],
          });
        }}
        onSave={() =>
          saveOp(merge, "merge", {
            merged_sources: [
              { id: doc.sourceId ?? doc.id, name: doc.name },
              { ref: mergeSrc2.trim() },
            ],
          })
        }
      >
        <Row label="Source 2">
          <Input
            value={mergeSrc2}
            onChange={(e) => setMergeSrc2(e.target.value)}
            placeholder="cld file ID or https://…"
            className="h-6 text-[11px]"
          />
        </Row>
        <p className="text-[10px] text-muted-foreground pl-[4.5rem] leading-snug">
          Paste a cloud file ID from another studio document, or a public URL.
        </p>
      </OpCard>

      <OpCard
        icon={ArrowDownToLine}
        label="Insert pages"
        description="Splice pages from another PDF into this one"
        op={insert}
        onRun={async () => {
          const src2 = parseSecondSrc(insertSrc);
          if (!src2) {
            insert.setError("Enter a source PDF (cld file ID or URL).");
            return;
          }
          const srcPages = insertSrcPages.trim()
            ? parsePagesInput(insertSrcPages)
            : undefined;
          const sourceWire = src2.url
            ? { source_url: src2.url }
            : { source_cld_id: src2.cld_id };
          await run(insert, "insertPages", {
            ...src,
            ...sourceWire,
            after_page: insertAt,
            ...(srcPages ? { source_pages: srcPages } : {}),
          });
        }}
        onSave={() =>
          saveOp(insert, "insert_pages", {
            insert_source: insertSrc.trim(),
            after_page: insertAt,
            source_pages: insertSrcPages.trim() || "all",
          })
        }
      >
        <Row label="Source">
          <Input
            value={insertSrc}
            onChange={(e) => setInsertSrc(e.target.value)}
            placeholder="cld file ID or https://…"
            className="h-6 text-[11px]"
          />
        </Row>
        <Row label="After page">
          <Input
            type="number"
            min={0}
            value={insertAt}
            onChange={(e) => setInsertAt(Number(e.target.value) || 0)}
            className="h-6 text-[11px] w-20"
          />
        </Row>
        <Row label="Src pages">
          <Input
            value={insertSrcPages}
            onChange={(e) => setInsertSrcPages(e.target.value)}
            placeholder="all source pages"
            className="h-6 text-[11px]"
          />
        </Row>
      </OpCard>

      {/* ── Privacy / Redact ─────────────────────────────────────────────── */}
      <SectionLabel>Redact</SectionLabel>

      <OpCard
        icon={Eraser}
        label="Redact by pattern"
        description="Black out every regex match (SSN, email, phone, …)"
        op={redact}
        onRun={async () => {
          if (!redactReason.trim()) {
            redact.setError("Reason is required.");
            return;
          }
          await run(redact, "redactPattern", {
            ...src,
            pattern: redactPattern,
            reason: redactReason,
            scrub_metadata: true,
          });
        }}
        onSave={() =>
          saveOp(redact, "redact_pattern", {
            pattern: redactPattern,
            reason: redactReason,
          })
        }
      >
        <Row label="Pattern">
          <div className="space-y-1">
            {redactCatalog && redactCatalog.patterns.length > 0 && (
              <select
                value={
                  redactCatalog.patterns.some((e) => e.id === redactPattern)
                    ? redactPattern
                    : "__custom__"
                }
                onChange={(e) => {
                  if (e.target.value !== "__custom__")
                    setRedactPattern(e.target.value);
                }}
                className="w-full rounded border border-border bg-background px-2 py-0.5 text-[11px]"
              >
                {redactCatalog.patterns.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} — {e.description}
                  </option>
                ))}
                <option value="__custom__">Custom regex…</option>
              </select>
            )}
            <Input
              value={redactPattern}
              onChange={(e) => setRedactPattern(e.target.value)}
              placeholder="ssn / email / your-regex…"
              className="h-6 text-[11px]"
            />
          </div>
        </Row>
        <Row label="Reason">
          <Input
            value={redactReason}
            onChange={(e) => setRedactReason(e.target.value)}
            placeholder="Why this redaction is running"
            className="h-6 text-[11px]"
          />
        </Row>
      </OpCard>

      {/* ── AI Pipeline ──────────────────────────────────────────────────── */}
      <SectionLabel>AI Pipeline</SectionLabel>

      <div className="flex items-start gap-2 px-2.5 py-2 bg-primary/5 border border-primary/20 rounded-md">
        <div className="shrink-0 w-6 h-6 rounded bg-primary/10 flex items-center justify-center mt-0.5">
          <Wand2 className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">Run full pipeline</p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Extract → per-page persist → AI cleanup → chunk
          </p>
        </div>
        <Button
          size="sm"
          className="h-7 text-[10px] px-2 shrink-0"
          disabled={!onRunPipeline || pipelineRunning}
          onClick={onRunPipeline ? () => void onRunPipeline() : undefined}
        >
          {pipelineRunning ? (
            <>
              <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />
              Running…
            </>
          ) : (
            "Run"
          )}
        </Button>
      </div>
    </div>
  );
}
