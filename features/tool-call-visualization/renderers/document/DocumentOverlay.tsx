"use client";

import { useMemo } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ToolRendererProps } from "../../types";
import { parseDocument } from "./parseDocument";

/**
 * Overlay renderer for the `document` tool — the real document rendered with the
 * canonical `RichDocument` (markdown + live render blocks: flashcards, mermaid,
 * tables, …), the same engine the notes/documents surfaces use.
 */
export function DocumentOverlay({ entry }: ToolRendererProps) {
  const doc = useMemo(() => parseDocument(entry), [entry]);

  if (!doc.text) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <FileText className="h-6 w-6" />
        <span>Open the document to view it.</span>
        {doc.id ? (
          <a
            href={`/documents/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-card px-4 py-4 md:px-8">
      <RichDocument content={doc.text} source={{ type: "raw" }} />
    </div>
  );
}
