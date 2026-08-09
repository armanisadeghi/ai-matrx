"use client";

// features/transcripts/browse/useTranscriptRowActions.tsx
//
// The ONE action list for a transcripts-hub row — table kebab, cards, and
// right-click all consume the same builder, so the three can never drift.
// Actions are per-kind: each row opens in its owning surface (Processor /
// Studio / Cleanup / Scribe), with the same secondary destinations the old
// hub cards carried.

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  Columns2,
  Eraser,
  Mic,
  Inbox,
  Link2,
  ClipboardCopy,
} from "lucide-react";
import type { ItemMenuConfig, ItemMenuEntry } from "@/components/official/item/types";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { primaryRowHref, type TranscriptListRow } from "./types";

function link(
  id: string,
  label: string,
  icon: ItemMenuEntry["icon"],
  href: string,
): ItemMenuEntry {
  return { id, label, icon, kind: "link", href };
}

export function useTranscriptRowActions(
  list: EntityListController<TranscriptListRow>,
): EntityRowActionsResult<TranscriptListRow> {
  const router = useRouter();

  // No manual memoization — the React Compiler owns it (CLAUDE.md).
  const menuFor = (row: TranscriptListRow) => (): ItemMenuConfig => {
      const href = primaryRowHref(row);
      const open: ItemMenuEntry[] = [];
      if (row.kind === "transcript") {
        open.push(
          link("open", "Open in Processor", Eye, href),
          link(
            "studio",
            "Open in Studio",
            Columns2,
            `/transcripts/studio?import=${encodeURIComponent(row.id)}`,
          ),
          link(
            "cleanup",
            "Run Cleanup",
            Eraser,
            `/transcripts/cleanup?import=${encodeURIComponent(row.id)}`,
          ),
        );
      } else if (row.kind === "session") {
        open.push(
          link("open", "Open in Studio", Columns2, href),
          link(
            "scribe",
            "Open in Scribe",
            Mic,
            `/transcripts/scribe/${encodeURIComponent(row.id)}`,
          ),
        );
      } else if (row.kind === "cleanup") {
        open.push(link("open", "Open cleanup session", Eraser, href));
      } else {
        open.push(link("open", "View unsorted recordings", Inbox, href));
      }

      const referenceType =
        row.kind === "transcript" ? "transcript" : "transcript_session";

      return {
        sections: [
          { id: "open", items: open },
          {
            id: "copy",
            items: [
              {
                id: "copy-link",
                label: "Copy link",
                icon: Link2,
                onSelect: () => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}${href}`,
                  );
                  toast.success("Link copied");
                },
              },
              {
                id: "copy-reference",
                label: "Copy reference",
                icon: ClipboardCopy,
                // Unsorted recordings have no referenceable record type.
                hidden: row.kind === "unsorted",
                onSelect: () => {
                  void navigator.clipboard.writeText(
                    buildRecordReferenceFence({
                      type: referenceType,
                      id: row.id,
                      label: row.title,
                    }),
                  );
                  toast.success("Reference copied");
                },
              },
            ],
          },
        ],
      };
  };

  const onOpenRow = (row: TranscriptListRow) =>
    router.push(primaryRowHref(row));

  // The list controller is unused today (no mutating actions yet — delete /
  // move land with the row-actions expansion tracked in the handoff).
  void list;
  return { actions: { menuFor, onOpenRow } };
}
