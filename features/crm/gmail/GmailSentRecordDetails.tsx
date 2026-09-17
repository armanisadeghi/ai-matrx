"use client";

/**
 * GmailSentRecordDetails — what a SENT Gmail message shows on a timeline.
 *
 * 🚨 A SENT RECORD THAT RENDERS NONE OF ITS FACTS IS NOT A SENT RECORD. The row
 * `features/crm/gmail/service.ts` writes carries the provider, the address it
 * actually went to, the account it went out through, Gmail's message id, who
 * drafted it (an agent and its run) and who approved it and when — and until
 * 2026-09-17 `InteractionTimeline` rendered a subject and a date, so the entire
 * point of the unit was invisible (VERIFY-B1-B2 A4/D6).
 *
 * Every fact comes from the ONE accessor (`./sent-record-facts.ts`), which reads
 * the column when the row has one and the row's own jsonb copy while the
 * generated types still lack the six audit columns. Nothing here knows which.
 *
 * THE DOOR LAW: every record named here opens — the Person, the deal, the
 * project and the agent through `EntityRef`, the run id as a copyable identity
 * (no run viewer exists to route to, and inventing a route that 404s is worse).
 */

import { BrainCircuit, Mail, ShieldCheck } from "lucide-react";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  UserAvatarDisplay,
  resolveUserName,
  type UserLike,
} from "@/components/user/UserIdentity";
import { formatRelativeTime } from "@/utils/datetime";
import type { InteractionRow } from "@/features/crm/types";
import { gmailSentRecordFacts } from "./sent-record-facts";

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

  return (
    <div className="mt-1 space-y-1 border-l-2 border-border/70 pl-2">
      {/* What carried it, to whom, and out of which mailbox. */}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
        <Mail className="h-3 w-3 shrink-0" aria-hidden />
        <span className="text-foreground">
          Sent with {facts.provider === "gmail" ? "Gmail" : facts.provider}
        </span>
        {facts.to ? <span>to {facts.to}</span> : null}
        {facts.cc.length > 0 ? <span>· cc {facts.cc.join(", ")}</span> : null}
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

      {/* "Associated with" — HubSpot's word, and every chip is a door. */}
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>Associated with</span>
        <EntityRef token="party" id={partyId} name={partyLabel ?? undefined} />
        {row.deal_id ? (
          <EntityRef
            token="crm_deal"
            id={row.deal_id}
            name={dealLabel ?? undefined}
          />
        ) : null}
        {facts.composedFromProjectId ? (
          <EntityRef token="project" id={facts.composedFromProjectId} />
        ) : null}
      </p>

      {/* Who wrote it, when it was not the person who sent it. */}
      {facts.draftedByLabel || facts.draftedByAgentId || facts.draftedByRunId ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <BrainCircuit className="h-3 w-3 shrink-0" aria-hidden />
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
    </div>
  );
}
