/**
 * Per-user memory — Supabase-direct CRUD on `public.user_memory`.
 *
 * Memory is a small, cross-project bag of text files (markdown, notes,
 * preferences) keyed on the user only — it follows the user into every
 * sandbox, where the orchestrator hydrates it into `~/.matrx/memory/` on
 * create and captures edits back on teardown. The canonical copy lives in this
 * table; the box copy is a per-session mirror.
 *
 * RLS scopes every row to `auth.uid() = user_id`, so the UI reads/writes
 * Supabase-direct (matrx-frontend doctrine — no Next.js middle tier for user
 * data). See docs/sandbox/MEMORY_API.md.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Database } from "@/types/database.types";

export type UserMemoryRow = Database["users"]["Tables"]["user_memory"]["Row"];

/** A memory entry as the UI consumes it (the columns the editor needs). */
export interface MemoryEntry {
  path: string;
  content: string;
  updated_at: string;
}

/** List the current user's memory entries, ordered by path. */
export async function listMemory(): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .schema("users").from("user_memory")
    .select("path, content, updated_at")
    .order("path");
  if (error) throw error;
  return data ?? [];
}

/**
 * Create or update one entry by path. The table's UNIQUE (user_id, path)
 * constraint makes this an idempotent upsert.
 */
export async function upsertMemory(
  path: string,
  content: string,
): Promise<void> {
  const userId = requireUserId();
  const { error } = await supabase
    .schema("users").from("user_memory")
    .upsert(
      { user_id: userId, path, content },
      { onConflict: "user_id,path" },
    );
  if (error) throw error;
}

/** Delete one entry by path. */
export async function deleteMemory(path: string): Promise<void> {
  const { error } = await supabase
    .schema("users").from("user_memory")
    .delete()
    .eq("path", path);
  if (error) throw error;
}
