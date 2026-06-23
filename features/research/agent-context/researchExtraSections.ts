import { ExternalLink, RefreshCw, Download } from "lucide-react";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";

/**
 * Real handlers a research surface wires into its menu. Every item is omitted
 * unless its handler is supplied — the section never renders dead/stub rows
 * (the core menu drops an empty section). A surface passes only the actions it
 * can actually perform (e.g. the DocumentViewer wires regenerate + export; a
 * read-only synthesis card wires only "open").
 */
export interface ResearchExtraSectionHandlers {
  /** Open the full document / synthesis in its own route. */
  onOpen?: () => void;
  /** Re-run document/synthesis generation. */
  onRegenerate?: () => void;
  /** Export the displayed output (caller decides the format). */
  onExport?: () => void;
}

/**
 * Research-specific menu items injected via `extraSections` — the wrapper only
 * describes them; the core menu renders them. Mirrors
 * `createNotesEditorExtraSections`, but every item is gated on a real handler so
 * nothing is a placeholder.
 */
export function createResearchExtraSections(
  handlers: ResearchExtraSectionHandlers = {},
): ContextMenuExtraSection[] {
  const { onOpen, onRegenerate, onExport } = handlers;
  const items = [] as ContextMenuExtraSection["items"];

  if (onOpen) {
    items.push({
      kind: "item",
      id: "research-open",
      label: "Open in research",
      icon: ExternalLink,
      onSelect: onOpen,
    });
  }
  if (onRegenerate) {
    items.push({
      kind: "item",
      id: "research-regenerate",
      label: "Regenerate",
      icon: RefreshCw,
      onSelect: onRegenerate,
    });
  }
  if (onExport) {
    items.push({
      kind: "item",
      id: "research-export",
      label: "Export",
      icon: Download,
      onSelect: onExport,
    });
  }

  if (items.length === 0) return [];

  return [
    {
      id: "research-ops",
      label: "Research",
      anchor: "after-compare",
      items,
    },
  ];
}
