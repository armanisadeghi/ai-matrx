"use client";

/**
 * Matrx Envelope — reference resolver registry.
 *
 * The data-driven mirror of the renderer registry, for the `reference` kind:
 * one entry per reference `type` describes (a) how to fetch the LIVE value from
 * Supabase and (b) which underlying entity clicking opens (reusing the
 * item-presentation opener via its `KnownItemType` discriminant).
 *
 * A new SERVER-registered noun needs NO entry here — the catalog-derived
 * generic resolver (see `derivedResolver`, fed by catalog-nouns.generated.ts)
 * covers any plain-row noun automatically. The hand RESOLVERS map below is the
 * bespoke OVERLAY only (compound identities, richer selects, custom open
 * targets). Aliases come from the server-published catalog map.
 *
 * Every resolver is defensive: it NEVER throws (the chip wraps it too). A soft
 * error returns `undefined` so the chip falls back to the item's display hint;
 * a read that SUCCEEDED and found no row this reader can see returns `null`, so
 * the chip says up front that the record is gone instead of drawing a working
 * chip whose click then fails (G2 review, 2026-10-02). UUID-guarding happens
 * at the call site (`ReferenceChip`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { noteRecordChanged, recordRevision, useRecordRevision } from "@ai-matrx/content-ir-react";

import { scopesService } from "@/features/scopes/service/scopesService";
import { supabase } from "@/utils/supabase/client";

import type { KnownItemType } from "@/features/item-presentation/types";
import {
  CATALOG_ALIASES,
  CATALOG_NOUNS,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
// Static, not `await import()`: this module reaches ~714 entry contexts and the seam adds ~31
// modules (`pnpm lab:graph`, 2026-09-23) — an async edge here would be a new chunk-group split in
// every one of them for no deferral worth having (code-splitting rule 6 caveat, D115).
import {
  getTableMetadata,
  readRelationWords,
  readRowsById,
  readTableDetails,
} from "@/features/data-tables/service";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { readPickList, readPickListForSelection } from "@/features/data-tables/pick-lists/doors";

/**
 * WHERE THIS TABLE OPENS. The table names its OWN organization (`custom.where_id_opens`, inside
 * `locateTable`), never the active one (active-org law, rule 5); a located table is read through
 * the data seam — the grid's own doors.
 */
async function located(tableId: string | undefined): Promise<boolean> {
  if (!tableId) return false;
  try {
    return (await locateTable(tableId)).ok;
  } catch {
    return false;
  }
}

/** One record-store row's cells, keyed by the grid's column names. */
async function storeRow(tableId: string, rowId: string): Promise<Record<string, unknown> | undefined> {
  const rows = await readRowsById({ tableId, rowIds: [rowId] });
  if (!rows.success) return undefined;
  return rows.data.find((r) => r.id === rowId)?.data;
}

export interface ReferenceResolver {
  /**
   * Fetch the live, human-readable value for this reference from Supabase.
   * `undefined` = could not tell (soft error; chip falls back to display.label).
   * `null` = the read worked and there is no such record for this reader —
   * the chip shows it as missing. Keep defensive — never throw.
   */
  resolveValue: (
    supabase: SupabaseClient,
    ref: Record<string, string>,
  ) => Promise<string | null | undefined>;
  /**
   * The item-presentation type that opens the underlying entity, when it is
   * not the type the `opensTable` already names (a list ITEM opens its list).
   * Omit it and the door derives from `opensTable` — never cast a noun.
   */
  openItemType?: KnownItemType;
  /**
   * `"schema.table"` of the record `openId` names. `referenceDoor` derives
   * the item type and the entity's address (route / peek) from it.
   */
  opensTable?: string;
  /** The id of the underlying entity to open (the picklist / dataset, not the cell). */
  openId: (ref: Record<string, string>) => string | undefined;
}

const stringify = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return undefined;
  }
};

/** First non-empty string field on a row (mirrors backend record resolver). */
function firstField(
  row: Record<string, unknown>,
  fields: string[],
): string | undefined {
  for (const field of fields) {
    const v = stringify(row[field]);
    if (v) return v;
  }
  return undefined;
}

interface RecordResolverConfig {
  openItemType?: KnownItemType;
  table: string;
  /**
   * Non-`public` Postgres schema `table` lives in, if any. Reached via
   * `.schema(schema)`. Omitted ⇒ `public`. (Set for the workspace domain after
   * the 2026 restructure moved projects/tasks to the `projects` schema.)
   */
  schema?: string;
  select: string;
  titleFields: string[];
  bodyFields?: string[];
}

async function resolveFileReferenceValue(
  supabase: SupabaseClient,
  ref: Record<string, string>,
): Promise<string | null | undefined> {
  if (!ref.file_id) return undefined;
  const { data, error } = await supabase
    .schema("files")
    .from("files")
    .select("file_name, mime_type")
    .eq("id", ref.file_id)
    .maybeSingle();
  if (error) return undefined;
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return firstField(row, ["file_name"]) ?? firstField(row, ["mime_type"]);
}

/**
 * A thing kept in the RECORD STORE, named by id (lane SCOPES-READS-WEB): a scope (a Record), a scope
 * type (a Table), a context item (a Field). The store says which organization the id opens in
 * (`custom.where_id_opens`, never the working organization) and `custom.read_record` answers its
 * document on the one ladder and the one read mask — so a chip names only what its reader may see.
 */
function createStoreRecordResolver(config: {
  openItemType: KnownItemType;
  titleFields: string[];
  bodyFields?: string[];
}): ReferenceResolver {
  return {
    openItemType: config.openItemType,
    openId: (ref) => ref.id,
    resolveValue: async (client, ref) => {
      if (!ref.id) return undefined;
      const store = client.schema("custom");
      const opens = await store.rpc("where_id_opens", { p_id: ref.id });
      const organizationId = (opens.data as { organization_id?: unknown } | null)?.organization_id;
      if (opens.error || typeof organizationId !== "string") return undefined;
      const read = await store.rpc("read_record", {
        p_organization_id: organizationId,
        p_record_id: ref.id,
        p_by_id: false,
      });
      if (read.error || !read.data || typeof read.data !== "object") return undefined;
      const doc = read.data as Record<string, unknown>;
      const heading = firstField(doc, config.titleFields);
      const body = config.bodyFields ? firstField(doc, config.bodyFields) : undefined;
      if (heading && body) return `${heading}\n${body}`;
      return heading ?? body;
    },
  };
}

function createRecordResolver(config: RecordResolverConfig): ReferenceResolver {
  return {
    openItemType: config.openItemType,
    opensTable: `${config.schema ?? "public"}.${config.table}`,
    openId: (ref) => ref.id,
    resolveValue: async (supabase, ref) => {
      if (!ref.id) return undefined;
      const db = config.schema ? supabase.schema(config.schema) : supabase;
      const { data, error } = await db
        .from(config.table)
        .select(config.select)
        .eq("id", ref.id)
        .maybeSingle();
      if (error) return undefined;
      // The read worked and found nothing this reader can see: missing.
      if (!data) return null;
      const row = data as unknown as Record<string, unknown>;
      const heading = firstField(row, config.titleFields);
      const body = config.bodyFields
        ? firstField(row, config.bodyFields)
        : undefined;
      if (heading && body) return `${heading}\n${body}`;
      return heading ?? body;
    },
  };
}

/**
 * Live value of a single table-row cell. A `relation` column stores a RECORD ID, so it resolves
 * through the store's own words door, the same one the grid uses: the agent reads the customer's
 * name, never a bare record id. Every other column is stringified.
 */
async function resolveCell(
  rowId: string | undefined,
  column: string | undefined,
  tableId?: string,
): Promise<string | undefined> {
  if (!rowId || !column || !tableId) return undefined;
  if (!(await located(tableId))) return undefined;
  const cells = await storeRow(tableId, rowId);
  if (!cells) return undefined;
  const raw = cells[column];
  const couldBeRelation =
    typeof raw === "string" ? isUuidShape(raw.trim()) : Array.isArray(raw);
  if (!couldBeRelation) return stringify(raw);
  // The words door names the RECORDS a relation cell points at, by their ids.
  const ids = (Array.isArray(raw) ? raw : [raw])
    .filter((v): v is string => typeof v === "string" && isUuidShape(v.trim()))
    .map((v) => v.trim());
  const words = await readRelationWords({ tableId, fieldName: column, rowIds: ids });
  // An id nothing resolved keeps its identifier rather than vanishing: a prompt that silently
  // dropped a reference would be worse than one that says the reference did not resolve.
  return ids.map((id) => words.get(id) ?? `Record ${id.slice(0, 8)}`).join(", ");
}

/**
 * The name of a table (the `table` / `dataset` reference).
 * The id is `table_id` (canonical), `id` (the catalog's generic ref) or `dataset_id` (legacy).
 */
function tableNameResolver(): ReferenceResolver {
  const idOf = (ref: Record<string, string>) => ref.table_id ?? ref.id ?? ref.dataset_id;
  return {
    openItemType: "table",
    openId: idOf,
    resolveValue: async (_supabase, ref) => {
      const tableId = idOf(ref);
      if (!tableId) return stringify(ref.label);
      if (!(await located(tableId))) return undefined;
      const details = await readTableDetails(tableId);
      return details.success ? (stringify(details.table?.name) ?? stringify(details.table?.description)) : undefined;
    },
  };
}

/**
 * The 7-type reference resolver registry (+ the `dataset_cell` legacy alias).
 * Every `ref` passed in is the FLAT canonical item (string-coerced): identity
 * ids live at the top level (`ref.list_id`, `ref.table_id`, …), NOT under a
 * nested `ref` object.
 */
const RESOLVERS: Record<string, ReferenceResolver> = {
  // ── Structured list family ─────────────────────────────────────────────────
  /** `pick_list` → { list_id }. Live value = the list name. */
  pick_list: {
    openItemType: "pick_list",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.list_id) return undefined;
      const doc = (await readPickListForSelection(supabase, ref.list_id).catch(() => null)) as { list_name?: string | null; description?: string | null } | null;
      if (!doc) return undefined;
      return stringify(doc.list_name) ?? stringify(doc.description);
    },
  },

  /** `pick_list_group` → { list_id, group_name }. Live value = the group name. */
  pick_list_group: {
    openItemType: "pick_list",
    openId: (ref) => ref.list_id,
    resolveValue: async (_supabase, ref) => stringify(ref.group_name),
  },

  /**
   * `pick_list_item` → { list_id, item_id }. Live value = the item's
   * description (fallback to its label). Opens the list (`list_id`).
   */
  pick_list_item: {
    openItemType: "pick_list",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.item_id || !ref.list_id) return undefined;
      // The list door shows a choice's description to an editor.
      const doc = (await readPickList(supabase, ref.list_id).catch(() => null)) as {
        items_grouped?: Record<string, Array<{ id: string; label?: string | null; description?: string | null }>> | null;
      } | null;
      if (!doc) return undefined;
      const item = Object.values(doc.items_grouped ?? {}).flat().find((i) => i.id === ref.item_id);
      if (!item) return undefined;
      return stringify(item.description) ?? stringify(item.label);
    },
  },

  // ── Table family ───────────────────────────────────────────────────────────
  /**
   * `table` → { table_id }. Live value = the table name.
   *
   * 🚨 `table` is an ALIAS of `dataset` in the server-published catalog
   * (`CATALOG_ALIASES`), so both keys share one resolver (lane INTEG-CLIENTS, F10).
   */
  // Both open as the item-presentation `table` type (entity token `dataset`); the derived
  // resolver had cast the noun "dataset", which is not an item type at all.
  table: tableNameResolver(),
  dataset: tableNameResolver(),

  /** `table_schema` → { table_id }. Live value = column schema summary. */
  table_schema: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (_supabase, ref) => {
      if (!ref.table_id) return undefined;
      if (!(await located(ref.table_id))) return undefined;
      const read = await getTableMetadata({ tableId: ref.table_id });
      if (!read.success) return undefined;
      const meta = read.data;
      const name =
        stringify(meta.table.table_name) ?? stringify(ref.table_name);
      const cols = meta.columns
        .map((f) => {
          const row = f as {
            display_name?: string | null;
            field_name?: string | null;
            data_type?: string | null;
          };
          const label =
            stringify(row.display_name) ?? stringify(row.field_name);
          const dt = stringify(row.data_type);
          return label ? (dt ? `${label} (${dt})` : label) : undefined;
        })
        .filter((v): v is string => !!v)
        .slice(0, 8);
      const schema = cols.length > 0 ? cols.join(", ") : "schema";
      return name ? `${name}: ${schema}` : schema;
    },
  },

  /**
   * `table_column` → { table_id, column_name }. Live value = the column's
   * display name (fallback to its raw field name).
   */
  table_column: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (_supabase, ref) => {
      if (!ref.table_id || !ref.column_name) return undefined;
      if (!(await located(ref.table_id))) return stringify(ref.column_name);
      const read = await getTableMetadata({ tableId: ref.table_id });
      const column = read.success
        ? (read.data.columns as Array<{ field_name?: string; display_name?: string }>).find(
            (c) => c.field_name === ref.column_name,
          )
        : undefined;
      return stringify(column?.display_name) ?? stringify(ref.column_name);
    },
  },

  /**
   * `table_row` → { table_id, row_id }. Live value = a compact preview of the
   * row's cell values (first few), enough to identify it in a chip.
   */
  table_row: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (_supabase, ref) => {
      if (!ref.row_id) return undefined;
      if (!ref.table_id || !(await located(ref.table_id))) return undefined;
      const cells = await storeRow(ref.table_id, ref.row_id);
      if (!cells || typeof cells !== "object") return undefined;
      const preview = Object.values(cells)
        .map((v) => stringify(v))
        .filter((v): v is string => !!v)
        .slice(0, 3)
        .join(" · ");
      return preview.length > 0 ? preview : undefined;
    },
  },

  /**
   * `table_cell` → { table_id, row_id, column_name }. Live value = the row's
   * `data[column_name]` cell. Opens the table (`table_id`).
   */
  table_cell: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (_supabase, ref) =>
      resolveCell(ref.row_id, ref.column_name, ref.table_id),
  },

  /**
   * `dataset_cell` — LEGACY alias of `table_cell`. Old ids were
   * `{ dataset_id, row_id, field_name }`; tolerate the canonical
   * `{ table_id, row_id, column_name }` too.
   */
  dataset_cell: {
    openItemType: "table",
    openId: (ref) => ref.dataset_id ?? ref.table_id,
    resolveValue: async (_supabase, ref) =>
      resolveCell(ref.row_id, ref.field_name ?? ref.column_name, ref.dataset_id ?? ref.table_id),
  },

  // ── RecordRef family (atomic Matrx entities) ───────────────────────────────
  task: createRecordResolver({
    openItemType: "task",
    table: "tasks",
    schema: "projects",
    select: "title, description",
    titleFields: ["title"],
    bodyFields: ["description"],
  }),
  note: createRecordResolver({
    openItemType: "note",
    table: "notes",
    schema: "workbench",
    select: "label, content",
    titleFields: ["label"],
    bodyFields: ["content"],
  }),
  project: createRecordResolver({
    openItemType: "project",
    table: "projects",
    schema: "projects",
    select: "name, description",
    titleFields: ["name"],
    bodyFields: ["description"],
  }),
  agent: createRecordResolver({
    openItemType: "agent",
    schema: "agent",
    table: "definition",
    select: "name, description",
    titleFields: ["name"],
    bodyFields: ["description"],
  }),
  agent_app: createRecordResolver({
    openItemType: "app",
    schema: "app",
    table: "definition",
    select: "name, description",
    titleFields: ["name"],
    bodyFields: ["description"],
  }),
  app: createRecordResolver({
    openItemType: "app",
    schema: "app",
    table: "definition",
    select: "name, description",
    titleFields: ["name"],
    bodyFields: ["description"],
  }),

  // The scope system lives in the record store (lane 9 flip, 2026-10-03): these nouns resolve through it.
  scope_type: createStoreRecordResolver({
    openItemType: "scope_type",
    titleFields: ["label_singular", "label_plural", "name"],
    bodyFields: ["description"],
  }),
  scope: createStoreRecordResolver({
    openItemType: "scope",
    titleFields: ["name"],
    bodyFields: ["description", "scope_description"],
  }),
  context_item: createStoreRecordResolver({
    openItemType: "context_item",
    titleFields: ["label", "key"],
    bodyFields: ["description"],
  }),

  /** Current value at scope × context_item (the cell agents care about). */
  context_value: {
    openItemType: "scope",
    openId: (ref) => ref.scope_id,
    // The cell comes from `scopesService` — the ONE door to the context
    // schema. This resolver used to read context_item_values / scopes /
    // context_items directly; the chokepoint lint now forbids that (DD-109).
    resolveValue: async (_supabase, ref) => {
      if (!ref.scope_id || !ref.context_item_id) return stringify(ref.label);
      const res = await scopesService.resolveContextCell({
        scopeId: ref.scope_id,
        contextItemId: ref.context_item_id,
      });
      if (!res.ok) return stringify(ref.label);
      const scopeName = stringify(res.data.scopeName);
      const itemName = stringify(res.data.itemName);
      const heading =
        scopeName && itemName
          ? `${scopeName} · ${itemName}`
          : (scopeName ?? itemName ?? stringify(ref.label));
      const row = res.data.value;
      if (!row) return heading;
      // A reference / document cell reads as the names it points at; any other cell as its value.
      const cell = row.references.length
        ? row.references.map((r) => r.label ?? `${r.type} ${r.id}`).join(", ")
        : stringify(row.value);
      if (heading && cell) return `${heading}\n${cell}`;
      return cell ?? heading;
    },
  },

  // A reference is a LINK: a transcript chip opens the transcript (its Detail
  // record, whose door is `/transcripts/processor?focus=<id>`). Until
  // 2026-09-30 `openId` returned nothing and the chip rendered disabled.
  transcript: createRecordResolver({
    openItemType: "transcript",
    table: "transcripts",
    schema: "transcripts",
    select: "title, description",
    titleFields: ["title"],
    bodyFields: ["description"],
  }),
  transcript_session: createRecordResolver({
    table: "studio_sessions",
    schema: "transcripts",
    select: "title",
    titleFields: ["title"],
  }),
  studio_session: createRecordResolver({
    table: "studio_sessions",
    schema: "transcripts",
    select: "title",
    titleFields: ["title"],
  }),

  /** One segment inside a stored transcript (`segment_index` = 0-based parse order). */
  transcript_segment: {
    // The segment's transcript — never the FILE preview (a transcript id is
    // not a file id; that door opened nothing until 2026-09-30).
    openItemType: "transcript",
    openId: (ref) => ref.transcript_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.transcript_id) return undefined;
      const idx = Number.parseInt(ref.segment_index ?? "", 10);
      if (!Number.isFinite(idx) || idx < 0) return stringify(ref.label);
      const { data, error } = await supabase
        .schema("transcripts")
        .from("transcripts")
        .select("title, content")
        .eq("id", ref.transcript_id)
        .maybeSingle();
      if (error || !data) return stringify(ref.label);
      const row = data as {
        title?: string | null;
        content?: string | null;
      };
      const content = stringify(row.content);
      if (!content) return stringify(row.title) ?? stringify(ref.label);
      // Segments are `[m:ss] text` lines in stored markdown content.
      const lines = content.split(/\n+/).filter((l) => l.trim().length > 0);
      const line = lines[idx];
      if (line) {
        const title = stringify(row.title);
        return title ? `${title} · ${line.trim()}` : line.trim();
      }
      return stringify(row.title) ?? stringify(ref.label);
    },
  },

  /** Transcript materialized from / linked to a studio session — opens THE TRANSCRIPT. */
  session_transcript: {
    openItemType: "transcript",
    opensTable: "transcripts.transcripts",
    openId: (ref) => ref.transcript_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.transcript_id) return undefined;
      const { data, error } = await supabase
        .schema("transcripts")
        .from("transcripts")
        .select("title, description")
        .eq("id", ref.transcript_id)
        .maybeSingle();
      if (error || !data) return stringify(ref.label);
      const row = data as {
        title?: string | null;
        description?: string | null;
      };
      const title = stringify(row.title);
      const body = stringify(row.description);
      if (title && body) return `${title}\n${body}`;
      return title ?? body ?? stringify(ref.label);
    },
  },

  workbook: createRecordResolver({
    openItemType: "workbook",
    table: "udt_workbooks",
    schema: "workbench",
    select: "workbook_name, description",
    titleFields: ["workbook_name"],
    bodyFields: ["description"],
  }),
  udt_document: createRecordResolver({
    openItemType: "document",
    table: "udt_documents",
    schema: "workbench",
    select: "document_name, description",
    titleFields: ["document_name"],
    bodyFields: ["description"],
  }),
  document: createRecordResolver({
    openItemType: "document",
    table: "udt_documents",
    schema: "workbench",
    select: "document_name, description",
    titleFields: ["document_name"],
    bodyFields: ["description"],
  }),

  workbook_sheet: {
    openItemType: "workbook",
    openId: (ref) => ref.workbook_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.workbook_id || !ref.sheet_id) return undefined;
      const hint =
        stringify(ref.sheet_name) ??
        stringify(ref.workbook_name) ??
        stringify(ref.label);
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_workbooks")
        .select("workbook_name")
        .eq("id", ref.workbook_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) return hint;
      const wbName = stringify(
        (data as { workbook_name?: string | null }).workbook_name,
      );
      const sheet = stringify(ref.sheet_name) ?? ref.sheet_id;
      if (wbName) return `${wbName} · ${sheet}`;
      return sheet ?? hint;
    },
  },

  document_page: {
    openItemType: "document",
    openId: (ref) => ref.document_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.document_id) return undefined;
      // ref.page_index is 1-based here (see AIDREAM_REFERENCE_IMPLEMENTATION.md:
      // "page_index is 1-based" — the name is misleading). So `p.${page_index}`
      // is already correct ("p.1" = first page); do NOT add +1. The truthy check
      // is intentional: an empty/absent page yields no page suffix.
      const page = ref.page_index ? `p.${ref.page_index}` : undefined;
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_documents")
        .select("document_name")
        .eq("id", ref.document_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) return stringify(ref.label);
      const name = stringify(
        (data as { document_name?: string | null }).document_name,
      );
      if (name && page) return `${name} · ${page}`;
      return name ?? page ?? stringify(ref.label);
    },
  },

  /** `file` / `media` — `{ file_id }`, resolved owner-scoped via cld_files. */
  file: {
    openItemType: "file",
    openId: (ref) => ref.file_id,
    resolveValue: resolveFileReferenceValue,
  },
  file_page: {
    openItemType: "file",
    openId: (ref) => ref.file_id,
    resolveValue: async (supabase, ref) => {
      const base = await resolveFileReferenceValue(supabase, ref);
      if (base === null) return null;
      const page = ref.page_number ? `p.${ref.page_number}` : undefined;
      if (base && page) return `${base} · ${page}`;
      return base ?? page ?? stringify(ref.label);
    },
  },
  media: {
    openItemType: "file",
    openId: (ref) => ref.file_id,
    resolveValue: resolveFileReferenceValue,
  },

  // ── Education (education schema) ───────────────────────────────────────────
  fc_card: createRecordResolver({
    schema: "education",
    table: "fc_card",
    select: "front, back, topic",
    titleFields: ["front"],
    bodyFields: ["back"],
  }),
  fc_set: createRecordResolver({
    schema: "education",
    table: "fc_set",
    select: "name, description, topic",
    titleFields: ["name"],
    bodyFields: ["description"],
  }),
  fc_detail: createRecordResolver({
    schema: "education",
    table: "fc_detail",
    select: "kind, text",
    titleFields: ["kind"],
    bodyFields: ["text"],
  }),
  quiz_session: createRecordResolver({
    schema: "education",
    table: "quiz_sessions",
    select: "title, category",
    titleFields: ["title"],
    bodyFields: ["category"],
  }),
  study_session: createRecordResolver({
    schema: "education",
    table: "study_session",
    select: "mode, status",
    titleFields: ["mode"],
    bodyFields: ["status"],
  }),
  study_goal: createRecordResolver({
    schema: "education",
    table: "study_goal",
    select: "title, status",
    titleFields: ["title"],
    bodyFields: ["status"],
  }),
  study_attempt: createRecordResolver({
    schema: "education",
    table: "study_attempt",
    select: "method, result",
    titleFields: ["method"],
    bodyFields: ["result"],
  }),
  item_mastery: createRecordResolver({
    schema: "education",
    table: "item_mastery",
    select: "item_type, last_result",
    titleFields: ["item_type"],
    bodyFields: ["last_result"],
  }),
  /**
   * `conversation_value` → { key, conversation_id?, field? } — a stored
   * pass-by-reference agent result (chat.conversation_value; aidream
   * services/conversation_values/FEATURE.md). Live value = "key — description".
   * Descriptor fences always carry conversation_id (FE handoff doc §5); when
   * absent the fence resolves against its own conversation server-side, so
   * the FE can't scope a lookup — the key alone is the display.
   */
  conversation_value: {
    // Opens the conversation the value was stored in.
    openItemType: "conversation",
    opensTable: "chat.conversation",
    openId: (ref) => ref.conversation_id,
    resolveValue: async (supabase, ref) => {
      const key = stringify(ref.key);
      if (!key) return stringify(ref.label);
      if (!ref.conversation_id) return stringify(ref.label) ?? key;
      const { data, error } = await supabase
        .schema("chat")
        .from("conversation_value")
        .select("description")
        .eq("conversation_id", ref.conversation_id)
        .eq("key", key)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data?.description) return stringify(ref.label) ?? key;
      const label = `${key} — ${data.description}`;
      return ref.field ? `${label} (.${ref.field})` : label;
    },
  },

  /**
   * `url` — `{ url, label? }`, an arbitrary external link. Nothing to fetch
   * (the URL itself IS the value); `openId` always `undefined` since the chip
   * opens it directly in a new tab (see registry.tsx's `isExternalUrl` path),
   * never through the item-presentation opener. `openItemType` is unused here.
   */
  url: {
    openId: () => undefined,
    resolveValue: async (_supabase, ref) => stringify(ref.label) ?? ref.url,
  },
};

// ── Catalog-derived generic resolver ─────────────────────────────────────────
// The server's computed directive catalog ships every registered noun's table +
// title_column (mirrored → the SLIM catalog-nouns.generated.ts: plain-id nouns
// only, two fields — kept minimal for bundle/build-memory reasons). Any
// plain-row noun WITHOUT a bespoke entry above resolves through this generic
// path — a newly registered server noun gets a live chip with ZERO edits here.
// Compound-identity nouns are excluded at generation time (a miss falls back to
// the bespoke RESOLVERS overlay / graceful chip). The hand RESOLVERS map is the
// OVERLAY for bespoke behavior, never a required registration.

const COMMON_TITLE_FIELDS = ["name", "title", "label", "display_name", "slug"];

function derivedResolver(noun: string): ReferenceResolver | undefined {
  const entry = CATALOG_NOUNS[noun];
  if (!entry) return undefined;
  const dot = entry.table.indexOf(".");
  const schema = dot === -1 ? "public" : entry.table.slice(0, dot);
  const table = dot === -1 ? entry.table : entry.table.slice(dot + 1);
  // THE SCOPE SYSTEM LIVES IN THE RECORD STORE (lane SCOPES-READS-WEB; the flip, 2026-10-03): the
  // catalogue still names the old `context.*` tables for scope / scope_type / context_item, and those
  // nouns resolve through the store resolvers above; a context-schema row is never read by table.
  if (schema === "context") return undefined;
  const titleFields = entry.title_column
    ? [entry.title_column, ...COMMON_TITLE_FIELDS]
    : COMMON_TITLE_FIELDS;
  return {
    // The door derives from the TABLE (`referenceDoor`), never `noun as
    // KnownItemType`: ≈90 nouns have no item type and that cast made every one
    // an enabled chip whose click did nothing.
    opensTable: `${schema}.${table}`,
    openId: (ref) => ref.id,
    resolveValue: async (supabase, ref) => {
      if (!ref.id || !isUuidShape(ref.id)) return stringify(ref.label);
      try {
        const from =
          schema === "public" ? supabase.from(table) : supabase.schema(schema).from(table);
        const { data, error } = await from.select("*").eq("id", ref.id).maybeSingle();
        if (error) return undefined;
        // The read worked and found nothing this reader can see: missing.
        if (!data) return null;
        return firstField(data as Record<string, unknown>, titleFields) ?? stringify(ref.label);
      } catch {
        return undefined; // graceful chip — display.label fallback
      }
    },
  };
}

/** Every noun with a bespoke resolver (the overlay above the catalog). */
export const BESPOKE_REFERENCE_NOUNS: readonly string[] = Object.keys(RESOLVERS);

/** References stored before the rename name the pick list family `structured_list*` / `picklist*`;
 * they still resolve, as the one `pick_list*` family. NEW content emits `pick_list*`. */
const RETIRED_PICK_LIST_NOUNS: Record<string, string> = {
  structured_list: "pick_list",
  structured_list_group: "pick_list_group",
  structured_list_item: "pick_list_item",
  picklist: "pick_list",
  picklist_group: "pick_list_group",
  picklist_item: "pick_list_item",
};

/** Resolve a reference `type` to its resolver, or `undefined` (graceful chip).

 * Bespoke overlay first, then the catalog-derived generic resolver. Aliases are
 * the SERVER-PUBLISHED map (catalog manifest) — the old hand map is gone. */
export function getReferenceResolver(
  type: string,
): ReferenceResolver | undefined {
  const canonical = RETIRED_PICK_LIST_NOUNS[type] ?? CATALOG_ALIASES[type] ?? type;
  return RESOLVERS[canonical] ?? derivedResolver(canonical);
}

/**
 * Coerce a model-produced `ref` into the `Record<string, string>` the resolvers
 * assume. The envelope is LLM JSON, so a value can arrive as a number/bool/null
 * — `.eq("id", 123)` would then silently miss. We stringify scalars (loud-on-
 * malformed per the recovery doctrine) and drop non-scalars.
 */
export function coerceRefToStrings(
  ref: unknown,
  context: string,
): Record<string, string> {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ref as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      // A non-string id is recoverable but a sign the producer is off-contract.
      console.warn(
        `[matrx-reference] ${context}: ref.${k} was ${typeof v}, coerced to string`,
      );
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * The display hint an item carries (flat: `label`, else a few other readable
 * hints), trimmed; else a humanized type. The canonical item is flat — there is
 * no nested `display`.
 */
export function referenceFallbackLabel(
  item: ReferenceItem,
  type: string,
): string {
  const hints = item as unknown as Record<string, unknown>;
  for (const key of [
    "label",
    "column_display_name",
    "table_name",
    "list_name",
    "description",
  ]) {
    const v = hints[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return (humanizeIdentifier(type) || type);
}

/**
 * A CHIP shows a name, not a record. `resolveValue` returns the live value —
 * "heading\nbody" for record types — so every chip renders its first line and
 * keeps the full value for the tooltip. Without this a note chip printed the
 * note's entire body into the composer / message bubble.
 */
export function referenceChipLabel(display: string): string {
  const first = display.split("\n").find((line) => line.trim().length > 0);
  return (first ?? display).trim();
}

/**
 * `missing` = the read worked and there is no such record for this reader
 * (deleted, or not shared with them) — a chip shows that up front.
 */
export type ReferenceResolutionStatus =
  | "idle"
  | "loading"
  | "ready"
  | "fallback"
  | "missing";

/**
 * THE ONE place a reference item's live display value is resolved. Every chip
 * — read-only (`ReferenceChip`) and editable (`PickerChip`) — must go through
 * this hook instead of the static `referenceFallbackLabel` alone. A baked-in
 * `label` hint (set at author time by a picker) is only ever a first-paint
 * head start; it can go stale (the underlying entity gets renamed) or be
 * absent entirely (a backfilled cell, a fence built server-side) — the live
 * lookup is the source of truth, `referenceFallbackLabel` is only the
 * loading/miss placeholder, never a substitute for it.
 */
/**
 * THE NAME IS RE-READ WHEN THE RECORD CHANGES. A resolved label is read once
 * per mount, so a chip or a directive row naming a record kept its OLD name
 * after this very page renamed it (LANE-C, 2026-10-02: an Update card's row
 * still read "LANE-C timing probe 1" beside its own "Updated task. → LANE-C
 * probe renamed" tally). A writer that changes a record announces it here and
 * every label naming that record resolves again.
 *
 * ONE change counter per record for the whole page — the content-ir package's
 * (`noteRecordChanged` / `recordRevision`), which every directive apply already
 * bumps. A second counter here once meant a label re-read after an apply while
 * an Update card's "old value" did not (G7, 2026-10-02).
 */
export function invalidateReferenceLabel(id: string): void {
  noteRecordChanged(id);
}

/**
 * ONE READ PER RECORD NAME, shared by every label that names it. Two labels
 * naming the same record (a confirm dialog's title AND its sentence; a card row
 * AND its tally) each read it on their own, so one showed the name while the
 * other still showed "Task 31fc9198" (LANE-C, 2026-10-02). Keyed by
 * type + ref + version, so an `invalidateReferenceLabel` bump is a fresh read.
 * In-flight reads are shared; a real name is remembered for LABEL_FRESH_MS (a
 * label mounted later still re-reads, as before; a miss is never remembered).
 */
const LABEL_FRESH_MS = 30_000;
const resolvedLabelsAt = new Map<string, { value: string; at: number }>();
const resolvingLabels = new Map<string, Promise<unknown>>();
const resolvedLabels = {
  get(key: string): string | undefined {
    const hit = resolvedLabelsAt.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > LABEL_FRESH_MS) {
      resolvedLabelsAt.delete(key);
      return undefined;
    }
    return hit.value;
  },
  set(key: string, value: string): void {
    resolvedLabelsAt.set(key, { value, at: Date.now() });
  },
};

function readLabelOnce(key: string, read: () => Promise<unknown>): Promise<unknown> {
  const pending = resolvingLabels.get(key);
  if (pending) return pending;
  const started = Promise.resolve()
    .then(read)
    .then((v) => {
      if (typeof v === "string" && v.length > 0) resolvedLabels.set(key, v);
      return v;
    })
    .finally(() => resolvingLabels.delete(key));
  resolvingLabels.set(key, started);
  return started;
}

/**
 * The change counter `invalidateReferenceLabel` bumps for one record — so any
 * other read of that record (a directive card's trash state) re-reads when a
 * writer on this page changes it, exactly as its label does.
 */
export function useReferenceRecordVersion(id: string): number {
  return useRecordRevision(id);
}

/**
 * The live NAME of `{type, id}` as a promise — the SAME read, key and cache as
 * `useResolvedReferenceLabel`, for a caller that must know the name BEFORE it
 * renders (a confirm that may not ask until it can say what it changes — G8A
 * review, 2026-10-02). A label mounted afterwards shows it on its first paint.
 * Resolves null when the type has no resolver or there is no such record;
 * rejects when the read fails.
 */
export async function resolveReferenceName(type: string, id: string): Promise<string | null> {
  const resolver = getReferenceResolver(type);
  if (!resolver) return null;
  const ref = coerceRefToStrings({ id }, `${type} reference`);
  const key = `${type}:${JSON.stringify(ref)}:${recordRevision(id)}`;
  const value = resolvedLabels.get(key) ?? (await readLabelOnce(key, () => resolver.resolveValue(supabase, ref)));
  return typeof value === "string" && value.length > 0 ? referenceChipLabel(value) : null;
}

export function useResolvedReferenceLabel(
  item: ReferenceItem,
  type: string,
): { display: string; status: ReferenceResolutionStatus } {
  const ref = coerceRefToStrings(item, `${type} reference`);
  const resolver = getReferenceResolver(type);
  const fallback = referenceFallbackLabel(item, type);

  const refKey = JSON.stringify(ref);
  const recordId = typeof ref.id === "string" ? ref.id : "";
  const version = useRecordRevision(recordId);
  // A name another label already read is shown on the FIRST paint.
  const known = resolvedLabels.get(`${type}:${refKey}:${version}`);
  const [value, setValue] = useState<string | undefined>(known);
  const [status, setStatus] = useState<ReferenceResolutionStatus>(known ? "ready" : "idle");
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!resolver) {
      setStatus("fallback");
      return undefined;
    }
    const recordKey = `${type}:${refKey}:`;
    const key = `${recordKey}${version}`;
    if (lastKey.current === key) return undefined;
    // A re-read of the SAME record after a change keeps the name it had until
    // the new one lands — never a flash of the fallback id.
    const reread = lastKey.current?.startsWith(recordKey) ?? false;
    lastKey.current = key;

    let cancelled = false;
    const cached = resolvedLabels.get(key);
    if (cached) {
      setValue(cached);
      setStatus("ready");
      return undefined;
    }
    setStatus((prev) => (reread && prev === "ready" ? "ready" : "loading"));

    readLabelOnce(key, () => resolver.resolveValue(supabase, ref))
      .then((v) => {
        if (cancelled) return;
        if (typeof v === "string" && v.length > 0) {
          setValue(v);
          setStatus("ready");
        } else {
          setStatus(v === null ? "missing" : "fallback");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("fallback");
      });

    return () => {
      cancelled = true;
    };
    // refKey captures the ref contents; resolver is stable per type.
  }, [type, refKey, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return { display: status === "ready" && value ? value : fallback, status };
}
