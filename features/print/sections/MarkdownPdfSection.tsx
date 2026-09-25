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
import { SectionShell } from "@/features/print/components/shared";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { resolvePlatformReferences } from "@/features/print/document/platformReferences";
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
  /** The note read settled with no row, or failed: the canonical gate says which. */
  const [missing, setMissing] = useState<{ error?: unknown } | null>(null);
  const [retry, setRetry] = useState(0);
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
    setMissing(null);
    NotesAPI.getById(noteId, { failureMode: "throw" })
      .then((note) => {
        if (cancelled) return;
        // A deleted, archived or unreadable note comes back as no row — the
        // screen says so instead of "Opening your note…" forever.
        if (!note) {
          setMissing({});
          return;
        }
        const label = note.label?.trim() || "Untitled note";
        setTitle(label);
        setMarkdown(withDocumentDefaults(note.content ?? "", label));
      })
      .catch((error: unknown) => {
        if (!cancelled) setMissing({ error });
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, retry]);

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

  if (noteId && missing) {
    return (
      <div className="h-full overflow-hidden">
        <AccessGate
          token="note"
          id={noteId}
          error={missing.error}
          onRetry={() => setRetry((n) => n + 1)}
          fallbackHref="/print/documents"
          fallbackLabel="Start a new document"
        />
      </div>
    );
  }

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
              <DocumentPrintPreview markdown={markdown} title={title} resolveReferences={resolvePlatformReferences} />
            ) : (
              <p className="p-8 text-center text-xs text-muted-foreground">
                {noteId ? "Opening your note…" : "Nothing to print yet — write something on the left."}
              </p>
            )}
          </div>
        </div>
      </SectionShell>
    </SurfaceRuntimeProvider>
  );
}
