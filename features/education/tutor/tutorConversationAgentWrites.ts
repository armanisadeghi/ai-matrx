import type { AppDispatch } from "@/lib/redux/store";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  renameConversation,
  setConversationArchived,
} from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { softDeleteConversation } from "@/features/agents/redux/execution-system/message-crud/soft-delete-conversation.thunk";

export interface OwnedTutorConversation {
  id: string;
  title: string | null;
  status: string;
}

type RenamePlan = { conversation: OwnedTutorConversation; title: string };
type ArchivePlan = { conversation: OwnedTutorConversation; archived: boolean };
type DeletePlan = { conversation: OwnedTutorConversation };

function record(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects one JSON object.`);
  }
  return { ...value };
}

function loadedConversation(
  value: unknown,
  target: string,
  conversations: readonly OwnedTutorConversation[],
): OwnedTutorConversation {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${target}.conversation_id must name a loaded tutor conversation.`);
  }
  const conversation = conversations.find((candidate) => candidate.id === value);
  if (!conversation) {
    throw new Error(
      `${target}.conversation_id is not an owned, loaded AI Tutor conversation. Refresh the Tutor list and use an id from owned_tutor_conversations.`,
    );
  }
  return conversation;
}

export function parseTutorConversationRename(
  value: unknown,
  conversations: readonly OwnedTutorConversation[],
): RenamePlan {
  const target = "rename_tutor_conversation";
  const input = record(value, target);
  const conversation = loadedConversation(input.conversation_id, target, conversations);
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new Error(`${target}.title must be a non-empty string.`);
  }
  return { conversation, title: input.title.trim() };
}

export function parseTutorConversationArchive(
  value: unknown,
  conversations: readonly OwnedTutorConversation[],
): ArchivePlan {
  const target = "archive_tutor_conversation";
  const input = record(value, target);
  const conversation = loadedConversation(input.conversation_id, target, conversations);
  if (typeof input.archived !== "boolean") {
    throw new Error(`${target}.archived must be true to archive or false to restore.`);
  }
  return { conversation, archived: input.archived };
}

export function parseTutorConversationDelete(
  value: unknown,
  conversations: readonly OwnedTutorConversation[],
): DeletePlan {
  const target = "delete_tutor_conversation";
  const input = record(value, target);
  return {
    conversation: loadedConversation(input.conversation_id, target, conversations),
  };
}

/** Uses the same thunks as the canonical conversation row menu. */
export function tutorConversationWriteHandlers(
  dispatch: AppDispatch,
  conversations: readonly OwnedTutorConversation[],
): SurfaceWriteHandlers {
  return {
    rename_tutor_conversation: {
      validate: (value) => {
        parseTutorConversationRename(value, conversations);
      },
      apply: async (value) => {
        const plan = parseTutorConversationRename(value, conversations);
        await dispatch(
          renameConversation({
            conversationId: plan.conversation.id,
            title: plan.title,
          }),
        ).unwrap();
        return {
          summary: `Renamed tutor conversation to “${plan.title}”.`,
          data: { conversation_id: plan.conversation.id, title: plan.title },
        };
      },
    },
    archive_tutor_conversation: {
      validate: (value) => {
        parseTutorConversationArchive(value, conversations);
      },
      apply: async (value) => {
        const plan = parseTutorConversationArchive(value, conversations);
        const result = await dispatch(
          setConversationArchived({
            conversationId: plan.conversation.id,
            archived: plan.archived,
          }),
        ).unwrap();
        return {
          summary:
            result.status === "archived"
              ? "Archived tutor conversation."
              : "Restored tutor conversation.",
          data: {
            conversation_id: plan.conversation.id,
            status: result.status,
          },
        };
      },
    },
    delete_tutor_conversation: {
      validate: (value) => {
        parseTutorConversationDelete(value, conversations);
      },
      apply: async (value) => {
        const plan = parseTutorConversationDelete(value, conversations);
        await dispatch(
          softDeleteConversation({ conversationId: plan.conversation.id }),
        ).unwrap();
        return {
          summary: "Moved tutor conversation to Trash. It can be restored from Trash.",
          data: { conversation_id: plan.conversation.id, deleted: true },
        };
      },
    },
  };
}
