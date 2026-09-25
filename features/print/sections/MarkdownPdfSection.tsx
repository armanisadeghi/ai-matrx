"use client";

/**
 * Documents — markdown in, a print-grade document out.
 *
 * The editor (left) holds the markdown, settings included in its frontmatter
 * (page size, margins, cover, TOC, header/footer, columns, citations). The
 * preview (right) is `DocumentPrintPreview` from `@ai-matrx/print/react`: the
 * real PDF pages, a web view, Print, and PDF / Word / EPUB / HTML / Markdown
 * downloads — all from the package's one parsed tree. This page owns no
 * printing logic.
 *
 * `?note=<id>` opens a copy of one of your notes (read-only source; edits here
 * change only what is printed).
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { FileDown } from "lucide-react";
import { toast } from "@/lib/toast";
import { ProTextarea } from "@/components/official/ProTextarea";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { SectionShell, StatusChip } from "@/features/print/components/shared";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createMarkdownPdfScope,
  MARKDOWN_PDF_SURFACE_NAME,
} from "@/features/surfaces/manifests/markdown-pdf.manifest";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { SAMPLE_MARKDOWN } from "./sample-data";

const DocumentPrintPreview = dynamic(
  () => import("@ai-matrx/print/react").then((m) => m.DocumentPrintPreview),
  { ssr: false, loading: () => <p className="p-8 text-center text-xs text-muted-foreground">Loading preview…</p> },
);

/** Frontmatter a plain note gets so it prints as a finished document. */
export function withDocumentDefaults(markdown: string, title: string): string {
  if (/^﻿?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.test(markdown)) return markdown;
  const safe = title.replace(/"/g, "'");
  return `---\ntitle: "${safe}"\ntoc: true\nheader: "{title} | | {date}"\nfooter: "Page {page} of {pages}"\ndate: today\n---\n\n${markdown}`;
}

export function MarkdownPdfSection() {
  const params = useSearchParams();
  const noteId = params?.get("note") ?? null;
  const [markdown, setMarkdown] = useState(noteId ? "" : SAMPLE_MARKDOWN);
  const [title, setTitle] = useState("Document");
  const [loadError, setLoadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);

  const handleDownloadPdf = async () => {
    if (busy || !markdown.trim()) return;
    setBusy(true);
    try {
      const { exportDocument, downloadDocumentExport } = await import("@ai-matrx/print/document");
      downloadDocumentExport(await exportDocument(markdown, "pdf", { title }));
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    NotesAPI.getById(noteId, { failureMode: "throw" })
      .then((note) => {
        if (cancelled || !note) return;
        const label = note.label?.trim() || "Untitled note";
        setTitle(label);
        setMarkdown(withDocumentDefaults(note.content ?? "", label));
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(
            `This note could not be opened (${err instanceof Error ? err.message : "unknown error"}). Check that it still exists and that you can see it in Notes.`,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const getApplicationScope = () =>
    createMarkdownPdfScope({ content: markdown, pdf_status: busy ? "generating" : "idle" });

  const menuSections: ContextMenuExtraSection[] = [
    {
      id: "markdown-pdf-actions",
      label: "Document",
      anchor: "after-compare",
      items: [
        {
          kind: "item",
          id: "download-pdf",
          label: "Download PDF",
          icon: FileDown,
          disabled: busy || !markdown.trim(),
          onSelect: handleDownloadPdf,
        },
      ],
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKDOWN_PDF_SURFACE_NAME}
      getScope={getApplicationScope}
      isEditable
    >
      <SectionShell
        title="Documents"
        entry="@ai-matrx/print/document"
        blurb="Write markdown; the settings block at the top sets page size, margins, cover, contents, header and footer, columns and citations. Print it, or download PDF, Word, EPUB, HTML or Markdown."
      >
        {loadError && (
          <StatusChip tone="warn" className="mb-3">
            {loadError}
          </StatusChip>
        )}
        <div className="grid min-h-[70vh] gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EditableContextMenu
            sourceFeature="print"
            surfaceName={MARKDOWN_PDF_SURFACE_NAME}
            menuVersion={1}
            getApplicationScope={getApplicationScope}
            getTextarea={() => textareaRef.current}
            onTextReplace={setMarkdown}
            extraSections={menuSections}
          >
            <ProTextarea
              ref={textareaRef}
              aria-label="Document markdown"
              className="h-full min-h-[70vh] w-full resize-none rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              spellCheck={false}
              enableVoice={false}
              enableCleanup={false}
              enableTextStats
              surfaceName={MARKDOWN_PDF_SURFACE_NAME}
              sourceFeature="print"
              getApplicationScope={getApplicationScope}
            />
          </EditableContextMenu>
          <div
            className="flex min-h-[70vh] flex-col overflow-hidden rounded-md border border-border"
          >
            {markdown.trim() ? (
              <DocumentPrintPreview markdown={markdown} title={title} />
            ) : (
              <p className="p-8 text-center text-xs text-muted-foreground">
                {noteId && !loadError ? "Opening your note…" : "Nothing to print yet — write something on the left."}
              </p>
            )}
          </div>
        </div>
      </SectionShell>
    </SurfaceRuntimeProvider>
  );
}
