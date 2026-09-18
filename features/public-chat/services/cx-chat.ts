/**
 * cx-chat service — Server-side Supabase queries for cx_ tables.
 *
 * Used by: Route Handlers, Server Actions.
 * Client components should call these through API routes.
 */

import { createClient } from "@/utils/supabase/server";
import type {
  CxConversation,
  CxConversationInsert,
  CxConversationUpdate,
  CxConversationSummary,
  CxMessage,
  CxMessageInsert,
  CxToolCall,
  CxConversationWithMessages,
} from "../types/cx-tables";

type CxDatabaseClient = Awaited<ReturnType<typeof createClient>>;

// ============================================================================
// cx_conversation queries
// ============================================================================

/** Get a single conversation by ID */
export async function getCxConversation(
  conversationId: string,
  client?: CxDatabaseClient,
): Promise<CxConversation | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .select("*")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .single();

  if (error) {
    console.error("getCxConversation error:", error);
    return null;
  }
  return data;
}

/** Create a new conversation */
export async function createCxConversation(
  // 🚨 THE CALLER NAMES THE ORGANIZATION. `organization_id` used to be
  // optional here and was resolved server-side into the session's PERSONAL
  // organization when the caller left it out — a conversation filed in a
  // private workspace nobody chose. It is required now, and the route that
  // calls this reads it from `X-Organization-Id` and refuses without one.
  // common-docs/policies/context-is-carried-never-rebuilt.md rule 4.
  conversation: CxConversationInsert,
): Promise<CxConversation | null> {
  const supabase = await createClient();
  if (!conversation.organization_id) {
    throw new Error(
      "createCxConversation was called without an organization. The conversation is filed in the organization the caller is acting in \u2014 read it at the request boundary and pass it in.",
    );
  }
  const insert: CxConversationInsert = {
    ...conversation,
    // Named explicitly so the write READS as carrying its organization — the
    // sibling guard `scripts/check-org-insert-scope.ts` judges the payload it
    // can see, and a spread alone hides which tenant this row lands in.
    organization_id: conversation.organization_id,
  };
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("createCxConversation error:", error);
    return null;
  }
  return data;
}

/** Update a conversation (rename, change status, etc.) */
export async function updateCxConversation(
  conversationId: string,
  updates: CxConversationUpdate,
): Promise<CxConversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    .update(updates)
    .eq("id", conversationId)
    .select()
    .single();

  if (error) {
    console.error("updateCxConversation error:", error);
    return null;
  }
  return data;
}

/** Soft-delete a conversation */
export async function deleteCxConversation(
  conversationId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("chat")
    .from("conversation")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", conversationId);

  if (error) {
    console.error("deleteCxConversation error:", error);
    return false;
  }
  return true;
}

// ============================================================================
// Chat history queries (for sidebar)
// ============================================================================

/** Get conversation history for an authenticated user */
export async function getUserChatHistory(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<CxConversationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("conversation")
    // Ownership is `created_by` (canonical, trigger-stamped); `user_id` is
    // deprecated and slated for drop. RLS also gates this query by visibility.
    .select("id, title, status, message_count, created_at, updated_at")
    .eq("created_by", userId)
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("getUserChatHistory error:", error);
    return [];
  }
  return (data || []) as CxConversationSummary[];
}

// ============================================================================
// cx_message queries
// ============================================================================

/** Get all active messages for a conversation, ordered by position */
export async function getCxMessages(
  conversationId: string,
): Promise<CxMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    // Hide model-plumbing rows (e.g. an agent-handoff tool_use/tool_result pair):
    // they carry is_visible_to_user=false and must never render as chat bubbles.
    // Column is NOT NULL DEFAULT true, so .eq(true) is exact (matches the main-chat
    // read path: get_cx_conversation_bundle RPC + conversation-bundle fallback).
    .eq("is_visible_to_user", true)
    .order("position", { ascending: true });

  if (error) {
    console.error("getCxMessages error:", error);
    return [];
  }
  return (data || []) as CxMessage[];
}

/** Create a single message */
export async function createCxMessage(
  message: CxMessageInsert,
  client?: CxDatabaseClient,
): Promise<CxMessage | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .insert(message)
    .select()
    .single();

  if (error) {
    console.error("createCxMessage error:", error);
    return null;
  }
  return data as CxMessage;
}

/** Bulk insert messages (e.g., saving a complete conversation) */
export async function bulkCreateCxMessages(
  messages: CxMessageInsert[],
): Promise<CxMessage[]> {
  if (messages.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .insert(messages)
    .select();

  if (error) {
    console.error("bulkCreateCxMessages error:", error);
    return [];
  }
  return (data || []) as CxMessage[];
}

// ============================================================================
// cx_tool_call queries
// ============================================================================

/** Get all tool calls for a conversation, ordered by creation time */
export async function getCxToolCalls(
  conversationId: string,
): Promise<CxToolCall[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("chat")
    .from("tool_call")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getCxToolCalls error:", error);
    return [];
  }
  return data || [];
}

// ============================================================================
// Composite queries
// ============================================================================

/** Load a full conversation with all messages and tool calls */
export async function loadFullConversation(
  conversationId: string,
): Promise<CxConversationWithMessages | null> {
  const conversation = await getCxConversation(conversationId);
  if (!conversation) return null;

  // Fetch messages and tool calls in parallel
  const [messages, toolCalls] = await Promise.all([
    getCxMessages(conversationId),
    getCxToolCalls(conversationId),
  ]);

  return {
    conversation,
    messages,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
