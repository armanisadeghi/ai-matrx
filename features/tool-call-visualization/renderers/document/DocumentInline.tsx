"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDocument } from "./parseDocument";
import { EntityOpenActions } from "../_shared-entity/EntityOpenActions";

/**
 * Inline renderer for the `document` tool — a light summary (name + size) and a
 * short text preview. The full rendered document (markdown + render blocks)
 * lives in the overlay / window / `/documents/[id]` route.
 */
function previewText(text: string, max = 320): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}

export function DocumentInline({ entry, onOpenWindowPanel }: ToolRendererProps) {
  const doc = useMemo(() => parseDocument(entry), [entry]);
  if (!doc.id && !doc.text) return null;

  const title = doc.title ?? "Document";
  const href = doc.id ? `/documents/${doc.id}` : undefined;
  const chars = doc.text?.length ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        {chars != null ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {chars.toLocaleString()} chars
          </span>
        ) : null}
        <EntityOpenActions
          className="ml-auto"
          onOpenWindow={onOpenWindowPanel ? () => onOpenWindowPanel() : undefined}
          href={href}
        />
      </div>
      {doc.text ? (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {previewText(doc.text)}
        </div>
      ) : null}
    </div>
  );
}
