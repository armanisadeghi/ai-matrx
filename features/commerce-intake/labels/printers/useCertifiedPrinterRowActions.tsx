"use client";

// features/commerce-intake/labels/printers/useCertifiedPrinterRowActions.tsx
//
// The ONE action list for a certified-printer row — kebab, cards and
// right-click all consume this builder.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, RotateCcw, Trash2 } from "lucide-react";

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

import { deleteCertifiedPrinter, markNeedsRecheck } from "./service";
import {
  certifyPrinterHref,
  printerDisplayName,
  type CertifiedPrinterListRow,
} from "./types";

export function useCertifiedPrinterRowActions(
  list: EntityListController<CertifiedPrinterListRow>,
): EntityRowActionsResult<CertifiedPrinterListRow> {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] =
    useState<CertifiedPrinterListRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const menuFor = (row: CertifiedPrinterListRow) => (): ItemMenuConfig => {
    const href = certifyPrinterHref(row.id);
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
        id: "recheck",
        label: "Re-check this printer",
        icon: RotateCcw,
        onSelect: () => {
          void (async () => {
            try {
              await markNeedsRecheck(row.id);
              list.patchRow(row.id, { status: "needs_recheck" });
              router.push(href);
            } catch (err) {
              console.error("[certified-printers] re-check failed", err);
              toast.error("Could not start the re-check.");
            }
          })();
        },
      } as ItemMenuEntry,
    ];
    return {
      header: { title: printerDisplayName(row) },
      sections: [
        { id: "open", items: open },
        {
          id: "danger",
          items: [
            {
              id: "delete",
              label: "Delete certification",
              icon: Trash2,
              tone: "destructive",
              onSelect: () => setPendingDelete(row),
            } as ItemMenuEntry,
          ],
        },
      ],
    };
  };

  const modals = (
    <ConfirmDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDelete(null);
      }}
      title={
        pendingDelete
          ? `Delete the ${printerDisplayName(pendingDelete)} certification?`
          : "Delete this certification?"
      }
      description="The recorded test result and its answers are removed from this list. Nothing about the printer itself changes — you would have to run the calibration page and answer the four checks again to get it back."
      confirmLabel="Delete certification"
      variant="destructive"
      busy={isDeleting}
      onConfirm={async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
          await deleteCertifiedPrinter(pendingDelete.id);
          list.removeRow(pendingDelete.id);
          setPendingDelete(null);
          toast.success("Certification deleted.");
        } catch (err) {
          console.error("[certified-printers] delete failed", err);
          toast.error("Could not delete the certification.");
        } finally {
          setIsDeleting(false);
        }
      }}
    />
  );

  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(certifyPrinterHref(row.id)),
    },
    modals,
  };
}
