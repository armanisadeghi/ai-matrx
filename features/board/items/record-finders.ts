/**
 * RECORD FINDERS — `RecordDoor.find` for the item types the search projection
 * (`platform.search_items`, what `knowledge_search` reads) does not hold. Each
 * one reads the type's OWN bring-in picker list service — every organization the
 * person can reach, never the active one (access ladder) — and keeps the rows
 * whose name matches, archived rows left out. No new data path.
 */

import { dataHomeTables, type DataHomeTableRow } from "@/features/unified-data/hub/doors";
import { tablesToPick } from "@/features/unified-data/hub/tablePicking";
import { readPickListIndex } from "@/features/data-tables/pick-lists/pick-list-index";
import type { FoundRecord } from "./types";
import { MEETING_PHASE_LABEL, meetingPhase } from "./feature-items.logic";

/** Every word of the query appears in the name (case-insensitive). An empty query matches all. */
export function nameMatches(query: string, name: string): boolean {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const hay = name.toLowerCase();
  return words.every((w) => hay.includes(w));
}

const newestFirst = (a: FoundRecord, b: FoundRecord) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "");

/** Tables, through the table picker's list (`custom.data_home_tables()`, all organizations). */
export async function findTables(
  key: string,
  query: string,
  limit: number,
  read: () => Promise<{ ok: true; data: DataHomeTableRow[] } | { ok: false; error: { message?: string } }>,
): Promise<FoundRecord[]> {
  const answered = await read();
  if (!answered.ok) throw new Error(`Your tables could not be listed: ${answered.error.message ?? "unknown error"}`);
  return tablesToPick(answered.data)
    .filter((t) => nameMatches(query, t.table_name))
    .map((t) => ({ type: key, id: t.table_id, title: t.table_name, updated_at: t.updated_at, snippet: t.organization_name }))
    .sort(newestFirst)
    .slice(0, limit);
}

/** Picklists, through the picklist picker's index (`pick_list_index_everywhere`), archived left out. */
export async function findPickLists(
  key: string,
  query: string,
  limit: number,
  read: () => ReturnType<typeof readPickListIndex>,
): Promise<FoundRecord[]> {
  const answered = await read();
  if (!answered.ok) throw new Error(answered.why, { cause: answered.error });
  const archived = new Set(answered.archivedIds);
  return answered.lists
    .filter((l) => !archived.has(l.id) && nameMatches(query, l.listName))
    .map((l) => ({
      type: key,
      id: l.id,
      title: l.listName,
      updated_at: l.updatedAt,
      ...(l.description ? { snippet: l.description } : {}),
    }))
    .sort(newestFirst)
    .slice(0, limit);
}

/** The meetings the person hosts or is invited to (the meeting picker's list), archived left out. */
export async function findMeetings(
  key: string,
  query: string,
  limit: number,
  read: () => Promise<{
    meetings: readonly {
      id: string;
      title: string;
      deletedAt?: string | null;
      cancelledAt?: string | null;
      scheduledFor: string | null;
      startedAt: string | null;
      endedAt: string | null;
      recurrenceRule?: string | null;
    }[];
  }>,
): Promise<FoundRecord[]> {
  const { meetings } = await read();
  return meetings
    .filter((m) => !m.deletedAt && nameMatches(query, m.title))
    .map((m) => ({
      type: key,
      id: m.id,
      title: m.title,
      updated_at: m.scheduledFor ?? m.startedAt ?? m.endedAt,
      snippet: MEETING_PHASE_LABEL[meetingPhase(m)],
    }))
    .sort(newestFirst)
    .slice(0, limit);
}

/** Workflow runs (the run picker's list), matched on the workflow's name and the run's status. */
export async function findWorkflowRuns(
  key: string,
  query: string,
  limit: number,
  readRuns: () => Promise<
    | { ok: true; rows: readonly { runId: string; definitionId: string | null; status: string; startedAt: string | null }[] }
    | { ok: false; message: string }
  >,
  readNames: (definitionIds: string[]) => Promise<ReadonlyMap<string, { name: string | null }>>,
): Promise<FoundRecord[]> {
  const answered = await readRuns();
  if (!answered.ok) throw new Error(`Your workflow runs could not be listed: ${answered.message}`);
  const names = await readNames([...new Set(answered.rows.flatMap((r) => (r.definitionId ? [r.definitionId] : [])))]).catch(
    () => new Map<string, { name: string | null }>(),
  );
  return answered.rows
    .map((r) => ({ r, name: (r.definitionId ? names.get(r.definitionId)?.name : null) ?? "Workflow run" }))
    .filter(({ r, name }) => nameMatches(query, `${name} ${r.status}`))
    .map(({ r, name }) => ({ type: key, id: r.runId, title: name, updated_at: r.startedAt, snippet: r.status }))
    .sort(newestFirst)
    .slice(0, limit);
}

/**
 * Study kits (the kit picker's list). A kit's id is its anchor's id; an anchor that is not a
 * file carries its type in front (`udt_document:<id>`), which `kitPlace` reads back.
 */
export async function findKits(
  key: string,
  query: string,
  limit: number,
  read: () => Promise<readonly { sourceType: string; sourceId: string; title: string; artifacts: readonly unknown[]; createdAt: string }[]>,
): Promise<FoundRecord[]> {
  return (await read())
    .filter((k) => nameMatches(query, k.title))
    .map((k) => ({
      type: key,
      id: k.sourceType === "file" ? k.sourceId : `${k.sourceType}:${k.sourceId}`,
      title: k.title,
      updated_at: k.createdAt,
      snippet: `${k.artifacts.length} ${k.artifacts.length === 1 ? "study aid" : "study aids"}`,
    }))
    .sort(newestFirst)
    .slice(0, limit);
}

export { dataHomeTables, readPickListIndex };
