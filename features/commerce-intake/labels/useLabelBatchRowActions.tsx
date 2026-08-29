"use client";

// features/commerce-intake/labels/useLabelBatchRowActions.tsx
//
// The ONE action list for a label-batch row — kebab, cards and right-click all
// consume this builder.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ExternalLink, Eye, Printer } from "lucide-react";

import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { toast } from "@/lib/toast";

import { loadLabelBatch, voidBatch } from "./service";
import { labelBatchHref, type LabelBatchListRow } from "./types";

export function useLabelBatchRowActions(
  list: EntityListController<LabelBatchListRow>,
): EntityRowActionsResult<LabelBatchListRow> {
  const router = useRouter();
  const [pendingVoid, setPendingVoid] = useState<LabelBatchListRow | null>(
    null,
  );
  const [isVoiding, setIsVoiding] = useState(false);

  const menuFor = (row: LabelBatchListRow) => (): ItemMenuConfig => {
    const href = labelBatchHref(row);
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
      {
        id: "print",
        label: "Print / preview",
        icon: Printer,
        kind: "link",
        href,
      },
    ];
    const sections = [{ id: "open", items: open }];
    if (row.state !== "void") {
      sections.push({
        id: "danger",
        items: [
          {
            id: "void",
            label: "Void batch",
            icon: Ban,
            tone: "destructive",
            onSelect: () => setPendingVoid(row),
          } as ItemMenuEntry,
        ],
      });
    }
    return {
      header: { title: row.purpose || "Label batch" },
      sections,
    };
  };

  const modals = (
    <ConfirmDialog
      open={pendingVoid !== null}
      onOpenChange={(open) => {
        if (!open) setPendingVoid(null);
      }}
      title="Void this label batch?"
      description="Every remaining unassigned code in the batch is voided — scanning one will be refused. Codes already assigned to items keep working."
      confirmLabel="Void batch"
      variant="destructive"
      busy={isVoiding}
      onConfirm={async () => {
        if (!pendingVoid) return;
        setIsVoiding(true);
        try {
          const batch = await loadLabelBatch(pendingVoid.id);
          if (!batch) throw new Error("This batch no longer exists.");
          await voidBatch(batch, "batch voided from the batches list");
          list.patchRow(pendingVoid.id, { state: "void" });
          setPendingVoid(null);
          toast.success("Batch voided.");
        } catch (err) {
          console.error("[commerce-labels] void batch failed", err);
          toast.error("Could not void the batch.");
        } finally {
          setIsVoiding(false);
        }
      }}
    />
  );

  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(labelBatchHref(row)),
    },
    modals,
  };
}
