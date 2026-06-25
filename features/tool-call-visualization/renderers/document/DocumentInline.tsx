"use client";

import { useMemo } from "react";
import { FileText, PanelRight, ExternalLink, Maximize2 } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDocument } from "./parseDocument";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for the `document` tool — a polished entity card with a short
 * text preview. The full rendered document (markdown + render blocks) lives in
 * the overlay / window / `/documents/[id]` route (via the "Open in" menu).
 */
function previewText(text: string, max = 320): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}

export function DocumentInline({
  entry,
  onOpenWindowPanel,
  onOpenOverlay,
}: ToolRendererProps) {
  const doc = useMemo(() => parseDocument(entry), [entry]);
  if (!doc.id && !doc.text) return null;

  const title = doc.title ?? "Document";
  const href = doc.id ? `/documents/${doc.id}` : undefined;
  const chars = doc.text?.length ?? null;

  const actions: EntityAction[] = [];
  if (onOpenWindowPanel)
    actions.push({
      label: "Open in window",
      icon: PanelRight,
      onSelect: () => onOpenWindowPanel(),
    });
  if (href) actions.push({ label: "Open in new tab", icon: ExternalLink, href });
  if (onOpenOverlay)
    actions.push({
      label: "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
      separatorBefore: true,
    });

  return (
    <EntityCard
      icon={FileText}
      accent="slate"
      title={title}
      subtitle={chars != null ? `${chars.toLocaleString()} chars · Document` : "Document"}
      actions={actions}
    >
      {doc.text ? (
        <div className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {previewText(doc.text)}
        </div>
      ) : null}
    </EntityCard>
  );
}
