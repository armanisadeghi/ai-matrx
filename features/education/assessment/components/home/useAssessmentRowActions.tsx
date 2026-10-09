"use client";

// features/education/assessment/components/home/useAssessmentRowActions.tsx
//
// The ONE action list for a quiz / practice-test row — the kebab, the phone
// card and the right-click menu all consume this builder, so they can never
// drift. Archive goes through Trash's one archive (`archiveRecord`), so the
// assessment is restorable from /trash and from this list's Archived filter.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  ExternalLink,
  Eye,
  Pencil,
  Play,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { ItemMenuConfig, ItemMenuEntry } from "@ai-matrx/chat/ui/item-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { archiveRecord, restoreFromTrash } from "@/features/trash/service";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import type { KindConfig } from "../kindConfig";
import {
  assessmentHref,
  assessmentTakeHref,
  type AssessmentListItem,
} from "./assessmentList";

/** Row actions for one kind — returns the hook the list config calls. */
export function makeAssessmentRowActions(config: KindConfig) {
  return function useAssessmentRowActions(
    list: EntityListController<AssessmentListItem>,
  ): EntityRowActionsResult<AssessmentListItem> {
    const router = useRouter();
    const [pendingArchive, setPendingArchive] = useState<AssessmentListItem | null>(null);
    const [busy, setBusy] = useState(false);
    const noun = config.noun;

    const restore = async (row: AssessmentListItem) => {
      try {
        await restoreFromTrash("assessment", row.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not restore this ${noun}.`);
        return;
      }
      list.refresh();
      toast.success(`Restored "${row.title}"`);
    };

    const menuFor = (row: AssessmentListItem) => (): ItemMenuConfig => {
      const href = assessmentHref(config, row);
      const restoreFirst = `Restore the ${noun} first`;
      const open: ItemMenuEntry[] = [
        { id: "open", label: "Open", icon: Eye, kind: "link", href },
        {
          id: "open-tab",
          label: "Open in new tab",
          icon: ExternalLink,
          kind: "link",
          href,
          target: "_blank",
        },
      ];
      const work: ItemMenuEntry[] = [
        {
          id: "take",
          label: "Take",
          icon: Play,
          kind: "link",
          href: assessmentTakeHref(config, row),
          disabled: row.archived || row.question_count === 0,
          disabledReason: row.archived
            ? restoreFirst
            : `This ${noun} has no questions yet — add some from Edit questions`,
        },
        // Only where the person may actually edit (their own, or editor
        // access) — an org-shared quiz they can only take offers no Edit.
        ...(row.my_can_edit
          ? [
              {
                id: "edit",
                label: "Edit questions",
                icon: Pencil,
                kind: "link",
                href: `${href}/edit`,
                disabled: row.archived,
                disabledReason: restoreFirst,
              } satisfies ItemMenuEntry,
            ]
          : []),
        // Results only once there is one to show: the results route without a
        // result id falls back to the overview, which was a second "Open".
        ...(row.my_last_result_id
          ? [
              {
                id: "results",
                label: "Results",
                icon: BarChart3,
                kind: "link",
                href: `${href}/results?r=${row.my_last_result_id}`,
              } satisfies ItemMenuEntry,
            ]
          : []),
      ];
      return {
        header: { title: row.title },
        sections: [
          { id: "open", items: open },
          { id: "work", label: config.label, items: work },
          ...(row.my_can_edit
            ? [
              {
                id: "manage",
                label: "Manage",
                items: [
                  row.archived
                    ? {
                        id: "restore",
                        label: "Restore",
                        icon: ArchiveRestore,
                        onSelect: () => {
                          void restore(row);
                        },
                      }
                    : {
                        id: "archive",
                        label: "Archive",
                        icon: Archive,
                        tone: "destructive" as const,
                        onSelect: () => setPendingArchive(row),
                      },
                ],
              },
              ]
            : []),
        ],
      };
    };

    const modals = (
      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchive(null);
        }}
        title={`Archive this ${noun}?`}
        description={pendingArchive ? archiveConfirmSentence(`"${pendingArchive.title}"`, { restoreFrom: "list_filters" }) : ""}
        confirmLabel="Archive"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          if (!pendingArchive) return;
          setBusy(true);
          try {
            await archiveRecord("assessment", pendingArchive.id, noun);
          } catch (e) {
            setBusy(false);
            toast.error(e instanceof Error ? e.message : `Could not archive this ${noun}.`);
            return;
          }
          setBusy(false);
          list.removeRow(pendingArchive.id);
          list.refresh();
          toast.success(`Archived "${pendingArchive.title}"`);
          setPendingArchive(null);
        }}
      />
    );

    return {
      actions: {
        menuFor,
        onOpenRow: (row) => router.push(assessmentHref(config, row)),
      },
      modals,
    };
  };
}
