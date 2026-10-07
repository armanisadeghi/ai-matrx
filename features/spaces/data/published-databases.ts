// features/spaces/data/published-databases.ts — the rows a published page carries, as the door answers them.
//
// Server-safe (no "use client"): the public route parses `content.space_public_view` once; the page's
// read-only store (data/published-rows.tsx) draws them.

type Json = Record<string, unknown>;

/** One database block's answer from `content.space_public_view` → `databases[blockId]`. */
export interface PublishedDatabase {
  tableId: string;
  organizationId: string;
  table: Json;
  fields: Array<{ id: string; data: Json }>;
  /** field key → option key → {id, label, position, retired} */
  options: Record<string, Record<string, { id?: string; label?: string; position?: number; retired?: boolean; color?: string | null }>>;
  rows: Array<{ id: string; data: Json }>;
  /** view id → the row ids that view shows, in its order */
  views: Record<string, string[]>;
  /** Related record id → its words, for each record a relation column points at that the publisher may open. */
  related: Record<string, string>;
  /** The block's question could not be answered (no rows are served for it). */
  unreadable?: boolean;
}

function obj(v: unknown): Json {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}

/** The door's `databases` JSON → typed answers (anything malformed is left out). */
export function readPublishedDatabases(raw: unknown): Record<string, PublishedDatabase> {
  const out: Record<string, PublishedDatabase> = {};
  for (const [blockId, value] of Object.entries(obj(raw))) {
    const v = obj(value);
    const tableId = typeof v.table_id === "string" ? v.table_id : null;
    if (!tableId) continue;
    out[blockId] = {
      tableId,
      organizationId: typeof v.organization_id === "string" ? v.organization_id : "",
      table: obj(v.table),
      fields: Array.isArray(v.fields) ? (v.fields as PublishedDatabase["fields"]).filter((f) => f && typeof f.id === "string") : [],
      options: obj(v.options) as PublishedDatabase["options"],
      rows: Array.isArray(v.rows) ? (v.rows as PublishedDatabase["rows"]).filter((r) => r && typeof r.id === "string") : [],
      views: obj(v.views) as PublishedDatabase["views"],
      related: Object.fromEntries(Object.entries(obj(v.related)).filter((e): e is [string, string] => typeof e[1] === "string")),
      unreadable: v.unreadable === true,
    };
  }
  return out;
}

/** One built-in module block's answer from `content.space_public_view` → `entities[blockId]` (the memory entity shape). */
export interface PublishedEntity {
  token: string;
  label: string;
  columns: Array<{
    api_name: string;
    name: string;
    type: string;
    choices?: string[];
    lookup?: { via: string; token: string; column: string; replaces: boolean };
  }>;
  rows: Array<Record<string, unknown>>;
  unreadable?: boolean;
}

/** The door's `entities` JSON → typed answers (anything malformed is left out). */
export function readPublishedEntities(raw: unknown): Record<string, PublishedEntity> {
  const out: Record<string, PublishedEntity> = {};
  for (const [blockId, value] of Object.entries(obj(raw))) {
    const v = obj(value);
    if (typeof v.token !== "string") continue;
    out[blockId] = {
      token: v.token,
      label: typeof v.label === "string" ? v.label : v.token,
      columns: Array.isArray(v.columns) ? (v.columns as PublishedEntity["columns"]).filter((c) => c && typeof c.api_name === "string") : [],
      rows: Array.isArray(v.rows) ? (v.rows as PublishedEntity["rows"]).filter((r) => r && typeof r.id === "string") : [],
      unreadable: v.unreadable === true,
    };
  }
  return out;
}
