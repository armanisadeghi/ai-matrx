"use client";

/**
 * GmailReviewCard — the Gmail consent surface (kind:"email_review").
 *
 * THIS CARD IS THE AUTHORIZATION. The agent proposed a message; nothing has
 * been sent, and nothing can be until the user presses Send here. Everything
 * that will leave their mailbox is on screen and editable: sender, recipient,
 * CC, subject, body. The send posts exactly what the fields hold at that
 * moment — never the agent's original arguments once the user has changed them.
 *
 * Deliberately absent: any "always send" affordance, any pre-checked consent,
 * and any path that sends without a click. Approval here covers ONE message.
 */

import { useState } from "react";
import { Send, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import {
  cancelPendingAsk,
  resolvePendingAsk,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import {
  cancelAskByCallId,
  resolveAskByCallId,
} from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import { EMPTY_ASK_RESPONSE } from "@/features/agents/ui-first-tools/tools/schemas";
import { AgentCardShell } from "@/features/agents/ui-first-tools/ui/AgentCardShell";
import { sendReviewedGmail } from "@/features/google-workspace/service";
import { splitMailboxField } from "@/features/crm/gmail/mailbox";
import {
  deliveredAddressDisagreement,
  reviewedSendNotices,
  reviewedSendOutcomeAsRecord,
  reviewedSendRefusalFixes,
  reviewedSendRefusalOf,
  type ReviewedGmailRefusal,
  type ReviewedGmailSendPlan,
} from "@/features/crm/gmail/reviewed-send-contract";
import { extractErrorMessage } from "@/utils/errors";
import { toast } from "@/lib/toast";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import {
  eligibleGoogleConnections,
  preferredGoogleConnectionId,
  rememberGoogleConnection,
} from "@/features/google-workspace/connection";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface GmailReviewCardProps {
  ask: PendingAsk;
  /**
   * 🚨 THE LAST GATE, RUN AGAINST WHAT IS ON THIS SCREEN.
   *
   * Every field here is editable and this card is what posts Send, so a caller
   * that checked its own draft checked a message that may no longer exist: the
   * recipient can be changed after the check passed. A caller with a gate
   * (the CRM's unsubscribe / blocklist / sending-standing authority) passes it
   * here, and it runs on the CURRENT to and cc immediately before the post.
   *
   * Return null to send; return a sentence to refuse — it is shown in place of
   * a send, and nothing leaves. Throwing refuses too, with the thrown message:
   * a gate that cannot be read is not a gate that said yes.
   *
   * Absent means there is no gate for this send (an agent asking to email an
   * address nobody in the CRM holds), not that one was skipped.
   */
  preflight?: (draft: {
    to: string;
    cc: string[];
    subject: string;
    body: string;
    connectionId: string;
  }) => Promise<string | null>;
  /**
   * 🚨 WHERE THE SERVER FILES THE SENT RECORD, DECIDED FROM THIS SCREEN.
   *
   * The server writes the `crm.interaction` row, its association edges and the
   * `crm.sending_event` from what this request carries — so the Person, the deal,
   * the contact point and each Cc's attribution have to be decided against the
   * recipients that are about to be sent to, not the draft this card opened with
   * (every field here is editable up to the click). A caller with a record passes
   * this; it is called immediately before the post.
   *
   * Absent means there is no record for this send (an agent asking to email an
   * address nobody in the CRM holds, the admin bench): the message is still gated
   * and still sent, the server records nothing, and it SAYS so in
   * `record_failure`, which this card shows.
   */
  plan?: (draft: { to: string; cc: string[] }) => ReviewedGmailSendPlan;
}

export function GmailReviewCard({ ask, preflight, plan }: GmailReviewCardProps) {
  const dispatch = useAppDispatch();
  const draft = ask.email;
  const inventory = useGoogleConnectionInventory();

  const [to, setTo] = useState(draft?.to ?? "");
  const [cc, setCc] = useState((draft?.cc ?? []).join(", "));
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The outbound authority's own 409, when that is what refused this send. */
  const [refusal, setRefusal] = useState<ReviewedGmailRefusal | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(() => draft?.connectionId ?? preferredGoogleConnectionId("gmail-send"));

  const mailboxes = eligibleGoogleConnections(
    inventory.data?.connections ?? [],
    "gmail-send",
    selectedConnectionId,
  );
  const selectedMailbox =
    mailboxes.find((mailbox) => mailbox.id === selectedConnectionId) ??
    mailboxes[0] ??
    null;

  // Defensive: an email_review ask always carries its draft.
  if (!draft) return null;

  const resolved = ask.status !== "pending";
  const edited =
    to !== draft.to ||
    cc !== draft.cc.join(", ") ||
    subject !== draft.subject ||
    body !== draft.body;
  const canSend = Boolean(
    selectedMailbox && to.trim().includes("@") && subject.trim() && body.trim(),
  );

  function selectMailbox(connectionId: string) {
    setSelectedConnectionId(connectionId);
    rememberGoogleConnection("gmail-send", connectionId);
  }

  function finish(response: Parameters<typeof resolveAskByCallId>[1]) {
    resolveAskByCallId(ask.callId, response);
    dispatch(
      resolvePendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  async function send() {
    if (!draft || !selectedMailbox || sending || !canSend) return;
    setSending(true);
    setError(null);
    setRefusal(null);
    /**
     * 🚨 ONE PARSER FOR A RECIPIENT FIELD (`features/crm/gmail/mailbox.ts`).
     * This card used to split on every comma, so `"Doe, John" <john@x.com>` —
     * the form every mail client prints — became two pieces that the send
     * authority could not read, and it fails CLOSED: the message was refused in
     * words that blamed the person's own address. `splitMailboxField` honours
     * quotes and angle brackets, and each piece keeps the form it was written in
     * (the gate and the server both parse it).
     */
    const ccList = splitMailboxField(cc);
    try {
      // THE GATE, on what is on screen right now, before anything is posted.
      if (preflight) {
        const gateRefusal = await preflight({
          to: to.trim(),
          cc: ccList,
          subject,
          body,
          connectionId: selectedMailbox.id,
        });
        if (gateRefusal) {
          setError(gateRefusal);
          setSending(false);
          return;
        }
      }
      // WHERE THE RECORD GOES, decided from the fields on THIS screen.
      const sendPlan = plan?.({ to: to.trim(), cc: ccList });
      // The exact bytes on screen — not the agent's arguments.
      const outcome = await sendReviewedGmail({
        connectionId: selectedMailbox.id,
        to: to.trim(),
        cc: ccList,
        subject,
        body,
        context: {
          // Null lets the transport resolve the viewer's own organization
          // context through the ONE fail-closed kernel — a send with no record.
          organizationId: null,
          ...(sendPlan?.context ?? {}),
          accountEmail: selectedMailbox.account_email,
        },
      });
      /**
       * 🚨 WHO GOOGLE ACTUALLY GOT, as the server's own parser read it (aidream
       * lane B-10, VERIFY-B1-B2-R2 N2). The server files the row against the
       * Person this card named, so if it delivered to a different address than
       * the one that was attributed, the row is on the wrong timeline and only a
       * sentence can say so — the browser no longer writes the row and cannot
       * correct it.
       */
      const delivered = outcome.to?.trim() ? outcome.to : null;
      if (delivered === null) {
        // 🚨 LAW 4: THE STAND-IN ANNOUNCES ITSELF, ON THE SCREEN THE PERSON IS
        // LOOKING AT — never only to devtools (VERIFY-B1-B2-R4 V6).
        toast.warning(
          "The server did not confirm the delivered address; this card reports " +
            "the address as typed, and the send could not be checked against " +
            "the record it was filed on — open the timeline to confirm it, and " +
            "refresh after the next server release.",
        );
      }
      /**
       * 🚨 EVERY GAP THE SERVER REPORTED IS SAID OUT LOUD, HERE, ONCE.
       *
       * The message has left and nothing unsends it: a row that did not land, a
       * `crm.sending_event` that does not exist (so a bounce can never be
       * correlated), a refused association edge, a recipient warning. This card is
       * on every send path, so it is the one place that cannot miss one.
       */
      if (sendPlan?.unattributed) toast.warning(sendPlan.unattributed);
      const disagreement = deliveredAddressDisagreement(
        outcome,
        sendPlan?.attributedAddress ?? null,
      );
      if (disagreement) toast.warning(disagreement);
      for (const notice of reviewedSendNotices(outcome)) {
        if (notice.level === "error") toast.error(notice.sentence);
        else toast.warning(notice.sentence);
      }
      finish({
        ...EMPTY_ASK_RESPONSE,
        confirmed: true,
        data: {
          // The server's own vocabulary, verbatim — this becomes the approval
          // row's receipt, and a second spelling of these facts would be a second
          // account of what happened.
          ...reviewedSendOutcomeAsRecord(outcome),
          to: delivered ?? to.trim(),
          cc: outcome.cc ?? ccList,
          subject,
          // 🚨 THE BODY IS PART OF THE RECEIPT: every field here is editable, so
          // the caller's original draft is NOT what left.
          body,
          edited,
          from_email: selectedMailbox.account_email,
        },
      });
    } catch (cause) {
      /**
       * 🚨 HTTP 409 `gmail_send_refused` — THE OUTBOUND AUTHORITY REFUSED A
       * RECIPIENT AND NOTHING WAS SENT. The gate runs before the provider write,
       * so this is not a failed send: it is a send that never happened, and the
       * authority's own blocks say which rule refused and how to fix it. Showing
       * only `extractErrorMessage` would drop every fix line a future server
       * stops concatenating into the sentence.
       */
      const refused = reviewedSendRefusalOf(cause);
      if (refused) {
        setRefusal(refused);
        setError(null);
      } else {
        setRefusal(null);
        setError(extractErrorMessage(cause));
      }
      setSending(false);
    }
  }

  function decline() {
    finish({ ...EMPTY_ASK_RESPONSE, confirmed: false });
  }

  function dismiss() {
    cancelAskByCallId(ask.callId);
    dispatch(
      cancelPendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        Nothing sends until you press Send.
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={decline} disabled={sending}>
          Don&apos;t send
        </Button>
        <Button size="sm" onClick={send} disabled={sending || !canSend}>
          <Send className="mr-1.5 h-4 w-4" />
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );

  return (
    <AgentCardShell
      tone="info"
      icon={Send}
      eyebrow="Review before sending"
      title={subject.trim() || "No subject"}
      subtitle={
        selectedMailbox?.account_email
          ? `From ${selectedMailbox.account_email} — your connected Google account`
          : "From your connected Google account"
      }
      onDismiss={dismiss}
      dismissLabel="Dismiss without sending"
      footer={footer}
      pending={resolved}
      aria-label="Review the email before sending"
    >
      <div className="flex flex-col gap-3">
        {selectedMailbox ? (
          <GoogleAccountSelect
            connections={mailboxes}
            connectionId={selectedMailbox.id}
            onConnectionChange={selectMailbox}
            label="Send from"
            disabled={sending || resolved}
          />
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">
            No connected Google account currently has Gmail sending access.
          </p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-to-${ask.callId}`}>To</Label>
          <Input
            id={`gmail-to-${ask.callId}`}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            disabled={sending}
            className="text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-cc-${ask.callId}`}>
            Cc <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`gmail-cc-${ask.callId}`}
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="Separate addresses with commas"
            disabled={sending}
            className="text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-subject-${ask.callId}`}>Subject</Label>
          <Input
            id={`gmail-subject-${ask.callId}`}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={sending}
            className="text-base"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-body-${ask.callId}`}>Message</Label>
          <ProTextarea
            id={`gmail-body-${ask.callId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            disabled={sending}
            className="text-base"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error} Nothing was sent.
            <ErrorAlchemyMenu error={error} />
          </p>
        ) : null}
        {refusal ? (
          <div className="rounded-md border border-red-600/40 bg-red-500/5 p-2 text-sm text-red-600 dark:text-red-400">
            <p>
              {refusal.userMessage}{" "}
              {refusal.sent
                ? "The server did not confirm that nothing was sent — check the mailbox's Sent folder."
                : "Nothing was sent."}
            </p>
            {reviewedSendRefusalFixes(refusal).length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {reviewedSendRefusalFixes(refusal).map((fix) => (
                  <li key={fix}>{fix}</li>
                ))}
              </ul>
            ) : null}
            <ErrorAlchemyMenu error={refusal.userMessage} />
          </div>
        ) : null}
        <a
          href="/user-settings/integrations/google-workspace"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground "
        >
          Manage or disconnect this Google account
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </AgentCardShell>
  );
}
