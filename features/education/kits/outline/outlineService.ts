// features/education/kits/outline/outlineService.ts
//
// THE KIT OUTLINE, read and started from the browser (living-kit plan W1,
// frontend half). The outline itself is written by the server workflow
// `education_kit_outline` (aidream `graph_actions/education/kit_outline.py`):
// one ordered set of `education.study_structured_section` rows per kit, their
// cited text in `education.study_source_chunk`.
//
// - reads: live rows by `kit_scope_id`, ordered by `position`;
// - start: the system-workflow lane (`POST /workflows/system/education_kit_outline/runs`,
//   subject `kit:<id>`); the server returns the ACTIVE run for the same subject
//   instead of starting a second one, so a double press never pays twice;
// - lookup: `GET …/runs?subject=kit:<id>` — the page reattaches after a refresh;
// - stale: the outline's `metadata.built_by_run_id` names the run that wrote it;
//   that run's `input.sources` is compared with what the kit holds NOW (see
//   `isOutlineStale` for why this, and not the server's content fingerprint).

import { readAllRows } from "@ai-matrx/data/db";
import type { paths } from "@ai-matrx/agents/generated/api-types";
import { supabase } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import type { KitSource } from "../kitScope";
import type { OutlineFact, OutlineSection } from "./types";

/** The system-workflow key of the outline builder (aidream allow-list). */
export const KIT_OUTLINE_WORKFLOW_KEY = "education_kit_outline";
/** The run metadata `source_feature` (COPPA gate + metering read it). */
export const KIT_OUTLINE_SOURCE_FEATURE = "education-kit-outline";

/**
 * 🚨 LOCAL PATH LITERAL — the generated api-types do not carry the system lane
 * yet (aidream half shipped 2026-10-09); the `as keyof paths` cast is the repo
 * precedent (`features/mandates/overrides.ts`) and becomes `satisfies` once
 * `pnpm sync-types` picks the route up.
 */
const SYSTEM_RUNS_PATH = "/workflows/system/{key}/runs" as keyof paths;

/** The subject one kit's outline runs are filed under. */
export function kitOutlineSubject(kitId: string): string {
  return `kit:${kitId}`;
}

// ─── Pure: rows → sections ───────────────────────────────────────────────────

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

export interface OutlineRow {
  id: string;
  position: number | null;
  title: string | null;
  summary: string | null;
  body: string | null;
  claims: Json | null;
  metadata: Json | null;
}

/** One stored row as the section generation and coverage read. */
export function outlineSectionFromRow(row: OutlineRow, index: number): OutlineSection {
  const facts: OutlineFact[] = (Array.isArray(row.claims) ? row.claims : [])
    .map((c) => obj(c))
    .map((c) => ({
      statement: typeof c.statement === "string" ? c.statement.trim() : "",
      chunkIds: strings(c.source_chunk_ids),
    }))
    .filter((f) => f.statement.length > 0);
  const cited = strings(obj(row.metadata).cited_chunk_ids);
  const chunkIds = [...new Set([...cited, ...facts.flatMap((f) => f.chunkIds)])];
  return {
    id: row.id,
    position: row.position ?? index,
    title: row.title?.trim() || `Section ${index + 1}`,
    summary: row.summary?.trim() ?? "",
    body: row.body ?? "",
    facts,
    chunkIds,
  };
}

/** Rows (any order) → sections in reading order. */
export function outlineSectionsFromRows(rows: readonly OutlineRow[]): OutlineSection[] {
  return [...rows]
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
    .map(outlineSectionFromRow);
}

/** The run that wrote the outline (every live row carries it; the newest wins). */
export function builtByRunOf(rows: readonly OutlineRow[]): string | null {
  for (const row of rows) {
    const id = obj(row.metadata).built_by_run_id;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/**
 * One section as generation reads it (living-kit decision 4): its cited source
 * text chunk-marked (`### Chunk <id>`, so a citation still resolves), then its
 * key facts. Falls back to the section body when no cited text was stored.
 */
export function sectionGroupText(
  section: Pick<OutlineSection, "title" | "body" | "facts">,
  chunks: readonly { id: string; content: string }[],
): string {
  const parts: string[] = [`## ${section.title}`];
  const cited = chunks.filter((c) => c.content.trim());
  if (cited.length > 0) {
    for (const c of cited) parts.push(`### Chunk ${c.id}\n${c.content.trim()}`);
  } else if (section.body.trim()) {
    parts.push(section.body.trim());
  }
  if (section.facts.length > 0) {
    parts.push(`Key facts:\n${section.facts.map((f) => `- ${f.statement}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

// ─── Pure: kit sources → run inputs, and staleness ───────────────────────────

/** One entry of the workflow's `sources` input (exactly one locator). */
export interface OutlineRunSource {
  label: string;
  processed_document_id?: string;
  file_id?: string;
  note?: string;
}

/**
 * Map the kit's Sources onto the outline workflow's input: a landed document
 * by its id (no re-extraction), a file by its id, a note by its text. A Source
 * of any other kind is returned in `skipped` so the page can name it.
 */
export function outlineRunSources(
  sources: readonly Pick<KitSource, "type" | "id" | "title">[],
  noteText: ReadonlyMap<string, string>,
): { sources: OutlineRunSource[]; skipped: string[] } {
  const out: OutlineRunSource[] = [];
  const skipped: string[] = [];
  for (const s of sources) {
    const label = s.title?.trim() || "Source";
    if (s.type === "processed_document") out.push({ label, processed_document_id: s.id });
    else if (s.type === "file" || s.type === "cld_file") out.push({ label, file_id: s.id });
    else if (s.type === "note") {
      const text = noteText.get(s.id)?.trim();
      if (text) out.push({ label, note: text });
      else skipped.push(label);
    } else skipped.push(label);
  }
  return { sources: out, skipped };
}

/** The identity of one run source — what it reads, never what it is called. */
export function outlineSourceKey(s: OutlineRunSource | Record<string, unknown>): string {
  const r = s as Record<string, unknown>;
  if (typeof r.processed_document_id === "string" && r.processed_document_id) return `processed_document:${r.processed_document_id}`;
  if (typeof r.file_id === "string" && r.file_id) return `file:${r.file_id}`;
  if (typeof r.note === "string") return `note:${r.note.trim()}`;
  return "unknown";
}

/**
 * Is the outline older than the kit's material? True when the Sources the kit
 * holds now (same mapping the start uses) differ from the Sources the run that
 * wrote the outline read — a Source added, removed, or a note edited.
 *
 * Why not the server's `metadata.sources_fingerprint`: the server hashes the
 * INGESTED CHUNKS (`sha256` over `kind:media_ref|content_hash` of every chunk,
 * `kit_outline.py sources_fingerprint`), which only exists after text
 * extraction on the server — a browser cannot recompute it without re-reading
 * every file. The run's own input is the same fact one step earlier, exactly.
 * Order-insensitive: reordering Sources rebuilds nothing worth paying for.
 */
export function isOutlineStale(
  now: readonly OutlineRunSource[],
  builtFrom: readonly Record<string, unknown>[] | null,
): boolean {
  if (builtFrom === null) return false; // unknown run: never cry wolf
  const a = now.map(outlineSourceKey).sort();
  const b = builtFrom.map(outlineSourceKey).sort();
  return a.length !== b.length || a.some((k, i) => k !== b[i]);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

const SECTION_COLUMNS = "id,position,title,summary,body,claims,metadata";

/** The kit's live outline rows (archived sections excluded), any order. */
export async function readKitOutlineRows(kitId: string): Promise<OutlineRow[]> {
  return readAllRows<OutlineRow>(
    ({ from, to }) =>
      supabase
        .schema("education")
        .from("study_structured_section")
        .select(SECTION_COLUMNS, { count: "exact" })
        .eq("kit_scope_id", kitId)
        .is("archived_at", null)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "education.study_structured_section kit outline" },
  );
}

/** The kit's outline in reading order (empty = no outline built yet). */
export async function readKitOutline(kitId: string): Promise<OutlineSection[]> {
  return outlineSectionsFromRows(await readKitOutlineRows(kitId));
}

/** Each section's cited source text, keyed by section id, in chunk order. */
export async function readSectionChunks(
  sectionIds: readonly string[],
): Promise<Map<string, { id: string; content: string }[]>> {
  const out = new Map<string, { id: string; content: string }[]>();
  for (let offset = 0; offset < sectionIds.length; offset += 100) {
    const ids = sectionIds.slice(offset, offset + 100);
    const rows = await readAllRows<{
      id: string;
      structured_section_id: string | null;
      content: string | null;
      chunk_index: number | null;
      source_metadata: Json | null;
    }>(
      ({ from, to }) =>
        supabase
          .schema("education")
          .from("study_source_chunk")
          .select("id,structured_section_id,content,chunk_index,source_metadata", { count: "exact" })
          .in("structured_section_id", ids)
          .order("chunk_index", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "education.study_source_chunk outline sections" },
    );
    for (const row of rows) {
      if (!row.structured_section_id) continue;
      // The citation id is the ingest chunk id the section cites, kept on the row.
      const chunkId = obj(row.source_metadata).chunk_id;
      const list = out.get(row.structured_section_id) ?? [];
      list.push({ id: typeof chunkId === "string" && chunkId ? chunkId : row.id, content: row.content ?? "" });
      out.set(row.structured_section_id, list);
    }
  }
  return out;
}

/** The `sources` input of the run that built the outline (null = unreadable). */
export async function readOutlineBuildSources(runId: string): Promise<Record<string, unknown>[] | null> {
  const { data, error } = await supabase.schema("workflow").from("run").select("input").eq("id", runId).maybeSingle();
  if (error || !data) return null;
  const sources = obj(data.input).sources;
  return Array.isArray(sources) ? sources.map(obj) : null;
}

/** Note bodies for the kit's note Sources (the workflow reads a note by its text). */
export async function readNoteTexts(noteIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (noteIds.length === 0) return out;
  const { data, error } = await supabase
    .schema("workbench")
    .from("notes")
    .select("id,content")
    .in("id", [...noteIds])
    .is("deleted_at", null);
  if (error) throw new Error("Could not read the kit's notes.", { cause: error });
  for (const row of data ?? []) if (row.content) out.set(row.id, row.content);
  return out;
}

/** The kit's Sources as the outline workflow's input (reads note bodies). */
export async function kitOutlineInputs(
  sources: readonly Pick<KitSource, "type" | "id" | "title">[],
): Promise<{ sources: OutlineRunSource[]; skipped: string[] }> {
  const notes = await readNoteTexts(sources.filter((s) => s.type === "note").map((s) => s.id));
  return outlineRunSources(sources, notes);
}

// ─── The run ─────────────────────────────────────────────────────────────────

export interface KitOutlineRun {
  runId: string;
  status: string;
  active: boolean;
}

function parseRun(value: unknown): KitOutlineRun | null {
  const r = obj(value);
  return typeof r.run_id === "string" && r.run_id
    ? { runId: r.run_id, status: String(r.status ?? ""), active: r.active !== false }
    : null;
}

/** The latest (active or finished) outline run for this kit, or null. */
export async function lookupKitOutlineRun(
  dispatch: AppDispatch,
  kitId: string,
  organizationId: string | undefined,
): Promise<KitOutlineRun | null> {
  // The run lives in the KIT's organization's copy of the workflow, so the
  // lookup names it (a GET otherwise goes out with no organization and the
  // server cannot tell which copy to read).
  const result = await dispatch(
    callApi({
      path: SYSTEM_RUNS_PATH,
      method: "GET",
      pathParams: { key: KIT_OUTLINE_WORKFLOW_KEY } as never,
      queryParams: { subject: kitOutlineSubject(kitId) },
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
    }),
  );
  if (result.error) throw new Error(result.error.message || "Could not check the outline's progress.");
  return parseRun(obj(result.data).run);
}

/**
 * Start (or rejoin) the kit's outline run. The server answers an ACTIVE run
 * for the same subject with `mode: "duplicate"` instead of starting another.
 */
export async function startKitOutline(
  dispatch: AppDispatch,
  input: {
    kitId: string;
    organizationId: string;
    sources: readonly OutlineRunSource[];
    audience?: string;
  },
): Promise<{ runId: string; duplicate: boolean }> {
  if (input.sources.length === 0) throw new Error("Add a source to this kit first.");
  const result = await dispatch(
    callApi({
      path: SYSTEM_RUNS_PATH,
      method: "POST",
      pathParams: { key: KIT_OUTLINE_WORKFLOW_KEY } as never,
      scopeOverrides: { organization_id: input.organizationId },
      body: {
        subject: kitOutlineSubject(input.kitId),
        source_feature: KIT_OUTLINE_SOURCE_FEATURE,
        mode: "queued",
        inputs: {
          kit_id: input.kitId,
          audience: input.audience ?? "",
          sources: input.sources,
        },
      } as never,
    }),
  );
  if (result.error) throw new Error(result.error.message || "Could not start the outline.");
  const data = obj(result.data);
  const runId = typeof data.run_id === "string" ? data.run_id : "";
  if (!runId) throw new Error("The outline did not start. Try again.");
  return { runId, duplicate: data.mode === "duplicate" };
}

// ─── Generation groups (decision 4) ──────────────────────────────────────────

export interface OutlineGroups {
  /** The sections generation runs over, in outline order (index = group). */
  sections: OutlineSection[];
  /** One `segmentedGenerate` group per section. */
  groups: { label: string; text: string }[];
}

/**
 * The kit's outline as generation groups — one per section, restricted to
 * `onlyIds` when the run is aimed (gaps, or one picked section). Null when the
 * kit has no outline (generation then reads the Sources as before).
 */
export async function readOutlineGroups(kitId: string, onlyIds?: readonly string[]): Promise<OutlineGroups | null> {
  const all = await readKitOutline(kitId);
  if (all.length === 0) return null;
  const wanted = onlyIds?.length ? new Set(onlyIds) : null;
  const sections = wanted ? all.filter((s) => wanted.has(s.id)) : all;
  if (sections.length === 0) return null;
  const chunks = await readSectionChunks(sections.map((s) => s.id));
  return {
    sections,
    groups: sections.map((s) => ({ label: s.title, text: sectionGroupText(s, chunks.get(s.id) ?? []) })),
  };
}

/**
 * At most `n` sections, the least covered first (outline order breaks ties) —
 * a top-up of n items over more than n sections must still make n, so it aims
 * at the sections that hold the fewest.
 */
export function leastCoveredSections<S extends { id: string }>(
  sections: readonly S[],
  countBySection: ReadonlyMap<string, number>,
  n: number,
): S[] {
  if (sections.length <= n) return [...sections];
  return sections
    .map((s, i) => ({ s, i, c: countBySection.get(s.id) ?? 0 }))
    .sort((a, b) => a.c - b.c || a.i - b.i)
    .slice(0, Math.max(1, n))
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}
