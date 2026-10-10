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

import { useRef, useState } from "react";
import { Send, ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "@ai-matrx/chat/agents/ui-first-tools/redux/pending-asks.slice";
import {
  cancelPendingAsk,
  resolvePendingAsk,
} from "@ai-matrx/chat/agents/ui-first-tools/redux/pending-asks.slice";
import {
  cancelAskByCallId,
  resolveAskByCallId,
} from "@ai-matrx/chat/agents/ui-first-tools/redux/ask-resolver-registry";
import { EMPTY_ASK_RESPONSE } from "@ai-matrx/chat/agents/ui-first-tools/tools/schemas";
import { AgentCardShell } from "@ai-matrx/chat/agents/ui-first-tools/ui/AgentCardShell";
import { reviewGmailDraft, sendReviewedGmail } from "@/features/google-workspace/service";
import { applyGoogleApproval } from "@/features/approvals/google-door";
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
import { isJsonObject } from "@/types/json";

interface GmailReviewCardProps {
  ask: PendingAsk;
  organizationId?: string | null;
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

export function GmailReviewCard({ ask, organizationId, preflight, plan }: GmailReviewCardProps) {
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

  type SaveAttempt = { fingerprint: string; operationId: string; approvalId?: string; state: "idle" | "busy" | "applying" | "saved" | "uncertain" };
  const attemptRef = useRef<SaveAttempt | null>(null);
  const [saveAttempt, setSaveAttempt] = useState<SaveAttempt | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allConnections = inventory.data?.connections ?? [];
  const mailboxes = [
    ...eligibleGoogleConnections(allConnections, "gmail-send", selectedConnectionId),
    ...eligibleGoogleConnections(allConnections, "gmail-draft", selectedConnectionId).filter(
      (entry) => !eligibleGoogleConnections(allConnections, "gmail-send", selectedConnectionId).some((send) => send.id === entry.id),
    ),
  ];
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
  const hasSendGrant = Boolean(selectedMailbox && eligibleGoogleConnections(allConnections, "gmail-send", selectedMailbox.id).some((entry) => entry.id === selectedMailbox.id));
  const hasDraftGrant = Boolean(selectedMailbox && eligibleGoogleConnections(allConnections, "gmail-draft", selectedMailbox.id).some((entry) => entry.id === selectedMailbox.id));
  const complete = Boolean(to.trim().includes("@") && subject.trim() && body.trim());
  const canSend = hasSendGrant && complete;
  const canSave = hasDraftGrant && complete;
  const saveFingerprint = JSON.stringify([selectedMailbox?.id, to.trim(), splitMailboxField(cc), subject, body]);
  const currentSave = saveAttempt?.fingerprint === saveFingerprint ? saveAttempt : null;

  function publishAttempt(next: SaveAttempt) {
    attemptRef.current = next;
    setSaveAttempt(next);
  }

  function readSaveReceipt(
    reply: Awaited<ReturnType<typeof applyGoogleApproval>>,
    attempt: SaveAttempt,
    approvalId: string,
  ) {
    const receipt = reply.receipt;
    const output = receipt.output;
    if (receipt.state === "applied" && isJsonObject(output) && output.__kind === "gmail_draft_saved" && typeof output.draft_id === "string" && typeof output.message_id === "string" && typeof output.account_email === "string") {
      publishAttempt({ ...attempt, approvalId, state: "saved" });
    } else if (receipt.state === "applied_unconfirmed") {
      publishAttempt({ ...attempt, approvalId, state: "uncertain" });
    } else if (receipt.state === "applying") {
      publishAttempt({ ...attempt, approvalId, state: "applying" });
    } else {
      publishAttempt({ ...attempt, approvalId, state: "idle" });
      setSaveError(reply.sentence ?? "Gmail could not save this draft. Try again.");
    }
  }

  async function checkDraftStatus() {
    const attempt = attemptRef.current;
    if (!attempt?.approvalId || attempt.fingerprint !== saveFingerprint || attempt.state === "busy") return;
    publishAttempt({ ...attempt, state: "busy" });
    setSaveError(null);
    try {
      // The approval id is the door's idempotency key. Never prepare a new row.
      const reply = await applyGoogleApproval(attempt.approvalId);
      readSaveReceipt(reply, attempt, attempt.approvalId);
    } catch (cause) {
      publishAttempt({ ...attempt, state: "uncertain" });
      setSaveError(extractErrorMessage(cause));
    }
  }

  async function saveDraft() {
    if (!selectedMailbox || !canSave || resolved || sending || attemptRef.current?.state === "busy") return;
    const existing = attemptRef.current?.fingerprint === saveFingerprint ? attemptRef.current : null;
    if (existing?.state === "saved" || existing?.state === "uncertain" || existing?.state === "applying") return;
    const attempt: SaveAttempt = existing ?? { fingerprint: saveFingerprint, operationId: crypto.randomUUID(), state: "idle" };
    publishAttempt({ ...attempt, state: "busy" });
    setSaveError(null);
    try {
      const reviewed = attempt.approvalId ? null : await reviewGmailDraft({
        operationId: attempt.operationId,
        connectionId: selectedMailbox.id,
        organizationId: organizationId ?? null,
        to: to.trim(), cc: splitMailboxField(cc), subject, body,
      });
      const approvalId = attempt.approvalId ?? reviewed?.approvalId;
      if (!approvalId) throw new Error("Gmail did not identify the reviewed draft.");
      publishAttempt({ ...attempt, approvalId, state: "busy" });
      const reply = await applyGoogleApproval(approvalId);
      readSaveReceipt(reply, attempt, approvalId);
    } catch (cause) {
      // A lost prepare response keeps the same operation id for an explicit retry.
      // A lost apply response is uncertain: never blindly repeat a provider write.
      publishAttempt({ ...attempt, state: attemptRef.current?.approvalId ? "uncertain" : "idle", approvalId: attemptRef.current?.approvalId });
      setSaveError(extractErrorMessage(cause));
    }
  }

  function selectMailbox(connectionId: string) {
    setSelectedConnectionId(connectionId);
    if (eligibleGoogleConnections(allConnections, "gmail-send", connectionId).some((entry) => entry.id === connectionId)) rememberGoogleConnection("gmail-send", connectionId);
    if (eligibleGoogleConnections(allConnections, "gmail-draft", connectionId).some((entry) => entry.id === connectionId)) rememberGoogleConnection("gmail-draft", connectionId);
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
        <Button variant="quiet" onClick={decline} disabled={sending}>
          Don&apos;t send
        </Button>
        <Button icon={<Save />} variant="outline" onClick={saveDraft} disabled={!canSave || sending || resolved || currentSave?.state === "busy" || currentSave?.state === "applying" || currentSave?.state === "saved" || currentSave?.state === "uncertain"}>
          {currentSave?.state === "busy" || currentSave?.state === "applying" ? "Saving…" : currentSave?.state === "saved" ? "Saved" : "Save to Gmail"}
        </Button>
        {(currentSave?.state === "applying" || currentSave?.state === "uncertain") && currentSave.approvalId ? (
          <Button variant="quiet" onClick={checkDraftStatus} disabled={sending || resolved}>Check status</Button>
        ) : null}
        <Button icon={<Send />} variant="primary" onClick={send} disabled={sending || !canSend}>
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
            label="Google account"
            disabled={sending || resolved}
          />
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">
            No connected Google account has Gmail send or draft access.
          </p>
        )}
        {selectedMailbox && !hasDraftGrant ? <p className="text-xs text-muted-foreground">This account lacks Gmail draft access.</p> : null}
        {selectedMailbox && !hasSendGrant ? <p className="text-xs text-muted-foreground">This account cannot send Gmail.</p> : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-to-${ask.callId}`}>To</Label>
          <Input
            id={`gmail-to-${ask.callId}`}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            disabled={sending}
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
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`gmail-subject-${ask.callId}`}>Subject</Label>
          <Input
            id={`gmail-subject-${ask.callId}`}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={sending}
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
        {currentSave?.state === "saved" ? <p className="text-xs text-muted-foreground">Saved in Gmail Drafts.</p> : null}
        {saveAttempt?.state === "saved" && !currentSave ? <p className="text-xs text-muted-foreground">Current edits are unsaved.</p> : null}
        {currentSave?.state === "uncertain" ? <p className="text-xs text-warning">Check Gmail Drafts before trying again. <ErrorAlchemyMenu input={{ message: saveError ?? "Gmail draft status is uncertain." }} /></p> : null}
        {currentSave?.state === "applying" ? <p className="text-xs text-muted-foreground">Gmail is saving this draft.</p> : null}
        {saveError && currentSave?.state !== "uncertain" && currentSave ? <p className="text-xs text-destructive">{saveError} <ErrorAlchemyMenu error={saveError} /></p> : null}
        {refusal ? (
          <div className="rounded-md border border-red-600/40 bg-red-500/5 p-2 text-sm text-red-600 dark:text-red-400">
            <p>
              {refusal.userMessage}{" "}
              {refusal.sent
                ? "Delivery is unconfirmed; check the Sent folder."
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
