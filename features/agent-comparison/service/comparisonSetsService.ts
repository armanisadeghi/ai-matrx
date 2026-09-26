/**
 * comparisonSetsService — React → Supabase direct CRUD for
 * `cmp_comparison_sets` and `cmp_comparison_entries`.
 *
 * Per CLAUDE.md, no Next.js API route sits in front of this. RLS on the
 * tables restricts access to the owner.
 */

import { createClient } from "@/utils/supabase/client";
import { writeOne } from "@/utils/supabase/writeOne";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
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

const supabase = () => createClient().schema("agent");

export async function createComparisonSet(
  input: CreateComparisonSetInput,
): Promise<ComparisonSetRow> {
  const { data, error } = await supabase()
    .schema("agent").from("cmp_comparison_sets")
    .insert({
      name: input.name,
      created_by: input.userId,
      organization_id: await ensureOrgId(input.organizationId),
      project_id: input.projectId ?? null,
      task_id: input.taskId ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ComparisonSetRow;
}

export async function renameComparisonSet(
  setId: string,
  name: string,
): Promise<void> {
  await writeOne(
    supabase()
      .schema("agent").from("cmp_comparison_sets")
      .update({ name })
      .eq("id", setId)
      .select("id"),
    { action: "rename", noun: "comparison" },
  );
}

export async function listComparisonSets(
  userId: string,
  limit = 50,
): Promise<ComparisonSetRow[]> {
  const { data, error } = await supabase()
    .schema("agent").from("cmp_comparison_sets")
    .select("*")
    .is("deleted_at", null)
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ComparisonSetRow[];
}

export async function loadComparisonSet(
  setId: string,
): Promise<LoadedComparisonSet> {
  const client = supabase();

  const [setRes, entriesRes] = await Promise.all([
    client
      .schema("agent").from("cmp_comparison_sets")
      .select("*")
      .is("deleted_at", null)
      .eq("id", setId)
      .single(),
    client
      .schema("agent").from("cmp_comparison_entries")
      .select("*")
      .eq("comparison_set_id", setId)
      .order("display_order", { ascending: true }),
  ]);

  if (setRes.error) throw setRes.error;
  if (entriesRes.error) throw entriesRes.error;

  return {
    set: setRes.data as ComparisonSetRow,
    entries: (entriesRes.data ?? []) as ComparisonEntryRow[],
  };
}

/**
 * Whether a saved battle is readable, and the mode it was built in
 * (`metadata.mode`). Lets a battle URL opened on the wrong mode page go to the
 * page that can rebuild it, and lets a missing battle say so plainly.
 */
export async function getComparisonSetMode(
  setId: string,
): Promise<{ found: boolean; mode: string | null }> {
  const { data, error } = await supabase()
    .schema("agent").from("cmp_comparison_sets")
    .select("metadata")
    .is("deleted_at", null)
    .eq("id", setId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { found: false, mode: null };
  const mode = (data.metadata as { mode?: unknown } | null)?.mode;
  return { found: true, mode: typeof mode === "string" ? mode : null };
}

export async function deleteComparisonSet(setId: string): Promise<void> {
  // Soft delete, never a hard one (owner ruling 2026-09-20; db-rules §8):
  // `listComparisonSets` and `loadComparisonSet` both filter `deleted_at`.
  // The set's ENTRIES stay a hard wipe-and-reinsert on every save — they are
  // never a record a person manages on their own.
  await writeOne(
    supabase()
      .schema("agent").from("cmp_comparison_sets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", setId)
      .is("deleted_at", null)
      .select("id, deleted_at"),
    {
      action: "delete",
      noun: "comparison",
      alreadyDone: {
        reread: () =>
          supabase()
            .schema("agent").from("cmp_comparison_sets")
            .select("id, deleted_at")
            .eq("id", setId)
            .maybeSingle(),
        isDone: (row) => row.deleted_at != null,
      },
    },
  );
}

/**
 * Rewrite a set's locked setup (`metadata`). Every mode stores what it holds
 * constant across columns here — the agent, version, shared request and
 * variables — so a re-save that only rewrote the entries used to drop every
 * change made to that setup after the first save.
 */
export async function updateComparisonSetMetadata(
  setId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await writeOne(
    supabase()
      .schema("agent").from("cmp_comparison_sets")
      .update({ metadata })
      .eq("id", setId)
      .select("id"),
    { action: "save", noun: "comparison" },
  );
}

/**
 * Make a set's entries exactly the provided list. Used on every save.
 *
 * Upsert first, then remove the entries that are no longer in the list: a
 * failed write therefore leaves the previous columns in place instead of an
 * empty battle (the old wipe-then-insert lost every column whenever the
 * insert failed). Entries stay a hard delete — they are never a record a
 * person manages on their own (see `deleteComparisonSet`).
 */
export async function replaceEntries(
  setId: string,
  entries: UpsertEntryInput[],
): Promise<ComparisonEntryRow[]> {
  const client = supabase();

  let written: ComparisonEntryRow[] = [];
  if (entries.length > 0) {
    // organization_id is NOT NULL on entries — inherit it from the owning set.
    const { data: setRow, error: setErr } = await client
      .schema("agent").from("cmp_comparison_sets")
      .select("organization_id")
      .eq("id", setId)
      .single();
    if (setErr) throw setErr;

    const rows = entries.map((e) => ({
      comparison_set_id: setId,
      organization_id: setRow.organization_id,
      conversation_id: e.conversationId,
      display_order: e.displayOrder,
      agent_id: e.agentId,
      agent_version: e.agentVersion,
      agent_version_snapshot_id: e.agentVersionSnapshotId,
      metadata: e.metadata ?? {},
    }));

    const { data, error } = await client
      .schema("agent").from("cmp_comparison_entries")
      .upsert(rows, { onConflict: "comparison_set_id,conversation_id" })
      .select("*");
    if (error) throw error;
    written = (data ?? []) as ComparisonEntryRow[];
  }

  let stale = client
    .schema("agent").from("cmp_comparison_entries")
    .delete()
    .eq("comparison_set_id", setId);
  if (entries.length > 0) {
    const keep = entries.map((e) => e.conversationId).join(",");
    stale = stale.not("conversation_id", "in", `(${keep})`);
  }
  const { error: delErr } = await stale;
  if (delErr) throw delErr;

  return written;
}
