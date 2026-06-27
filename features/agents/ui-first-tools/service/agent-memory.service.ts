/**
 * cx_agent_memory — per-conversation ephemeral KV scratchpad.
 * The agent thinks of this as "session memory" (cleared on conversation
 * boundary). Distinct from agent_user_kv (cross-conversation persistent).
 */

import { db } from "./supabase-typed";
import type { CxAgentMemoryRow } from "../tools/types";

export async function getMemory(
  conversationId: string,
  key: string,
): Promise<unknown> {
  const { data, error } = await db
    .schema("chat").from("agent_memory")
    .select("value")
    .eq("conversation_id", conversationId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function setMemory(
  conversationId: string,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await db.schema("chat").from("agent_memory").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      key,
      value: value as object,
    },
    { onConflict: "conversation_id,key" },
  );
  if (error) throw error;
}

export async function listMemoryKeys(
  conversationId: string,
): Promise<string[]> {
  const { data, error } = await db
    .schema("chat").from("agent_memory")
    .select("key")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.key as string);
}

export async function deleteMemory(
  conversationId: string,
  key: string,
): Promise<void> {
  const { error } = await db
    .schema("chat").from("agent_memory")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("key", key);
  if (error) throw error;
}

export async function listMemoryEntries(
  conversationId: string,
): Promise<CxAgentMemoryRow[]> {
  const { data, error } = await db
    .schema("chat").from("agent_memory")
    .select("*")
    .eq("conversation_id", conversationId);
  if (error) throw error;
  return (data ?? []) as CxAgentMemoryRow[];
}
