"use client";

/**
 * PendingAsksZone — renders all pending ask cards for a conversation. Mounts
 * directly above the chat input in `AgentConversationColumn`. Hidden when
 * no active asks exist (returns null — zero pixel height).
 *
 * Critical UX invariant from the user: the chat input is NEVER disabled or
 * grayed by this zone. The cards live above the input; the input stays free.
 * The user can answer any combination of cards AND/OR type into the input
 * AND/OR submit the input — all independently.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectActivePendingAsksForConversation } from "../redux/pending-asks.slice";
import { AskCard } from "./AskCard";
import { ApprovalCard } from "./ApprovalCard";

interface PendingAsksZoneProps {
  conversationId: string;
  className?: string;
}

export function PendingAsksZone({
  conversationId,
  className,
}: PendingAsksZoneProps) {
  const asks = useAppSelector(
    selectActivePendingAsksForConversation(conversationId),
  );
  if (asks.length === 0) return null;
  return (
    <div className={className ?? "flex flex-col gap-1.5 mb-1.5"}>
      {asks.map((ask) =>
        ask.kind === "approval" ? (
          <ApprovalCard key={ask.callId} ask={ask} />
        ) : (
          <AskCard key={ask.callId} ask={ask} />
        ),
      )}
    </div>
  );
}
