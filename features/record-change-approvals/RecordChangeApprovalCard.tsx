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

import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";

import { ApprovalCard } from "@/features/agents/ui-first-tools/ui/ApprovalCard";
import type { PendingAsk } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";

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
  /** Told once the decision is taken, so a list can refresh. */
  onDecided?: () => void;
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
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const tableIdForOrganization = waitTableId(wait);
  const object = useObjectOrganization(
    cardDataSource(),
    objectOrganizationId ? null : (wait.approvalId ?? tableIdForOrganization),
  );
  const organizationId =
    objectOrganizationId ??
    (object.state === "found"
      ? object.organizationId
      : object.state === "stand-in"
        ? activeOrganizationId
        : null);
  const organizationKnown =
    Boolean(objectOrganizationId) || object.state !== "resolving";
  const campaign = useUnifiedDataCampaign({
    organizationId,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
  });

  const [decision, setDecision] = useState<Decision>({ state: "open" });
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
    (choice: "approve" | "decline") => {
      setDecision({ state: "applying" });
      // BOTH ANSWERS GO THROUGH THE QUEUE. A decline used to be a sentence this
      // component drew and nothing else — so the wait stayed `pending` for
      // everybody who was not looking at this conversation, and the next person
      // to open the inbox was asked a question somebody had already answered.
      // `custom.work_approval_decide` records who decided and when, for yes and
      // for no alike.
      const taken =
        choice === "approve"
          ? applyApprovedRecordChange(wait)
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
          onDecided?.();
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
    approval: approvalChangeFor(wait, {
      actor: actorName ?? null,
      tableName,
    }),
  };

  if (!organizationKnown || campaign.on === null) return null;
  if (!campaign.on) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {wait.notDone} {campaign.because}
      </p>
    );
  }

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
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:min-h-8"
      >
        <ExternalLink className="size-3.5" />
        Open the table
      </Link>
    ) : null;

  const outcome =
    decision.state === "applying" ? (
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
        note={`${wait.policy.why} ${wait.policy.howToChange}`}
        {...(outcome ? { outcome } : {})}
      />
      {/* WHO CAN ANSWER THIS, BY NAME. The 2026-09-19 pass found a refusal that
          named nobody — so a person reading "waiting for a person" had no idea
          whether that person was them. It is shown only while the decision is
          still open: after it is taken, who could have taken it is noise. */}
      {decision.state === "open" && wait.approvers.length > 0 && (
        <p className="px-2.5 text-xs leading-relaxed text-muted-foreground">
          {wait.approvers.length === 1
            ? `${wait.approvers[0]!.name ?? "One person"} can decide this.`
            : `${wait.approvers
                .map((who) => who.name)
                .filter(Boolean)
                .join(", ")} can decide this.`}
        </p>
      )}
      {decision.state === "failed" && (
        <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive">
          {decision.sentence}
          <ErrorAlchemyMenu />
        </p>
      )}
    </div>
  );
}
