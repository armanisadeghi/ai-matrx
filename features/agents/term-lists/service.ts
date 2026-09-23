/**
 * Term lists — data access, direct to Supabase (RLS decides).
 *
 * Rows: `agent.term_list`. Attachment to an agent: an association edge
 * `agent_term_list -> agent`, role `term_list`, written ONLY through
 * `associationsService` (the one chokepoint). `metadata` is system-only (the
 * server caches vendor glossary / dictionary ids there) — never written here.
 */

import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  TERM_LIST_ROLE,
  TERM_LIST_TOKEN,
  entriesFromJson,
  isModality,
  normalizeEntries,
  type Modality,
  type TermEntry,
  type TermList,
} from "./types";

const COLUMNS =
  "id, organization_id, name, description, modalities, context, source_language, entries, version, updated_at";

function db() {
  return supabase.schema("agent").from("term_list");
}

type TermListRow = Pick<
  Database["agent"]["Tables"]["term_list"]["Row"],
  | "id"
  | "organization_id"
  | "name"
  | "description"
  | "modalities"
  | "context"
  | "source_language"
  | "entries"
  | "version"
  | "updated_at"
>;

/** The stored jsonb shape: only the keys an entry actually carries. */
function entriesToJson(entries: TermEntry[]): Json {
  return normalizeEntries(entries).map((e) => {
    const out: { [key: string]: Json } = { term: e.term, kind: e.kind };
    if (e.value !== undefined) out.value = e.value;
    if (e.language !== undefined) out.language = e.language;
    if (e.case_sensitive) out.case_sensitive = true;
    return out;
  });
}

function toTermList(row: TermListRow): TermList {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    modalities: (row.modalities ?? []).filter(isModality),
    context: row.context,
    source_language: row.source_language,
    entries: entriesFromJson(row.entries),
    version: row.version,
    updated_at: row.updated_at,
  };
}

/** Every live term list in an organization (complete — read with readAllRows). */
export async function listTermLists(organizationId: string): Promise<TermList[]> {
  const rows = await readAllRows<TermListRow>(
    ({ from, to }) =>
      db()
        .select(COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "agent.term_list" },
  );
  return rows.map(toTermList);
}

export async function getTermList(id: string): Promise<TermList | null> {
  const { data, error } = await db()
    .select(COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the term list: ${error.message}`);
  return data ? toTermList(data) : null;
}

export interface TermListDraft {
  name: string;
  description?: string | null;
  modalities: Modality[];
  context?: string | null;
  source_language?: string | null;
  entries: TermEntry[];
}

export async function createTermList(
  draft: TermListDraft,
  organizationId?: string | null,
): Promise<TermList> {
  const orgId = await ensureOrgId(organizationId);
  const { data, error } = await db()
    .insert({
      organization_id: orgId,
      name: draft.name.trim(),
      description: draft.description ?? null,
      modalities: draft.modalities,
      context: draft.context ?? null,
      source_language: draft.source_language ?? null,
      entries: entriesToJson(draft.entries),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Couldn't create the term list: ${error.message}`);
  return toTermList(data);
}

export type SaveResult =
  | { status: "saved"; list: TermList }
  | { status: "conflict"; current: TermList }
  | { status: "not_found" };

/**
 * Save an edit with the version compare-and-swap. The server bumps `version`
 * when it caches a vendor artifact in metadata; `rebase` treats that as a
 * phantom (none of the fields this editor writes moved) and retries.
 */
export async function saveTermList(
  base: TermList,
  draft: TermListDraft,
): Promise<SaveResult> {
  const patch = {
    name: draft.name.trim(),
    description: draft.description ?? null,
    modalities: draft.modalities,
    context: draft.context ?? null,
    source_language: draft.source_language ?? null,
    entries: entriesToJson(draft.entries),
  };
  const baseFields = JSON.stringify(editableFields(base));
  const result = await guardedUpdate<TermListRow>({
    expectedVersion: base.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db()
        .update({ ...patch, version: nextVersion })
        .eq("id", base.id)
        .eq("version", expectedVersion)
        .select(COLUMNS)
        .maybeSingle(),
    fetchCurrent: () => db().select(COLUMNS).eq("id", base.id).maybeSingle(),
    rebase: {
      isPhantom: (current) =>
        JSON.stringify(editableFields(toTermList(current))) === baseFields,
    },
  });
  if (result.status === "saved") return { status: "saved", list: toTermList(result.row) };
  if (result.status === "conflict") {
    return { status: "conflict", current: toTermList(result.currentRow) };
  }
  return { status: "not_found" };
}

function editableFields(list: TermList) {
  return {
    name: list.name,
    description: list.description,
    modalities: list.modalities,
    context: list.context,
    source_language: list.source_language,
    entries: normalizeEntries(list.entries),
  };
}

/** Archive (soft delete). Edges to agents are tombstoned by the platform. */
export async function archiveTermList(id: string): Promise<void> {
  const { error } = await db()
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Couldn't archive the term list: ${error.message}`);
}

// ── attachment to agents ───────────────────────────────────────────────────

export interface AttachedTermList {
  edgeId: string;
  termListId: string;
  label: string | null;
}

export async function listAttachedTermLists(
  agentId: string,
): Promise<AttachedTermList[]> {
  const result = await associationsService.listForTargetsVisible("agent", [agentId]);
  if (isScopesRpcErr(result)) {
    throw new Error(`Couldn't load term lists: ${result.error.message}`);
  }
  return result.data.edges
    .filter((e) => e.role === TERM_LIST_ROLE && e.sourceType === TERM_LIST_TOKEN)
    .map((e) => ({ edgeId: e.id, termListId: e.sourceId, label: e.label }));
}

export async function attachTermList(
  agentId: string,
  list: Pick<TermList, "id" | "name">,
): Promise<void> {
  const result = await associationsService.add({
    sourceType: TERM_LIST_TOKEN,
    sourceId: list.id,
    targetType: "agent",
    targetId: agentId,
    role: TERM_LIST_ROLE,
    label: list.name,
  });
  if (isScopesRpcErr(result)) {
    throw new Error(`Couldn't attach "${list.name}": ${result.error.message}`);
  }
}

export async function detachTermList(agentId: string, termListId: string): Promise<void> {
  const result = await associationsService.remove({
    sourceType: TERM_LIST_TOKEN,
    sourceId: termListId,
    targetType: "agent",
    targetId: agentId,
    role: TERM_LIST_ROLE,
  });
  if (isScopesRpcErr(result)) {
    throw new Error(`Couldn't remove the term list: ${result.error.message}`);
  }
}
