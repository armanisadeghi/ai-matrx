// components/markdown-studio/lab/PrintPreviewView.tsx
//
// Print preview — THE one print preview: `DocumentPrintPreview` from
// `@ai-matrx/print/react` (RC-B10). The real PDF pages (cover, contents with
// page numbers, header/footer, section breaks, captions, citations — all from
// the markdown's frontmatter), a web view, Print, and PDF / Word / EPUB / HTML /
// Markdown downloads, all from the package's one parsed tree. The earlier
// page-split preview here was a second preview; it is gone. Never build a
// preview or converter in the app — fix it in @ai-matrx/print.

"use client";

import dynamic from "next/dynamic";
import { PAGE_BREAK_MARKDOWN } from "@ai-matrx/print/directives";

const DocumentPrintPreview = dynamic(
  () => import("@ai-matrx/print/react").then((m) => m.DocumentPrintPreview),
  {
    ssr: false,
    loading: () => <p className="p-8 text-center text-xs text-muted-foreground">Laying out pages…</p>,
  },
);

export interface PrintPreviewViewProps {
  content: string;
  title: string;
}

export function PrintPreviewView({ content, title }: PrintPreviewViewProps) {
  if (!content.trim()) {
    return (
      <p className="p-8 text-center text-xs text-muted-foreground">
        Nothing to print — load or type content first. Start a new page with a line{" "}
        <code className="font-mono">{PAGE_BREAK_MARKDOWN}</code>.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DocumentPrintPreview markdown={content} title={title} />
    </div>
  );
}
