/**
 * agent_user_kv — persistent per-user KV. Survives conversation reset.
 * The agent thinks of this as "long-term storage."
 */

import { db } from "./supabase-typed";

export async function getKv(userId: string, key: string): Promise<unknown> {
  const { data, error } = await db
    .from("agent_user_kv")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function setKv(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const { error } = await db.from("agent_user_kv").upsert(
    {
      user_id: userId,
      key,
      value: value as object,
    },
    { onConflict: "user_id,key" },
  );
  if (error) throw error;
}

export async function listKvKeys(userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("agent_user_kv")
    .select("key")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.key as string);
}

export async function deleteKv(userId: string, key: string): Promise<void> {
  const { error } = await db
    .from("agent_user_kv")
    .delete()
    .eq("user_id", userId)
    .eq("key", key);
  if (error) throw error;
}
