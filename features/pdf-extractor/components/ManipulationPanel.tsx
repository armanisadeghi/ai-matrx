"use client";

/**
 * ManipulationPanel — fully wired PDF operation panel for the Studio inspector.
 *
 * Tier-1 ops (scrub, flatten, strip-metadata, compress, rotate, delete,
 * extract, split) are wired inline — each card expands to show a mini-form,
 * submits to the matching Python endpoint, and offers a browser download.
 *
 * Complex ops (crop, merge, reorder, redact, etc.) link to their full demo
 * pages until dedicated modal UIs ship.
 */

import React, { useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Combine,
  Crop,
  Download,
  Eraser,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  Scissors,
  Shield,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { BinaryResult } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";
import type { PdfDocument } from "../hooks/usePdfExtractor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManipulationPanelProps {
  doc: PdfDocument;
  onRunPipeline?: () => void | Promise<unknown>;
  running?: boolean;
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

// ─── Expandable op card ───────────────────────────────────────────────────────

interface OpCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  children?: React.ReactNode;
  onRun?: () => Promise<void>;
  running?: boolean;
  result?: BinaryResult | null;
  error?: string | null;
  demoPath?: string;
}

function OpCard({
  icon: Icon,
  label,
  description,
  children,
  onRun,
  running,
  result,
  error,
  demoPath,
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

          <div className="flex flex-wrap items-center gap-2">
            {onRun && (
              <Button
                size="sm"
                className="h-7 text-[10px] px-2.5"
                disabled={running}
                onClick={() => void onRun()}
              >
                {running ? (
                  <>
                    <Loader2 className="w-2.5 h-2.5 animate-spin mr-1" />
                    Running…
                  </>
                ) : (
                  "Run"
                )}
              </Button>
            )}

            {result && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] px-2.5"
                onClick={() => downloadBlob(result)}
              >
                <Download className="w-3 h-3 mr-1" />
                {result.filename}
              </Button>
            )}

            {demoPath && (
              <a
                href={demoPath}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Full tool
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </div>

          {error && (
            <p className="text-[10px] text-destructive leading-snug">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-0.5 pt-1.5">
      {children}
    </p>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ManipulationPanel({
  doc,
  onRunPipeline,
  running,
}: ManipulationPanelProps) {
  const api = usePdfDemoApi();

  // Prefer cld_id proxy path; fall back to a public HTTP URL if available.
  const src: Record<string, unknown> | null =
    doc.sourceKind === "cld_file" && doc.sourceId
      ? { cld_id: doc.sourceId }
      : doc.source && !doc.source.startsWith("s3://")
        ? { url: doc.source }
        : null;

  // ── Per-op state ──────────────────────────────────────────────────────────
  const [scrubRunning, setScrubRunning] = useState(false);
  const [scrubResult, setScrubResult] = useState<BinaryResult | null>(null);
  const [scrubError, setScrubError] = useState<string | null>(null);

  const [flattenRunning, setFlattenRunning] = useState(false);
  const [flattenResult, setFlattenResult] = useState<BinaryResult | null>(null);
  const [flattenError, setFlattenError] = useState<string | null>(null);

  const [stripRunning, setStripRunning] = useState(false);
  const [stripResult, setStripResult] = useState<BinaryResult | null>(null);
  const [stripError, setStripError] = useState<string | null>(null);

  const [compressLevel, setCompressLevel] = useState<1 | 2 | 3>(2);
  const [compressRunning, setCompressRunning] = useState(false);
  const [compressResult, setCompressResult] = useState<BinaryResult | null>(null);
  const [compressError, setCompressError] = useState<string | null>(null);

  const [rotPages, setRotPages] = useState("");
  const [rotation, setRotation] = useState<90 | 180 | 270>(90);
  const [rotRunning, setRotRunning] = useState(false);
  const [rotResult, setRotResult] = useState<BinaryResult | null>(null);
  const [rotError, setRotError] = useState<string | null>(null);

  const [delPages, setDelPages] = useState("");
  const [delRunning, setDelRunning] = useState(false);
  const [delResult, setDelResult] = useState<BinaryResult | null>(null);
  const [delError, setDelError] = useState<string | null>(null);

  const [extPages, setExtPages] = useState("");
  const [extRunning, setExtRunning] = useState(false);
  const [extResult, setExtResult] = useState<BinaryResult | null>(null);
  const [extError, setExtError] = useState<string | null>(null);

  const [splitParts, setSplitParts] = useState("2");
  const [splitRunning, setSplitRunning] = useState(false);
  const [splitResult, setSplitResult] = useState<BinaryResult | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);

  // ── Shared runner ─────────────────────────────────────────────────────────

  async function run(
    key: Parameters<typeof api.postPdfBlob>[0],
    body: Record<string, unknown>,
    setR: (v: boolean) => void,
    setRes: (v: BinaryResult | null) => void,
    setErr: (v: string | null) => void,
  ) {
    setR(true);
    setRes(null);
    setErr(null);
    try {
      setRes(await api.postPdfBlob(key, body));
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
    } finally {
      setR(false);
    }
  }

  if (!src) {
    return (
      <div className="p-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          No source file linked to this record. Re-upload the PDF to enable
          manipulation operations.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          Manipulate
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[140px]">
          {doc.name}
        </span>
      </div>

      {/* ── Quick / privacy ops ─────────────────────────────────────────── */}
      <SectionLabel>Privacy &amp; Cleanup</SectionLabel>

      <OpCard
        icon={Shield}
        label="Scrub"
        description="Strip metadata, attachments, and JS actions"
        onRun={() =>
          run(
            "scrub",
            { ...src, metadata: true, attachments: true, javascript: true },
            setScrubRunning,
            setScrubResult,
            setScrubError,
          )
        }
        running={scrubRunning}
        result={scrubResult}
        error={scrubError}
        demoPath="/ssr/demos/pdf-processing/scrub"
      />

      <OpCard
        icon={Eraser}
        label="Flatten annotations"
        description="Bake form fields and annotations into page pixels"
        onRun={() =>
          run(
            "flattenAnnotations",
            { ...src },
            setFlattenRunning,
            setFlattenResult,
            setFlattenError,
          )
        }
        running={flattenRunning}
        result={flattenResult}
        error={flattenError}
        demoPath="/ssr/demos/pdf-processing/flatten-annotations"
      />

      <OpCard
        icon={FileText}
        label="Strip metadata"
        description="Remove /Info, XMP, and custom properties"
        onRun={() =>
          run(
            "stripMetadata",
            { ...src },
            setStripRunning,
            setStripResult,
            setStripError,
          )
        }
        running={stripRunning}
        result={stripResult}
        error={stripError}
        demoPath="/ssr/demos/pdf-processing/strip-metadata"
      />

      {/* ── Quality ─────────────────────────────────────────────────────── */}
      <SectionLabel>Quality</SectionLabel>

      <OpCard
        icon={FileText}
        label="Compress"
        description="Reduce file size via image quality reduction"
        onRun={() =>
          run(
            "compress",
            { ...src, level: compressLevel },
            setCompressRunning,
            setCompressResult,
            setCompressError,
          )
        }
        running={compressRunning}
        result={compressResult}
        error={compressError}
        demoPath="/ssr/demos/pdf-processing/compress"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-16 shrink-0">
            Level
          </span>
          <select
            value={compressLevel}
            onChange={(e) =>
              setCompressLevel(Number(e.target.value) as 1 | 2 | 3)
            }
            className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            <option value={1}>1 — Smallest / low quality</option>
            <option value={2}>2 — Medium (recommended)</option>
            <option value={3}>3 — High quality</option>
          </select>
        </div>
      </OpCard>

      {/* ── Page operations ──────────────────────────────────────────────── */}
      <SectionLabel>Page Operations</SectionLabel>

      <OpCard
        icon={RotateCcw}
        label="Rotate pages"
        description="90°, 180°, or 270° — per-page or all"
        onRun={async () => {
          let pages: number[] | undefined;
          if (rotPages.trim()) {
            try {
              pages = parsePagesInput(rotPages);
            } catch (err) {
              setRotError(err instanceof Error ? err.message : "Invalid pages");
              return;
            }
          }
          await run(
            "rotatePages",
            { ...src, rotation, ...(pages ? { pages } : {}) },
            setRotRunning,
            setRotResult,
            setRotError,
          );
        }}
        running={rotRunning}
        result={rotResult}
        error={rotError}
        demoPath="/ssr/demos/pdf-processing/rotate-pages"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 shrink-0">
              Rotation
            </span>
            <select
              value={rotation}
              onChange={(e) =>
                setRotation(Number(e.target.value) as 90 | 180 | 270)
              }
              className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-[11px]"
            >
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 shrink-0">
              Pages
            </span>
            <Input
              value={rotPages}
              onChange={(e) => setRotPages(e.target.value)}
              placeholder="all (e.g. 1,3-5)"
              className="h-6 text-[11px] flex-1"
            />
          </div>
        </div>
      </OpCard>

      <OpCard
        icon={Trash2}
        label="Delete pages"
        description="Remove pages; creates a derivative PDF"
        onRun={async () => {
          let pages: number[];
          try {
            pages = parsePagesInput(delPages);
          } catch (err) {
            setDelError(err instanceof Error ? err.message : "Invalid pages");
            return;
          }
          if (!pages.length) {
            setDelError("Enter at least one page.");
            return;
          }
          await run(
            "deletePages",
            { ...src, pages },
            setDelRunning,
            setDelResult,
            setDelError,
          );
        }}
        running={delRunning}
        result={delResult}
        error={delError}
        demoPath="/ssr/demos/pdf-processing/delete-pages"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-16 shrink-0">
            Pages
          </span>
          <Input
            value={delPages}
            onChange={(e) => setDelPages(e.target.value)}
            placeholder="e.g. 1,3-5"
            className="h-6 text-[11px] flex-1"
          />
        </div>
      </OpCard>

      <OpCard
        icon={ArrowDownToLine}
        label="Extract pages"
        description="Pull pages into a new PDF"
        onRun={async () => {
          let pages: number[];
          try {
            pages = parsePagesInput(extPages);
          } catch (err) {
            setExtError(err instanceof Error ? err.message : "Invalid pages");
            return;
          }
          if (!pages.length) {
            setExtError("Enter at least one page.");
            return;
          }
          await run(
            "extractPages",
            { ...src, pages },
            setExtRunning,
            setExtResult,
            setExtError,
          );
        }}
        running={extRunning}
        result={extResult}
        error={extError}
        demoPath="/ssr/demos/pdf-processing/extract-pages"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-16 shrink-0">
            Pages
          </span>
          <Input
            value={extPages}
            onChange={(e) => setExtPages(e.target.value)}
            placeholder="e.g. 1,3-5"
            className="h-6 text-[11px] flex-1"
          />
        </div>
      </OpCard>

      <OpCard
        icon={Scissors}
        label="Split"
        description="Break into equal parts; result is a ZIP"
        onRun={async () => {
          const parts = parseInt(splitParts, 10);
          if (!parts || parts < 2) {
            setSplitError("Enter 2 or more parts.");
            return;
          }
          await run(
            "split",
            { ...src, parts },
            setSplitRunning,
            setSplitResult,
            setSplitError,
          );
        }}
        running={splitRunning}
        result={splitResult}
        error={splitError}
        demoPath="/ssr/demos/pdf-processing/split"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-16 shrink-0">
            Parts
          </span>
          <Input
            type="number"
            min={2}
            value={splitParts}
            onChange={(e) => setSplitParts(e.target.value)}
            className="h-6 text-[11px] w-20"
          />
        </div>
      </OpCard>

      {/* ── Advanced — links to full demo pages ──────────────────────────── */}
      <SectionLabel>Advanced</SectionLabel>

      {(
        [
          {
            label: "Crop pages",
            path: "/ssr/demos/pdf-processing/crop-pages",
            icon: Crop,
          },
          {
            label: "Merge PDFs",
            path: "/ssr/demos/pdf-processing/merge",
            icon: Combine,
          },
          {
            label: "Reorder pages",
            path: "/ssr/demos/pdf-processing/reorder-pages",
            icon: RotateCcw,
          },
          {
            label: "Insert pages",
            path: "/ssr/demos/pdf-processing/insert-pages",
            icon: ArrowDownToLine,
          },
          {
            label: "Duplicate pages",
            path: "/ssr/demos/pdf-processing/duplicate-pages",
            icon: FileText,
          },
          {
            label: "Redact pattern",
            path: "/ssr/demos/pdf-processing/redact-pattern",
            icon: Eraser,
          },
          {
            label: "Redact regions",
            path: "/ssr/demos/pdf-processing/redact-regions",
            icon: Shield,
          },
          {
            label: "Render page",
            path: "/ssr/demos/pdf-processing/render-page",
            icon: Wand2,
          },
        ] as const
      ).map(({ label, path, icon: Icon }) => (
        <a
          key={path}
          href={path}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-accent/40 transition-colors"
        >
          <div className="shrink-0 w-5 h-5 rounded bg-muted flex items-center justify-center">
            <Icon className="w-3 h-3 text-muted-foreground" />
          </div>
          <span className="text-[11px] text-foreground flex-1">{label}</span>
          <ExternalLink className="w-3 h-3 text-muted-foreground" />
        </a>
      ))}

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
          disabled={!onRunPipeline || running}
          onClick={onRunPipeline ? () => void onRunPipeline() : undefined}
        >
          {running ? (
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
