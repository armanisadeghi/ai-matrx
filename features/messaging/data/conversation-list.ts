import { z } from "zod";

import type { Database } from "@/types/database.types";
import type {
  ConversationWithDetails,
  ParticipantWithUser,
} from "@/features/messaging/types";

export type DmConversationRpcRow =
  Database["public"]["Functions"]["get_dm_conversations_with_details"]["Returns"][number];

const participantSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "member"]),
  joined_at: z.string().nullable(),
  last_read_at: z.string().nullable(),
  is_muted: z.boolean(),
  is_archived: z.boolean(),
  user: z.object({
    user_id: z.string().uuid(),
    email: z.string().nullable(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
});

/** Validate the JSON aggregate returned by the guarded conversation-list RPC. */
export function parseConversationParticipants(
  value: DmConversationRpcRow["participants"],
): ParticipantWithUser[] {
  return z.array(participantSchema).parse(value);
}

/** Project one canonical RPC row into the Redux/UI conversation contract. */
export function toConversationWithDetails(
  row: DmConversationRpcRow,
  userId: string,
): ConversationWithDetails {
  const participants = parseConversationParticipants(row.participants);
  const otherParticipant = participants.find(
    (participant) => participant.user_id !== userId,
  );

  return {
    id: row.conversation_id,
    type: row.conversation_type === "group" ? "group" : "direct",
    group_name: row.group_name,
    group_image_url: row.group_image_url,
    created_by: null,
    created_at: row.conversation_created_at,
    updated_at: row.conversation_updated_at,
    participants,
    last_message: row.last_message_content
      ? {
          id: "",
          conversation_id: row.conversation_id,
          sender_id: row.last_message_sender_id,
          content: row.last_message_content,
          message_type: "text",
          media_url: null,
          media_thumbnail_url: null,
          media_metadata: null,
          status: "sent",
          reply_to_id: null,
          deleted_at: null,
          deleted_for_everyone: false,
          created_at: row.last_message_at,
          edited_at: null,
          client_message_id: null,
          action_data: null,
          metadata: {},
        }
      : null,
    unread_count: row.unread_count,
    display_name:
      row.conversation_type === "direct" && otherParticipant
        ? otherParticipant.user?.display_name ||
          otherParticipant.user?.email ||
          "Unknown"
        : row.group_name || "Group Chat",
    display_image:
      row.conversation_type === "direct" && otherParticipant
        ? otherParticipant.user?.avatar_url
        : row.group_image_url,
  };
}
