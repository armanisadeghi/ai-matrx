// components/markdown-studio/lab/PrintPreviewView.tsx
//
// Print preview — the content as the platform print package will put it on
// paper: the SAME `renderMarkdownDocument` composition the print window, PDF
// capture and "copy HTML page" use, split at page-break directives by the
// package's own fence-aware `splitAtPageBreaks`. Each piece starts on a new
// sheet; a piece longer than one page flows onto more paper when printed.
// Never a second converter or stylesheet (fix those in @ai-matrx/print).

"use client";

import React, { useState } from "react";
import { Printer, SeparatorHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PAGE_BREAK_MARKDOWN,
  renderMarkdownDocument,
  splitAtPageBreaks,
} from "@ai-matrx/print/markdown";
import { printMarkdownContent } from "@/features/conversation/utils/markdown-print";

export interface PrintPreviewViewProps {
  content: string;
  title: string;
}

export function PrintPreviewView({ content, title }: PrintPreviewViewProps) {
  if (!content.trim()) {
    return (
      <p className="p-8 text-center text-xs text-muted-foreground">
        Nothing to print — load or type content first.
      </p>
    );
  }
  const pieces = splitAtPageBreaks(content);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <Badge variant="outline" className="font-mono">
          {pieces.length} {pieces.length === 1 ? "section" : "sections"}
        </Badge>
        <span className="text-muted-foreground">
          Start a new page with a line <code className="font-mono">{PAGE_BREAK_MARKDOWN}</code>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 gap-1.5 px-2.5 text-xs"
          onClick={() => printMarkdownContent(content, title)}
        >
          <Printer className="h-3.5 w-3.5" />
          Print / Save PDF
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-muted/40 p-4">
        {pieces.map((piece, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-muted-foreground">
                <SeparatorHorizontal className="h-3.5 w-3.5" />
                Page break — the next section starts on a new sheet
              </div>
            )}
            <PrintSheet
              html={renderMarkdownDocument(piece, { skin: "article", title })}
              label={`${title} — section ${idx + 1}`}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/** One sheet: letter-width paper, height grown to its content. */
function PrintSheet({ html, label }: { html: string; label: string }) {
  const [height, setHeight] = useState(400);
  return (
    <iframe
      title={label}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={(e) => {
        const doc = e.currentTarget.contentDocument;
        if (doc) setHeight(doc.documentElement.scrollHeight + 8);
      }}
      style={{ height }}
      className="mx-auto block w-full max-w-[816px] rounded-sm border border-border bg-white shadow-md"
    />
  );
}
