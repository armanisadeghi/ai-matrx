"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorNotice } from "@ai-matrx/design-system";
import { asConversationId, formatMessageTime } from "@ai-matrx/messaging";
import { useConversation } from "@ai-matrx/messaging/react";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import type { LivePresence } from "../presence";
import type { SessionMemberRow } from "../service";
import { openDirectLine } from "../service";

const READS_IT: Record<LivePresence, string> = {
  busy: "reads it at its next tool call",
  idle: "reads it when its next turn starts",
  ended: "reads it if it resumes",
};

/**
 * Where the person's newest message stands with the session: delivered (the
 * session's hook confirmed it) or sent and waiting, with when it will be read.
 */
function DeliveryLine({
  roomId,
  member,
  presence,
}: {
  roomId: string;
  member: SessionMemberRow | null;
  presence: LivePresence;
}) {
  const { messages } = useConversation(asConversationId(roomId));
  const mine = [...messages]
    .reverse()
    .find((m) => m.metadata.actor_kind !== "agent" && m.deliveryState !== "failed");
  const deliveredAt = member?.delivered_at ? Date.parse(member.delivered_at) : NaN;
  let text: string;
  if (!mine) {
    text = `${presence === "busy" ? "Busy" : presence === "idle" ? "Idle" : "Ended"}: ${READS_IT[presence]}`;
  } else if (!Number.isNaN(deliveredAt) && Date.parse(mine.createdAt) <= deliveredAt) {
    text = `Delivered to the session ${formatMessageTime(member?.delivered_at ?? mine.createdAt)}`;
  } else {
    text = `Sent, not yet read: it ${READS_IT[presence]}`;
  }
  return (
    <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground" aria-live="polite">
      {text}
    </div>
  );
}

/**
 * The person's direct line to one session — ONE composer, from the first
 * message on. The line is opened (created on first use) through the
 * agent-messages service when the session is opened, so the session is a
 * member and delivery runs; posting is the messaging package's own send.
 */
export function DirectLine({
  address,
  roomId,
  presence,
  member,
  onCreated,
}: {
  address: string;
  roomId: string | null;
  presence: LivePresence;
  member: SessionMemberRow | null;
  onCreated: (roomId: string) => void;
}) {
  const [failed, setFailed] = useState<{ address: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const error = failed?.address === address ? failed.message : null;
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    if (roomId) return;
    let current = true;
    void openDirectLine(address)
      .then(({ roomId: opened }) => {
        if (current) onCreatedRef.current(opened);
      })
      .catch((cause: unknown) => {
        if (current) {
          setFailed({
            address,
            message: cause instanceof Error ? cause.message : "The direct line did not open.",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [address, roomId, attempt]);

  if (!roomId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          Opening the direct line
        </div>
        <div className="flex-1" />
        {error ? (
          <div className="p-3">
            <ErrorNotice message={error} size="inline" />
            <button type="button" className="text-xs underline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="m-3 h-11 animate-pulse rounded-lg bg-muted/60" />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DeliveryLine roomId={roomId} member={member} presence={presence} />
      <ConversationPane
        key={roomId}
        conversationId={roomId}
        showHeader={false}
        showAi={false}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
