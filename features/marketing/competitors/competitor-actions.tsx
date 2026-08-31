"use client";

/**
 * THE COMPETITOR ROW'S ACTIONS — ONE definition of "what you can do to a
 * `seo.competitor` row", shared by every surface that shows one (mirrors
 * `features/crm/components/crm-row-actions.tsx`).
 *
 * Today: `CompetitorAutopsyWorkspace` (the Competitors tab table) and
 * `GroundTruthQueue` (the ruling queue) — both `MatrxDataTable`s stamping
 * `data-row-id`, so the pane's one right-click menu resolves the clicked row
 * off the DOM the same way `useCrmRowMenu` does.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Track/stop-tracking delegates to the
 * host's own mutation (`applyTracking` in the workspace); this module only
 * describes the row, its readable text, and its entity.
 */

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraSection,
  ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { toast } from "@/lib/toast";
import type { CompetitorRow } from "./data";

export function competitorEntityRef(
  row: CompetitorRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "seo_competitor",
    id: row.id,
    title: row.display_name || row.display_domain,
  };
}

function competitorContent(row: CompetitorRow): string {
  return [
    `${row.display_name || row.display_domain} (${row.display_domain})`,
    `tracking=${row.tracking_status} classification=${row.classification_status}`,
    row.entity_role ? `role: ${row.entity_role}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface CompetitorMenu {
  /** Hand straight to `NonEditableContextMenu.resolveContextOnOpen`. */
  resolveContextOnOpen: (
    target: HTMLElement | null,
  ) => ResolvedContextMenuContext | null;
  /** Hand straight to `NonEditableContextMenu.extraSections`. */
  sections: ContextMenuExtraSection[];
  row: CompetitorRow | null;
}

export interface CompetitorMenuOptions {
  /** The rows currently on screen, read at open time (never captured). */
  rows: () => CompetitorRow[];
  /** Omit on a surface that doesn't offer track/untrack (none do today). */
  onMutateTracking?: (id: string, status: "tracked" | "ignored") => void;
}

export function useCompetitorMenu(opts: CompetitorMenuOptions): CompetitorMenu {
  const [row, setRow] = useState<CompetitorRow | null>(null);

  const resolveContextOnOpen = (target: HTMLElement | null) => {
    const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const next = (id && opts.rows().find((r) => r.id === id)) || null;
    setRow(next);
    if (!next) return null;
    return {
      [CONTEXT_MENU_ENTITY_KEY]: competitorEntityRef(next),
      content: competitorContent(next),
    };
  };

  const items: ContextMenuExtraSection["items"] = [
    {
      kind: "item",
      id: "competitor-copy-domain",
      label: "Copy domain",
      icon: Copy,
      disabled: !row,
      onSelect: () => {
        if (!row) return;
        void navigator.clipboard.writeText(row.display_domain);
        toast.success("Domain copied");
      },
    },
  ];
  if (opts.onMutateTracking) {
    items.push({
      kind: "item",
      id: "competitor-toggle-tracking",
      label: row?.tracking_status === "tracked" ? "Stop tracking" : "Track",
      icon: row?.tracking_status === "tracked" ? EyeOff : Eye,
      disabled: !row,
      onSelect: () =>
        row &&
        opts.onMutateTracking!(
          row.id,
          row.tracking_status === "tracked" ? "ignored" : "tracked",
        ),
    });
  }

  const sections: ContextMenuExtraSection[] = [
    {
      id: "competitor-row",
      label: row ? row.display_name || row.display_domain : "This competitor",
      anchor: "after-compare",
      items,
    },
  ];

  return { resolveContextOnOpen, sections, row };
}
