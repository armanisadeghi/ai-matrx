"use client";

// features/exports/browse/useExportItemRowActions.tsx
//
// The ONE action list for one extracted item — table kebab, phone card and
// right-click all consume this builder.
//
// 🚨 WHAT "OPEN" MEANS HERE, AND WHY IT IS NOT A PREVIEW PANE. Every other
// list in this app opens a record page. An export item has no record page,
// because an export holds OTHER PEOPLE'S WORDS and the API deliberately serves
// no body text — there is no endpoint that could fill a reading pane and there
// must not be one. But a row the UI names and cannot open is the dead end THE
// DOOR LAW exists to kill, so "open" shows everything the platform actually
// holds about that item (who, when, which thread, which labels, how long, what
// was attached) and says in one sentence that the text itself was never read
// in. Metadata, completely, and nothing else.

import { useState } from "react";
import { ClipboardCopy, Filter, Info, User } from "lucide-react";
import { toast } from "@/lib/toast";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { ExportItemDetailsDialog } from "../components/ExportItemDetailsDialog";
import type { ExportItem } from "../types";
import { partyLabel } from "./columns";

export function useExportItemRowActions(
  list: EntityListController<ExportItem>,
): EntityRowActionsResult<ExportItem> {
  const [detailed, setDetailed] = useState<ExportItem | null>(null);

  // No manual memoization — the React Compiler owns it (CLAUDE.md).
  const menuFor = (row: ExportItem) => (): ItemMenuConfig => {
    const author = partyLabel(row.author);
    const narrowing: ItemMenuEntry[] = [];

    const containerId = row.container_id;
    if (row.container_label && containerId) {
      narrowing.push({
        id: "only-thread",
        label: `Only "${row.container_label}"`,
        icon: Filter,
        onSelect: () => {
          list.setFilters({
            ...list.query.filters,
            container_label: { kind: "select", values: [containerId] },
          });
        },
      });
    }
    if (author) {
      narrowing.push({
        id: "only-author",
        label: `Only from ${author}`,
        icon: User,
        onSelect: () => {
          list.setFilters({
            ...list.query.filters,
            author: { kind: "text", value: author },
          });
        },
      });
    }

    return {
      sections: [
        {
          id: "open",
          items: [
            {
              id: "details",
              label: "What we hold about this",
              icon: Info,
              onSelect: () => setDetailed(row),
            },
          ],
        },
        ...(narrowing.length > 0
          ? [{ id: "narrow", items: narrowing }]
          : []),
        {
          id: "copy",
          items: [
            {
              id: "copy-details",
              label: "Copy details",
              icon: ClipboardCopy,
              onSelect: () => {
                // Metadata only — the same fields the details dialog shows.
                void navigator.clipboard.writeText(
                  [
                    row.title?.trim() || "(no subject)",
                    author ? `From: ${author}` : null,
                    row.occurred_at ? `When: ${row.occurred_at}` : null,
                    row.container_label ? `Thread: ${row.container_label}` : null,
                    row.labels.length ? `Labels: ${row.labels.join(", ")}` : null,
                    `Length: ${row.char_count.toLocaleString()} characters`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                );
                toast.success("Details copied");
              },
            },
          ],
        },
      ],
    };
  };

  return {
    actions: { menuFor, onOpenRow: (row) => setDetailed(row) },
    modals: (
      <ExportItemDetailsDialog
        item={detailed}
        onClose={() => setDetailed(null)}
      />
    ),
  };
}
