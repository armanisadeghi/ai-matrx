"use client";

// features/crm/inbox/useInboxRowActions.tsx
//
// The ONE action list for an inbox row — table kebab, right-click and any
// future card view all consume this builder, so the three can never drift.
//
// The reply action does NOT compose a message here. It resolves the campaign
// and the member, then hands both to the CANONICAL SingleSendDialog — the same
// dialog the outreach-list workspace uses, over the same
// createOutreachDraft → approveOutreachDraft → sendOutreachDraft client and the
// same `crm.check_send_eligibility` authority. A second compose UI would be a
// second send path, which is the one thing this feature may never grow.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CircleDot,
  ClipboardCopy,
  Contact,
  Link2,
  Mail,
  Megaphone,
} from "lucide-react";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { toast } from "@/lib/toast";
import { setInboxHandled } from "./service";
import { InboxReplyDialog } from "./components/InboxReplyDialog";
import type { InboxRow } from "./types";

function link(
  id: string,
  label: string,
  icon: ItemMenuEntry["icon"],
  href: string,
): ItemMenuEntry {
  return { id, label, icon, kind: "link", href };
}

export function useInboxRowActions(
  list: EntityListController<InboxRow>,
): EntityRowActionsResult<InboxRow> {
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<InboxRow | null>(null);

  async function toggleHandled(row: InboxRow) {
    const next = !row.handled;
    try {
      await setInboxHandled(row.id, next);
      // Patch locally so the row reflects the change without a refetch flash;
      // the shell owns the refresh when the user asks for one.
      list.patchRow(row.id, { handled: next } as Partial<InboxRow>);
      toast.success(next ? "Marked handled" : "Moved back to Needs me");
    } catch (error) {
      // Never swallow: a governed refusal here is a real permission answer.
      toast.error(
        error instanceof Error ? error.message : "Could not update this reply.",
      );
    }
  }

  const menuFor = (row: InboxRow) => (): ItemMenuConfig => {
    const open: ItemMenuEntry[] = [];
    if (row.party_id) {
      open.push(link("open-party", "Open contact record", Contact, `/crm/${row.party_id}`));
    }
    if (row.outreach_list_id) {
      open.push(
        link(
          "open-campaign",
          "Open campaign",
          Megaphone,
          `/crm/outreach-lists/${row.outreach_list_id}`,
        ),
      );
    }
    if (row.sending_identity_id) {
      open.push(
        link(
          "open-mailbox",
          "Open sending mailbox",
          Mail,
          `/crm/sending-identities/${row.sending_identity_id}`,
        ),
      );
    }

    return {
      sections: [
        {
          id: "act",
          items: [
            {
              id: "reply",
              label: "Reply with a governed message",
              icon: Mail,
              // Replying needs the campaign it came from: the lane, the
              // mailbox and the eligibility check all hang off that row.
              disabled: !row.outreach_list_id || !row.member_id,
              disabledReason: !row.outreach_list_id
                ? "This reply is not attached to a campaign, so there is no lane or mailbox to send from."
                : !row.member_id
                  ? "The campaign member behind this reply could not be resolved."
                  : undefined,
              onSelect: () => setReplyTo(row),
            },
            {
              id: "handled",
              label: row.handled ? "Move back to Needs me" : "Mark handled",
              icon: row.handled ? CircleDot : CircleCheck,
              onSelect: () => void toggleHandled(row),
            },
          ],
        },
        { id: "open", items: open },
        {
          id: "copy",
          items: [
            {
              id: "copy-link",
              label: "Copy link to the contact",
              icon: Link2,
              hidden: !row.party_id,
              onSelect: () => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/crm/${row.party_id}`,
                );
                toast.success("Link copied");
              },
            },
            {
              id: "copy-reference",
              label: "Copy reference",
              icon: ClipboardCopy,
              hidden: !row.party_id,
              onSelect: () => {
                void navigator.clipboard.writeText(
                  buildRecordReferenceFence({
                    type: "party",
                    id: row.party_id as string,
                    label: row.party_name ?? "Contact",
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

  const onOpenRow = (row: InboxRow) => {
    if (row.party_id) router.push(`/crm/${row.party_id}`);
  };

  return {
    actions: { menuFor, onOpenRow },
    modals: (
      <InboxReplyDialog
        row={replyTo}
        onClose={() => setReplyTo(null)}
        onSent={() => {
          setReplyTo(null);
          list.refresh();
        }}
      />
    ),
  };
}
