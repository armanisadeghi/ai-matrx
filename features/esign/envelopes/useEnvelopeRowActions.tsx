"use client";

// features/esign/envelopes/useEnvelopeRowActions.tsx — the row menu on /esign: open the envelope,
// open it in a new tab, and — when it is the person's turn — sign it.

import { useRouter } from "next/navigation";
import { ExternalLink, Eye, PenLine } from "lucide-react";
import type { ItemMenuConfig, ItemMenuEntry } from "@ai-matrx/chat/ui/item-types";
import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import { envelopeHref, signHref, type EnvelopeListRow } from "./types";

export function useEnvelopeRowActions(
  _list: EntityListController<EnvelopeListRow>,
): EntityRowActionsResult<EnvelopeListRow> {
  const router = useRouter();

  const menuFor = (row: EnvelopeListRow) => (): ItemMenuConfig => {
    const href = envelopeHref(row);
    const open: ItemMenuEntry[] = [
      { id: "open", label: "Open", icon: Eye, kind: "link", href },
      { id: "open-tab", label: "Open in new tab", icon: ExternalLink, kind: "link", href, target: "_blank" },
    ];
    if (row.my_turn) {
      open.unshift({ id: "sign", label: "Sign now", icon: PenLine, kind: "link", href: signHref(row.id) });
    }
    return { header: { title: row.title }, sections: [{ id: "open", items: open }] };
  };

  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(envelopeHref(row)),
    },
  };
}
