"use client";

/**
 * RecordChangeApprovalCard — the decision, in the conversation where it was
 * asked for.
 *
 * The organization's setting is `ask`: an agent may make the table it is making
 * right now, and a table that ALREADY EXISTED waits for a person. Before this
 * card the wait was invisible — the tool said "not done, waiting for a person"
 * and there was no person-facing anything to act on, which is the dead end the
 * platform's own law forbids: a screen that names a decision must offer it.
 *
 * It is the platform's `<ApprovalCard>` — the same header, the same diff, the
 * same Apply / Keep as is — driven by a producer that applies the write itself
 * rather than by a suspended tool call. Approving says what now exists;
 * declining says what does not, and what an administrator does if this
 * organization would rather not be asked.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";


import { ApprovalCard } from "@ai-matrx/chat/agents/ui-first-tools/ui/ApprovalCard";
import type { PendingAsk } from "@ai-matrx/chat/agents/ui-first-tools/redux/pending-asks.slice";

import {
  approvalChangeFor,
  waitTableId,
  type RecordChangeWait,
} from "./recordChangeApproval";
import {
  applyApprovedRecordChange,
  declineRecordChange,
  tableNameFor,
  type ApplyApprovedOutcome,
} from "./applyRecordChange";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { recordsDataSource } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { standingSentence, useApprovalStanding } from "./approvalDecision";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

/** One data source for every card on the page — the organization lookup's dependency stays stable. */
let sharedDataSource: ReturnType<typeof recordsDataSource> | null = null;
function cardDataSource(): ReturnType<typeof recordsDataSource> {
  sharedDataSource ??= recordsDataSource(createClient());
  return sharedDataSource;
}

export interface RecordChangeApprovalCardProps {
  wait: RecordChangeWait;
  /** The tool call this wait came back on — the card's identity in the thread. */
  callId: string;
  conversationId?: string;
  /** The agent's display name, when the surface knows it. */
  actorName?: string | null;
  /** The table's name when the mounting surface already knows it (skips a read). */
  tableName?: string | null;
  /** Hide "Open the table" — set by the table's own page, which is already there. */
  hideOpen?: boolean;
  /**
   * Told once the decision is taken here, with what was chosen and the store's sentence for
   * it — a list refreshes; the chat tells the agent so it carries on without being nudged.
   */
  onDecided?: (decided: { choice: "approve" | "decline"; sentence: string }) => void;
  /**
   * The organization the WAIT lives in, when the mounting surface knows it (the
   * table's page reads it from the table). Access is personal: the switch is
   * asked about the object's organization, never merely the active one.
   */
  organizationId?: string | null;
}

type Decision =
  | { state: "open" }
  | { state: "applying" }
  | { state: "decided"; sentence: string }
  | { state: "failed"; sentence: string };

/** Who can answer, by name — and "You" when the person reading is one of them. */
function deciderSentence(
  approvers: RecordChangeWait["approvers"],
  viewerId: string | null | undefined,
): string {
  const others = approvers.filter((who) => who.userId !== viewerId);
  const viewerDecides = others.length < approvers.length;
  const named = others.map((who) => who.name).filter(Boolean) as string[];
  if (viewerDecides) {
    return named.length > 0 ? `You or ${named.join(", ")} can decide this.` : "You can decide this.";
  }
  if (approvers.length === 1) return `${approvers[0]!.name ?? "One person"} can decide this.`;
  return `${named.join(", ")} can decide this.`;
}

export function RecordChangeApprovalCard({
  wait,
  callId,
  conversationId,
  actorName,
  tableName: knownTableName,
  hideOpen = false,
  onDecided,
  organizationId: objectOrganizationId = null,
}: RecordChangeApprovalCardProps) {
  // THE switch, asked for the organization THE WAIT LIVES IN. A card that
  // offered to write into a store its organization does not keep its data in
  // would be a button that cannot mean what it says, so while the switch is off
  // the wait is reported and no decision is offered.
  //
  // ACCESS IS PERSONAL (owner, 2026-09-23): the organization comes FROM THE
  // OBJECT — the approval row names its own — never merely from whichever one
  // is active. A reopened chat with no organization picked used to say "No
  // organization is picked yet" instead of offering the decision (lane
  // AGENT-WRITE-APPROVAL, 2026-09-26).
  const tableIdForOrganization = waitTableId(wait);
  const object = useObjectOrganization(
    cardDataSource(),
    objectOrganizationId ? null : (wait.approvalId ?? tableIdForOrganization),
  );
  const organizationId =
    objectOrganizationId ??
    (object.state === "found"
      ? object.organizationId
      : null);
  const organizationKnown =
    Boolean(objectOrganizationId) || object.state !== "resolving";

  const [decision, setDecision] = useState<Decision>({ state: "open" });
  const viewerId = useAppSelector(selectUserId);
  // THE ROW'S OWN STANDING. The tool result says "held" forever; the queue row says whether
  // somebody already decided — here earlier, in another tab, on the table's page. A decided
  // change never offers Approve again (lane HANDOVER, 2026-09-27).
  const standing = useApprovalStanding(organizationId, wait.approvalId);
  const decidedElsewhere =
    decision.state === "open" && standing ? standingSentence(standing) : null;
  const [fetchedTableName, setTableName] = useState<string | null>(null);
  const tableName = knownTableName ?? fetchedTableName;
  const tableId = waitTableId(wait);

  // The table a pending change belongs to, by NAME. Asked once, and only when
  // the mounting surface did not already know it — a table proposal names itself.
  useEffect(() => {
    if (!tableId || knownTableName) return;
    let live = true;
    void tableNameFor(tableId).then((name) => {
      if (live && name) setTableName(name);
    });
    return () => {
      live = false;
    };
  }, [tableId, knownTableName]);

  const decide = useCallback(
    (choice: "approve" | "decline", options?: { remember: boolean }) => {
      setDecision({ state: "applying" });
      // BOTH ANSWERS GO THROUGH THE QUEUE. A decline used to be a sentence this
      // component drew and nothing else — so the wait stayed `pending` for
      // everybody who was not looking at this conversation, and the next person
      // to open the inbox was asked a question somebody had already answered.
      // `custom.work_approval_decide` records who decided and when, for yes and
      // for no alike.
      const taken =
        choice === "approve"
          ? applyApprovedRecordChange(wait, { restOfChat: options?.remember === true })
          : declineRecordChange(wait);
      void taken.then(
        (outcome: ApplyApprovedOutcome) => {
          if (outcome.status === "refused") {
            // The store's own sentence, and the card stays open: a refusal a
            // person can act on is not a decision they already took.
            setDecision({ state: "failed", sentence: outcome.detail });
            return;
          }
          setDecision({ state: "decided", sentence: outcome.detail });
          onDecided?.({ choice, sentence: outcome.detail });
        },
        (error: unknown) => {
          setDecision({
            state: "failed",
            sentence:
              error instanceof Error
                ? error.message
                : "The change could not be applied, and the store gave no reason.",
          });
        },
      );
    },
    [wait, onDecided],
  );

  const ask: PendingAsk = {
    callId,
    conversationId: conversationId ?? "",
    toolName: "records",
    kind: "approval",
    status: "pending",
    createdAtMs: 0,
    approval: {
      ...approvalChangeFor(wait, {
        actor: actorName ?? null,
        tableName,
      }),
      // In a chat, the person may trust the agent with this table for the rest of it — the
      // second, third… change of the same job then goes ahead without another card.
      ...(conversationId && wait.approvalId && tableId
        ? {
            autoApprove: {
              scope: "table-in-this-chat",
              noun: "changes to this table",
              label: "Also allow its other changes to this table in this chat",
            },
          }
        : {}),
    },
  };

  // The approval's own organization cannot be read, and the ACTIVE organization is never a
  // substitute (it may not be the record's). Say so.
  if (!objectOrganizationId && object.state === "unavailable") {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {/* read-gate-exempt: this sentence IS the unavailable-state message of the failed read */}
        {wait.notDone} The record store could not say which organization this change belongs to, so
        no decision is offered here. {object.why}
      </p>
    );
  }
  if (!organizationKnown) return null;

  // NOTHING WAS QUEUED — so no decision is offered, and the reason is on screen.
  // This is the `always_ask` table case: a table that does not exist yet has no
  // subject to be filed against, so there is nothing for anybody to approve.
  // An Apply button here would write something nobody filed, which is exactly
  // the lie the card exists to remove.
  if (!wait.approvalId) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {wait.notDone}
      </p>
    );
  }

  const openTable =
    tableId && !hideOpen ? (
      <Link
        href={`/data/${tableId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:min-h-8"
      >
        <ExternalLink className="size-3.5" />
        Open the table
      </Link>
    ) : null;

  const outcome = decidedElsewhere ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <span data-held-write-outcome="">{decidedElsewhere}</span>
        {openTable}
      </span>
    ) : decision.state === "applying" ? (
      <span>Applying…</span>
    ) : decision.state === "decided" ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <span data-held-write-outcome="">{decision.sentence}</span>
        {openTable}
      </span>
    ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <ApprovalCard
        ask={ask}
        onDecide={decide}
        allowRespond={false}
        labels={{ approve: "Approve", decline: "Refuse" }}
        secondaryAction={openTable}
        note={wait.policy.why}
        {...(outcome ? { outcome } : {})}
      />
      {/* WHO CAN ANSWER THIS, BY NAME. The 2026-09-19 pass found a refusal that
          named nobody — so a person reading "waiting for a person" had no idea
          whether that person was them. It is shown only while the decision is
          still open: after it is taken, who could have taken it is noise. */}
      {decision.state === "open" && !decidedElsewhere && wait.approvers.length > 0 && (
        <p className="px-2.5 text-xs leading-relaxed text-muted-foreground">
          {deciderSentence(wait.approvers, viewerId)}
        </p>
      )}
      {decision.state === "failed" && (
        <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive-ink">
          {decision.sentence}
          <ErrorAlchemyMenu />
        </p>
      )}
    </div>
  );
}
