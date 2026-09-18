"use client";

// features/block-ledger/useBlockRowActions.tsx
//
// The ONE action list for a single block — kebab, phone card and right-click all
// read this builder.
//
// THE DOOR LAW. A block names a thing (a page, a file, an account) and this screen
// must open it rather than dead-end on it: "Open what we could not get" opens the
// address itself for a web page, and for everything else the row detail says
// exactly what the platform holds. Never a row you can see and cannot follow.

import { useState } from "react";
import {
  ClipboardCopy,
  ExternalLink,
  Filter,
  Info,
  RotateCw,
  Send,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { retryBlocks, sendBlocksToOwnBrowser } from "./actions";
import { BlockDetailsDialog } from "./BlockDetailsDialog";
import {
  ENGINE_LABELS,
  SOURCE_TYPE_LABELS,
  canGoToYourBrowser,
  isRetryable,
  labelFor,
  type AcquisitionBlock,
} from "./types";

export function useBlockRowActions(
  list: EntityListController<AcquisitionBlock>,
): EntityRowActionsResult<AcquisitionBlock> {
  const [detailed, setDetailed] = useState<AcquisitionBlock | null>(null);

  const menuFor = (row: AcquisitionBlock) => (): ItemMenuConfig => {
    const open: ItemMenuEntry[] = [
      {
        id: "details",
        label: "What we hold about this block",
        icon: Info,
        onSelect: () => setDetailed(row),
      },
    ];
    if (/^https?:\/\//.test(row.input_ref)) {
      open.push({
        id: "open-source",
        label: "Open the page yourself",
        icon: ExternalLink,
        onSelect: () => {
          window.open(row.input_ref, "_blank", "noopener");
        },
      });
    }

    const act: ItemMenuEntry[] = [];
    if (isRetryable(row)) {
      act.push({
        id: "retry",
        label: "Try this again",
        icon: RotateCw,
        onSelect: async () => {
          const outcome = await retryBlocks([row]);
          toast.info(outcome.sentence);
          if (outcome.refresh) list.refresh();
        },
      });
    }
    if (canGoToYourBrowser(row)) {
      act.push({
        id: "send-to-browser",
        label: "Send to my browser",
        icon: Send,
        onSelect: async () => {
          const outcome = await sendBlocksToOwnBrowser([row]);
          toast.info(outcome.sentence);
          if (outcome.refresh) list.refresh();
        },
      });
    }

    return {
      sections: [
        { id: "open", items: open },
        ...(act.length > 0 ? [{ id: "act", items: act }] : []),
        {
          id: "narrow",
          items: [
            {
              id: "only-class",
              label: `Only "${row.error_class}"`,
              icon: Filter,
              onSelect: () =>
                list.setFilters({
                  ...list.query.filters,
                  error_class: { kind: "select", values: [row.error_class] },
                }),
            },
            {
              id: "only-engine",
              label: `Only ${labelFor(ENGINE_LABELS, row.engine)}`,
              icon: Filter,
              onSelect: () =>
                list.setFilters({
                  ...list.query.filters,
                  engine: { kind: "select", values: [row.engine] },
                }),
            },
          ],
        },
        {
          id: "copy",
          items: [
            {
              id: "copy-block",
              label: "Copy this block",
              icon: ClipboardCopy,
              onSelect: () => {
                void navigator.clipboard.writeText(
                  [
                    row.input_ref,
                    `Source: ${labelFor(SOURCE_TYPE_LABELS, row.source_type)}`,
                    `Engine: ${labelFor(ENGINE_LABELS, row.engine)}${row.rung ? ` (rung ${row.rung})` : ""}`,
                    `Class: ${row.error_class}`,
                    `Said: ${row.error_sentence}`,
                    row.unblock_note ? `Unblocks by: ${row.unblock_note}` : null,
                    `Seen ${row.occurrence_count}× — first ${row.first_seen_at}, last ${row.last_seen_at}`,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                );
                toast.success("Block copied");
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
      <BlockDetailsDialog block={detailed} onClose={() => setDetailed(null)} />
    ),
  };
}
