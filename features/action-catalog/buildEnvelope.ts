/**
 * Action Catalog — (verb, noun) → canonical Matrx envelope.
 *
 * The builder's core. Given a chosen verb + noun + the admin-typed item fields,
 * produce the exact `{ matrx_version, kind, type, items }` envelope the backend
 * understands:
 *
 *   - reference / view  → kind:"reference", type:"<noun>"   (a pure read)
 *   - create/update/delete → kind:"output_directive", type:"<verb>:<noun>"  (a side effect)
 *
 * Identity-field requirements for the `reference`/`view` path are read from the
 * canonical reference taxonomy (`features/matrx-envelope/`) so this never forks
 * a second source of "which ids does a picklist_item need". Most reference nouns
 * are RecordRef (`{ id }`); the compound ones (picklist_item, table_cell, …)
 * carry their specific id set.
 */

import { MATRX_VERSION, type MatrxEnvelope } from "@/features/matrx-envelope/envelope";
import type { ActionVerb } from "@/features/action-catalog/types";

/** One identity field the admin must supply for a reference type. */
export interface RefFieldSpec {
  key: string;
  label: string;
  /** Whether a UUID is expected (drives the live-render "can resolve" hint). */
  uuid?: boolean;
}

/**
 * Identity-field requirements per reference `type`. The DEFAULT is the
 * RecordRef shape (`{ id }`) — applied to any noun not listed here. The listed
 * compound types mirror the item interfaces in `features/matrx-envelope/envelope.ts`.
 */
const REF_FIELDS: Record<string, RefFieldSpec[]> = {
  picklist: [{ key: "list_id", label: "List ID", uuid: true }],
  picklist_group: [
    { key: "list_id", label: "List ID", uuid: true },
    { key: "group_name", label: "Group name" },
  ],
  picklist_item: [
    { key: "list_id", label: "List ID", uuid: true },
    { key: "item_id", label: "Item ID", uuid: true },
  ],
  table: [{ key: "table_id", label: "Table ID", uuid: true }],
  table_schema: [{ key: "table_id", label: "Table ID", uuid: true }],
  table_column: [
    { key: "table_id", label: "Table ID", uuid: true },
    { key: "column_name", label: "Column name" },
  ],
  table_row: [
    { key: "table_id", label: "Table ID", uuid: true },
    { key: "row_id", label: "Row ID", uuid: true },
  ],
  table_cell: [
    { key: "table_id", label: "Table ID", uuid: true },
    { key: "row_id", label: "Row ID", uuid: true },
    { key: "column_name", label: "Column name" },
  ],
  context_value: [
    { key: "scope_id", label: "Scope ID", uuid: true },
    { key: "context_item_id", label: "Context item ID", uuid: true },
  ],
  transcript_segment: [
    { key: "transcript_id", label: "Transcript ID", uuid: true },
    { key: "segment_index", label: "Segment index" },
  ],
  session_transcript: [
    { key: "session_id", label: "Session ID", uuid: true },
    { key: "transcript_id", label: "Transcript ID", uuid: true },
  ],
  workbook_sheet: [
    { key: "workbook_id", label: "Workbook ID", uuid: true },
    { key: "sheet_id", label: "Sheet ID", uuid: true },
  ],
  document_page: [
    { key: "document_id", label: "Document ID", uuid: true },
    { key: "page_index", label: "Page index" },
  ],
  file: [{ key: "file_id", label: "File ID", uuid: true }],
  file_page: [
    { key: "file_id", label: "File ID", uuid: true },
    { key: "page_number", label: "Page number" },
  ],
};

const DEFAULT_REF_FIELDS: RefFieldSpec[] = [
  { key: "id", label: "Record ID", uuid: true },
];

/** The identity fields a `reference`/`view` of this noun needs. */
export function refFieldsForNoun(noun: string): RefFieldSpec[] {
  return REF_FIELDS[noun] ?? DEFAULT_REF_FIELDS;
}

/** A reference / view verb resolves to the `reference` kind (a pure read). */
export function isReferenceVerb(verb: ActionVerb): boolean {
  return verb === "reference" || verb === "view";
}

/**
 * Build the canonical envelope for a (verb, noun) and the supplied item fields.
 *
 * `fields` is the admin-entered key→value map. Empty values are dropped so the
 * envelope stays clean. For write verbs the item is the raw field map (the
 * payload shape is the writer's contract); for reads it's the identity ids.
 */
export function buildActionEnvelope(
  verb: ActionVerb,
  noun: string,
  fields: Record<string, string>,
): MatrxEnvelope {
  const item: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" && v.trim().length > 0) item[k] = v.trim();
  }

  if (isReferenceVerb(verb)) {
    return {
      matrx_version: MATRX_VERSION,
      kind: "reference",
      type: noun,
      items: [item],
    };
  }

  return {
    matrx_version: MATRX_VERSION,
    kind: "output_directive",
    type: `${verb}:${noun}`,
    items: [item],
  };
}
