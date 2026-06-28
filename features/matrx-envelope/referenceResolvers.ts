"use client";

/**
 * Matrx Envelope — reference resolver registry.
 *
 * The data-driven mirror of the renderer registry, for the `reference` kind:
 * one entry per reference `type` describes (a) how to fetch the LIVE value from
 * Supabase and (b) which underlying entity clicking opens (reusing the
 * item-presentation opener via its `KnownItemType` discriminant).
 *
 * Adding a new reference type later = one entry here. No switch to edit, no new
 * opener if the item-presentation registry already has the entity's window.
 *
 * Every resolver is defensive: it NEVER throws (the chip wraps it too), and a
 * missing row / soft error returns `undefined` so the chip falls back to the
 * item's display hint. UUID-guarding happens at the call site (`ReferenceChip`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { contextDb } from "@/utils/supabase/contextDb";

import type { KnownItemType } from "@/features/item-presentation/types";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";

export interface ReferenceResolver {
  /**
   * Fetch the live, human-readable value for this reference from Supabase.
   * Returns `undefined` on miss / soft error (chip falls back to display.label).
   * Keep defensive — never throw.
   */
  resolveValue: (
    supabase: SupabaseClient,
    ref: Record<string, string>,
  ) => Promise<string | undefined>;
  /** The item-presentation type to reuse for opening the underlying entity. */
  openItemType: KnownItemType;
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
  openItemType: KnownItemType;
  table: string;
  /**
   * Non-`public` Postgres schema `table` lives in, if any. Reached via
   * `.schema(schema)`. Omitted ⇒ `public`. (Set for the workspace domain after
   * the 2026 restructure moved projects/tasks to the `workspace` schema.)
   */
  schema?: string;
  select: string;
  titleFields: string[];
  bodyFields?: string[];
}

async function resolveFileReferenceValue(
  supabase: SupabaseClient,
  ref: Record<string, string>,
): Promise<string | undefined> {
  if (!ref.file_id) return undefined;
  const { data, error } = await supabase
    .schema("files")
    .from("files")
    .select("file_name, mime_type")
    .eq("id", ref.file_id)
    .maybeSingle();
  if (error || !data) return undefined;
  const row = data as unknown as Record<string, unknown>;
  return firstField(row, ["file_name"]) ?? firstField(row, ["mime_type"]);
}

function createRecordResolver(config: RecordResolverConfig): ReferenceResolver {
  return {
    openItemType: config.openItemType,
    openId: (ref) => ref.id,
    resolveValue: async (supabase, ref) => {
      if (!ref.id) return undefined;
      const db = config.schema ? supabase.schema(config.schema) : supabase;
      const { data, error } = await db
        .from(config.table)
        .select(config.select)
        .eq("id", ref.id)
        .maybeSingle();
      if (error || !data) return undefined;
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

/** Live value of a single dataset-row cell: `udt_dataset_rows.data[column]`. */
async function resolveCell(
  supabase: SupabaseClient,
  rowId: string | undefined,
  column: string | undefined,
): Promise<string | undefined> {
  if (!rowId || !column) return undefined;
  const { data, error } = await supabase
    .schema("workbench")
    .from("udt_dataset_rows")
    .select("data")
    .eq("id", rowId)
    .maybeSingle();
  if (error || !data) return undefined;
  const cells = (data as { data?: Record<string, unknown> | null }).data;
  if (!cells || typeof cells !== "object") return undefined;
  return stringify(cells[column]);
}

/**
 * The 7-type reference resolver registry (+ the `dataset_cell` legacy alias).
 * Every `ref` passed in is the FLAT canonical item (string-coerced): identity
 * ids live at the top level (`ref.list_id`, `ref.table_id`, …), NOT under a
 * nested `ref` object.
 */
const RESOLVERS: Record<string, ReferenceResolver> = {
  // ── Picklist family ────────────────────────────────────────────────────────
  /** `picklist` → { list_id }. Live value = the list name. */
  picklist: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.list_id) return undefined;
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_picklists")
        .select("list_name, description")
        .eq("id", ref.list_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as {
        list_name?: string | null;
        description?: string | null;
      };
      return stringify(row.list_name) ?? stringify(row.description);
    },
  },

  /** `picklist_group` → { list_id, group_name }. Live value = the group name. */
  picklist_group: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (_supabase, ref) => stringify(ref.group_name),
  },

  /**
   * `picklist_item` → { list_id, item_id }. Live value = the item's description
   * (fallback to its label). Opens the picklist (`list_id`).
   */
  picklist_item: {
    openItemType: "picklist",
    openId: (ref) => ref.list_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.item_id) return undefined;
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_picklist_items")
        .select("description, label")
        .eq("id", ref.item_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as {
        description?: string | null;
        label?: string | null;
      };
      return stringify(row.description) ?? stringify(row.label);
    },
  },

  // ── Table (udt dataset) family ─────────────────────────────────────────────
  /** `table` → { table_id }. Live value = the table name. */
  table: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.table_id) return undefined;
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_datasets")
        .select("table_name, description")
        .eq("id", ref.table_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const row = data as {
        table_name?: string | null;
        description?: string | null;
      };
      return stringify(row.table_name) ?? stringify(row.description);
    },
  },

  /** `table_schema` → { table_id }. Live value = column schema summary. */
  table_schema: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.table_id) return undefined;
      const [
        { data: table, error: tableErr },
        { data: fields, error: fieldsErr },
      ] = await Promise.all([
        supabase
          .schema("workbench")
          .from("udt_datasets")
          .select("table_name")
          .eq("id", ref.table_id)
          .maybeSingle(),
        supabase
          .schema("workbench")
          .from("udt_dataset_fields")
          .select("display_name, field_name, data_type")
          .eq("table_id", ref.table_id)
          .order("field_order", { ascending: true }),
      ]);
      if (tableErr || fieldsErr) return undefined;
      const name =
        stringify(
          (table as { table_name?: string | null } | null)?.table_name,
        ) ?? stringify(ref.table_name);
      const cols = (fields ?? [])
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
    resolveValue: async (supabase, ref) => {
      if (!ref.table_id || !ref.column_name) return undefined;
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_dataset_fields")
        .select("display_name, field_name")
        .eq("table_id", ref.table_id)
        .eq("field_name", ref.column_name)
        .maybeSingle();
      if (error || !data) return stringify(ref.column_name);
      const row = data as {
        display_name?: string | null;
        field_name?: string | null;
      };
      return (
        stringify(row.display_name) ??
        stringify(row.field_name) ??
        stringify(ref.column_name)
      );
    },
  },

  /**
   * `table_row` → { table_id, row_id }. Live value = a compact preview of the
   * row's cell values (first few), enough to identify it in a chip.
   */
  table_row: {
    openItemType: "table",
    openId: (ref) => ref.table_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.row_id) return undefined;
      const { data, error } = await supabase
        .schema("workbench")
        .from("udt_dataset_rows")
        .select("data")
        .eq("id", ref.row_id)
        .maybeSingle();
      if (error || !data) return undefined;
      const cells = (data as { data?: Record<string, unknown> | null }).data;
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
    resolveValue: async (supabase, ref) =>
      resolveCell(supabase, ref.row_id, ref.column_name),
  },

  /**
   * `dataset_cell` — LEGACY alias of `table_cell`. Old ids were
   * `{ dataset_id, row_id, field_name }`; tolerate the canonical
   * `{ table_id, row_id, column_name }` too.
   */
  dataset_cell: {
    openItemType: "table",
    openId: (ref) => ref.dataset_id ?? ref.table_id,
    resolveValue: async (supabase, ref) =>
      resolveCell(supabase, ref.row_id, ref.field_name ?? ref.column_name),
  },

  // ── RecordRef family (atomic Matrx entities) ───────────────────────────────
  task: createRecordResolver({
    openItemType: "task",
    table: "tasks",
    schema: "workspace",
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
    schema: "workspace",
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

  organization: {
    ...createRecordResolver({
      openItemType: "scope",
      table: "organizations",
      select: "name, description",
      titleFields: ["name"],
      bodyFields: ["description"],
    }),
    openId: () => undefined,
  },
  scope_type: createRecordResolver({
    openItemType: "scope_type",
    schema: "context",
    table: "scope_types",
    select: "label_singular, label_plural, description",
    titleFields: ["label_singular", "label_plural"],
    bodyFields: ["description"],
  }),
  scope: createRecordResolver({
    openItemType: "scope",
    schema: "context",
    table: "scopes",
    select: "name, description",
    titleFields: ["name"],
    bodyFields: ["description"],
  }),
  context_item: createRecordResolver({
    openItemType: "context_item",
    schema: "context",
    table: "context_items",
    select: "display_name, description, value_type",
    titleFields: ["display_name"],
    bodyFields: ["description"],
  }),

  /** Current value at scope × context_item (the cell agents care about). */
  context_value: {
    openItemType: "scope",
    openId: (ref) => ref.scope_id,
    resolveValue: async (supabase, ref) => {
      if (!ref.scope_id || !ref.context_item_id) return stringify(ref.label);
      const ctx = contextDb(supabase);
      const [
        { data: value, error: valueErr },
        { data: scope },
        { data: item },
      ] = await Promise.all([
        ctx
          .from("context_item_values")
          .select(
            "value_text, value_number, value_boolean, value_date, value_json",
          )
          .eq("scope_id", ref.scope_id)
          .eq("context_item_id", ref.context_item_id)
          .eq("is_current", true)
          .maybeSingle(),
        ctx.from("scopes").select("name").eq("id", ref.scope_id).maybeSingle(),
        ctx
          .from("context_items")
          .select("display_name")
          .eq("id", ref.context_item_id)
          .maybeSingle(),
      ]);
      if (valueErr) return stringify(ref.label);
      const scopeName = stringify(
        (scope as { name?: string | null } | null)?.name,
      );
      const itemName = stringify(
        (item as { display_name?: string | null } | null)?.display_name,
      );
      const heading =
        scopeName && itemName
          ? `${scopeName} · ${itemName}`
          : (scopeName ?? itemName ?? stringify(ref.label));
      if (!value) return heading;
      const row = value as {
        value_text?: string | null;
        value_number?: number | null;
        value_boolean?: boolean | null;
        value_date?: string | null;
        value_json?: unknown;
      };
      const cell =
        stringify(row.value_text) ??
        stringify(row.value_number) ??
        stringify(row.value_boolean) ??
        stringify(row.value_date) ??
        (row.value_json != null ? stringify(row.value_json) : undefined);
      if (heading && cell) return `${heading}\n${cell}`;
      return cell ?? heading;
    },
  },

  transcript: {
    ...createRecordResolver({
      openItemType: "file",
      table: "transcripts",
      schema: "transcripts",
      select: "title, description",
      titleFields: ["title"],
      bodyFields: ["description"],
    }),
    // No transcript window wired in item-presentation yet — resolve-only chip.
    openId: () => undefined,
  },
  transcript_session: createRecordResolver({
    openItemType: "session",
    table: "studio_sessions",
    select: "title",
    titleFields: ["title"],
  }),

  /** One segment inside a stored transcript (`segment_index` = 0-based parse order). */
  transcript_segment: {
    openItemType: "file",
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

  /** Transcript materialized from / linked to a studio session. */
  session_transcript: {
    openItemType: "session",
    openId: (ref) => ref.session_id,
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
};

/** Resolve a reference `type` to its resolver, or `undefined` (graceful chip). */
export function getReferenceResolver(
  type: string,
): ReferenceResolver | undefined {
  return RESOLVERS[type];
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

const humanizeType = (type: string): string =>
  type
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

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
  return humanizeType(type);
}
