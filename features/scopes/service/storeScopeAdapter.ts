// features/scopes/service/storeScopeAdapter.ts
//
// THE SCOPE SYSTEM, READ FROM THE RECORD STORE AND SPOKEN IN ITS OLD NOUNS (lane SCOPES-READS-WEB,
// common-docs/projects/data-doctrine-adoption/v5/SCOPES-CUTOVER-PLAN.md step 2.4).
//
// Every web read of `context.scope_types` / `context.scopes` / `context.context_items` /
// `context.context_item_values` now reads the store through its `custom.context_*` doors instead —
// so the old tables can go to the graveyard without a single screen noticing. The old tables are
// never read here: not as a fallback, not for a missing field, not at all.
//
// THE MAPPING IS THE MOVER'S, READ BACKWARDS — the same mapping the server reads with
// (aidream `packages/matrx-records/matrx_records/store/scopes.py`, lane SCOPES-READS-SERVER):
//
//   scope type     a Table the context system keeps (`kept_for = context`); its id IS the old type id
//   scope          a Record of that Table; its id IS the old scope id
//   context item   a Field of that Table the scope door did not derive (the scope's own name /
//                  description / slug / sort-order columns and each settings key are Fields with
//                  derived, version-5 ids — never items)
//   current value  the Record's document under the item's key, with the Record's own stamps
//
// THIS MODULE IS THE PERMANENT ADAPTER: the doors answer the store's words, and the functions below
// turn them into the node types every scope screen, picker and Redux slice already holds
// (`ScopeTypeNode`, `ScopeNode`, `ContextItemRow`, `ContextItemValue`, …). They are pure, so the
// mapping is tested without a database (`__tests__/store-scope-reads.test.ts`).
//
// Two words the store spells differently, restored here so every route that builds an address from
// them keeps its address: a scope type's slug is `practice_areas` in the store's grammar (hyphens are
// refused) and `practice-areas` on the old screens (measured 2026-09-28: every live type differs only
// by `-` ↔ `_`); and the store keeps a Table's own clock (`created_at` / `updated_at` of the Record),
// which the cutover plan accepts as the successor of the old row's.

import type {
  ArchivedScopeTypeRow,
  ContextItemRow,
  ContextItemValue,
  ScopeNode,
  ScopeTypeDisplay,
  ScopeTypeNode,
} from "@/features/scopes/types";
import type { Json } from "@/types/database.types";

// ─── the doors' answers (the store's words) ─────────────────────────────────────────────────────

export interface StoreTypeRow {
  id: string;
  organization_id: string;
  label_singular?: string | null;
  label_plural?: string | null;
  name?: string | null;
  icon?: string | null;
  color?: string | null;
  slug?: string | null;
  description?: string | null;
  sort_order?: number | null;
  max_assignments_per_entity?: number | null;
  default_variable_keys?: string[] | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StoreScopeRow {
  id: string;
  scope_type_id: string;
  organization_id: string;
  name?: string | null;
  description?: string | null;
  slug?: string | null;
  sort_order?: number | null;
  parent_scope_id?: string | null;
  settings?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** `custom.context_scopes` only: the scope's type, for a display row. */
  scope_type?: (Partial<StoreTypeRow> & { id: string }) | null;
}

export interface StoreTree {
  types: StoreTypeRow[];
  scopes: StoreScopeRow[];
}

/** One Field document, as `custom.context_items` / `custom.context_values` answer it. */
export interface StoreFieldDoc {
  key?: string;
  label?: string;
  type?: string;
  multi?: boolean | null;
  format?: string | null;
  display_format?: { id?: string } | null;
  config?: { kind?: string; allowed_types?: string[] } & Record<string, unknown>;
  relation_target?: string | null;
  sort?: number | null;
  description?: string | null;
  sensitivity?: string | null;
  context_policy?: string | null;
  source?: string | null;
  status?: string | null;
  status_note?: string | null;
  category?: string | null;
  tags?: string[] | null;
  max_items?: number | null;
  custom_component?: Json | null;
  reference_source?: Json | null;
  allowed_scope_type_ids?: string[] | null;
  allowed_reference_types?: string[] | null;
  review_interval_days?: number | null;
  depends_on?: string[] | null;
  [extra: string]: unknown;
}

export interface StoreItemRow {
  id: string;
  scope_type_id: string;
  organization_id: string;
  data: StoreFieldDoc;
  carried?: { value_type?: string; as_text?: boolean; is_active?: boolean } | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  version?: number | null;
}

export interface StoreValueRow {
  scope_id: string;
  context_item_id: string;
  key: string;
  value: unknown;
  field: Pick<StoreFieldDoc, "type" | "multi" | "format" | "display_format" | "config" | "relation_target"> & {
    carried?: StoreItemRow["carried"];
  };
  version?: number | null;
  set_at?: string | null;
  source_type?: string | null;
  value_id?: string | null;
  authored_by?: string | null;
  /** Names of the scopes a reference points at that the caller may see. */
  labels?: Record<string, string> | null;
}

// ─── the adapter: store words → the old nodes ──────────────────────────────────────────────────

/** The store's slug grammar (`practice_areas`) read as the old screens wrote it (`practice-areas`). */
export function oldTypeSlug(slug: string | null | undefined): string | null {
  return slug ? slug.replace(/_/g, "-") : null;
}

export function scopeTypeNodeFromStore(row: StoreTypeRow): ScopeTypeNode {
  const singular = row.label_singular ?? row.name ?? "";
  return {
    id: row.id,
    organization_id: row.organization_id,
    label_singular: singular,
    label_plural: row.label_plural ?? singular,
    icon: row.icon ?? "folder",
    color: row.color ?? "",
    max_assignments_per_entity: row.max_assignments_per_entity ?? null,
    sort_order: row.sort_order ?? 0,
    // No live scope type has a parent type (census 2026-09-28: 0 of 83); the store keeps none.
    parent_type_id: null,
    default_variable_keys: Array.isArray(row.default_variable_keys) ? row.default_variable_keys : [],
    slug: oldTypeSlug(row.slug),
    description: row.description ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    scopes: [],
  };
}

/**
 * A settings value as the old row held it. The scope door keeps a list-of-objects setting (a class's
 * exam dates) as a list of their JSON texts (`custom._ctx_words`); read back, each is the object again.
 */
export function settingFromStore(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((el) => {
    if (typeof el !== "string") return el;
    const t = el.trim();
    if (!(t.startsWith("{") && t.endsWith("}")) && !(t.startsWith("[") && t.endsWith("]"))) return el;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return el;
    }
  });
}

export function scopeNodeFromStore(row: StoreScopeRow): ScopeNode {
  const settings: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row.settings ?? {})) settings[k] = settingFromStore(v);
  return {
    id: row.id,
    scope_type_id: row.scope_type_id,
    organization_id: row.organization_id,
    name: row.name ?? "",
    description: row.description ?? "",
    parent_scope_id: row.parent_scope_id ?? null,
    settings: settings as Json,
    slug: row.slug ?? null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order ?? 0) || 0,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

export function scopeTypeDisplayFromStore(t: Partial<StoreTypeRow> & { id: string }): ScopeTypeDisplay {
  const singular = t.label_singular ?? t.name ?? "";
  return {
    id: t.id,
    label_singular: singular,
    label_plural: t.label_plural ?? singular,
    icon: t.icon ?? null,
    color: t.color ?? null,
  };
}

/** The file kernel: a relation at it is a document (a file), never a reference to a row. */
export const FILE_KERNEL_ID = "11111111-0000-4000-8000-000000000006";

/** The old `context_value_type` word for a Field — the mover's type map, read backwards. */
export function valueTypeOfField(
  doc: Pick<StoreFieldDoc, "type" | "multi" | "format" | "display_format" | "config" | "relation_target">,
  carried?: StoreItemRow["carried"],
): ContextItemRow["value_type"] {
  // An item the store landed as text keeps the word it had (custom._ctx_store_item carries it).
  if (carried?.as_text && carried.value_type) return carried.value_type as ContextItemRow["value_type"];
  const behavior = String(doc.type ?? "text");
  const fmt = doc.format ? String(doc.format) : "";
  const shown = doc.display_format && typeof doc.display_format === "object" ? String(doc.display_format.id ?? "") : "";
  const kind = String(doc.config?.kind ?? "");
  const multi = Boolean(doc.multi);
  if (behavior === "boolean") return "boolean";
  if (behavior === "relation") {
    return doc.relation_target === FILE_KERNEL_ID && !multi ? "document" : "reference";
  }
  if (behavior === "range") {
    if (kind === "date") return "date";
    if (kind === "datetime") return "datetime";
    if (fmt === "percent" || fmt === "currency") return fmt;
    return "number";
  }
  if (behavior === "text") {
    if (multi) return "array";
    if (fmt === "json") return "object";
    for (const word of [fmt, shown]) {
      if (["time", "email", "url", "phone", "color", "markdown"].includes(word)) {
        return word as ContextItemRow["value_type"];
      }
    }
    return "string";
  }
  return "string";
}

/** The store's context policy → the old fetch hint, and its sensitivity → the old word. */
const FETCH_HINT: Record<string, string> = { include: "always", on_request: "on_demand", exclude: "never" };
const OLD_SENSITIVITY: Record<string, string> = {
  public: "public",
  internal: "internal",
  confidential: "restricted",
  restricted: "privileged",
};

/** The old item slug: its key in kebab words (the old screens' `slug` column had no store home). */
function itemSlug(key: string): string {
  return key.replace(/_/g, "-");
}

export function contextItemRowFromStore(row: StoreItemRow): ContextItemRow {
  const d = row.data ?? {};
  const key = String(d.key ?? "");
  const item = {
    id: row.id,
    scope_type_id: row.scope_type_id,
    key,
    slug: itemSlug(key),
    display_name: String(d.label ?? key),
    description: String(d.description ?? ""),
    value_type: valueTypeOfField(d, row.carried),
    // The store's sort counts the scope's own two columns first (custom._ctx_store_item: + 2).
    sort_order: Math.max(0, Number(d.sort ?? 0) - 2),
    sensitivity: OLD_SENSITIVITY[String(d.sensitivity ?? "internal")] ?? "internal",
    fetch_hint: FETCH_HINT[String(d.context_policy ?? "include")] ?? "always",
    source_type: String(d.source ?? "manual"),
    status: String(d.status ?? "active"),
    status_note: d.status_note ?? null,
    category: d.category ?? null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    max_items: typeof d.max_items === "number" ? d.max_items : 1,
    custom_component: d.custom_component ?? null,
    reference_source: d.reference_source ?? null,
    allowed_scope_type_ids: d.allowed_scope_type_ids ?? null,
    allowed_reference_types: d.allowed_reference_types ?? null,
    review_interval_days: d.review_interval_days ?? null,
    depends_on: Array.isArray(d.depends_on) ? d.depends_on : [],
    is_active: true,
    deleted_at: null,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
    updated_by: null,
    version: row.version ?? 1,
    custom_fields: {},
    metadata: {},
    feed_type: "manual",
    feed_config: {},
    feed_status: null,
    feed_error: null,
    last_fed_at: null,
    last_verified_at: null,
    next_review_at: null,
    refresh_task_id: null,
    status_updated_at: row.updated_at ?? "",
    status_updated_by: null,
    template_item_key: null,
  };
  return item as unknown as ContextItemRow;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const FENCE = /^\s*```matrx\b/;

/** The canonical reference fence the old screens stored in `value_text` (features/scopes/utils/referenceCell.ts). */
export function referenceFenceText(type: string, items: Array<{ id: string; label?: string; type?: string }>): string {
  const body = { matrx_version: 1, kind: "reference", type, items };
  return "```matrx\n" + JSON.stringify(body, null, 2) + "\n```";
}

function emptyCell(): Omit<ContextItemValue, "context_item_id" | "id" | "version" | "source_type" | "authored_by" | "created_at"> {
  return {
    is_current: true,
    value_text: null,
    value_number: null,
    value_boolean: null,
    value_date: null,
    value_json: null,
    value_document_url: null,
    value_document_size_bytes: null,
    value_timestamp: null,
    value_time: null,
    value_reference_id: null,
    value_reference_type: null,
  };
}

/**
 * One current value, in `context.context_item_values`' columns, from the Record's document under the
 * item's key. The value lands in the column the old screens read for its type; a reference becomes the
 * canonical fence they render as chips (a scope's label is its live name, only where the caller sees it).
 */
export function contextValueFromStore(row: StoreValueRow): ContextItemValue & { scope_id: string } {
  const cell = emptyCell();
  const vt = valueTypeOfField(row.field ?? {}, row.field?.carried);
  const v = row.value;
  const labels = row.labels ?? {};
  // AN ITEM THE STORE LANDED AS TEXT HOLDS THE OLD CELL'S TEXT VERBATIM (lane SCOPES-READ-SWITCH-VALIDATE,
  // 2026-09-30). `custom._ctx_store_item` lands a value the store could not type (a reference fence
  // naming a table or a person the store has no Record for, a free-text "date" such as "2023") as a
  // text Field and records the old word in `carried`. The word decides nothing about WHERE the value
  // goes: it was the old `value_text`, so it is `value_text` again. Before this line a carried
  // reference fell into the reference branch below, found no uuid in a fence string, and the cell
  // came back EMPTY — the class that dropped values on the store path.
  if (row.field?.carried?.as_text && typeof v === "string") {
    cell.value_text = v;
  } else if (vt === "reference" || vt === "document") {
    const list = Array.isArray(v) ? v : v == null ? [] : [v];
    const refs: Array<{ id: string; type: string; label?: string }> = [];
    for (const el of list) {
      if (typeof el === "string" && UUID.test(el)) {
        refs.push({ id: el, type: row.field?.relation_target === FILE_KERNEL_ID ? "file" : "scope" });
      } else if (el && typeof el === "object" && typeof (el as { id?: unknown }).id === "string") {
        const token = String((el as { token?: unknown }).token ?? "");
        // A reference to a row outside the scope system (a workbook, a note, a site, a brand) carries
        // its own label in the store, as the old fence did; keep it (the door's labels name scopes only).
        const own = (el as { label?: unknown }).label;
        refs.push({
          id: (el as { id: string }).id,
          type: token === "dataset" ? "table" : token || "scope",
          ...(typeof own === "string" && own ? { label: own } : {}),
        });
      }
    }
    if (refs.length > 0) {
      const kinds = [...new Set(refs.map((r) => r.type))];
      const type = kinds.length === 1 ? kinds[0]! : "mixed";
      cell.value_text = referenceFenceText(
        type,
        refs.map((r) => {
          const item: { id: string; label?: string; type?: string } = { id: r.id };
          if (labels[r.id]) item.label = labels[r.id];
          else if (r.label) item.label = r.label;
          if (kinds.length > 1) item.type = r.type;
          return item;
        }),
      );
    }
  } else if (vt === "boolean") {
    if (typeof v === "boolean") cell.value_boolean = v;
    else if (v != null) cell.value_text = String(v);
  } else if (vt === "number" || vt === "percent" || vt === "currency") {
    if (typeof v === "number") cell.value_number = v;
    else if (v !== null && typeof v === "object") cell.value_json = v as Json;
    else if (v != null) cell.value_text = String(v);
  } else if (vt === "date") {
    if (typeof v === "string" && ISO_DATE.test(v)) cell.value_date = v;
    else if (v != null) cell.value_text = String(v);
  } else if (vt === "datetime") {
    if (typeof v === "string" && ISO_INSTANT.test(v)) cell.value_timestamp = v;
    else if (v != null) cell.value_text = String(v);
  } else if (vt === "time") {
    if (v != null) cell.value_time = String(v);
  } else if (vt === "object") {
    if (typeof v === "string") {
      try {
        cell.value_json = JSON.parse(v) as Json;
      } catch {
        cell.value_text = v;
      }
    } else if (v != null) cell.value_json = v as Json;
  } else if (vt === "array") {
    // A one-entry list whose entry is a fence was one fenced cell on the old side (a picklist choice).
    if (Array.isArray(v) && v.length === 1 && typeof v[0] === "string" && FENCE.test(v[0])) cell.value_text = v[0];
    else if (v != null) cell.value_json = v as Json;
  } else {
    // Text: string, email, url, phone, color, markdown — and anything the store landed as text.
    if (typeof v === "string") cell.value_text = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) cell.value_text = v.join("\n");
    else if (v != null) cell.value_text = JSON.stringify(v);
  }
  return {
    ...cell,
    scope_id: row.scope_id,
    context_item_id: row.context_item_id,
    // The old value's id where the copy carried one; a value first written in the store has none, and
    // is named by its cell instead — never a made-up uuid another table could mistake for its own.
    id: row.value_id ?? `${row.scope_id}:${row.context_item_id}`,
    version: row.version ?? 1,
    source_type: row.source_type ?? "manual",
    authored_by: row.authored_by ?? null,
    created_at: row.set_at ?? "",
  };
}

export function archivedTypeFromStore(row: {
  id: string;
  organization_id: string;
  label_singular?: string | null;
  label_plural?: string | null;
  icon?: string | null;
  color?: string | null;
  deleted_at?: string | null;
  archived_scope_count?: number | null;
}): ArchivedScopeTypeRow {
  const singular = row.label_singular ?? "";
  return {
    id: row.id,
    organization_id: row.organization_id,
    label_singular: singular,
    label_plural: row.label_plural ?? singular,
    icon: row.icon ?? "folder",
    color: row.color ?? "",
    deleted_at: row.deleted_at ?? "",
    archived_scope_count: row.archived_scope_count ?? 0,
  };
}

