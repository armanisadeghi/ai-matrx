/**
 * NotifyOwnerDialog — send a drift notification DM to the owner(s) of usages
 * the caller can't (or shouldn't) remediate directly.
 *
 *   • Single recipient (one usage's owner), or
 *   • Org managers (a not-managed org aggregate), or
 *   • Admin "Inform all affected users" — every distinct owner across a set.
 *
 * Shows the default drift template (read-only preview) + an optional custom
 * note prepended to it. Sends sequentially with per-recipient progress and a
 * retry list. Recipients > 3 require a ConfirmDialog gate.
 */

"use client";

import { useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { sendDirectActionMessage } from "@/features/messaging/service/sendDirectActionMessage";
import {
  buildDriftActionData,
  buildDriftMessage,
  type DriftMessageInput,
} from "./driftMessageTemplate";

export interface NotifyTarget {
  recipientIds: string[];
  drift: DriftMessageInput;
  /** Human label for the dialog header (e.g. agent name or "all affected users"). */
  contextLabel: string;
}

interface NotifyOwnerDialogProps {
  open: boolean;
  target: NotifyTarget | null;
  onClose: () => void;
}

export function NotifyOwnerDialog({ open, target, onClose }: NotifyOwnerDialogProps) {
  const currentUserId = useAppSelector(selectUserId);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  const recipients = useMemo(
    () => Array.from(new Set(target?.recipientIds ?? [])).filter(Boolean),
    [target],
  );
  const defaultBody = useMemo(
    () => (target ? buildDriftMessage(target.drift) : ""),
    [target],
  );

  const handleSend = async () => {
    if (!currentUserId || !target || recipients.length === 0) return;
    if (recipients.length > 3) {
      const ok = await confirm({
        title: `Notify ${recipients.length} people?`,
        description: "Each affected user will receive a direct message about this drift.",
        confirmLabel: `Send ${recipients.length} messages`,
      });
      if (!ok) return;
    }

    setSending(true);
    setFailed([]);
    setProgress({ done: 0, total: recipients.length });
    const content = note.trim() ? `${note.trim()}\n\n${defaultBody}` : defaultBody;
    const actionData = buildDriftActionData(target.drift);
    const errored: string[] = [];

    for (let i = 0; i < recipients.length; i += 1) {
      try {
        await sendDirectActionMessage({
          currentUserId,
          recipientId: recipients[i],
          content,
          actionData,
        });
      } catch {
        errored.push(recipients[i]);
      }
      setProgress({ done: i + 1, total: recipients.length });
    }

    setSending(false);
    setFailed(errored);
    if (errored.length === 0) {
      toast.success(
        recipients.length === 1
          ? "Notification sent"
          : `Sent ${recipients.length} notifications`,
      );
      setNote("");
      onClose();
    } else {
      toast.error(`${errored.length} of ${recipients.length} notifications failed`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Notify {recipients.length === 1 ? "owner" : `${recipients.length} people`}</DialogTitle>
          <DialogDescription>
            {target?.contextLabel
              ? `About drift on ${target.contextLabel}.`
              : "Send a drift notification."}{" "}
            They&apos;ll get a direct message with a link to review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Add a note (optional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything you want to add before the standard message…"
              rows={2}
              className="text-sm"
              disabled={sending}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Standard message (always included)
            </label>
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              {defaultBody}
            </div>
          </div>
          {failed.length > 0 && (
            <p className="text-xs text-destructive">
              Failed for {failed.length} recipient{failed.length !== 1 ? "s" : ""}. Press send to
              retry.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || recipients.length === 0} className="gap-1.5">
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progress ? `Sending ${progress.done}/${progress.total}` : "Sending…"}
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                {failed.length > 0 ? "Retry failed" : `Send${recipients.length > 1 ? ` (${recipients.length})` : ""}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
