"use client";

// features/esign/templates/useTemplateRowActions.tsx — Use / Edit / Delete on a template row.

import { useRouter } from "next/navigation";
import { Pencil, Send, Trash2 } from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { deleteTemplateRow } from "../editor/api/realApi";
import { templateEditHref, templateUseHref, type TemplateRow } from "./types";

export function useTemplateRowActions(list: EntityListController<TemplateRow>): EntityRowActionsResult<TemplateRow> {
  const router = useRouter();

  async function remove(row: TemplateRow) {
    const ok = await confirm({
      title: `Delete ${row.name}?`,
      description: "Envelopes already made from it keep working. New ones cannot start from it.",
      confirmLabel: "Delete template",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteTemplateRow(row.id);
      toast.success("Template deleted.");
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The template could not be deleted.");
    }
  }

  const menuFor = (row: TemplateRow) => (): ItemMenuConfig => ({
    header: { title: row.name },
    sections: [
      {
        id: "use",
        items: [
          { id: "use", label: "Use template", icon: Send, kind: "link", href: templateUseHref(row.id) },
          { id: "edit", label: "Edit", icon: Pencil, kind: "link", href: templateEditHref(row.id), disabled: !row.i_manage },
        ],
      },
      { id: "danger", items: [{ id: "delete", label: "Delete", icon: Trash2, tone: "destructive", onSelect: () => void remove(row), disabled: !row.i_manage }] },
    ],
  });

  return { actions: { menuFor, onOpenRow: (row) => router.push(templateUseHref(row.id)) } };
}
