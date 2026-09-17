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
import { GMAIL_SEND_MODE } from "../mode";
import type {
  ApprovalDecisions,
  ApprovalItem,
  ApprovalKind,
  ApprovalScope,
  ApprovalSource,
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

  // The proposal's contact point describes the address the proposal named. If
  // the approver changed it, that association is about somebody else — it is
  // dropped rather than attached to the wrong recipient, and said out loud.
  const sameRecipient =
    receipt.to.trim().toLocaleLowerCase() ===
    payload.to.trim().toLocaleLowerCase();
  if (!sameRecipient) {
    toast.warning(
      "You changed the recipient before sending, so the message is recorded without a contact point and the unsubscribe and blocklist checks did not cover the new address.",
    );
  }

  const result = await recordGmailSendInteraction({
    receipt,
    association: {
      partyId: payload.partyId,
      organizationId: payload.organizationId,
      dealId: payload.dealId ?? null,
      contactPointId: sameRecipient ? (payload.contactPointId ?? null) : null,
      mediumId: sameRecipient ? (payload.recipientMediumId ?? null) : null,
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
    // The message HAS LEFT. Never swallowed, never retried on its own.
    toast.error(
      "The message was sent, but it could not be recorded on the record's timeline. Log it by hand so the history is true.",
      { description: result.failure },
    );
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
  const callId = `approval:${proposal.assist.id}`;
  const approverId = useAppSelector(selectUserId);

  useEffect(() => {
    registerAskResolver(callId, (response) => {
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
      // Unmounting is not a decision; drop the resolver without resolving it.
      // (`resolveAskByCallId` is the only other exit and the card owns it.)
    };
  }, [callId, proposal.assist.id]);

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
      preflight={async (draft) => {
        const unchanged =
          draft.to.trim().toLocaleLowerCase() ===
          payload.to.trim().toLocaleLowerCase();
        if (!unchanged || !payload.recipientMediumId) return null;
        try {
          const verdict = await checkSendEligibility({
            mediumId: payload.recipientMediumId,
            listId: payload.listId ?? null,
            identityId: payload.identityId ?? null,
          });
          if (verdict.allowed) return null;
          return verdict.blocks
            .map((block) => `${block.message} ${block.fix}`.trim())
            .join(" ");
        } catch (error) {
          return `The outbound checks could not be read. ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      }}
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
    queryFn: () => listPendingProposals(userId ?? "", KIND_ID),
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
          <div className="space-y-1.5">
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
