"use client";

/**
 * InboxReplyDialog — one-click reply from the unified inbox, through the SAME
 * send primitive as everywhere else.
 *
 * This component composes NOTHING. It resolves the campaign row and the member
 * row an inbox row points at, then renders the canonical
 * `SingleSendDialog` — the same component the outreach-list workspace uses,
 * over the same `createOutreachDraft → approveOutreachDraft → sendOutreachDraft`
 * client, the same `readOutreachProblem` fix rendering, and the same
 * `crm.check_send_eligibility` authority.
 *
 * A second compose UI here would be a second send path, and a send path that
 * can skip the gate will eventually skip it (crm/compliance/FEATURE.md).
 *
 * The ACTION is what `outreach.send` gates, and that gate lives inside
 * `SingleSendDialog` beside the Send button — one gate, every consumer.
 * Reading replies is never gated: gating the teaching is how a non-technical
 * expert's outreach career ends on day one.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SingleSendDialog } from "@/features/crm/components/outreach-lists/SingleSendDialog";
import {
  fetchOutreachList,
  fetchOutreachListMember,
} from "@/features/crm/outreach-lists/service";
import type {
  OutreachListMemberWithParty,
  OutreachListRow,
} from "@/features/crm/outreach-lists/types";
import type { InboxRow } from "../types";

interface InboxReplyDialogProps {
  /** The reply being answered, or null when the dialog is closed. */
  row: InboxRow | null;
  onClose: () => void;
  onSent: () => void;
}

interface Resolved {
  list: OutreachListRow;
  member: OutreachListMemberWithParty;
}

export function InboxReplyDialog({ row, onClose, onSent }: InboxReplyDialogProps) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = row?.outreach_list_id ?? null;
  const memberId = row?.member_id ?? null;

  useEffect(() => {
    if (!listId || !memberId) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setError(null);
    setResolved(null);
    void (async () => {
      try {
        const [list, member] = await Promise.all([
          fetchOutreachList(listId),
          fetchOutreachListMember(memberId),
        ]);
        if (cancelled) return;
        if (!member) {
          setError(
            "This reply's campaign member no longer exists, so there is nothing to reply to through the campaign. Open the contact record and reach them there.",
          );
          return;
        }
        setResolved({ list, member });
      } catch (loadError) {
        if (cancelled) return;
        // A failed read is not an empty state — say what happened.
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the campaign behind this reply.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listId, memberId]);

  if (!row) return null;

  // Resolved: hand off to THE canonical dialog. The `outreach.send` gate lives
  // INSIDE that dialog, beside the Send button, so this surface cannot hold a
  // second (and eventually divergent) opinion about who may send — and a
  // blocked user meets the explanation where they were about to press, not as
  // a banner at the bottom of the page.
  if (resolved) {
    return (
      <SingleSendDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        list={resolved.list}
        member={resolved.member}
        onSent={onSent}
      />
    );
  }

  // Loading / failure both need a real surface, because the canonical dialog
  // cannot mount without its two rows.
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reply to {row.party_name ?? "this contact"}</DialogTitle>
          <DialogDescription>
            Replying goes through the same governed send path as the campaign,
            so the eligibility gate and the approval ladder still apply.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <p className="flex gap-2 font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
            {row.party_id && (
              <a
                className="mt-2 inline-block pl-6 text-sm text-primary underline-offset-2 hover:underline"
                href={`/crm/${row.party_id}`}
              >
                Open the contact record
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading the campaign and the member behind this reply…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
