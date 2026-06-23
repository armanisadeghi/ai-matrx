"use client";

/**
 * PDF Canonical Components Bench — /demos/pdf-processing/components
 *
 * Unit-test bench for THE canonical PDF systems (one implementation per
 * purpose; these are the same components mounted in production):
 *
 *   Preview   → PdfPreview → PdfDocumentRenderer (features/pdf viewer)
 *   Edit      → PdfEditTab (canvas view/select/draw + Pages, Doc Ops,
 *               Notes, Findings, Redact, Search panels)
 *   Knowledge → DocumentTab (RAG index status, pages, chunks, search)
 *   Analysis  → AnalysisTab (detector sections + Knowledge/NER panel)
 *   Share     → FileShareTab · Info → FileInfoTab
 *   Switcher  → PdfSurfaceSwitcher · Presets → PdfPresetPicker
 *   NER       → FileKnowledgePanel (standalone)
 *
 * Pick a PDF once at the top; every section mounts against it. The
 * endpoint-level test pages live at /demos/pdf-processing.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import { PdfSurfaceSwitcher } from "@/features/pdf/components/PdfSurfaceSwitcher";
import { PdfPresetPicker } from "@/features/pdf/components/PdfPresetPicker";
import { FileKnowledgePanel } from "@/features/rag/components/files/FileKnowledgePanel";
import PdfPreview from "@/features/pdf/components/viewer/PdfPreview";
import { PdfEditTab } from "@/features/files/components/surfaces/single-file/PdfEditTab";
import { DocumentTab } from "@/features/files/components/surfaces/DocumentTab";
import { AnalysisTab } from "@/features/file-analysis/tab/AnalysisTab";
import { FileShareTab } from "@/features/files/components/surfaces/FileShareTab";
import { FileInfoTab } from "@/features/files/components/surfaces/FileInfoTab";

interface PdfRow {
  id: string;
  file_name: string;
  size_bytes: number | null;
}

function Section({
  title,
  hint,
  children,
  defaultOpen = false,
  tall = false,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tall?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </button>
      {open ? (
        <div
          className={cn(
            "border-t border-border",
            tall ? "h-[75dvh] overflow-hidden" : "max-h-[70dvh] overflow-y-auto p-3",
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function PdfComponentsBenchPage() {
  const [pdfs, setPdfs] = useState<PdfRow[] | null>(null);
  const [fileId, setFileId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("cld_files")
      .select("id, file_name, size_bytes")
      .eq("mime_type", "application/pdf")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        setPdfs((data as PdfRow[]) ?? []);
        if (data?.length && !fileId) setFileId(data[0].id);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-2.5rem)] max-w-6xl flex-col gap-3 overflow-y-auto p-4">
      <header className="flex flex-wrap items-center gap-3">
        <FileText className="h-5 w-5 text-destructive" />
        <h1 className="text-base font-semibold">
          PDF canonical components bench
        </h1>
        <p className="text-xs text-muted-foreground">
          The exact components production mounts — one implementation per
          purpose.{" "}
          <Link href="/demos/pdf-processing" className="underline">
            Endpoint tests →
          </Link>
        </p>
      </header>

      {/* File picker — every section below mounts against this id. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
        <span className="text-xs font-medium">Test file:</span>
        {pdfs === null ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading your PDFs…
          </span>
        ) : (
          <select
            value={fileId}
            onChange={(e) => setFileId(e.target.value)}
            className="h-8 min-w-0 max-w-md flex-1 rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Choose a PDF to test against"
          >
            {pdfs.length === 0 ? (
              <option value="">No PDFs — upload one at /files first</option>
            ) : null}
            {pdfs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.file_name}
                {p.size_bytes
                  ? ` · ${(p.size_bytes / 1024 / 1024).toFixed(1)}MB`
                  : ""}
              </option>
            ))}
          </select>
        )}
        {fileId ? (
          <PdfSurfaceSwitcher current="file-viewer" fileId={fileId} size="sm" />
        ) : null}
      </div>

      {!fileId ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Pick a PDF above to mount every canonical surface against it.
        </p>
      ) : (
        <div key={fileId} className="flex flex-col gap-3 pb-8">
          <Section
            title="Preview"
            hint="PdfPreview → PdfDocumentRenderer — zoom, fit, rotate, range loading, loading state, retry"
            defaultOpen
            tall
          >
            <PdfPreview fileId={fileId} />
          </Section>

          <Section
            title="Edit"
            hint="PdfEditTab — canvas (view / select / draw) + Pages · Doc Ops · Notes · Findings · Redact · Search"
            tall
          >
            <PdfEditTab fileId={fileId} />
          </Section>

          <Section
            title="Knowledge (RAG index)"
            hint="DocumentTab — ingest CTA / pages / cleaned text / chunks / search"
            tall
          >
            <DocumentTab fileId={fileId} />
          </Section>

          <Section
            title="Analysis"
            hint="AnalysisTab — detector sections + the Knowledge/NER panel"
            tall
          >
            <AnalysisTab fileId={fileId} />
          </Section>

          <Section title="Share" hint="FileShareTab — visibility, links, people & groups">
            <FileShareTab fileId={fileId} />
          </Section>

          <Section title="Info" hint="FileInfoTab — the one info implementation (dialog mounts this too)">
            <FileInfoTab fileId={fileId} />
          </Section>

          <Section
            title="Knowledge / NER panel (standalone)"
            hint="FileKnowledgePanel — status read + (re)index trigger"
          >
            <FileKnowledgePanel fileId={fileId} />
          </Section>

          <Section
            title="Studio presets"
            hint="PdfPresetPicker — backend preset catalog → studio render"
          >
            <PdfPresetPicker fileId={fileId} />
          </Section>
        </div>
      )}
    </div>
  );
}
