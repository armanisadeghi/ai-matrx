/**
 * comparisonSetsService — React → Supabase direct CRUD for
 * `cmp_comparison_sets` and `cmp_comparison_entries`.
 *
 * Per CLAUDE.md, no Next.js API route sits in front of this. RLS on the
 * tables restricts access to the owner.
 *
 * The new tables aren't yet in the generated `database.types.ts`. We use
 * `from(... as never)` to bypass the typed-table check on this surface
 * and lift the raw rows through our own `ComparisonSetRow` /
 * `ComparisonEntryRow` types. When the types are regenerated, drop the
 * `as never` casts.
 */

import { createClient } from "@/utils/supabase/client";
import type {
  ComparisonEntryRow,
  ComparisonSetRow,
  LoadedComparisonSet,
} from "../types";

export interface CreateComparisonSetInput {
  name: string;
  userId: string;
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpsertEntryInput {
  conversationId: string;
  displayOrder: number;
  agentId: string;
  agentVersion: number | null;
  agentVersionSnapshotId: string | null;
  metadata?: Record<string, unknown>;
}

const supabase = () => createClient();
const SETS = "cmp_comparison_sets" as never;
const ENTRIES = "cmp_comparison_entries" as never;

export async function createComparisonSet(
  input: CreateComparisonSetInput,
): Promise<ComparisonSetRow> {
  const { data, error } = await supabase()
    .from(SETS)
    .insert({
      name: input.name,
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      project_id: input.projectId ?? null,
      task_id: input.taskId ?? null,
      metadata: input.metadata ?? {},
    } as never)
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as ComparisonSetRow;
}

export async function renameComparisonSet(
  setId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase()
    .from(SETS)
    .update({ name } as never)
    .eq("id", setId);
  if (error) throw error;
}

export async function listComparisonSets(
  userId: string,
  limit = 50,
): Promise<ComparisonSetRow[]> {
  const { data, error } = await supabase()
    .from(SETS)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as ComparisonSetRow[];
}

export async function loadComparisonSet(
  setId: string,
): Promise<LoadedComparisonSet> {
  const client = supabase();

  const [setRes, entriesRes] = await Promise.all([
    client.from(SETS).select("*").eq("id", setId).single(),
    client
      .from(ENTRIES)
      .select("*")
      .eq("comparison_set_id", setId)
      .order("display_order", { ascending: true }),
  ]);

  if (setRes.error) throw setRes.error;
  if (entriesRes.error) throw entriesRes.error;

  return {
    set: setRes.data as unknown as ComparisonSetRow,
    entries: (entriesRes.data ?? []) as unknown as ComparisonEntryRow[],
  };
}

export async function deleteComparisonSet(setId: string): Promise<void> {
  const { error } = await supabase().from(SETS).delete().eq("id", setId);
  if (error) throw error;
}

/**
 * Replace all entries in a set with the provided list. Used on every save —
 * we wipe + re-insert rather than diff (small N, simpler invariants).
 */
export async function replaceEntries(
  setId: string,
  entries: UpsertEntryInput[],
): Promise<ComparisonEntryRow[]> {
  const client = supabase();

  const { error: delErr } = await client
    .from(ENTRIES)
    .delete()
    .eq("comparison_set_id", setId);
  if (delErr) throw delErr;

  if (entries.length === 0) return [];

  const rows = entries.map((e) => ({
    comparison_set_id: setId,
    conversation_id: e.conversationId,
    display_order: e.displayOrder,
    agent_id: e.agentId,
    agent_version: e.agentVersion,
    agent_version_snapshot_id: e.agentVersionSnapshotId,
    metadata: e.metadata ?? {},
  }));

  const { data, error } = await client
    .from(ENTRIES)
    .insert(rows as never)
    .select("*");

  if (error) throw error;
  return (data ?? []) as unknown as ComparisonEntryRow[];
}
