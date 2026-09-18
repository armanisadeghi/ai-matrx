"use client";

/**
 * ConnectMailboxDialog — pick one of YOUR connected mailboxes, or connect a
 * NEW Google account without leaving the dialog.
 *
 * Four no-dead-ends rules are load-bearing here:
 *
 *   0. A mailbox a reviewed one-to-one send RECORDED FOR AUDIT is its own state.
 *      It is connectable — picking it makes it a campaign mailbox as well, keeping
 *      everything it has already sent — and it is offered with the consequence
 *      stated first, because domain proof, warm-up and reading that mailbox's
 *      incoming mail all begin there. It used to arrive as `already_used` with the
 *      sentence "This mailbox is already set up as a sending identity": false, and
 *      a dead end our own bookkeeping created, while the server's own
 *      `create_identity` would have promoted it (VERIFY-B1-B2-R5 W1).
 *   1. Mailboxes that CANNOT be used are still listed, with the reason and the
 *      way out. An account that silently disappears from a picker leaves the
 *      user certain they connected it and unable to find it.
 *   2. "Connect a different Google account" is ALWAYS offered — not only in
 *      the empty state. The bug this fixed: a user with two connected accounts
 *      who wanted to send from a THIRD had no door at all (2026-08-16, hit by
 *      Arman on the first real bring-up).
 *   3. When there is nothing to pick at all, the empty state is that same
 *      connect action — never the sentence "no mailboxes available".
 *
 * The address is not typed by hand: the server only accepts the address the
 * OAuth account actually authenticated as, so offering a free-text field would
 * be inviting a refusal. Adding a new account goes through Google's own
 * account chooser (`select_account: true` in the provider), which is where
 * "use another account" lives.
 */

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  FileClock,
  Loader2,
  Mail,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { GOOGLE_WORKSPACE_SEND_SCOPES } from "@/lib/googleScopes";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { connectGoogle } from "@/features/marketing/google/service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useConnectableMailboxes } from "@/features/crm/sending-identities/hooks";
import { createSendingIdentity } from "@/features/crm/sending-identities/service";
import type {
  ConnectableMailbox,
  SendingIdentityDetail,
} from "@/features/crm/sending-identities/types";
import {
  PROMOTE_TO_CAMPAIGNS_CONFIRM_LABEL,
  PROMOTE_TO_CAMPAIGNS_CONSEQUENCE,
  PROMOTE_TO_CAMPAIGNS_TITLE,
  connectableStateOf,
} from "@/features/crm/sending-identities/purpose";

interface ConnectMailboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Receives the identity the server just created, so the mount site can make
   * success unmistakable — navigate to its setup steps, highlight it, toast it.
   * A connect that lands silently at the bottom of a list reads as a failure
   * to the person who just did it (Arman, 2026-08-16).
   */
  onConnected: (identity: SendingIdentityDetail) => void;
}

export function ConnectMailboxDialog(props: ConnectMailboxDialogProps) {
  // The Google provider is mounted lazily and only while the dialog is open,
  // exactly like GoogleWorkspaceReviewRoot does — the CRM page itself never
  // pays for the Google script.
  if (!props.open) return null;
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_WORKSPACE_SEND_SCOPES]}>
      <ConnectMailboxDialogBody {...props} />
    </LazyGoogleAPIProvider>
  );
}

function ConnectMailboxDialogBody({
  open,
  onOpenChange,
  onConnected,
}: ConnectMailboxDialogProps) {
  const { mailboxes, loading, error, reload } = useConnectableMailboxes(open);
  const google = useGoogleAPI();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * A CORRESPONDENCE MAILBOX IS PROMOTED, NOT REFUSED (VERIFY-B1-B2-R5 W1).
   *
   * The same `createSendingIdentity` call does it — the server's
   * `register_identity` flips `purpose` to `outreach` in place and keeps every
   * event the mailbox already wrote. What is different is that a person is told
   * what turns on FIRST, because domain proof, warm-up and reading that
   * mailbox's incoming mail all begin here.
   */
  async function promote(connectionId: string, address: string) {
    const ok = await confirm({
      title: PROMOTE_TO_CAMPAIGNS_TITLE,
      description: PROMOTE_TO_CAMPAIGNS_CONSEQUENCE,
      confirmLabel: PROMOTE_TO_CAMPAIGNS_CONFIRM_LABEL,
    });
    if (!ok) return;
    await connect(connectionId, address);
  }

  async function connect(connectionId: string, address: string) {
    setConnecting(connectionId);
    setFailure(null);
    try {
      const identity = await createSendingIdentity({
        connection_id: connectionId,
        from_address: address,
      });
      onConnected(identity);
      onOpenChange(false);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(null);
    }
  }

  /**
   * Connect a Google account that is not on the list yet. Google's own
   * account chooser opens (the provider passes `select_account: true`), the
   * user picks or adds any account, we exchange the code server-side, and the
   * list reloads with the new mailbox ready to pick.
   */
  async function addGoogleAccount() {
    setAddingAccount(true);
    setFailure(null);
    try {
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_WORKSPACE_SEND_SCOPES,
      ]);
      await connectGoogle(code, { type: "user" });
      toast.success("Google account connected — pick it below.");
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Closing Google's popup is a decision, not an error worth shouting.
      if (!message.includes("closed before it finished")) {
        setFailure(message);
      }
    } finally {
      setAddingAccount(false);
    }
  }

  /**
   * 🚨 THE THREE STATES, decided by the server's own words
   * (`features/crm/sending-identities/purpose.ts`): usable, a correspondence
   * mailbox that may be promoted, and genuinely blocked. `can_send` alone put a
   * correspondence mailbox in the blocked list under the sentence "This mailbox
   * is already set up as a sending identity" — false, and a dead end our own
   * bookkeeping created, while the server would have promoted it (W1).
   */
  const rows = (mailboxes ?? []).map((mailbox) => ({
    mailbox,
    state: connectableStateOf(mailbox),
  }));
  const usable = rows.filter((row) => row.state.kind === "connectable");
  const promotable = rows.filter(
    (row) => row.state.kind === "recorded_for_audit",
  );
  const blocked = rows.filter((row) => row.state.kind === "blocked");
  const empty = rows.length === 0;

  function pickable(
    mailbox: ConnectableMailbox,
    promoting: boolean,
    sentence?: string,
  ) {
    return (
      <button
        key={mailbox.connection_id}
        type="button"
        disabled={connecting !== null || addingAccount}
        onClick={() =>
          void (promoting
            ? promote(mailbox.connection_id, mailbox.account_email)
            : connect(mailbox.connection_id, mailbox.account_email))
        }
        className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40 disabled:opacity-60"
      >
        {promoting ? (
          <FileClock className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {mailbox.account_email}
          </p>
          {promoting ? (
            /* The SERVER's own sentence about what this mailbox is and what
               picking it does — never re-worded here. */
            <p className="text-xs text-muted-foreground">{sentence}</p>
          ) : mailbox.account_name ? (
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
    );
  }

  const addAccountButton = (
    <Button
      variant={empty ? "default" : "outline"}
      className="w-full"
      disabled={addingAccount || connecting !== null}
      onClick={() => void addGoogleAccount()}
    >
      {addingAccount ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="mr-1.5 h-3.5 w-3.5" />
      )}
      Connect a different Google account
    </Button>
  );

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
            {usable.map((row) => pickable(row.mailbox, false))}

            {promotable.map((row) =>
              pickable(
                row.mailbox,
                true,
                row.state.kind === "recorded_for_audit"
                  ? row.state.sentence
                  : undefined,
              ),
            )}

            {blocked.map(({ mailbox, state }) => (
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
                      {/* Never silence: `connectableStateOf` supplies a sentence
                          even when the server sent no reason at all. */}
                      {state.kind === "blocked" ? state.sentence : null}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {empty ? (
              <div className="space-y-3 rounded-lg border border-border p-5 text-center">
                <Mail className="mx-auto h-7 w-7 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    No Google mailbox connected yet
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    Connect the Google account whose mailbox you want your
                    outreach to come from, and allow it to send mail.
                  </p>
                </div>
                {addAccountButton}
              </div>
            ) : (
              addAccountButton
            )}
          </div>
        )}

        {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
