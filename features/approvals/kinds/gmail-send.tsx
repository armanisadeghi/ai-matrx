"use client";

/**
 * `gmail_send` — one message an agent drafted, waiting for the person who may
 * send it.
 *
 * 🚨 THIS KIND OWNS NO REVIEW UI AND NO SENDER. The product already has the
 * surface that reviews a Gmail message before it leaves —
 * `features/google-workspace/agent/GmailReviewCard.tsx`, where every field is
 * editable, the send posts exactly the bytes on screen, and approval covers ONE
 * message. That card IS this item's body, mounted through `individualReview`
 * (so the row is never part of a batch and has no bare Approve), and its own
 * Send is what sends. A second review screen here would drift from that one and
 * one of them would then be lying.
 *
 * 🚨 AND IT NEVER REACHES GMAIL BEFORE THE OUTBOUND SPINE (chair ruling,
 * 2026-09-17). `crm.check_send_eligibility` — reached through
 * `features/crm/compliance/service.ts`, the ONE send authority, which holds the
 * unsubscribe suppressions, the blocklist, the jurisdiction verdict and the
 * identity's standing — runs BEFORE the card is offered. A blocked recipient
 * gets the verdict's own sentences and fixes and no card at all, because the
 * card's Send button cannot be gated from here: it posts straight to the
 * reviewed-send endpoint by design.
 *
 * Mode: Gmail send is human-confirmed per message, for everyone, and is NOT a
 * knob (google-native PLAN §4.4). `mode.ts` holds that as a constant with the
 * reason, and a row that claims any other mode is shown as the defect it is
 * rather than being obeyed.
 */

import { useEffect } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { checkSendEligibility } from "@/features/crm/compliance/service";
import {
  narrowGmailSendReceipt,
  recordGmailSendInteraction,
} from "@/features/crm/gmail/service";
import { preflightGmailRecipients } from "@/features/crm/gmail/preflight";
import { assessGmailRecipientIntegrity } from "@/features/crm/gmail/recipient-integrity";
import type { EligibilityVerdict } from "@/features/crm/compliance/types";
import { GmailReviewCard } from "@/features/google-workspace/agent/GmailReviewCard";
import type { PendingAsk } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { registerAskResolver } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { Json } from "@/types/database.types";
import { toast } from "@/lib/toast";
import {
  listPendingProposals,
  recordApprovalDecision,
  type ApprovalProposal,
} from "../data";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalScope,
  ApprovalSource,
  AutonomyMode,
} from "../types";

const KIND_ID = "gmail_send";
const QUERY_KEY = ["approvals", KIND_ID] as const;

/**
 * What a proposer puts in `payload`. The `__kind` marker travels with it like
 * everything else stored (THE KIND-MARKER LAW) and is read, never stripped.
 */
export const GMAIL_SEND_PAYLOAD_KIND = "gmail_send_proposal";

export interface GmailSendPayload {
  __kind: typeof GMAIL_SEND_PAYLOAD_KIND;
  /** The connected Google account the draft was composed against. */
  connectionId: string;
  fromEmail: string | null;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  /**
   * The recipient's CRM contact point, when the recipient IS one. It is what
   * lets the outbound spine answer "may we contact this address right now?" —
   * unsubscribes and blocklists are recorded against the medium, not a string.
   */
  recipientMediumId?: string | null;
  /** The outreach list this message belongs to, when it belongs to one. */
  listId?: string | null;
  /** The sending identity, when the proposer chose one. */
  identityId?: string | null;
  /**
   * WHO THE SENT RECORD BELONGS TO (google-native PLAN §4.4). Without it an
   * approved message leaves and nothing on the Person's timeline ever says so —
   * which is the entire reason to send from a CRM at all. A proposer that
   * cannot name a party simply omits it and the message is recorded nowhere,
   * loudly, rather than on the wrong record.
   */
  partyId?: string | null;
  organizationId?: string | null;
  dealId?: string | null;
  contactPointId?: string | null;
}

function isRecord(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** Narrowed at run time — a malformed payload is reported, never rendered. */
export function narrowGmailSendPayload(
  payload: Json,
): GmailSendPayload | null {
  if (!isRecord(payload)) return null;
  if (payload.__kind !== GMAIL_SEND_PAYLOAD_KIND) return null;
  const { connectionId, to, subject, body } = payload;
  if (
    typeof connectionId !== "string" ||
    typeof to !== "string" ||
    typeof subject !== "string" ||
    typeof body !== "string"
  ) {
    return null;
  }
  return {
    __kind: GMAIL_SEND_PAYLOAD_KIND,
    connectionId,
    fromEmail: typeof payload.fromEmail === "string" ? payload.fromEmail : null,
    to,
    cc: stringArray(payload.cc),
    subject,
    body,
    recipientMediumId:
      typeof payload.recipientMediumId === "string"
        ? payload.recipientMediumId
        : null,
    listId: typeof payload.listId === "string" ? payload.listId : null,
    identityId:
      typeof payload.identityId === "string" ? payload.identityId : null,
    partyId: typeof payload.partyId === "string" ? payload.partyId : null,
    organizationId:
      typeof payload.organizationId === "string"
        ? payload.organizationId
        : null,
    dealId: typeof payload.dealId === "string" ? payload.dealId : null,
    contactPointId:
      typeof payload.contactPointId === "string"
        ? payload.contactPointId
        : null,
  };
}

/**
 * GMAIL SEND IS HUMAN-CONFIRMED PER MESSAGE, ALWAYS, FOR EVERYONE — and that is
 * NOT a knob (google-native PLAN §4.4 "Not a knob"). The send path
 * (`GmailReviewCard` → `sendReviewedGmail`) has no code that can send without a
 * click, so declaring anything else would be a control that governs nothing.
 *
 * It lives here, beside the one kind it describes, because
 * `features/approvals/mode.ts` was DELETED on 2026-09-17: that module
 * implemented the whole five-mode ladder for the browser (`HITL_KNOBS`,
 * `resolveHitlMode`, `useHitlMode`, `useHitlModeSentence`,
 * `useHitlReviewTimeoutHours`) and a repo-wide search found NO consumer of any
 * of it, while the browser wrote to Google through four ungated routes — so the
 * knob a person's own writes would obey governed nothing (round-2 hostile
 * verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-vii). THE SERVER now
 * resolves the mode and answers 202 with a filed proposal when review is
 * required (`features/google-workspace/service.ts` → `GoogleWriteOutcome`), so a
 * second ladder in the browser would be a second opinion about who may write.
 * This constant is the one thing that module held which was never a read.
 */
export const GMAIL_SEND_MODE: AutonomyMode = "mode_4";

/**
 * THE DRAFT'S IDENTITY — every field the review card and the timeline write
 * read, in one comparable string.
 *
 * It is what makes a re-proposal a NEW card: the host keys
 * `GmailApprovalBody` on it, so React remounts instead of leaving a card whose
 * editable state was seeded from a draft that no longer exists. Derived from
 * the narrowed payload (fixed key order), never a hand-listed subset — a field
 * a future proposer adds is in the identity the moment it exists.
 */
export function gmailPayloadFingerprint(payload: GmailSendPayload): string {
  const json = JSON.stringify(payload);
  // Hashed, not the whole JSON: the fingerprint is now part of an ask CALL ID
  // (see `gmailApprovalCallId`), which travels through Redux actions and the
  // draft registry. djb2 over the exact bytes — same input, same identity.
  let hash = 5381;
  for (let index = 0; index < json.length; index += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * THE ASK IDENTITY OF ONE PROPOSAL VERSION — the assist id AND the draft's
 * fingerprint.
 *
 * 🚨 IT IS NOT THE ASSIST ID ALONE (Bugbot round 9, finding 8). The card
 * resolves through the module-level ask-resolver registry, keyed by call id, and
 * `registerAskResolver` OVERWRITES. A re-proposal under the same dedupe key
 * replaces the payload on the same assist id, so the card remounts and registers
 * a new resolver — under the same key. An in-flight Send from the OLD card then
 * resolved that key and ran the NEW card's resolver: the new draft was recorded
 * as approved, and its receipt written to the timeline, for a message that was
 * never sent. One identity per proposal VERSION closes that door; the version
 * that goes away leaves a REFUSAL behind it rather than a silent hand-off (see
 * `GmailApprovalBody`).
 */
export function gmailApprovalCallId(
  assistId: string,
  payload: GmailSendPayload,
): string {
  return `approval:${assistId}:${gmailPayloadFingerprint(payload)}`;
}

/**
 * Put the approved message on the CRM record's timeline.
 *
 * Calls the ONE writer (`features/crm/gmail/service.ts`) — the same one the
 * compose window uses — so an agent's sent message and a person's sent message
 * are the same kind of row, with the same fields, on the same timeline. The
 * difference is only what this path can fill in: who drafted it, which run,
 * and which queue row the approval was recorded in.
 *
 * A proposal that names no party is NOT recorded silently. The queue says so,
 * because the alternative is a message that left with no trace in the CRM.
 */
async function recordProposalOnTimeline(
  payload: GmailSendPayload,
  proposal: ApprovalProposal,
  responseData: unknown,
  approverId: string | null,
): Promise<void> {
  if (!payload.partyId || !payload.organizationId) {
    toast.warning(
      "The message was sent, but the draft did not say which record it belongs to, so nothing was added to a timeline. Log it by hand.",
    );
    return;
  }
  // 🚨 WHAT THE CARD SENT, never the proposal's draft. Every field on that card
  // is editable up to the click, so a record built from the payload can attest
  // to a message nobody received (Bugbot HIGH #1, 2026-09-17).
  const receipt = narrowGmailSendReceipt(responseData, payload.connectionId);
  if (!receipt) {
    toast.error(
      "The message was sent but Gmail's message id did not come back, so it could not be recorded on the timeline.",
    );
    return;
  }

  /**
   * 🚨 A CHANGED RECIPIENT IS A DIFFERENT PERSON UNTIL SOMETHING PROVES
   * OTHERWISE (Bugbot MEDIUM, frontend PR 228).
   *
   * The rule, the comparison and the sentence all live in ONE primitive —
   * `features/crm/gmail/recipient-integrity.ts` — because this path had the
   * guard and the compose panel did not, and the compose panel therefore
   * recorded a stranger's message on the open record's timeline (VERIFY-B1-B2
   * D1). This file's private copy is deleted; both consumers call the same
   * function, so the two paths cannot drift again.
   *
   * The proposal's `partyId` is the party the PROPOSED address belonged to, so
   * the proposed address is what authorizes the row. Written to no timeline is a
   * loss a person can repair (the toast says so and carries the address); a
   * false row on a customer's history is a loss nobody can see to repair.
   */
  const integrity = assessGmailRecipientIntegrity({
    sentTo: receipt.to,
    source: {
      kind: "proposal",
      proposedAddress: payload.to,
      contactPointId: payload.contactPointId ?? null,
      mediumId: payload.recipientMediumId ?? null,
    },
  });
  if (!integrity.recordOnRecord) {
    toast.warning(integrity.refusal);
    return;
  }

  const result = await recordGmailSendInteraction({
    receipt,
    association: {
      partyId: payload.partyId,
      organizationId: payload.organizationId,
      dealId: payload.dealId ?? null,
      contactPointId: integrity.contactPointId,
      mediumId: integrity.mediumId,
    },
    approvedByUserId: approverId,
    draftedBy: {
      agentId: proposal.proposerAgentId,
      runId: proposal.proposerRunId,
      label: proposal.proposerLabel,
      assistId: proposal.assist.id,
    },
  });

  if (result.failure) {
    // The message HAS LEFT. Never swallowed, never retried on its own — and the
    // writer already turned the database's refusal into a sentence with its
    // remedy, so no raw Postgres text reaches a person here.
    toast.error(result.failure);
  }
  // The row is true even when one of its "Associated with" edges did not land.
  for (const missing of result.associationFailures) {
    toast.warning(missing);
  }
}

/**
 * The card, wired to record the decision the moment it resolves.
 *
 * The card resolves through the ask-resolver registry (that is how it reports
 * what it sent), so this wrapper registers a resolver for a synthetic call id
 * belonging to this proposal. Sent → the row is approved and carries the
 * message id as its receipt; declined → rejected. Nothing here sends anything;
 * the card does, with the bytes on its own screen.
 */
function GmailApprovalBody({
  proposal,
  payload,
  onDecided,
}: {
  proposal: ApprovalProposal;
  payload: GmailSendPayload;
  onDecided: () => void;
}) {
  const approverId = useAppSelector(selectUserId);
  /**
   * 🚨 WHICH DRAFT THIS CARD IS REVIEWING — the identity the effect and the
   * host's `key` both use (Bugbot MEDIUM, frontend PR 228).
   *
   * A re-proposal under the same dedupe key REPLACES the payload on the same
   * assist id. Keyed on the id alone, the row headline updated from the new
   * draft while this card kept the first one in its own editable state and the
   * resolver closed over the first payload: Send could post a message the queue
   * was no longer showing, and record it against the superseded draft.
   */
  const payloadFingerprint = gmailPayloadFingerprint(payload);
  // ONE IDENTITY PER PROPOSAL VERSION (Bugbot round 9 #8).
  const callId = gmailApprovalCallId(proposal.assist.id, payload);

  useEffect(() => {
    /**
     * Did THIS version resolve? If it did not, and it is going away, the id it
     * owned must not be left un-owned: a Send already in flight would then
     * resolve nothing and the message would leave with no record at all. So the
     * cleanup replaces the resolver with a REFUSAL that screams (below).
     */
    let resolvedHere = false;
    registerAskResolver(callId, (response) => {
      resolvedHere = true;
      void (async () => {
        try {
          if (response.confirmed === true) {
            const receipt = (response.data ?? null) as Json;
            await recordApprovalDecision(
              proposal.assist.id,
              "approved",
              null,
              receipt,
            );
            toast.success("Sent, and recorded as approved by you.");
            // 🚨 AND ONTO THE RECORD'S TIMELINE, through the ONE writer the
            // compose window uses (`features/crm/gmail/service.ts`). An agent
            // draft that leaves without a sent record is the anti-pattern the
            // plan names by name: the message exists and the CRM never heard
            // of it.
            await recordProposalOnTimeline(
              payload,
              proposal,
              response.data,
              approverId ?? null,
            );
          } else if (response.confirmed === false) {
            await recordApprovalDecision(
              proposal.assist.id,
              "rejected",
              "Declined in the review card.",
            );
          } else {
            // Dismissed without a decision: the proposal stays waiting. Saying
            // so beats a card that vanishes and leaves the person guessing.
            toast.info("Still waiting on you — nothing was sent.");
          }
        } catch (error) {
          // The message may already have LEFT. Never swallow this.
          toast.error(
            "The send finished but the approval record did not save — this proposal may still look like it is waiting.",
            {
              description:
                error instanceof Error ? error.message : String(error),
            },
          );
        }
        onDecided();
      })();
    });
    return () => {
      // Unmounting is not a decision; this version simply stops being the one on
      // screen. But a Send may already be in flight from the card that is going
      // away, so the id it owned keeps an owner — one that RECORDS NOTHING and
      // says so loudly. Never a silent approve of a draft nobody is looking at.
      if (resolvedHere) return;
      registerAskResolver(callId, (response) => {
        if (response.confirmed !== true) return;
        console.error(
          `[approvals] a Gmail send resolved for proposal version ${callId}, which is no longer on screen — the proposal was NOT recorded as approved`,
        );
        toast.error(
          "A message was sent from a draft this queue has since replaced, so it was NOT recorded as approved and nothing was written to the record's timeline.",
          {
            description:
              "Check the sent folder for that message and log it by hand; the proposal is still waiting on you.",
          },
        );
      });
    };
    // The fingerprint is a dependency, not a decoration: the resolver closes
    // over `payload`, and a stale closure records the wrong draft.
  }, [callId, proposal.assist.id, payloadFingerprint]);

  const ask: PendingAsk = {
    callId,
    // There is no conversation behind a durable proposal — the run that drafted
    // it is long gone. The proposal's own id stands in, so the Redux actions the
    // card dispatches address a real, unique key instead of a fake chat.
    conversationId: `approval:${proposal.assist.id}`,
    toolName: "approval_queue",
    kind: "email_review",
    status: "pending",
    createdAtMs: Date.parse(proposal.assist.createdAt) || Date.now(),
    email: {
      connectionId: payload.connectionId,
      fromEmail: payload.fromEmail,
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      body: payload.body,
    },
  };

  return (
    <GmailReviewCard
      ask={ask}
      /* THE LAST GATE, at Send time, on the card's own recipient. The queue
         checked the address the PROPOSAL named; the approver can change it
         before pressing Send, and a suppressed address must not slip in that
         way. Same medium -> re-check and fail closed; a different address has
         no contact point to look up and is reported on the record instead. */
      preflight={(draft) =>
        /* THE LAST GATE, at Send time, on the card's own recipients — the ONE
           preflight both send paths use (`features/crm/gmail/preflight.ts`).
           EVERY address is asked about, To and Cc: an address the proposal did
           not name is resolved against the organization's own contact mediums,
           where the unsubscribes and the blocklist actually live, instead of
           being waved through (VERIFY-B1-B2 D2). It fails CLOSED. */
        preflightGmailRecipients({
          to: draft.to,
          cc: draft.cc,
          options: payload.recipientMediumId
            ? [
                {
                  address: payload.to,
                  contactPointId: payload.contactPointId ?? "",
                  mediumId: payload.recipientMediumId,
                  label: null,
                  isPrimary: true,
                  warning: null,
                },
              ]
            : [],
          organizationId: payload.organizationId ?? null,
          listId: payload.listId ?? null,
          identityId: payload.identityId ?? null,
        })
      }
    />
  );
}

/** The spine's verdict, rendered as its own sentences and fixes. */
function BlockedBySpine({ verdict }: { verdict: EligibilityVerdict }) {
  return (
    <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2">
      <p className="text-xs font-medium text-foreground">
        This message cannot be sent to that address right now, so it is not
        offered for sending.
      </p>
      {verdict.blocks.map((block) => (
        <p key={block.code} className="break-words text-[11px]">
          <span className="text-foreground">{block.message}</span>{" "}
          <span className="text-muted-foreground">{block.fix}</span>
        </p>
      ))}
    </div>
  );
}

interface GmailItem extends ApprovalItem {
  proposal: ApprovalProposal;
}

function useSource(scope: ApprovalScope): ApprovalSource {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();

  const pending = useQuery({
    queryKey: [...QUERY_KEY, userId],
    queryFn: () => listPendingProposals(userId ?? "", gmailSendKind, scope),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const proposals = pending.data?.proposals ?? [];

  /**
   * The outbound spine, per recipient — the pre-send gate, not a decoration.
   * One query per proposal so a slow or failing check on one message never
   * decides anything about another, and a FAILED check never reads as allowed.
   */
  const verdicts = useQueries({
    queries: proposals.map((proposal) => {
      const payload = narrowGmailSendPayload(proposal.payload);
      const mediumId = payload?.recipientMediumId ?? null;
      return {
        queryKey: ["approvals", KIND_ID, "eligibility", proposal.assist.id],
        queryFn: () =>
          checkSendEligibility({
            mediumId: mediumId ?? "",
            listId: payload?.listId ?? null,
            identityId: payload?.identityId ?? null,
          }),
        enabled: Boolean(mediumId),
        staleTime: 60_000,
      };
    }),
  });

  const refetch = () => {
    void pending.refetch();
    void client.invalidateQueries({ queryKey: QUERY_KEY });
  };

  // The callback's return is annotated because each branch returns a different
  // literal shape; without it TypeScript infers a union of arrays and refuses.
  const items: GmailItem[] = proposals.flatMap((proposal, index): GmailItem[] => {
    const payload = narrowGmailSendPayload(proposal.payload);
    const recipients = payload
      ? [payload.to, ...payload.cc].filter(Boolean).join(", ")
      : "";
    const base = {
      key: `${KIND_ID}:${proposal.assist.id}`,
      kindId: KIND_ID,
      proposal,
      // Never the row's claim: Gmail send has no auto mode anywhere in the code.
      mode: GMAIL_SEND_MODE,
      autoApplyAt: null,
      proposedBy: proposal.proposerLabel,
      proposedAt: proposal.assist.createdAt,
      // 🚨 THE PRODUCER'S OWN BLOCK IS CARRIED, ALWAYS. When the row says the
      // operator it is addressed to cannot send from that account, the review
      // card must not mount at all — its Send button posts straight to the
      // reviewed-send endpoint and would try. Dropping this field is exactly how
      // a blocked draft got a live Send button (Bugbot HIGH #1, 2026-09-17).
      blocked: proposal.blocked,
      rejectEffect:
        "Nothing is sent, and the draft is recorded as rejected by you with your reason.",
      doors: proposal.subject ? (
        <EntityRef
          token={proposal.subject.token}
          id={proposal.subject.id}
          name={proposal.assist.title}
        />
      ) : undefined,
    };

    if (!payload) {
      // A malformed proposal is SHOWN as broken. Hiding it would leave a row
      // pending forever with nobody able to see why.
      return [
        {
          ...base,
          headline: proposal.assist.title,
          acceptEffect: "Nothing — this proposal cannot be read.",
          blocked: {
            reason:
              "This draft was written in a shape this queue does not recognise, so it cannot be reviewed or sent.",
            whoCan:
              "Reject it and ask for it again; the agent that wrote it needs fixing.",
          },
        } satisfies GmailItem,
      ];
    }

    const headline = `Email to ${recipients} — "${payload.subject}"`;
    const acceptEffect = `Sends this message from ${payload.fromEmail ?? "your connected Google account"} to ${recipients}, exactly as it reads when you press Send.`;

    // The producer said this person cannot send it. No card, no Send button.
    if (proposal.blocked) {
      return [{ ...base, headline, acceptEffect } satisfies GmailItem];
    }

    // The row's own mode claim, when it disagrees with the law.
    if (proposal.mode !== GMAIL_SEND_MODE) {
      return [
        {
          ...base,
          headline,
          acceptEffect,
          blocked: {
            reason: `This draft claims it may send itself (${proposal.mode}). Gmail messages are confirmed one at a time and nothing here can send without your click.`,
            whoCan: "Review and send it below, or reject it.",
          },
          individualReview: (
            <GmailApprovalBody
              // A re-proposal under the same id is a DIFFERENT draft: a new key
              // remounts the card instead of reviewing the superseded one.
              key={`${proposal.assist.id}:${gmailPayloadFingerprint(payload)}`}
              proposal={proposal}
              payload={payload}
              onDecided={refetch}
            />
          ),
        } satisfies GmailItem,
      ];
    }

    const check = verdicts[index];
    const spineUnreadable = check?.isError === true;
    const verdict = check?.data;
    // 🚨 PENDING IS NOT ALLOWED. The card has no eligibility check of its own —
    // its Send posts straight to the reviewed-send endpoint — so while the
    // outbound checks are still in flight the row must not offer one. Treating
    // "no verdict yet" as permission is how a click could reach a recipient the
    // spine was about to refuse (Bugbot HIGH #2, 2026-09-17).
    const gated = Boolean(payload.recipientMediumId);
    const stillChecking = gated && !spineUnreadable && verdict === undefined;

    if (stillChecking) {
      return [
        {
          ...base,
          headline,
          acceptEffect,
          blocked: {
            reason:
              "Checking this recipient against the unsubscribes, the blocklist and this sender's standing.",
            whoCan: "The draft opens for sending the moment those checks pass.",
          },
        } satisfies GmailItem,
      ];
    }

    if (spineUnreadable) {
      return [
        {
          ...base,
          headline,
          acceptEffect,
          blocked: {
            reason:
              "The outbound checks (unsubscribes, blocklist, sending standing) could not be read, so this is not offered for sending.",
            whoCan: "Try again in a moment; nothing was sent.",
          },
        } satisfies GmailItem,
      ];
    }

    if (verdict && !verdict.allowed) {
      return [
        {
          ...base,
          headline,
          acceptEffect,
          blocked: {
            reason: "The outbound checks refuse this recipient.",
            whoCan: "Fix what they name below, or reject the draft.",
          },
          individualReview: <BlockedBySpine verdict={verdict} />,
        } satisfies GmailItem,
      ];
    }

    return [
      {
        ...base,
        headline,
        acceptEffect,
        // No contact point means the unsubscribe and blocklist checks had
        // nothing to look up. Said out loud on the row — never skipped quietly.
        ...(payload.recipientMediumId
          ? {}
          : {
              badge: "Not a known contact",
            }),
        individualReview: (
          // A re-proposal under the same id is a DIFFERENT draft, and the KEY IS
          // THE REMOUNT — on the node the host actually renders. Keyed only on
          // the inner card, the wrapper stayed put and nothing observable
          // changed identity (Bugbot MEDIUM, frontend PR 228).
          <div
            key={`${proposal.assist.id}:${gmailPayloadFingerprint(payload)}`}
            className="space-y-1.5"
          >
            {payload.recipientMediumId ? null : (
              <p className="break-words text-[11px] text-warning">
                This address is not a contact point we hold, so the unsubscribe
                and blocklist checks had nothing to check. You are sending it on
                your own judgement.
              </p>
            )}
            <GmailApprovalBody
              proposal={proposal}
              payload={payload}
              onDecided={refetch}
            />
          </div>
        ),
      } satisfies GmailItem,
    ];
  });

  return {
    items,
    total: pending.data?.total ?? items.length,
    loading: pending.isLoading,
    error: pending.error,
    refetch,
  };
}

function useDecisions(scope: ApprovalScope): ApprovalDecisions {
  const viewerId = useAppSelector(selectUserId);
  const userId = scope.userId ?? viewerId;
  const client = useQueryClient();
  const invalidate = () =>
    void client.invalidateQueries({ queryKey: [...QUERY_KEY, userId] });

  return {
    /**
     * There is no bulk approve here and there never will be: sending is the
     * card's Send button, one message at a time. If something ever calls this,
     * it must NOT send — it says so and leaves the row waiting.
     */
    acceptItems: async (items) => ({
      applied: 0,
      failures: items.map((item) => ({
        key: item.key,
        message:
          "An email is sent from its own review card, one message at a time — nothing was sent.",
      })),
    }),
    rejectItems: async (items, reason) => {
      const failures: { key: string; message: string }[] = [];
      let applied = 0;
      for (const item of items) {
        const proposal = (item as GmailItem).proposal;
        try {
          await recordApprovalDecision(
            proposal.assist.id,
            "rejected",
            reason,
          );
          applied += 1;
        } catch (error) {
          failures.push({
            key: item.key,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      invalidate();
      return { applied, failures };
    },
  };
}

export const gmailSendKind: ApprovalKind = {
  id: KIND_ID,
  label: "Email to send",
  accept: {
    // Shown nowhere for a normal row (every row is reviewed in its own card),
    // and honest if a blocked row ever exposes it.
    label: "Review and send",
    keepsReason: false,
  },
  reject: {
    label: "Don't send",
    keepsReason: true,
    reasonPrompt: "Why not? (kept on the record)",
  },
  useSource,
  useDecisions,
  /**
   * These rows are addressed to ONE PERSON (the operator), so a site-scoped
   * mount must not repeat them: the marketing console mounts a queue per site,
   * and without this every site would show the same drafts and the waiting count
   * would be multiplied by the number of sites (Bugbot HIGH #3, 2026-09-17).
   */
  scopeRequirement: {
    field: "userId",
    explain:
      "an email or a spreadsheet change waits with the person it is addressed to, not with a website.",
    where: { label: "Open what is waiting on you", href: "/approvals" },
  },
};
