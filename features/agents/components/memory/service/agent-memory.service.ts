/**
 * chat.agent_memory — service layer for the user-facing Memory manager.
 *
 * Live schema: id, user_id, organization_id, scope, scope_id, memory_type,
 * key, content, importance, metadata, access_count, last_accessed_at,
 * expires_at, version, created_at, created_by, updated_at, updated_by,
 * deleted_at. `organization_id` / `created_by` / `updated_by` / `updated_at`
 * are stamped by DB triggers — never set them from the client.
 *
 * RLS scopes every read/write to `created_by = auth.uid()` (plus IAM shares),
 * so a plain `select *` here already returns only "my" memories.
 *
 * Deletes are soft (`deleted_at`) — callers must filter `deleted_at is null`.
 */

import { supabase } from "@/utils/supabase/client";
import { slugifyKey } from "@/features/scope-system/utils/slugify";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";
import type {
  AgentMemoryRow,
  CreateAgentMemoryInput,
  UpdateAgentMemoryInput,
} from "../types";

type AgentMemoryUpdate = Database["chat"]["Tables"]["agent_memory"]["Update"];

const TABLE = "agent_memory";
const DEFAULT_MEMORY_TYPE = "long";

function memoryTable() {
  return supabase.schema("chat").from(TABLE);
}

export async function listAgentMemories(): Promise<AgentMemoryRow[]> {
  const { data, error } = await memoryTable()
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentMemoryRow[];
}

function keyFromTitle(title: string): string {
  const base = slugifyKey(title) || "memory";
  return base.slice(0, 120);
}

const UNIQUE_VIOLATION = "23505";

export async function createAgentMemory(
  userId: string,
  input: CreateAgentMemoryInput,
): Promise<AgentMemoryRow> {
  const baseKey = keyFromTitle(input.title);
  let attempt = 0;
  let lastError: unknown = null;

  const organizationId = await ensureOrgId(undefined);

  while (attempt < 4) {
    const key =
      attempt === 0
        ? baseKey
        : `${baseKey}_${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await memoryTable()
      .insert({
        user_id: userId,
        organization_id: organizationId,
        scope: input.scope,
        memory_type: DEFAULT_MEMORY_TYPE,
        key,
        content: input.content,
        importance: input.importance,
        metadata: { title: input.title },
      })
      .select("*")
      .single();
    if (!error) return data as AgentMemoryRow;
    if (error.code !== UNIQUE_VIOLATION) throw error;
    lastError = error;
    attempt += 1;
  }
  throw lastError;
}

export async function updateAgentMemory(
  input: UpdateAgentMemoryInput,
): Promise<AgentMemoryRow> {
  const changes: AgentMemoryUpdate = {};
  if (input.content !== undefined) changes.content = input.content;
  if (input.importance !== undefined) changes.importance = input.importance;
  if (input.metadata !== undefined) changes.metadata = input.metadata;

  const { data, error } = await memoryTable()
    .update(changes)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as AgentMemoryRow;
}

export async function softDeleteAgentMemory(id: string): Promise<void> {
  const { error } = await memoryTable()
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
