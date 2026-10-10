"use client";

import { useMemo } from "react";
import { asConversationId, type Message, type RecipientDelivery } from "@ai-matrx/messaging";
import { useConversation } from "@ai-matrx/messaging/react";
import type { LiveSession } from "./useLiveHub";
import type { AgentMemberInfo, SessionMemberRow } from "./service";
import { expiredByMember, recipientDeliveryFor, type DeliveryRecipient } from "./delivery";

/**
 * The hub's `deliveryStatusFor` for one room: each message's state with every
 * session and manager-agent member, from the member rows `useLiveHub` keeps
 * live. Memoized on the rows and the thread, so the bubbles re-render only
 * when a cursor or a message actually moves.
 */
export function useRoomDelivery(
  roomId: string | null,
  members: readonly SessionMemberRow[],
  sessions: readonly LiveSession[],
  agentInfo: Readonly<Record<string, AgentMemberInfo>>,
): ((message: Message) => readonly RecipientDelivery[] | null) | undefined {
  const { messages } = useConversation(roomId ? asConversationId(roomId) : null);
  return useMemo(() => {
    if (!roomId) return undefined;
    const inRoom = members.filter((m) => m.conversation_id === roomId);
    if (inRoom.length === 0) return undefined;
    const recipients: DeliveryRecipient[] = inRoom.map((member) => {
      if (member.member_kind === "agent_conversation") {
        return {
          member,
          label: agentInfo[member.member_id]?.agentName ?? "AI Matrx agent",
          actorIds: [`agent_conversation:${member.member_id}`],
          remote: false,
        };
      }
      const session = sessions.find((s) => s.bindingIds.includes(member.member_id)) ?? null;
      const bindings = session?.bindingIds ?? [member.member_id];
      return {
        member,
        label: session?.title ?? "Session",
        actorIds: bindings.map((id) => `coding_session:${id}`),
        remote: session?.remote ?? false,
      };
    });
    const order = new Map(messages.map((m, i) => [m.id as string, i]));
    const expired = expiredByMember(messages);
    return (message: Message) => recipientDeliveryFor(message, order, recipients, expired);
  }, [roomId, members, sessions, agentInfo, messages]);
}
