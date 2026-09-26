"use client";

/**
 * GmailSentRecordDetails — what a SENT Gmail message shows on a timeline.
 *
 * 🚨 A SENT RECORD THAT RENDERS NONE OF ITS FACTS IS NOT A SENT RECORD. The row
 * the reviewed-send endpoint writes carries the provider, the address it
 * actually went to, the account it went out through, Gmail's message id, who
 * drafted it (an agent and its run) and who approved it and when — and until
 * 2026-09-17 `InteractionTimeline` rendered a subject and a date, so the entire
 * point of the unit was invisible (VERIFY-B1-B2 A4/D6).
 *
 * Every fact comes from the ONE accessor (`./sent-record-facts.ts`), which reads
 * the six audit COLUMNS and falls back to the row's own jsonb copy for rows
 * written before they existed. Nothing here knows which.
 *
 * THE DOOR LAW: every record named here opens — the Person, the deal, the
 * project and the agent through `EntityRef`, the run id as a copyable identity
 * (no run viewer exists to route to, and inventing a route that 404s is worse).
 *
 * 🚨 "ASSOCIATED WITH" IS READ FROM THE EDGES. This block used to print the
 * Person, the deal and the project from the row's own columns, so a refused edge
 * was asserted here forever while "everything associated with this Person" did
 * not list the message — and the only trace was a toast that had long since
 * disappeared (VERIFY-B1-B2-R2 N7). It now compares the row's INTENDED
 * associations against `platform.associations` (`./sent-record-associations.ts`)
 * and shows a missing one AS missing, with a retry that writes through the same
 * registered, cache-aware path.
 */

import { useState } from "react";
import {
  FileText,
  Link2Off,
  Loader2,
  Mail,
  MailWarning,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table";
import { useAssociations } from "@ai-matrx/associations/react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  UserAvatarDisplay,
  resolveUserName,
  type UserLike,
} from "@/components/user/UserIdentity";
import { formatRelativeTime } from "@/utils/datetime";
import type { InteractionRow } from "@/features/crm/types";
import { gmailSentRecordFacts } from "./sent-record-facts";
import {
  GMAIL_SEND_ASSOCIATION_ROLE,
  gmailAssociationStanding,
  type GmailIntendedAssociation,
} from "./sent-record-associations";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export interface GmailSentRecordDetailsProps {
  row: InteractionRow;
  /** The Person this timeline belongs to — always one of the associations. */
  partyId: string;
  partyLabel?: string | null;
  /** The deal, when this row names one. */
  dealLabel?: string | null;
  /** Resolved org members, so an approver is a person and not a UUID. */
  memberById?: Map<string, UserLike>;
}

export function GmailSentRecordDetails({
  row,
  partyId,
  partyLabel,
  dealLabel,
  memberById,
}: GmailSentRecordDetailsProps) {
  const facts = gmailSentRecordFacts(row);
  const approver = facts.approvedBy
    ? (memberById?.get(facts.approvedBy) ?? null)
    : null;

  // The edges this row actually has. `add` is the cache-aware door, so a retry
  // that succeeds refreshes both endpoints — including the Person's own
  // associations panel (R2 N8).
  const { edges, status, add } = useAssociations({
    type: "crm_interaction",
    id: row.id,
  });
  const [linking, setLinking] = useState(false);

  const intended: GmailIntendedAssociation[] = [
    { type: "party", id: partyId, label: partyLabel },
    ...(row.deal_id
      ? [{ type: "crm_deal" as const, id: row.deal_id, label: dealLabel }]
      : []),
    ...(facts.composedFromProjectId
      ? [{ type: "project" as const, id: facts.composedFromProjectId }]
      : []),
  ];
  const settled = status === "ready" || status === "error";
  const standing = gmailAssociationStanding(intended, edges);
  // Nothing is claimed while the edges are still being read: the linked list is
  // what the edges say, and before they answer the row says only what it is.
  const shown = settled ? standing.linked : intended;
  const missing = settled ? standing.missing : [];

  const linkMissing = async () => {
    setLinking(true);
    const failures: string[] = [];
    for (const target of missing) {
      try {
        const result = await add({
          targetType: target.type,
          targetId: target.id,
          role: GMAIL_SEND_ASSOCIATION_ROLE,
        });
        if (!result.ok) {
          failures.push(result.error ?? "the association was refused");
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    setLinking(false);
    if (failures.length > 0) {
      toast.error(
        `This message still could not be linked: ${failures.join(" ")} ` +
          "Nothing about the message itself changed — it is recorded here either way.",
      );
      return;
    }
    toast.success("The sent message is linked again.");
  };

  return (
    <div className="mt-1 space-y-1 border-l-2 border-border/70 pl-2">
      {/* What carried it, to whom, and out of which mailbox. */}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
        <Mail className="h-3 w-3 shrink-0" aria-hidden />
        <span className="text-foreground">
          Sent with {facts.provider === "gmail" ? "Gmail" : facts.provider}
        </span>
        {facts.to ? <span>to {facts.to}</span> : null}
        {/* A Cc IS a recipient, and it says whose address it is: the row carries
            the attribution the send decided (R2 N9). Rows written before that
            print the addresses alone — never invented into "this record's". */}
        {facts.ccAttribution.length > 0 ? (
          <span>
            · cc{" "}
            {facts.ccAttribution
              .map((entry) =>
                entry.heldByThisRecord
                  ? entry.address
                  : `${entry.address} (not an address this record holds)`,
              )
              .join(", ")}
          </span>
        ) : facts.cc.length > 0 ? (
          <span>· cc {facts.cc.join(", ")}</span>
        ) : null}
        {facts.sentViaAccountEmail ? (
          <span>· from {facts.sentViaAccountEmail}</span>
        ) : null}
        {facts.messageId ? (
          <MatrxUuidCell
            value={facts.messageId}
            label="Gmail message id"
            forbidden
            className="text-[11px]"
          />
        ) : null}
      </p>

      {/* "Associated with" — HubSpot's word, every chip a door, and every chip
          an edge that exists. */}
      {shown.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Associated with</span>
          {shown.map((target) => (
            <EntityRef
              key={`${target.type}:${target.id}`}
              token={target.type}
              id={target.id}
              name={target.label ?? undefined}
            />
          ))}
        </p>
      ) : null}

      {/* 🚨 A MISSING LINK IS SHOWN, NOT TOASTED. The message is recorded here
          either way — only the link is missing, and it is repairable in place. */}
      {missing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-warning">
          <Link2Off className="h-3 w-3 shrink-0" aria-hidden />
          <span>Not linked to</span>
          {missing.map((target) => (
            <EntityRef
              key={`missing:${target.type}:${target.id}`}
              token={target.type}
              id={target.id}
              name={target.label ?? undefined}
            />
          ))}
          <span className="text-muted-foreground">
            — this message is recorded here, but it will not show up under them.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={linking}
            onClick={() => void linkMissing()}
          >
            {linking ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
            ) : null}
            {linking ? "Linking…" : "Link it now"}
          </Button>
        </div>
      ) : null}

      {/* Who wrote it, when it was not the person who sent it. */}
      {facts.draftedByLabel || facts.draftedByAgentId || facts.draftedByRunId ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <AGENT_ICON className="h-3 w-3 shrink-0" aria-hidden />
          <span>Drafted by</span>
          {facts.draftedByAgentId ? (
            <EntityRef
              token="agent"
              id={facts.draftedByAgentId}
              name={facts.draftedByLabel ?? undefined}
            />
          ) : (
            <span className="text-foreground">
              {facts.draftedByLabel ?? "an agent"}
            </span>
          )}
          {facts.draftedByRunId ? (
            <MatrxUuidCell
              value={facts.draftedByRunId}
              label="Agent run"
              forbidden
              className="text-[11px]"
            />
          ) : null}
        </p>
      ) : null}

      {/* Who authorized the send, and when. */}
      {facts.approvedBy ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
          <span>Approved by</span>
          {approver ? (
            <span className="inline-flex items-center gap-1">
              <UserAvatarDisplay user={approver} size="xs" />
              <span className="text-foreground">{resolveUserName(approver)}</span>
            </span>
          ) : (
            <MatrxUuidCell
              value={facts.approvedBy}
              label="Approved by"
              forbidden
              className="text-[11px]"
            />
          )}
          {facts.approvedAt ? (
            <span>{formatRelativeTime(facts.approvedAt)}</span>
          ) : null}
        </p>
      ) : null}

      {/*
        🚨 WHAT WAS ADDED TO THE BODY AFTER IT WAS APPROVED (VERIFY-B1-B2-R5 W4,
        chair ruling R24). A footer the spine appended and nobody rendered is the
        same silence as a hidden refusal — and the exact text is shown, because
        "a footer was added" does not tell the person what the recipient read.
        Nothing is printed for a message that carried none: the honest default is
        that the body is the body, and the reason sentence lives on the receipt.
      */}
      {facts.compliance?.footerAppended ? (
        <div className="space-y-0.5 text-[11px] text-warning">
          <p className="flex items-start gap-1.5">
            <FileText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0">
              {facts.compliance.reason ??
                "An unsubscribe footer was added to this message after it was approved."}
            </span>
          </p>
          {facts.compliance.footerText ? (
            <p className="whitespace-pre-wrap break-words pl-4 text-muted-foreground">
              {facts.compliance.footerText}
            </p>
          ) : (
            <p className="pl-4 text-muted-foreground">
              The exact text that was added was not recorded, so compare this with
              the copy in the sent folder.
            </p>
          )}
        </div>
      ) : null}

      {/*
        🚨 THE RULES THE AUTHORITY RAISED AND THIS MESSAGE WAS NOT JUDGED BY (W3).
        The exemption is correct — a cold-campaign rule does not judge a reply —
        and the approver was the legal actor, so the row keeps what was said and
        why it was set aside instead of dropping it on the floor.
      */}
      {facts.exemptedBlocks.length > 0 ? (
        <div className="space-y-0.5 text-[11px]">
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <ScrollText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              Checked and not applied to this message, because it was a reviewed
              one-to-one reply and not a campaign:
            </span>
          </p>
          {facts.exemptedBlocks.map((block) => (
            <p
              key={`${block.code}:${block.address}`}
              className="break-words pl-4 text-muted-foreground"
            >
              <span className="text-foreground">{block.message}</span>{" "}
              {block.exemptReason}
              {block.address ? ` (${block.field}: ${block.address})` : null}
            </p>
          ))}
        </div>
      ) : null}

      {/*
        🚨 A BOUNCE THAT WILL NEVER COME BACK (W5). The `crm.sending_event` row
        exists for every reviewed send now, which makes the machinery LOOK
        correlated; `outreach_inbound` reads a mailbox only through a Gmail watch,
        and a mailbox recorded for audit is deliberately never watched. Shown only
        when the row SAYS so — a timeline that guessed "not watched" would be
        inventing a state, and one that guessed "watched" would be the defect.
      */}
      {facts.bounceCorrelation === "not_watched" ? (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <MailWarning className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0">
            {facts.bounceCorrelationNote ??
              "We do not read this mailbox, so a bounce will not be matched back " +
                "to this message automatically — watch the mailbox itself for a " +
                "delivery failure."}
          </span>
        </p>
      ) : null}
    </div>
  );
}
