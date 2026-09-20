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

import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";

import { ApprovalCard } from "@/features/agents/ui-first-tools/ui/ApprovalCard";
import type { PendingAsk } from "@/features/agents/ui-first-tools/redux/pending-asks.slice";

import {
  approvalChangeFor,
  type RecordChangeWait,
} from "./recordChangeApproval";
import {
  applyApprovedRecordChange,
  declineRecordChange,
  tableNameFor,
  type ApplyApprovedOutcome,
} from "./applyRecordChange";

export interface RecordChangeApprovalCardProps {
  wait: RecordChangeWait;
  /** The tool call this wait came back on — the card's identity in the thread. */
  callId: string;
  conversationId?: string;
  /** The agent's display name, when the surface knows it. */
  actorName?: string | null;
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
}: RecordChangeApprovalCardProps) {
  // THE switch, asked for the organization the person is actually working in.
  // A card that offered to write into a store this organization does not keep
  // its data in would be a button that cannot mean what it says, so while the
  // switch is off the wait is reported and no decision is offered.
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const campaign = useUnifiedDataCampaign({
    organizationId,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
  });

  const [decision, setDecision] = useState<Decision>({ state: "open" });
  const [tableName, setTableName] = useState<string | null>(null);

  // The table a pending column belongs to, by NAME. Asked once, and only for
  // the column case — a table proposal names itself.
  useEffect(() => {
    if (wait.change.change === "table") return;
    let live = true;
    const tableId = wait.change.tableId;
    void tableNameFor(tableId).then((name) => {
      if (live && name) setTableName(name);
    });
    return () => {
      live = false;
    };
  }, [wait]);

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
    [wait],
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

  if (campaign.on === null) return null;
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

  const outcome =
    decision.state === "applying" ? (
      <span>Applying…</span>
    ) : decision.state === "decided" ? (
      <span>{decision.sentence}</span>
    ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <ApprovalCard
        ask={ask}
        onDecide={decide}
        allowRespond={false}
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
        </p>
      )}
    </div>
  );
}
