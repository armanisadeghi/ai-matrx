"use client";

/**
 * ConnectMailboxDialog — pick one of YOUR connected mailboxes.
 *
 * Two no-dead-ends rules are load-bearing here:
 *
 *   1. Mailboxes that CANNOT be used are still listed, with the reason and the
 *      way out. An account that silently disappears from a picker leaves the
 *      user certain they connected it and unable to find it.
 *   2. When there is nothing to pick at all, the empty state is a door to the
 *      integrations page — never the sentence "no mailboxes available".
 *
 * The address is not typed by hand: the server only accepts the address the
 * OAuth account actually authenticated as, so offering a free-text field would
 * be inviting a refusal.
 */

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2, Mail, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useConnectableMailboxes } from "@/features/crm/sending-identities/hooks";
import { createSendingIdentity } from "@/features/crm/sending-identities/service";

interface ConnectMailboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

export function ConnectMailboxDialog({
  open,
  onOpenChange,
  onConnected,
}: ConnectMailboxDialogProps) {
  const { mailboxes, loading, error } = useConnectableMailboxes(open);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function connect(connectionId: string, address: string) {
    setConnecting(connectionId);
    setFailure(null);
    try {
      await createSendingIdentity({
        connection_id: connectionId,
        from_address: address,
      });
      onConnected();
      onOpenChange(false);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(null);
    }
  }

  const usable = mailboxes?.filter((mailbox) => mailbox.can_send) ?? [];
  const blocked = mailboxes?.filter((mailbox) => !mailbox.can_send) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a mailbox</DialogTitle>
          <DialogDescription>
            Outreach will be sent from this mailbox, exactly as if you had
            written it yourself.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="space-y-2">
            {usable.map((mailbox) => (
              <button
                key={mailbox.connection_id}
                type="button"
                disabled={connecting !== null}
                onClick={() =>
                  void connect(mailbox.connection_id, mailbox.account_email)
                }
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40 disabled:opacity-60"
              >
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {mailbox.account_email}
                  </p>
                  {mailbox.account_name ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {mailbox.account_name}
                    </p>
                  ) : null}
                </div>
                {connecting === mailbox.connection_id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}

            {blocked.map((mailbox) => (
              <div
                key={mailbox.connection_id}
                className={cn(
                  "rounded-lg border border-border bg-muted/40 p-3",
                  "opacity-90",
                )}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {mailbox.account_email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mailbox.blocked_reason}
                    </p>
                  </div>
                  {mailbox.already_used ? null : (
                    <Button size="sm" variant="outline" className="shrink-0" asChild>
                      <Link href="/settings/integrations">Fix</Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {usable.length === 0 && blocked.length === 0 ? (
              <div className="space-y-3 rounded-lg border border-border p-5 text-center">
                <Plug className="mx-auto h-7 w-7 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    No Google mailbox connected yet
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    Connect the Google account whose mailbox you want your
                    outreach to come from, and allow it to send mail.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/settings/integrations">
                    Connect a Google account
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
